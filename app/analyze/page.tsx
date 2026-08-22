"use client";

import { useMemo, useState } from "react";
import { normalize } from "@/lib/normalize";
import { analyze } from "@/lib/analyze";
import { SAMPLES } from "@/lib/samples";
import { ms, usd } from "@/lib/pricing";
import type { Analysis, Span, Trace } from "@/lib/types";
import Workspace from "@/components/Workspace";

const KIND_COLOR: Record<string, string> = {
  llm: "#a78bfa",
  tool: "#22d3ee",
  retrieval: "#fbbf24",
  agent: "#94a3b8",
  chain: "#94a3b8",
  other: "#64748b",
};

const SEV: Record<string, { bg: string; fg: string; label: string }> = {
  critical: { bg: "#2a1215", fg: "#f87171", label: "CRITICAL" },
  warn: { bg: "#2a2010", fg: "#fbbf24", label: "WARN" },
  info: { bg: "#0f1c24", fg: "#38bdf8", label: "INFO" },
};

export default function Page() {
  const [raw, setRaw] = useState(SAMPLES[0].body);
  const [active, setActive] = useState(SAMPLES[0].id);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openFinding, setOpenFinding] = useState<string | null>(null);
  const [narration, setNarration] = useState<string>("");
  // a run opened from the workspace is rendered as-is: redacted runs no longer
  // carry the text the detectors need, so we replay the stored analysis
  const [saved, setSaved] = useState<{ trace: Trace; analysis: Analysis & { slack: Map<string, number> } } | null>(null);
  const [narrating, setNarrating] = useState(false);

  const computed = useMemo(() => {
    try {
      const trace = normalize(raw);
      return { trace, analysis: analyze(trace), error: null as string | null };
    } catch (e) {
      return { trace: null, analysis: null, error: (e as Error).message };
    }
  }, [raw]);

  const result = saved
    ? { trace: saved.trace, analysis: saved.analysis, error: null as string | null }
    : computed;
  const { trace, analysis, error } = result;
  const cpSet = useMemo(
    () => new Set(analysis?.criticalPath.spanIds ?? []),
    [analysis],
  );

  async function narrate() {
    if (!analysis || !trace) return;
    setNarrating(true);
    setNarration("");
    try {
      // Only the computed evidence leaves the browser — never the raw trace.
      const evidence = {
        runName: trace.runName,
        totals: analysis.totals,
        criticalPath: analysis.criticalPath,
        waste: analysis.waste,
        topNodes: analysis.costByNode.slice(0, 6),
        findings: analysis.findings.map((f) => ({
          id: f.id, severity: f.severity, title: f.title,
          detail: f.detail, wastedMs: f.wastedMs, wastedUsd: f.wastedUsd,
        })),
      };
      const r = await fetch("/api/narrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evidence }),
      });
      if (!r.ok || !r.body) {
        setNarration(`_${(await r.text()) || "Narration unavailable."}_`);
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setNarration((p) => p + dec.decode(value, { stream: true }));
      }
    } catch {
      setNarration("_Narration unavailable — the deterministic analysis above is complete on its own._");
    } finally {
      setNarrating(false);
    }
  }

  function loadSample(id: string) {
    const s = SAMPLES.find((x) => x.id === id)!;
    setActive(id);
    setSaved(null);
    setRaw(s.body);
    setSel(new Set());
    setOpenFinding(null);
    setNarration("");
  }

  return (
    <main className="min-h-screen mx-auto max-w-[1400px] px-6 py-8">
      {/* header */}
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b hairline">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <a href="/" className="hover:opacity-80 transition">Agent X-Ray</a>{" "}
            <span className="dim font-normal">/ APM for AI agent traces</span>
          </h1>
          <p className="dim text-sm mt-1 max-w-2xl">
            Critical path, context re-send cost, semantic loop detection and dead-branch analysis.
            Deterministic — no model in the analysis path.
          </p>
        </div>
        <div className="text-xs mono dim text-right leading-relaxed">
          <div className="text-emerald-400">● runs entirely in your browser</div>
          <div>your traces are never uploaded</div>
        </div>
      </header>

      {/* ingest */}
      <section className="mt-6 grid gap-4 lg:grid-cols-[380px_1fr] items-start">
        <div className="panel rounded-lg p-4">
          <div className="text-xs uppercase tracking-wider dim mb-3">Sample runs</div>
          <div className="grid gap-2">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                onClick={() => loadSample(s.id)}
                className={`text-left rounded-md px-3 py-2 border transition ${
                  active === s.id
                    ? "border-violet-500/60 bg-violet-500/10"
                    : "hairline hover:bg-white/5"
                }`}
              >
                <div className="text-sm">{s.label}</div>
                <div className="mono text-[11px] dim">{s.sub}</div>
              </button>
            ))}
          </div>

          <div className="text-xs uppercase tracking-wider dim mt-5 mb-2">Or paste a trace</div>
          <textarea
            value={raw}
            onChange={(e) => { setRaw(e.target.value); setActive(""); setSaved(null); }}
            spellCheck={false}
            className="w-full h-44 mono text-[11px] leading-relaxed rounded-md p-3 bg-black/40 border hairline outline-none focus:border-violet-500/60 resize-y"
          />
          <div className="mono text-[11px] dim mt-2">
            OTLP JSON · Langfuse export · LangSmith / LangGraph run tree
          </div>
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          <Workspace
            trace={trace}
            analysis={analysis}
            onLoad={(t, a) => { setSaved({ trace: t, analysis: a }); setActive(""); setSel(new Set()); setOpenFinding(null); setNarration(""); }}
          />
        </div>

        {/* summary + findings */}
        <div className="grid gap-4 lg:row-span-2">
          {error && (
            <div className="panel rounded-lg p-4 border-red-500/40 text-red-300 text-sm">{error}</div>
          )}

          {trace && analysis && (
            <>
              <div className="panel rounded-lg p-4">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="text-sm">{trace.runName}</div>
                  <div className="mono text-[11px] dim">
                    {trace.source} · {analysis.totals.spanCount} spans ·{" "}
                    {analysis.totals.llmCalls} LLM · {analysis.totals.toolCalls} tool
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
                  <Tile label="Wall clock" value={ms(analysis.totals.durationMs)} />
                  <Tile label="Cost" value={usd(analysis.totals.costUsd)} />
                  <Tile
                    label="Recoverable"
                    value={usd(analysis.waste.usd)}
                    sub={`${Math.round(analysis.waste.shareUsd * 100)}% of spend`}
                    accent={analysis.waste.shareUsd > 0.25 ? "#f87171" : undefined}
                  />
                  <Tile
                    label="Critical path"
                    value={ms(analysis.criticalPath.ms)}
                    sub={`${Math.round(analysis.criticalPath.share * 100)}% of wall clock`}
                  />
                  <Tile
                    label="Tokens in / out"
                    value={`${fmt(analysis.totals.inputTokens)} / ${fmt(analysis.totals.outputTokens)}`}
                    sub={analysis.totals.cachedTokens ? `${fmt(analysis.totals.cachedTokens)} cached` : "no cache hits"}
                    accent={!analysis.totals.cachedTokens && analysis.totals.inputTokens > 5000 ? "#fbbf24" : undefined}
                  />
                </div>
              </div>

              <div className="panel rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-wider dim">
                    Findings ({analysis.findings.length})
                  </div>
                  <button
                    onClick={narrate}
                    disabled={narrating}
                    className="mono text-[11px] px-3 py-1.5 rounded-md border hairline hover:bg-white/5 disabled:opacity-40"
                  >
                    {narrating ? "analysing…" : "explain + prioritise ▸"}
                  </button>
                </div>

                {analysis.findings.length === 0 && (
                  <div className="text-sm text-emerald-400">
                    No waste detected. Cached prefixes, no repeated calls, everything on the critical path.
                  </div>
                )}

                <div className="grid gap-2">
                  {analysis.findings.map((f) => {
                    const sev = SEV[f.severity];
                    const open = openFinding === f.id;
                    return (
                      <div key={f.id} className="rounded-md border hairline overflow-hidden">
                        <button
                          onClick={() => {
                            setOpenFinding(open ? null : f.id);
                            setSel(new Set(f.spanIds));
                          }}
                          className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-white/5"
                        >
                          <span
                            className="mono text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: sev.bg, color: sev.fg }}
                          >
                            {sev.label}
                          </span>
                          <span className="text-sm flex-1">{f.title}</span>
                          {f.wastedUsd ? (
                            <span className="mono text-[11px] text-red-300">{usd(f.wastedUsd)}</span>
                          ) : null}
                          {f.wastedMs ? (
                            <span className="mono text-[11px] text-amber-300">{ms(f.wastedMs)}</span>
                          ) : null}
                        </button>
                        {open && (
                          <div className="px-3 pb-3 text-[13px] dim leading-relaxed border-t hairline pt-2">
                            {f.detail}
                            <div className="mono text-[11px] mt-2 text-violet-300">
                              {f.spanIds.length} span{f.spanIds.length > 1 ? "s" : ""} highlighted below
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {narration && (
                  <div className="mt-4 rounded-md border hairline p-3 text-[13px] leading-relaxed whitespace-pre-wrap">
                    {narration}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* waterfall */}
      {trace && analysis && (
        <section className="panel rounded-lg p-4 mt-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="text-xs uppercase tracking-wider dim">
              Waterfall · critical path highlighted, slack shown hatched
            </div>
            <div className="flex gap-3 mono text-[10px]">
              {Object.entries(KIND_COLOR).slice(0, 4).map(([k, c]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <i className="w-2 h-2 rounded-sm inline-block" style={{ background: c }} />
                  {k}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-[3px]">
            {trace.spans.map((s) => (
              <Row
                key={s.id}
                span={s}
                total={trace.totalMs}
                onCritical={cpSet.has(s.id)}
                slack={analysis.slack.get(s.id) ?? 0}
                selected={sel.has(s.id)}
                dimmed={sel.size > 0 && !sel.has(s.id)}
                onClick={() => setSel(new Set([s.id]))}
              />
            ))}
          </div>
        </section>
      )}

      {/* cost attribution */}
      {analysis && analysis.costByNode.some((n) => n.costUsd > 0) && (
        <section className="panel rounded-lg p-4 mt-4">
          <div className="text-xs uppercase tracking-wider dim mb-3">Cost attribution by node</div>
          <div className="grid gap-1">
            {analysis.costByNode.filter((n) => n.costUsd > 0).map((n) => (
              <div key={n.name} className="flex items-center gap-3 text-[13px]">
                <span className="mono w-44 truncate" style={{ color: KIND_COLOR[n.kind] }}>{n.name}</span>
                <span className="mono text-[11px] dim w-16">{n.calls}×</span>
                <div className="flex-1 h-2 rounded-sm bg-white/5 overflow-hidden">
                  <div className="h-full rounded-sm" style={{ width: `${n.share * 100}%`, background: KIND_COLOR[n.kind] }} />
                </div>
                <span className="mono text-[11px] w-20 text-right">{usd(n.costUsd)}</span>
                <span className="mono text-[11px] dim w-12 text-right">{Math.round(n.share * 100)}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="mono text-[11px] dim py-8 text-center">
        deterministic analysis · nothing uploaded · built at a midnight buildathon
      </footer>
    </main>
  );
}

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-md border hairline px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider dim">{label}</div>
      <div className="mono text-lg mt-0.5" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="mono text-[10px] dim mt-0.5">{sub}</div>}
    </div>
  );
}

function Row({
  span, total, onCritical, slack, selected, dimmed, onClick,
}: {
  span: Span; total: number; onCritical: boolean; slack: number;
  selected: boolean; dimmed: boolean; onClick: () => void;
}) {
  const left = (span.startMs / total) * 100;
  const width = Math.max((span.durationMs / total) * 100, 0.4);
  const slackW = (Math.min(slack, total) / total) * 100;
  const color = KIND_COLOR[span.kind];

  return (
    <button
      onClick={onClick}
      className={`grid grid-cols-[280px_1fr_150px] items-center gap-3 text-left rounded px-1 py-[3px] transition ${
        selected ? "bg-white/10" : "hover:bg-white/5"
      } ${dimmed ? "opacity-30" : ""}`}
    >
      <div className="flex items-center gap-2 min-w-0" style={{ paddingLeft: span.depth * 14 }}>
        <i className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ background: color }} />
        <span className="mono text-[12px] truncate">{span.name}</span>
        {span.status === "error" && <span className="mono text-[10px] text-red-400">ERR</span>}
        {onCritical && <span className="mono text-[9px] px-1 rounded bg-violet-500/20 text-violet-300">CP</span>}
      </div>

      <div className="relative h-4">
        <div
          className="absolute top-1/2 -translate-y-1/2 h-[9px] rounded-sm"
          style={{
            left: `${left}%`,
            width: `${width}%`,
            background: span.status === "error" ? "#ef4444" : color,
            opacity: onCritical ? 1 : 0.55,
            boxShadow: onCritical ? `0 0 0 1px ${color}` : undefined,
          }}
        />
        {slackW > 0.5 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-[9px] rounded-sm border border-dashed"
            style={{
              left: `${left + width}%`,
              width: `${slackW}%`,
              borderColor: "#3a4256",
            }}
            title={`${Math.round(slack)}ms slack — not on the critical path`}
          />
        )}
      </div>

      <div className="mono text-[11px] dim text-right">
        {ms(span.durationMs)}
        {span.costUsd ? <span className="ml-2 text-white/70">{usd(span.costUsd)}</span> : null}
      </div>
    </button>
  );
}
