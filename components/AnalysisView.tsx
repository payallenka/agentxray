"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, EyeOff, X } from "lucide-react";
import { ms, usd } from "@/lib/pricing";
import type { Analysis, Span, Trace } from "@/lib/types";
import { Badge, Button, Card, CardLabel, CountUp, Tip } from "@/components/ui";
import { cn } from "@/lib/cn";

export const KIND_COLOR: Record<string, string> = {
  llm: "var(--k-llm)", tool: "var(--k-tool)", retrieval: "var(--k-retrieval)",
  agent: "var(--k-agent)", chain: "var(--k-agent)", other: "#64748b",
};

const SEV_TONE = { critical: "critical", warn: "warn", info: "info" } as const;

export default function AnalysisView({
  trace, analysis,
}: { trace: Trace; analysis: Analysis & { slack: Map<string, number> } }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [inspect, setInspect] = useState<Span | null>(null);
  const [openFinding, setOpenFinding] = useState<string | null>(null);
  const [narration, setNarration] = useState("");
  const [narrating, setNarrating] = useState(false);

  const cpSet = useMemo(() => new Set(analysis.criticalPath.spanIds), [analysis]);
  const clean = analysis.findings.length === 0;

  async function narrate() {
    setNarrating(true); setNarration("");
    try {
      // only the computed evidence leaves the browser — never the raw trace
      const evidence = {
        runName: trace.runName, totals: analysis.totals,
        criticalPath: analysis.criticalPath, waste: analysis.waste,
        topNodes: analysis.costByNode.slice(0, 6),
        findings: analysis.findings.map((f) => ({
          id: f.id, severity: f.severity, title: f.title,
          detail: f.detail, wastedMs: f.wastedMs, wastedUsd: f.wastedUsd,
        })),
      };
      const r = await fetch("/api/narrate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ evidence }),
      });
      if (!r.ok || !r.body) { setNarration((await r.text()) || "Narration unavailable."); return; }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setNarration((p) => p + dec.decode(value, { stream: true }));
      }
    } catch {
      setNarration("Narration unavailable — the analysis above is complete on its own.");
    } finally { setNarrating(false); }
  }

  return (
    <div className="grid gap-6">
      {/* metric strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Metric label="Wall clock" value={analysis.totals.durationMs} format={ms}
                sub={`${analysis.totals.spanCount} spans`} />
        <Metric label="Cost" value={analysis.totals.costUsd} format={usd}
                sub={`${analysis.totals.llmCalls} LLM · ${analysis.totals.toolCalls} tool`} />
        <Metric label="Recoverable" value={analysis.waste.usd} format={usd}
                sub={`${Math.round(analysis.waste.shareUsd * 100)}% of spend`}
                accent={analysis.waste.shareUsd > 0.25 ? "var(--critical)" : undefined} />
        <Metric label="Critical path" value={analysis.criticalPath.ms} format={ms}
                sub={`${Math.round(analysis.criticalPath.share * 100)}% of wall clock`} />
        <Metric label="Tokens in" value={analysis.totals.inputTokens}
                format={(n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)))}
                sub={analysis.totals.cachedTokens
                  ? `${(analysis.totals.cachedTokens / 1000).toFixed(1)}k cached` : "no cache hits"}
                accent={!analysis.totals.cachedTokens && analysis.totals.inputTokens > 5000
                  ? "var(--warn)" : undefined} />
      </div>

      {/* findings */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <CardLabel>Findings</CardLabel>
            {!clean && <span className="mono text-[11px] dimmer">{analysis.findings.length}</span>}
          </div>
          <Button size="sm" mono onClick={narrate} disabled={narrating || clean}>
            <Sparkles size={13} />{narrating ? "analysing…" : "explain + prioritise"}
          </Button>
        </div>

        {clean ? (
          <div className="flex items-start gap-3 py-3">
            <div className="w-9 h-9 rounded-full grid place-items-center bg-emerald-500/10 border border-emerald-500/25 shrink-0">
              <span className="text-[var(--ok)] text-[15px]">✓</span>
            </div>
            <div>
              <div className="text-[15px] text-[var(--ok)]">No waste detected</div>
              <p className="prose-dim text-[13.5px] mt-1 max-w-[60ch]">
                Prefixes are cached, no repeated calls, independent work runs in parallel and
                every span reaches the answer. This is what a healthy run looks like.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            {analysis.findings.map((f, i) => {
              const open = openFinding === f.id;
              return (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.035, ease: [0.16, 1, 0.3, 1] }}
                  className={cn("rounded-[9px] border overflow-hidden interactive",
                    open ? "border-[var(--line-strong)] bg-white/[0.02]" : "hairline")}
                >
                  <button
                    onClick={() => { setOpenFinding(open ? null : f.id); setSel(new Set(f.spanIds)); }}
                    className="w-full text-left px-4 py-3 flex items-center gap-3.5 hover:bg-white/[0.03] interactive"
                  >
                    <Badge tone={SEV_TONE[f.severity]}>{f.severity.toUpperCase()}</Badge>
                    <span className="text-[14px] flex-1 min-w-0">{f.title}</span>
                    {f.wastedUsd ? <span className="mono text-[11.5px] text-[var(--critical)]">{usd(f.wastedUsd)}</span> : null}
                    {f.wastedMs ? <span className="mono text-[11.5px] text-[var(--warn)]">{ms(f.wastedMs)}</span> : null}
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <div className="px-4 pb-4 pt-3 border-t hairline">
                          <p className="prose-dim text-[13.5px] max-w-[80ch]">{f.detail}</p>
                          <div className="mono text-[11px] mt-3 text-[var(--accent-soft)]">
                            {f.spanIds.length} span{f.spanIds.length > 1 ? "s" : ""} highlighted below ↓
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}

        <AnimatePresence>
          {narration && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-5 rounded-[9px] border border-violet-500/25 bg-violet-500/[0.05] p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={12} className="text-[var(--accent-soft)]" />
                <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--accent-soft)]">
                  Ranked by expected value of fix
                </span>
              </div>
              <div className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{narration}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* waterfall */}
      <Card className="p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <div>
            <CardLabel>Waterfall</CardLabel>
            <div className="text-[12.5px] dim mt-1">
              Critical path is solid. Dashed trails are slack — time a span could waste for free.
            </div>
          </div>
          <div className="flex gap-3.5 mono text-[10px] dimmer">
            {["llm", "tool", "retrieval", "agent"].map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <i className="w-2 h-2 rounded-[2px]" style={{ background: KIND_COLOR[k] }} />{k}
              </span>
            ))}
          </div>
        </div>
        <div className="text-[11.5px] dimmer mb-3">Click any span to inspect it.</div>
        <div className="grid gap-[3px]">
          {trace.spans.map((s, i) => (
            <Row key={s.id} span={s} total={trace.totalMs} index={i}
                 onCritical={cpSet.has(s.id)} slack={analysis.slack.get(s.id) ?? 0}
                 selected={sel.has(s.id) || inspect?.id === s.id}
                 dimmed={sel.size > 0 && !sel.has(s.id)}
                 onClick={() => { setSel(new Set([s.id])); setInspect(s); }} />
          ))}
        </div>
        <AnimatePresence>
          {inspect && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <SpanDetail
                span={inspect}
                slack={analysis.slack.get(inspect.id) ?? 0}
                onCritical={cpSet.has(inspect.id)}
                onClose={() => { setInspect(null); setSel(new Set()); }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* cost attribution */}
      {analysis.costByNode.some((n) => n.costUsd > 0) && (
        <Card className="p-6">
          <CardLabel>Cost attribution by node</CardLabel>
          <div className="grid gap-1.5 mt-4">
            {analysis.costByNode.filter((n) => n.costUsd > 0).map((n, i) => (
              <div key={n.name} className="flex items-center gap-4 text-[13px]">
                <span className="mono w-44 truncate shrink-0" style={{ color: KIND_COLOR[n.kind] }}>{n.name}</span>
                <span className="mono text-[11px] dimmer w-10 shrink-0">{n.calls}×</span>
                <div className="flex-1 h-2 rounded-full bg-white/[0.04] overflow-hidden">
                  <motion.div className="h-full rounded-full" style={{ background: KIND_COLOR[n.kind] }}
                    initial={{ width: 0 }} animate={{ width: `${n.share * 100}%` }}
                    transition={{ duration: 0.7, delay: 0.1 + i * 0.05, ease: [0.16, 1, 0.3, 1] }} />
                </div>
                <span className="mono text-[11.5px] w-20 text-right shrink-0">{usd(n.costUsd)}</span>
                <span className="mono text-[11px] dimmer w-11 text-right shrink-0">{Math.round(n.share * 100)}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function SpanDetail({
  span, slack, onCritical, onClose,
}: { span: Span; slack: number; onCritical: boolean; onClose: () => void }) {
  const hasText = Boolean(span.inputPreview || span.outputPreview);

  return (
    <div className="mt-5 pt-5 border-t hairline">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          <i className="w-2 h-2 rounded-[2px]" style={{ background: KIND_COLOR[span.kind] }} />
          <span className="mono text-[14px]">{span.name}</span>
          <Badge tone="neutral">{span.kind}</Badge>
          {span.model && <Badge tone="accent">{span.model}</Badge>}
          {onCritical && <Badge tone="accent">on critical path</Badge>}
          {span.status === "error" && <Badge tone="critical">error</Badge>}
        </div>
        <button onClick={onClose} className="dimmer hover:text-[var(--ink)] interactive shrink-0" aria-label="close">
          <X size={15} />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mt-4">
        <Stat label="duration" value={ms(span.durationMs)} />
        <Stat label="started at" value={ms(span.startMs)} />
        <Stat label="slack" value={slack > 1 ? ms(slack) : "none"}
              hint={slack > 1 ? "can run late for free" : "gates the run"} />
        {span.inputTokens != null && <Stat label="tokens in" value={span.inputTokens.toLocaleString()} />}
        {span.outputTokens != null && <Stat label="tokens out" value={span.outputTokens.toLocaleString()} />}
        {span.costUsd != null && <Stat label="cost" value={usd(span.costUsd)} />}
        {span.cachedTokens ? <Stat label="cached" value={span.cachedTokens.toLocaleString()} /> : null}
      </div>

      {span.error && (
        <div className="mt-4 p-3 rounded-[8px] bg-red-500/[0.07] border border-red-500/25">
          <div className="mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--critical)] mb-1.5">error</div>
          <div className="mono text-[11.5px] text-[var(--critical)] break-words">{span.error}</div>
        </div>
      )}

      {hasText ? (
        <div className="grid lg:grid-cols-2 gap-3 mt-4">
          {span.inputPreview && <Payload label="input · what went in" body={span.inputPreview} />}
          {span.outputPreview && <Payload label="output · what came back" body={span.outputPreview} />}
        </div>
      ) : (
        <div className="mt-4 flex items-start gap-2.5 p-3 rounded-[8px] bg-white/[0.02] border hairline">
          <EyeOff size={14} className="dimmer mt-0.5 shrink-0" />
          <div className="prose-dim text-[12.5px]">
            No prompt or output text on this span. Either the trace did not carry it, or the run
            was saved with redaction on — the measurements above are unaffected either way.
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-[0.12em] dimmer">{label}</div>
      <div className="mono text-[13px] mt-1">{value}</div>
      {hint && <div className="text-[10px] dimmer mt-0.5">{hint}</div>}
    </div>
  );
}

function Payload({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="mono text-[9.5px] uppercase tracking-[0.12em] dimmer mb-1.5">{label}</div>
      <pre className="mono text-[11px] leading-[1.65] p-3 rounded-[8px] bg-black/45 border hairline
                      max-h-64 overflow-auto whitespace-pre-wrap break-words dim">{body}</pre>
    </div>
  );
}

function Metric({ label, value, format, sub, accent }: {
  label: string; value: number; format: (n: number) => string; sub: string; accent?: string;
}) {
  return (
    <div className="panel px-4 py-3.5">
      <CardLabel>{label}</CardLabel>
      <div className="mono text-[21px] mt-1.5" style={accent ? { color: accent } : undefined}>
        <CountUp value={value} format={format} duration={0.7} />
      </div>
      <div className="mono text-[10px] dimmer mt-1">{sub}</div>
    </div>
  );
}

function Row({ span, total, index, onCritical, slack, selected, dimmed, onClick }: {
  span: Span; total: number; index: number; onCritical: boolean; slack: number;
  selected: boolean; dimmed: boolean; onClick: () => void;
}) {
  const left = (span.startMs / total) * 100;
  const width = Math.max((span.durationMs / total) * 100, 0.4);
  const slackW = (Math.min(slack, total - span.endMs) / total) * 100;
  const color = KIND_COLOR[span.kind];

  return (
    <button onClick={onClick} className={cn(
      "grid grid-cols-[250px_minmax(0,1fr)_160px] items-center gap-4 text-left rounded-[6px] px-2 py-[4px] interactive",
      selected ? "bg-white/[0.07]" : "hover:bg-white/[0.035]", dimmed && "opacity-25",
    )}>
      <div className="flex items-center gap-2 min-w-0" style={{ paddingLeft: span.depth * 14 }}>
        <i className="w-1.5 h-1.5 rounded-[2px] shrink-0" style={{ background: color }} />
        <span className="mono text-[12px] truncate">{span.name}</span>
        {span.status === "error" && <Badge tone="critical">ERR</Badge>}
        {onCritical && <Badge tone="accent">CP</Badge>}
      </div>
      <div className="relative h-4">
        <motion.div className="absolute top-1/2 -translate-y-1/2 h-[9px] rounded-[3px]"
          style={{
            left: `${left}%`, background: span.status === "error" ? "var(--critical)" : color,
            opacity: onCritical ? 1 : 0.5,
            boxShadow: onCritical ? `0 0 0 1px ${color}, 0 0 12px -2px ${color}` : undefined,
          }}
          initial={{ width: 0 }} animate={{ width: `${width}%` }}
          transition={{ duration: 0.5, delay: index * 0.025, ease: [0.16, 1, 0.3, 1] }} />
        {slackW > 0.5 && (
          <Tip label={`${Math.round(slack)}ms of slack — this span finishes before anything needs it, so optimizing it returns no wall-clock.`}>
            <div className="absolute top-1/2 -translate-y-1/2 h-[9px] rounded-[3px] border border-dashed border-[var(--line-strong)]"
                 style={{ left: `${left + width}%`, width: `${slackW}%` }} />
          </Tip>
        )}
      </div>
      <div className="mono text-[11.5px] dimmer text-right">
        {ms(span.durationMs)}
        {span.costUsd ? <span className="ml-2.5 text-[var(--ink-2)]">{usd(span.costUsd)}</span> : null}
      </div>
    </button>
  );
}
