import Link from "next/link";

const ANALYSES = [
  {
    tag: "cost",
    title: "Context re-send decomposition",
    lede: "The largest recoverable cost in most agent runs, and nothing surfaces it.",
    body:
      "A ReAct loop re-sends turns 1..N−1 on turn N, so input tokens grow roughly quadratically. " +
      "Every other tool sums them into one number. X-Ray takes the character-level longest common prefix " +
      "between consecutive LLM inputs, splits each call into novel versus carried tokens, and prices the " +
      "carried portion that was never served from cache.",
    out: "$0.052 recoverable — 56% of this run's spend",
  },
  {
    tag: "latency",
    title: "Critical path with PERT slack",
    lede: "A slow span with slack is not worth optimizing. Zero wall-clock gain.",
    body:
      "Wall-clock is not the sum of spans. The span tree is structural, so X-Ray rebuilds the real data-flow " +
      "DAG — parent edges plus dependencies inferred from 8-word-gram overlap between one span's output and " +
      "another's input. A forward and backward pass then yields the longest path and per-span slack.",
    out: "25.2s critical path — 60% of 41.8s wall clock",
  },
  {
    tag: "waste",
    title: "Semantic loop detection",
    lede: "Agents don't loop with identical strings. They loop with paraphrases.",
    body:
      "64-permutation MinHash over character 5-gram shingles, combined with a stemmed word-set Jaccard for " +
      "short tool arguments. Clusters at 0.7, then classifies thrash versus legitimate retry versus pagination. " +
      "For LLM spans only the novel suffix is compared, so a growing conversation is never mistaken for repetition.",
    out: 'search_docs called 3× — "refund policy for damaged items" / "policy for refunds on damaged item"',
  },
  {
    tag: "waste",
    title: "Dead branch analysis",
    lede: "The agent equivalent of dead code, and directly priceable.",
    body:
      "Reverse reachability from the final answer over data-flow edges only. Any span that cannot be reached " +
      "produced output that never influenced the result — computed, billed, and discarded. Structural edges are " +
      "deliberately excluded, since everything is reachable from the root through those.",
    out: "2 spans never reached the answer — 4.0s, billed",
  },
];

export default function Landing() {
  return (
    <main className="min-h-screen">
      {/* nav */}
      <nav className="sticky top-0 z-20 backdrop-blur bg-[#0a0b0e]/80 border-b hairline">
        <div className="mx-auto max-w-[1100px] px-6 h-14 flex items-center justify-between">
          <span className="font-semibold tracking-tight">
            Agent X-Ray
          </span>
          <div className="flex items-center gap-5 text-[13px]">
            <a href="#analyses" className="dim hover:text-white transition hidden sm:inline">What it computes</a>
            <a href="#privacy" className="dim hover:text-white transition hidden sm:inline">Privacy</a>
            <a href="#ci" className="dim hover:text-white transition hidden sm:inline">CI</a>
            <Link href="/login" className="dim hover:text-white transition">Sign in</Link>
            <Link
              href="/analyze"
              className="mono text-[12px] px-3 py-1.5 rounded-md border border-violet-500/50 bg-violet-500/10 hover:bg-violet-500/20 transition"
            >
              open the tool ▸
            </Link>
          </div>
        </div>
      </nav>

      {/* hero */}
      <section className="mx-auto max-w-[1100px] px-6 pt-20 pb-16">
        <div className="mono text-[11px] text-violet-300/80 mb-5 tracking-wider">
          APM FOR AI AGENT TRACES
        </div>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.1] max-w-3xl">
          Your agent run cost $4.20 and took 42 seconds.
          <span className="dim"> Your tracing tool won&apos;t tell you why.</span>
        </h1>
        <p className="mt-6 text-[15px] leading-relaxed dim max-w-2xl">
          Langfuse, LangSmith and Braintrust render the span tree and sum the tokens. They tell you
          what happened. They do not tell you which step gated the latency, where the money went, or
          which work was thrown away. We solved this for microservices fifteen years ago — critical
          path, cost attribution, slack, root cause. Nobody had ported it to agent runs.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/analyze"
            className="text-[14px] px-5 py-2.5 rounded-md bg-violet-500 hover:bg-violet-400 text-black font-medium transition"
          >
            Analyze a trace
          </Link>
          <Link
            href="/analyze"
            className="mono text-[13px] px-5 py-2.5 rounded-md border hairline hover:bg-white/5 transition"
          >
            see a sample run ▸
          </Link>
          <span className="mono text-[11px] dim ml-1">no account needed</span>
        </div>

        {/* metric strip from the real sample */}
        <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ["Wall clock", "41.8s", "13 spans"],
            ["Cost", "$0.093", "31.7k tokens in"],
            ["Recoverable", "$0.052", "56% of spend", "#f87171"],
            ["Critical path", "25.2s", "60% of wall clock"],
          ].map(([label, value, sub, accent]) => (
            <div key={label} className="panel rounded-lg px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider dim">{label}</div>
              <div className="mono text-xl mt-1" style={accent ? { color: accent } : undefined}>{value}</div>
              <div className="mono text-[10px] dim mt-0.5">{sub}</div>
            </div>
          ))}
        </div>
        <div className="mono text-[11px] dim mt-3">
          ↑ measured from the bundled sample run, not illustrative numbers
        </div>
      </section>

      {/* the four analyses */}
      <section id="analyses" className="mx-auto max-w-[1100px] px-6 py-16 border-t hairline">
        <h2 className="text-2xl font-semibold tracking-tight">Four things it computes</h2>
        <p className="dim text-[14px] mt-2 max-w-2xl">
          All deterministic. No model runs in the analysis path, so the same trace always produces
          the same findings.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mt-8">
          {ANALYSES.map((a) => (
            <div key={a.title} className="panel rounded-lg p-5 flex flex-col">
              <div className="mono text-[10px] uppercase tracking-wider text-violet-300/70">{a.tag}</div>
              <h3 className="text-[17px] font-medium mt-2">{a.title}</h3>
              <p className="text-[13px] mt-1.5 text-white/70">{a.lede}</p>
              <p className="text-[13px] dim leading-relaxed mt-3 flex-1">{a.body}</p>
              <div className="mono text-[11px] mt-4 pt-3 border-t hairline text-emerald-300/90">
                {a.out}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ingest */}
      <section className="mx-auto max-w-[1100px] px-6 py-16 border-t hairline">
        <h2 className="text-2xl font-semibold tracking-tight">Works with what you already emit</h2>
        <p className="dim text-[14px] mt-2 max-w-2xl">
          Adapters are tried in order and the first match wins. If your stack is instrumented with
          OpenTelemetry, there is nothing to install.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-7">
          {[
            ["OpenTelemetry", "OTLP JSON, GenAI semantic conventions"],
            ["Langfuse", "trace export"],
            ["LangSmith", "LangGraph run tree"],
            ["Native", "a flat span array"],
          ].map(([n, d]) => (
            <div key={n} className="panel rounded-lg px-4 py-3">
              <div className="text-[14px]">{n}</div>
              <div className="mono text-[10px] dim mt-1">{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* privacy */}
      <section id="privacy" className="mx-auto max-w-[1100px] px-6 py-16 border-t hairline">
        <div className="grid lg:grid-cols-[1fr_420px] gap-10 items-start">
          <div>
            <div className="mono text-[11px] text-emerald-400 tracking-wider">● PRIVACY</div>
            <h2 className="text-2xl font-semibold tracking-tight mt-3">
              Your traces never leave your browser
            </h2>
            <p className="dim text-[14px] leading-relaxed mt-3">
              The entire analysis engine runs client-side. Nothing is uploaded, there is no account
              required, and there is no backend in the analysis path at all. Agent traces carry system
              prompts, customer records and internal tool output — every incumbent here is SaaS that
              ingests exactly that.
            </p>
            <p className="dim text-[14px] leading-relaxed mt-3">
              When a team does opt into saving a run, prompt and completion text is{" "}
              <span className="text-white/80">stripped by default</span>. What persists is what we
              measured: span names, timings, token counts, findings. The analysis is computed before
              redaction and stored alongside it, so a redacted run still shows every finding.
            </p>
          </div>
          <div className="panel rounded-lg p-5">
            <div className="text-[10px] uppercase tracking-wider dim mb-3">When you save a run</div>
            <div className="grid gap-2 mono text-[12px]">
              {[
                ["span names, kinds, parentage", true],
                ["timings, token counts, model ids", true],
                ["computed findings and costs", true],
                ["system prompts", false],
                ["tool arguments and output", false],
                ["model completions", false],
              ].map(([label, kept]) => (
                <div key={String(label)} className="flex items-center gap-2.5">
                  <span className={kept ? "text-emerald-400" : "text-red-400"}>{kept ? "kept" : "×  "}</span>
                  <span className={kept ? "" : "dim line-through"}>{label}</span>
                </div>
              ))}
            </div>
            <div className="text-[12px] dim mt-4 pt-3 border-t hairline leading-relaxed">
              Tenant isolation is enforced by Postgres row-level security, not by application code.
            </div>
          </div>
        </div>
      </section>

      {/* CI */}
      <section id="ci" className="mx-auto max-w-[1100px] px-6 py-16 border-t hairline">
        <h2 className="text-2xl font-semibold tracking-tight">Fail the build on agent regressions</h2>
        <p className="dim text-[14px] mt-2 max-w-2xl">
          Push a trace from CI and get back a number you can assert on. When a prompt change pushes
          recoverable waste past your threshold, the build goes red.
        </p>
        <div className="panel rounded-lg p-5 mt-7 overflow-x-auto">
          <pre className="mono text-[12px] leading-relaxed"><span className="dim">$</span> curl -X POST https://agent-xray.app/api/ingest \
  -H <span className="text-emerald-300">&quot;Authorization: Bearer axr_...&quot;</span> \
  --data @trace.json

{"{"}
  <span className="text-violet-300">&quot;spans&quot;</span>: 13,
  <span className="text-violet-300">&quot;costUsd&quot;</span>: 0.0934,
  <span className="text-violet-300">&quot;recoverableUsd&quot;</span>: 0.0522,
  <span className="text-violet-300">&quot;wasteShare&quot;</span>: <span className="text-red-300">0.5589</span>,
  <span className="text-violet-300">&quot;findings&quot;</span>: [{"{"} <span className="dim">&quot;severity&quot;: &quot;critical&quot;, &quot;title&quot;: &quot;Conversation prefix re-sent uncached…&quot;</span> {"}"}]
{"}"}</pre>
        </div>
      </section>

      {/* close */}
      <section className="mx-auto max-w-[1100px] px-6 py-20 border-t hairline text-center">
        <h2 className="text-3xl font-semibold tracking-tight">Drop in a trace. Nothing to install.</h2>
        <p className="dim text-[14px] mt-3">
          Three sample runs are bundled, including a healthy one for contrast.
        </p>
        <Link
          href="/analyze"
          className="inline-block mt-7 text-[14px] px-6 py-3 rounded-md bg-violet-500 hover:bg-violet-400 text-black font-medium transition"
        >
          Analyze a trace
        </Link>
      </section>

      <footer className="border-t hairline">
        <div className="mx-auto max-w-[1100px] px-6 py-8 mono text-[11px] dim flex flex-wrap justify-between gap-3">
          <span>Agent X-Ray · deterministic analysis, nothing uploaded</span>
          <span>built at a midnight buildathon</span>
        </div>
      </footer>
    </main>
  );
}
