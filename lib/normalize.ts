import { Span, SpanKind, Trace } from "./types";
import { estimateCost } from "./pricing";

const asStr = (v: unknown, max = 4000): string | undefined => {
  if (v == null) return undefined;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? s.slice(0, max) : s;
};

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};

function classify(name: string, hint?: string): SpanKind {
  const h = (hint || "").toLowerCase();
  const n = (name || "").toLowerCase();
  if (/llm|generation|chat|completion|inference/.test(h)) return "llm";
  if (/tool|function/.test(h)) return "tool";
  if (/retriev|embed|vector|search/.test(h)) return "retrieval";
  if (/agent/.test(h)) return "agent";
  if (/chain|graph|workflow/.test(h)) return "chain";
  if (/retriev|vector|qdrant|pinecone|embed|rerank/.test(n)) return "retrieval";
  if (/llm|gpt|claude|gemini|generate|completion/.test(n)) return "llm";
  if (/agent|supervisor|react/.test(n)) return "agent";
  if (/tool|call_|api_|fetch|query/.test(n)) return "tool";
  return "other";
}

/** Shared finishing pass: rebase timestamps, compute depth, fill costs. */
function finalize(raw: Omit<Span, "depth" | "durationMs">[], source: string, runName: string): Trace {
  if (!raw.length) throw new Error("No spans found in this payload.");
  const t0 = Math.min(...raw.map((s) => s.startMs));
  const byId = new Map(raw.map((s) => [s.id, s]));

  const depthOf = (s: (typeof raw)[number], guard = 0): number => {
    if (!s.parentId || guard > 64) return 0;
    const p = byId.get(s.parentId);
    return p ? depthOf(p, guard + 1) + 1 : 0;
  };

  const spans: Span[] = raw.map((s) => {
    const startMs = s.startMs - t0;
    const endMs = Math.max(s.endMs - t0, startMs);
    const costUsd =
      s.costUsd ?? (s.inputTokens || s.outputTokens
        ? estimateCost(s.model, s.inputTokens ?? 0, s.outputTokens ?? 0)
        : undefined);
    return { ...s, startMs, endMs, durationMs: endMs - startMs, costUsd, depth: depthOf(s) };
  });

  // Langfuse and some OTLP instrumentations emit tool calls as a generic
  // "SPAN" with no type hint. A leaf that did work and has no children is a
  // tool call in everything but name — classify it as one so the loop and
  // parallelism detectors can see it.
  const parents = new Set(spans.map((s) => s.parentId).filter(Boolean) as string[]);
  for (const s of spans) {
    if (s.kind === "other" && !parents.has(s.id)) s.kind = "tool";
  }

  spans.sort((a, b) => a.startMs - b.startMs || b.durationMs - a.durationMs);
  return { source, runName, spans, totalMs: Math.max(...spans.map((s) => s.endMs)) };
}

/* ---------------- OTLP / OpenTelemetry GenAI semantic conventions ---------------- */

function flattenOtelAttrs(attrs: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of attrs || []) {
    const at = a as { key?: string; value?: Record<string, unknown> };
    if (!at?.key || !at.value) continue;
    const v = at.value;
    out[at.key] =
      v.stringValue ?? v.intValue ?? v.doubleValue ?? v.boolValue ??
      (v.arrayValue ? JSON.stringify(v.arrayValue) : undefined);
  }
  return out;
}

function fromOtlp(doc: Record<string, unknown>) {
  const raw: Omit<Span, "depth" | "durationMs">[] = [];
  const resourceSpans = (doc.resourceSpans ?? doc.resource_spans) as unknown[];
  for (const rs of resourceSpans || []) {
    const scopes = ((rs as Record<string, unknown>).scopeSpans ??
      (rs as Record<string, unknown>).scope_spans) as unknown[];
    for (const ss of scopes || []) {
      for (const sp of (((ss as Record<string, unknown>).spans as unknown[]) || [])) {
        const s = sp as Record<string, unknown>;
        const at = flattenOtelAttrs((s.attributes as unknown[]) || []);
        const startNs = num(s.startTimeUnixNano ?? s.start_time_unix_nano) ?? 0;
        const endNs = num(s.endTimeUnixNano ?? s.end_time_unix_nano) ?? startNs;
        const parent = (s.parentSpanId ?? s.parent_span_id) as string;
        // GenAI semconv: gen_ai.operation.name, gen_ai.request.model, gen_ai.usage.*
        const op = at["gen_ai.operation.name"] as string;
        raw.push({
          id: String(s.spanId ?? s.span_id),
          parentId: parent && parent.length ? String(parent) : null,
          name: String(s.name ?? "span"),
          kind: classify(String(s.name ?? ""), op || (at["gen_ai.system"] ? "llm" : undefined)),
          startMs: startNs / 1e6,
          endMs: endNs / 1e6,
          status: num((s.status as Record<string, unknown>)?.code) === 2 ? "error" : "ok",
          error: asStr((s.status as Record<string, unknown>)?.message, 400),
          model: (at["gen_ai.request.model"] ?? at["gen_ai.response.model"]) as string,
          inputTokens: num(at["gen_ai.usage.input_tokens"] ?? at["gen_ai.usage.prompt_tokens"]),
          outputTokens: num(at["gen_ai.usage.output_tokens"] ?? at["gen_ai.usage.completion_tokens"]),
          cachedTokens: num(at["gen_ai.usage.cache_read_input_tokens"]),
          inputPreview: asStr(at["gen_ai.prompt"] ?? at["input.value"] ?? at["gen_ai.input.messages"]),
          outputPreview: asStr(at["gen_ai.completion"] ?? at["output.value"] ?? at["gen_ai.output.messages"]),
        });
      }
    }
  }
  return raw.length ? finalize(raw, "OpenTelemetry (GenAI semconv)", "OTLP trace") : null;
}

/* ---------------- LangSmith / LangGraph run tree ---------------- */

function fromLangSmith(doc: Record<string, unknown>) {
  const raw: Omit<Span, "depth" | "durationMs">[] = [];
  let auto = 0;

  const walk = (r: Record<string, unknown>, parentId: string | null) => {
    const id = String(r.id ?? r.run_id ?? `ls-${auto++}`);
    const start = Date.parse(String(r.start_time ?? r.startTime ?? 0));
    const end = Date.parse(String(r.end_time ?? r.endTime ?? r.start_time ?? 0));
    const extra = (r.extra as Record<string, unknown>) || {};
    const invocation = (extra.invocation_params as Record<string, unknown>) || {};
    const usage =
      ((r.usage_metadata ?? (r.outputs as Record<string, unknown>)?.llm_output) as Record<string, unknown>) || {};
    raw.push({
      id,
      parentId,
      name: String(r.name ?? "run"),
      kind: classify(String(r.name ?? ""), String(r.run_type ?? "")),
      startMs: Number.isFinite(start) ? start : 0,
      endMs: Number.isFinite(end) ? end : start,
      status: r.error ? "error" : "ok",
      error: asStr(r.error, 400),
      model: (invocation.model ?? invocation.model_name ?? r.model) as string,
      inputTokens: num(usage.input_tokens ?? usage.prompt_tokens ?? r.prompt_tokens),
      outputTokens: num(usage.output_tokens ?? usage.completion_tokens ?? r.completion_tokens),
      cachedTokens: num((usage.input_token_details as Record<string, unknown>)?.cache_read),
      inputPreview: asStr(r.inputs),
      outputPreview: asStr(r.outputs),
    });
    for (const c of ((r.child_runs ?? r.children) as unknown[]) || []) {
      walk(c as Record<string, unknown>, id);
    }
  };

  const roots = Array.isArray(doc) ? doc : doc.child_runs || doc.run ? [doc] : null;
  if (!roots) return null;
  for (const r of roots as unknown[]) walk(r as Record<string, unknown>, null);
  return raw.length ? finalize(raw, "LangSmith / LangGraph run tree", String((roots as Record<string, unknown>[])[0]?.name ?? "agent run")) : null;
}

/* ---------------- Langfuse export ---------------- */

function fromLangfuse(doc: Record<string, unknown>) {
  const obs = (doc.observations ?? doc.data) as Record<string, unknown>[];
  if (!Array.isArray(obs) || !obs.length || !obs[0].startTime) return null;
  const raw = obs.map((o) => {
    const usage = (o.usage ?? o.usageDetails ?? {}) as Record<string, unknown>;
    return {
      id: String(o.id),
      parentId: (o.parentObservationId as string) ?? null,
      name: String(o.name ?? o.type ?? "observation"),
      kind: classify(String(o.name ?? ""), String(o.type ?? "")),
      startMs: Date.parse(String(o.startTime)),
      endMs: Date.parse(String(o.endTime ?? o.startTime)),
      status: o.level === "ERROR" ? ("error" as const) : ("ok" as const),
      error: asStr(o.statusMessage, 400),
      model: o.model as string,
      inputTokens: num(usage.input ?? usage.promptTokens ?? usage.input_tokens),
      outputTokens: num(usage.output ?? usage.completionTokens ?? usage.output_tokens),
      cachedTokens: num(usage.cache_read_input_tokens),
      costUsd: num(o.calculatedTotalCost ?? o.totalCost),
      inputPreview: asStr(o.input),
      outputPreview: asStr(o.output),
    };
  });
  return finalize(raw, "Langfuse export", String(doc.name ?? "langfuse trace"));
}

/* ---------------- Generic flat span array (our own schema) ---------------- */

function fromGeneric(doc: unknown) {
  const arr = (Array.isArray(doc) ? doc : (doc as Record<string, unknown>)?.spans) as Record<string, unknown>[];
  if (!Array.isArray(arr) || !arr.length) return null;
  const first = arr[0];
  if (!("startMs" in first) && !("start" in first)) return null;
  const raw = arr.map((s, i) => ({
    id: String(s.id ?? i),
    parentId: (s.parentId as string) ?? null,
    name: String(s.name ?? `span-${i}`),
    kind: (s.kind as SpanKind) ?? classify(String(s.name ?? "")),
    startMs: num(s.startMs ?? s.start) ?? 0,
    endMs: num(s.endMs ?? s.end) ?? 0,
    status: (s.status as "ok" | "error") ?? "ok",
    error: asStr(s.error, 400),
    model: s.model as string,
    inputTokens: num(s.inputTokens),
    outputTokens: num(s.outputTokens),
    cachedTokens: num(s.cachedTokens),
    costUsd: num(s.costUsd),
    inputPreview: asStr(s.inputPreview ?? s.input),
    outputPreview: asStr(s.outputPreview ?? s.output),
  }));
  return finalize(raw, "Costpath span format", String((doc as Record<string, unknown>)?.runName ?? "agent run"));
}

export function normalize(input: string): Trace {
  let doc: unknown;
  try {
    doc = JSON.parse(input);
  } catch {
    throw new Error("That is not valid JSON. Paste a trace export or pick a sample run.");
  }
  const adapters = [fromOtlp, fromLangfuse, fromLangSmith, fromGeneric];
  for (const a of adapters) {
    try {
      const t = a(doc as Record<string, unknown>);
      if (t) return t;
    } catch { /* try the next adapter */ }
  }
  throw new Error("Unrecognized trace shape. Supported: OTLP JSON, Langfuse export, LangSmith/LangGraph run tree.");
}
