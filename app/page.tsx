"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check, X, Activity, GitBranch, Repeat, Scissors } from "lucide-react";
import { Badge, Button, Card, CardLabel, CountUp, Reveal, TooltipRoot } from "@/components/ui";
import { HeroCta, NavCta } from "@/components/SessionCta";

const SHELL = "mx-auto w-full max-w-[1600px] px-6 sm:px-10 lg:px-14";

const ANALYSES = [
  {
    icon: Activity, tag: "cost", title: "Context re-send decomposition",
    lede: "The largest recoverable cost in most agent runs, and nothing else surfaces it.",
    body: "A ReAct loop re-sends turns 1..N−1 on turn N, so input tokens grow roughly quadratically. Every other tool sums them into a single number. X-Ray takes the character-level longest common prefix between consecutive LLM inputs, splits each call into novel versus carried tokens, and prices the carried portion that was never served from cache.",
    out: "$0.052 recoverable · 56% of this run's spend",
  },
  {
    icon: GitBranch, tag: "latency", title: "Critical path with PERT slack",
    lede: "A slow span with slack is not worth optimizing. Zero wall-clock gain.",
    body: "Wall-clock is not the sum of spans. The span tree is structural, so X-Ray rebuilds the real data-flow DAG — parent edges plus dependencies inferred from 8-word-gram overlap between one span's output and another's input. Forward and backward passes then yield the longest path and per-span slack.",
    out: "25.2s critical path · 60% of 41.8s wall clock",
  },
  {
    icon: Repeat, tag: "waste", title: "Semantic loop detection",
    lede: "Agents don't loop with identical strings. They loop with paraphrases.",
    body: "64-permutation MinHash over character 5-gram shingles, combined with a stemmed word-set Jaccard for short tool arguments. Clusters at 0.7, then classifies thrash versus legitimate retry versus pagination. For LLM spans only the novel suffix is compared, so a growing conversation is never mistaken for repetition.",
    out: '3× search_docs · "refund policy for damaged items" ≈ "policy for refunds on damaged item"',
  },
  {
    icon: Scissors, tag: "waste", title: "Dead branch analysis",
    lede: "The agent equivalent of dead code, and directly priceable.",
    body: "Reverse reachability from the final answer over data-flow edges only. Any span that cannot be reached produced output that never influenced the result — computed, billed, discarded. Structural edges are deliberately excluded, since everything is reachable from the root through those.",
    out: "2 spans never reached the answer · 4.0s billed",
  },
];

// the real sample run, drawn to scale
const HERO_SPANS: [string, number, number, string, boolean][] = [
  ["planner",          0.2,  5.5, "var(--k-llm)",       true],
  ["search_docs",      6.0,  3.8, "var(--k-tool)",      false],
  ["search_docs",     10.0,  3.3, "var(--k-tool)",      false],
  ["search_docs",     13.6,  3.1, "var(--k-tool)",      false],
  ["react_turn_2",    17.0,  9.8, "var(--k-llm)",       true],
  ["fetch_order",     27.0,  6.7, "var(--k-tool)",      true],
  ["fetch_customer",  34.0,  6.4, "var(--k-tool)",      false],
  ["vector_search_kb",41.0,  6.0, "var(--k-retrieval)", false],
  ["final_answer",    47.5, 31.0, "var(--k-llm)",       true],
];

export default function Landing() {
  return (
    <TooltipRoot>
      <main className="min-h-screen">
        {/* ---------------------------- nav ---------------------------- */}
        <nav className="sticky top-0 z-30 backdrop-blur-xl bg-[var(--bg)]/75 border-b hairline">
          <div className={`${SHELL} h-16 flex items-center justify-between`}>
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]" />
              <span className="font-semibold tracking-[-0.02em]">Costpath</span>
            </div>
            <div className="flex items-center gap-6 text-[13px]">
              <a href="#analyses" className="dim hover:text-[var(--ink)] interactive hidden md:inline">What it computes</a>
              <Link href="/docs/start-here" className="dim hover:text-[var(--ink)] interactive hidden md:inline">Docs</Link>
              <a href="#privacy" className="dim hover:text-[var(--ink)] interactive hidden md:inline">Privacy</a>
              <a href="#ci" className="dim hover:text-[var(--ink)] interactive hidden md:inline">CI</a>
              <NavCta />
            </div>
          </div>
        </nav>

        {/* --------------------------- hero ---------------------------- */}
        <section className="relative hero-glow overflow-hidden border-b hairline">
          <div className={`${SHELL} relative z-10 pt-24 pb-20`}>
            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,620px)] gap-16 items-center">
              <div>
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="eyebrow"
                >
                  Cost and latency analysis for AI agent runs
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
                  className="display text-[clamp(2.4rem,4.4vw,4rem)] mt-5"
                >
                  Your agent run cost $4.20 and took 42 seconds.
                  <span className="dim"> Your tracing tool won&apos;t tell you why.</span>
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="prose-dim text-[15px] mt-7 max-w-[58ch]"
                >
                  Langfuse, LangSmith and Braintrust render the span tree and sum the tokens. They
                  tell you what happened. They don&apos;t tell you which step gated the latency, where
                  the money went, or which work was thrown away. Critical path, slack and cost
                  attribution are decades-old scheduling ideas. Nobody had pointed them at an
                  agent run.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.26, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-9"
                >
                  <HeroCta />
                </motion.div>
              </div>

              {/* hero waterfall — the product, not an illustration */}
              <motion.div
                initial={{ opacity: 0, scale: 0.97, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="panel-raised p-5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="mono text-[11px] dim">support_agent · refund request</span>
                    <Badge tone="critical">56% WASTE</Badge>
                  </div>

                  <div className="grid gap-[5px]">
                    {HERO_SPANS.map(([name, start, width, color, onCp], i) => (
                      <div key={i} className="grid grid-cols-[122px_1fr] items-center gap-3">
                        <span className="mono text-[10.5px] dim truncate">{name as string}</span>
                        <div className="relative h-[9px]">
                          <motion.div
                            className="absolute top-0 h-full rounded-[3px]"
                            style={{ left: `${start}%`, background: color as string, opacity: onCp ? 1 : 0.45 }}
                            initial={{ width: 0 }}
                            animate={{ width: `${width}%` }}
                            transition={{ duration: 0.65, delay: 0.5 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-4 mt-4 pt-3 border-t hairline mono text-[10px] dimmer">
                    <span className="flex items-center gap-1.5">
                      <i className="w-2.5 h-[3px] rounded-sm bg-[var(--k-llm)]" /> on critical path
                    </span>
                    <span className="flex items-center gap-1.5">
                      <i className="w-2.5 h-[3px] rounded-sm bg-[var(--k-tool)] opacity-45" /> has slack
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* metric strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-20">
              {([
                ["Wall clock", 41.8, (n: number) => `${n.toFixed(1)}s`, "13 spans", undefined],
                ["Cost", 0.0934, (n: number) => `$${n.toFixed(3)}`, "31.7k tokens in", undefined],
                ["Recoverable", 0.0522, (n: number) => `$${n.toFixed(3)}`, "56% of spend", "var(--critical)"],
                ["Critical path", 25.2, (n: number) => `${n.toFixed(1)}s`, "60% of wall clock", undefined],
              ] as const).map(([label, value, fmt, sub, accent], i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, delay: 0.45 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                  className="panel px-5 py-4"
                >
                  <CardLabel>{label}</CardLabel>
                  <div className="mono text-[26px] mt-1.5" style={accent ? { color: accent } : undefined}>
                    <CountUp value={value} format={fmt} />
                  </div>
                  <div className="mono text-[10px] dimmer mt-1">{sub}</div>
                </motion.div>
              ))}
            </div>
            <div className="mono text-[11px] dimmer mt-4">
              ↑ measured from the bundled sample run — not illustrative numbers
            </div>
          </div>
        </section>

        {/* ------------------------- analyses -------------------------- */}
        <section id="analyses" className={`${SHELL} py-24`}>
          <Reveal>
            <div className="max-w-2xl">
              <div className="eyebrow">The engine</div>
              <h2 className="section-title text-[clamp(1.7rem,2.6vw,2.3rem)] mt-4">
                Four things it computes
              </h2>
              <p className="prose-dim text-[15px] mt-3">
                All deterministic. No model runs in the analysis path, so the same trace always
                produces the same findings — which is what makes it an analysis tool rather than
                a chatbot.
              </p>
            </div>
          </Reveal>

          <div className="grid lg:grid-cols-2 gap-5 mt-12">
            {ANALYSES.map((a, i) => (
              <Reveal key={a.title} delay={i * 0.06}>
                <Card className="p-7 h-full flex flex-col group hover:border-[var(--line-strong)] interactive">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-[9px] grid place-items-center bg-violet-500/10 border border-violet-500/20">
                      <a.icon size={16} className="text-[var(--accent-soft)]" />
                    </div>
                    <Badge tone="accent">{a.tag}</Badge>
                  </div>
                  <h3 className="text-[19px] font-medium tracking-[-0.015em] mt-5">{a.title}</h3>
                  <p className="text-[14px] mt-2 text-[var(--ink)]/80">{a.lede}</p>
                  <p className="prose-dim text-[13.5px] mt-4 flex-1">{a.body}</p>
                  <div className="mono text-[11px] mt-6 pt-4 border-t hairline text-[var(--ok)]">
                    {a.out}
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>

        {/* -------------------------- ingest --------------------------- */}
        <section className={`${SHELL} py-20 border-t hairline`}>
          <Reveal>
            <div className="grid lg:grid-cols-[minmax(0,420px)_1fr] gap-12 items-start">
              <div>
                <div className="eyebrow">Ingest</div>
                <h2 className="section-title text-[clamp(1.6rem,2.4vw,2.1rem)] mt-4">
                  Works with what you already emit
                </h2>
                <p className="prose-dim text-[14.5px] mt-3">
                  Adapters are tried in order and the first match wins. If your stack is
                  instrumented with OpenTelemetry, there is nothing to install.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  ["OpenTelemetry", "OTLP JSON · GenAI semantic conventions", true],
                  ["Langfuse", "trace export", false],
                  ["LangSmith", "LangGraph run tree", false],
                  ["Native", "a flat span array", false],
                ].map(([n, d, primary]) => (
                  <div key={n as string} className={`panel px-5 py-4 ${primary ? "border-violet-500/25" : ""}`}>
                    <div className="text-[15px]">{n}</div>
                    <div className="mono text-[10.5px] dimmer mt-1.5">{d}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ------------------------- audience -------------------------- */}
        <section className={`${SHELL} py-20 border-t hairline`}>
          <Reveal>
            <div className="max-w-2xl">
              <div className="eyebrow">Who it&apos;s for</div>
              <h2 className="section-title text-[clamp(1.6rem,2.4vw,2.1rem)] mt-4">
                Built for the person who owns the bill
              </h2>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-5 mt-10">
            {[
              ["Engineers shipping agents",
               "Which slow step actually gates the run, and which is free to ignore because it has slack."],
              ["Teams watching an AI budget",
               "A dollar figure for recoverable spend across every run, and the workflow responsible for most of it."],
              ["Platform teams",
               "A CI gate. Push a trace, assert on wasteShare, fail the build when a prompt change makes an agent wasteful."],
            ].map(([t, d], i) => (
              <Reveal key={t} delay={i * 0.06}>
                <Card className="p-6 h-full">
                  <div className="text-[15.5px]">{t}</div>
                  <p className="prose-dim text-[13.5px] mt-2">{d}</p>
                </Card>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.2}>
            <p className="prose-dim text-[13.5px] mt-7 max-w-[70ch]">
              <span className="text-[var(--ink)]">Not for live monitoring.</span> If you need a
              collector or alerting, use Langfuse, LangSmith or an OpenTelemetry backend — Agent
              X-Ray reads what they produce and tells you what it means.
            </p>
          </Reveal>
        </section>

        {/* -------------------------- privacy -------------------------- */}
        <section id="privacy" className={`${SHELL} py-24 border-t hairline`}>
          <div className="grid lg:grid-cols-[1fr_minmax(0,460px)] gap-16 items-start">
            <Reveal>
              <div className="mono text-[11px] text-[var(--ok)] tracking-[0.18em] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)] shadow-[0_0_10px_var(--ok)]" />
                PRIVACY
              </div>
              <h2 className="section-title text-[clamp(1.8rem,2.8vw,2.5rem)] mt-4 max-w-[18ch]">
                Your traces never leave your browser
              </h2>
              <p className="prose-dim text-[15px] mt-5 max-w-[62ch]">
                The entire analysis engine runs client-side. Nothing is uploaded, no account is
                required, and there is no backend in the analysis path at all. Agent traces carry
                system prompts, customer records and internal tool output — every incumbent here
                is SaaS that ingests exactly that.
              </p>
              <p className="prose-dim text-[15px] mt-4 max-w-[62ch]">
                When a team does opt into saving a run, prompt and completion text is{" "}
                <span className="text-[var(--ink)]">stripped by default</span>. What persists is
                what we measured. The analysis is computed before redaction and stored alongside
                it, so a redacted run still shows every finding.
              </p>
            </Reveal>

            <Reveal delay={0.1}>
              <Card raised className="p-6">
                <CardLabel>When you save a run</CardLabel>
                <div className="grid gap-2.5 mt-4 mono text-[12.5px]">
                  {[
                    ["span names, kinds, parentage", true],
                    ["timings, token counts, model ids", true],
                    ["computed findings and costs", true],
                    ["system prompts", false],
                    ["tool arguments and output", false],
                    ["model completions", false],
                  ].map(([label, kept]) => (
                    <div key={String(label)} className="flex items-center gap-3">
                      {kept
                        ? <Check size={14} className="text-[var(--ok)] shrink-0" />
                        : <X size={14} className="text-[var(--critical)] shrink-0" />}
                      <span className={kept ? "" : "dimmer line-through"}>{label}</span>
                    </div>
                  ))}
                </div>
                <div className="text-[12.5px] dim mt-5 pt-4 border-t hairline leading-relaxed">
                  Tenant isolation is enforced by Postgres row-level security, not by application
                  code. A query that forgets its filter returns nothing rather than leaking.
                </div>
              </Card>
            </Reveal>
          </div>
        </section>

        {/* ----------------------------- CI ---------------------------- */}
        <section id="ci" className={`${SHELL} py-24 border-t hairline`}>
          <Reveal>
            <div className="eyebrow">Continuous integration</div>
            <h2 className="section-title text-[clamp(1.7rem,2.6vw,2.3rem)] mt-4">
              Fail the build on agent regressions
            </h2>
            <p className="prose-dim text-[15px] mt-3 max-w-[62ch]">
              Push a trace from CI and get back a number you can assert on. When a prompt change
              drives recoverable waste past your threshold, the build goes red.
            </p>
          </Reveal>

          <Reveal delay={0.08}>
            <Card raised className="mt-9 overflow-x-auto">
              <div className="flex items-center gap-2 px-5 py-3 border-b hairline">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
                <span className="mono text-[11px] dimmer ml-2">ci · post-run hook</span>
              </div>
              <pre className="mono text-[12.5px] leading-[1.75] p-6"><span className="dimmer">$</span> curl -X POST https://costpath.app/api/ingest \
    -H <span className="text-[var(--ok)]">&quot;Authorization: Bearer axr_...&quot;</span> \
    --data @trace.json

<span className="dimmer">{"{"}</span>
  <span className="text-[var(--accent-soft)]">&quot;spans&quot;</span>: 13,
  <span className="text-[var(--accent-soft)]">&quot;costUsd&quot;</span>: 0.0934,
  <span className="text-[var(--accent-soft)]">&quot;recoverableUsd&quot;</span>: 0.0522,
  <span className="text-[var(--accent-soft)]">&quot;wasteShare&quot;</span>: <span className="text-[var(--critical)]">0.5589</span>,   <span className="dimmer">← assert on this</span>
  <span className="text-[var(--accent-soft)]">&quot;findings&quot;</span>: [<span className="dimmer">{"{"} &quot;severity&quot;: &quot;critical&quot;, &quot;title&quot;: &quot;Conversation prefix re-sent uncached…&quot; {"}"}</span>]
<span className="dimmer">{"}"}</span></pre>
            </Card>
          </Reveal>
        </section>

        {/* --------------------------- close --------------------------- */}
        <section className={`${SHELL} py-28 border-t hairline`}>
          <Reveal>
            <div className="text-center">
              <h2 className="section-title text-[clamp(2rem,3.4vw,3rem)]">
                Drop in a trace. Nothing to install.
              </h2>
              <p className="prose-dim text-[15px] mt-4">
                Sign in and three sample runs are waiting — including a healthy one, so you can
                see the detectors stay quiet when there&apos;s nothing wrong.
              </p>
              <Link href="/login" className="inline-block mt-9">
                <Button variant="primary" size="lg">Start analyzing <ArrowRight size={15} /></Button>
              </Link>
            </div>
          </Reveal>
        </section>

        <footer className="border-t hairline">
          <div className={`${SHELL} py-10`}>
            <div className="mono text-[11px] dimmer flex flex-wrap justify-between gap-3">
              <span>Costpath · deterministic analysis, nothing uploaded</span>
              <span>MIT licensed · built at a buildathon</span>
            </div>
            <p className="prose-dim text-[11.5px] mt-5 max-w-[80ch] leading-relaxed">
              A personal, independent open-source project. Not affiliated with, endorsed by, or
              connected to any employer or client. Costpath is a post-hoc analyser: it collects
              no telemetry, monitors nothing, and has no alerting — it reads a trace another tool
              already recorded. All sample traces are synthetic.
            </p>
          </div>
        </footer>
      </main>
    </TooltipRoot>
  );
}
