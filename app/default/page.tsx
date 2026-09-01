"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Info } from "lucide-react";
import { normalize } from "@/lib/normalize";
import { analyze } from "@/lib/analyze";
import AnalysisView from "@/components/AnalysisView";
import { Badge, Button, Card, CardLabel, Skeleton, TooltipRoot } from "@/components/ui";
import { cn } from "@/lib/cn";

const SHELL = "mx-auto w-full max-w-[1600px] px-6 sm:px-10 lg:px-14";

interface Sample { id: string; label: string; sub: string; demonstrates: string; headline: string }

export default function DefaultRun() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [active, setActive] = useState("react");
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/samples/${id}`);
      if (r.ok) { setRaw(await r.text()); setActive(id); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await (await fetch("/api/samples")).json();
      if (!alive) return;
      setSamples(list);
      await load("react");
    })();
    return () => { alive = false; };
  }, [load]);

  const result = useMemo(() => {
    if (!raw.trim()) return null;
    try {
      const trace = normalize(raw);
      return { trace, analysis: analyze(trace) };
    } catch { return null; }
  }, [raw]);

  const current = samples.find((s) => s.id === active);

  return (
    <TooltipRoot>
      <main className="min-h-screen">
        {/* nav */}
        <nav className="sticky top-0 z-30 backdrop-blur-xl bg-[var(--bg)]/80 border-b hairline">
          <div className={`${SHELL} h-16 flex items-center justify-between gap-6`}>
            <Link href="/" className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]" />
              <span className="font-semibold tracking-[-0.02em]">Agent X-Ray</span>
            </Link>
            <div className="flex items-center gap-6 text-[13px]">
              <Link href="/docs/start-here" className="dim hover:text-[var(--ink)] interactive hidden sm:inline">Docs</Link>
              <Link href="/login">
                <Button variant="primary" size="sm">
                  Analyze your own <ArrowRight size={13} />
                </Button>
              </Link>
            </div>
          </div>
        </nav>

        <div className={`${SHELL} py-9`}>
          {/* framing */}
          <div className="max-w-[75ch]">
            <div className="eyebrow">A worked example</div>
            <h1 className="display text-[clamp(1.9rem,3vw,2.5rem)] mt-4">
              This is what Agent X-Ray tells you about an agent run
            </h1>
            <p className="prose-dim text-[15px] mt-4">
              Below is a real analysis of a sample trace — nothing is mocked, the engine ran in your
              browser as this page loaded. Switch between the three runs to see how the same
              detectors behave on a broken agent and a healthy one.
            </p>
          </div>

          {/* sample switcher */}
          <div className="grid md:grid-cols-3 gap-3 mt-8">
            {samples.length === 0 && Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[120px]" />
            ))}
            {samples.map((s) => (
              <button
                key={s.id}
                onClick={() => void load(s.id)}
                className={cn(
                  "text-left rounded-[10px] p-4 border interactive relative",
                  active === s.id
                    ? "border-violet-500/45 bg-violet-500/[0.07]"
                    : "hairline hover:bg-white/[0.03] hover:border-[var(--line-strong)]",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14px]">{s.label}</span>
                  {active === s.id && <Badge tone="accent">showing</Badge>}
                </div>
                <div className="mono text-[10px] dimmer mt-1">{s.sub}</div>
                <div className={cn(
                  "mono text-[11px] mt-2",
                  s.headline.startsWith("0%") ? "text-[var(--ok)]" : "text-[var(--critical)]",
                )}>
                  {s.headline}
                </div>
              </button>
            ))}
          </div>

          {/* what this run demonstrates */}
          {current && (
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4"
            >
              <Card className="p-5 flex items-start gap-3">
                <Info size={16} className="text-[var(--accent-soft)] mt-0.5 shrink-0" />
                <div>
                  <CardLabel>What this run demonstrates</CardLabel>
                  <p className="prose-dim text-[13.5px] mt-1.5 max-w-[85ch]">{current.demonstrates}</p>
                </div>
              </Card>
            </motion.div>
          )}

          {/* the analysis */}
          <div className="mt-6">
            {loading && !result && (
              <div className="grid gap-6">
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[86px]" />)}
                </div>
                <Skeleton className="h-[300px]" />
                <Skeleton className="h-[400px]" />
              </div>
            )}
            {result && (
              <AnalysisView key={active} trace={result.trace} analysis={result.analysis} />
            )}
          </div>

          {/* how to read it */}
          <Card className="p-6 mt-6">
            <CardLabel>How to read this page</CardLabel>
            <div className="grid md:grid-cols-2 gap-x-10 gap-y-4 mt-4">
              {[
                ["Recoverable", "Spend you could remove without changing what the agent does. Over 25% turns red."],
                ["Critical path", "The chain that decides total runtime. A low share means the win is parallelism, not faster steps."],
                ["Solid vs dimmed bars", "Solid bars gate the finish. Dimmed ones have slack — optimizing them returns nothing."],
                ["Dashed trails", "How much slack a span has. Hover for the figure."],
                ["Click a finding", "It highlights the spans it refers to in the waterfall below."],
                ["Click a span", "Opens its timings, tokens, cost and the actual prompt and output."],
              ].map(([t, d]) => (
                <div key={t}>
                  <div className="text-[13.5px]">{t}</div>
                  <p className="prose-dim text-[12.5px] mt-0.5">{d}</p>
                </div>
              ))}
            </div>
            <p className="prose-dim text-[12.5px] mt-5 pt-4 border-t hairline">
              Full reference in the{" "}
              <Link href="/docs" className="text-[var(--accent-soft)] hover:underline">docs</Link>, or
              start from zero with{" "}
              <Link href="/docs/start-here" className="text-[var(--accent-soft)] hover:underline">
                what is all of this
              </Link>.
            </p>
          </Card>

          {/* cta */}
          <Card className="p-8 mt-6 text-center">
            <h2 className="section-title text-[22px]">Run it on your own trace</h2>
            <p className="prose-dim text-[14px] mt-2 max-w-[60ch] mx-auto">
              Paste an OpenTelemetry, Langfuse or LangSmith export. The analysis runs in your
              browser — nothing is uploaded unless you choose to save it.
            </p>
            <Link href="/login" className="inline-block mt-6">
              <Button variant="primary" size="lg">Analyze your own trace <ArrowRight size={15} /></Button>
            </Link>
          </Card>
        </div>

        <footer className="border-t hairline mt-6">
          <div className={`${SHELL} py-8`}>
            <div className="mono text-[11px] dimmer">
              Agent X-Ray · deterministic analysis, nothing uploaded · MIT licensed
            </div>
            <p className="prose-dim text-[11.5px] mt-4 max-w-[80ch] leading-relaxed">
              A personal, independent open-source project. Not affiliated with, endorsed by, or
              connected to any employer or client. All sample traces are synthetic.
            </p>
          </div>
        </footer>
      </main>
    </TooltipRoot>
  );
}
