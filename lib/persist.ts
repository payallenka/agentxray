import type { Analysis, Span, Trace } from "./types";

export interface RunRow {
  id: string;
  name: string;
  source: string;
  span_count: number;
  total_ms: number;
  cost_usd: number;
  waste_usd: number;
  waste_share: number;
  cp_share: number;
  finding_count: number;
  redacted: boolean;
  created_at: string;
}

/** Strip prompt and completion text. What remains is what we measured:
 *  span names, timings, token counts, model ids. */
export function redactSpans(spans: Span[]): Span[] {
  return spans.map(({ inputPreview, outputPreview, error, ...rest }) => ({
    ...rest,
    // keep the shape of the error, drop anything that could carry user data
    error: error ? error.slice(0, 120) : undefined,
  }));
}

/**
 * Content address for a run: the structural shape of the trace, independent
 * of when it was ingested. Two pushes of the same payload hash identically;
 * a genuine re-run of the same workflow will differ in its timings and so
 * will not collide.
 */
export async function contentHash(trace: Trace): Promise<string> {
  const shape = trace.spans
    .map((s) =>
      [s.name, s.kind, Math.round(s.startMs), Math.round(s.endMs),
       s.inputTokens ?? 0, s.outputTokens ?? 0, s.status].join("|"),
    )
    .join("\n");
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${trace.source}::${trace.runName}::${shape}`),
  );
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** How long an identical payload is treated as a redelivery rather than a
 *  new run. Long enough to absorb webhook retries and double-fired hooks,
 *  short enough that a nightly job still records every night. */
export const DEDUP_WINDOW_MS = 10 * 60 * 1000;

export function runSummary(trace: Trace, analysis: Analysis) {
  return {
    name: trace.runName,
    source: trace.source,
    span_count: analysis.totals.spanCount,
    total_ms: analysis.totals.durationMs,
    cost_usd: analysis.totals.costUsd,
    waste_usd: analysis.waste.usd,
    waste_share: analysis.waste.shareUsd,
    cp_share: analysis.criticalPath.share,
    finding_count: analysis.findings.length,
  };
}

/** The analysis is computed BEFORE redaction and stored alongside, so a
 *  redacted run still shows every finding even though the text is gone. */
export function buildRunPayload(
  trace: Trace,
  analysis: Analysis,
  orgId: string,
  userId: string,
  redact: boolean,
  hash?: string,
) {
  const { ...serialisable } = analysis;
  return {
    org_id: orgId,
    created_by: userId,
    redacted: redact,
    ...runSummary(trace, analysis),
    spans: redact ? redactSpans(trace.spans) : trace.spans,
    analysis: {
      totals: serialisable.totals,
      criticalPath: serialisable.criticalPath,
      costByNode: serialisable.costByNode,
      findings: serialisable.findings,
      waste: serialisable.waste,
      // Map is not JSON-serialisable
      slack: Object.fromEntries((analysis as Analysis & { slack?: Map<string, number> }).slack ?? []),
      // carried inside the JSON so neither needs a schema migration
      contentHash: hash ?? null,
      attributes: trace.attributes ?? null,
    },
  };
}

/** Rehydrate a stored row into the shape the UI renders. */
export function rehydrate(row: Record<string, unknown>): { trace: Trace; analysis: Analysis & { slack: Map<string, number> } } {
  const spans = row.spans as Span[];
  const a = row.analysis as Record<string, unknown>;
  return {
    trace: {
      source: String(row.source),
      runName: String(row.name),
      spans,
      totalMs: Number(row.total_ms),
    },
    analysis: {
      ...(a as unknown as Analysis),
      slack: new Map(Object.entries((a.slack as Record<string, number>) ?? {})),
    },
  };
}
