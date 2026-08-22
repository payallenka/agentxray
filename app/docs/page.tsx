import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CriticalPathDiagram, ContextGrowthDiagram, PipelineDiagram } from "@/components/Diagrams";

export const metadata = {
  title: "Reading the analysis — Agent X-Ray",
  description: "What every number, chart and finding in Agent X-Ray means.",
};

const H1 = ({ children }: { children: React.ReactNode }) => (
  <h1 className="display text-[clamp(2rem,3.4vw,2.8rem)]">{children}</h1>
);
const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <h2 id={id} className="section-title text-[24px] mt-16 mb-4 scroll-mt-28">{children}</h2>
);
const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-[16.5px] font-medium mt-7 mb-2 tracking-[-0.01em]">{children}</h3>
);
const P = ({ children }: { children: React.ReactNode }) => (
  <p className="prose-dim text-[15px] my-4">{children}</p>
);
const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="my-6 pl-4 border-l-2 border-[var(--accent)] text-[15px] prose-dim">{children}</div>
);
const Code = ({ children }: { children: React.ReactNode }) => (
  <pre className="mono text-[12px] leading-[1.7] p-4 my-5 rounded-[9px] bg-black/45 border hairline overflow-x-auto dim">{children}</pre>
);
const K = ({ children }: { children: React.ReactNode }) => (
  <span className="mono text-[13px] text-[var(--ink)]">{children}</span>
);

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="my-6 rounded-[10px] border hairline overflow-x-auto">
      <table className="w-full text-[13.5px] border-collapse">
        <thead>
          <tr className="border-b hairline">
            {head.map((h) => (
              <th key={h} className="text-left px-4 py-2.5 mono text-[10px] uppercase tracking-[0.12em] dimmer font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 ? "bg-white/[0.015]" : ""}>
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-2.5 align-top ${j === 0 ? "text-[var(--ink)]" : "dim"}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Docs() {
  return (
    <>
      <div className="eyebrow">Reference</div>
      <H1>Reading the analysis</H1>
      <P>
        Every chart and number in Agent X-Ray, and how to interpret it. If the vocabulary is new,
        read{" "}
        <Link href="/docs/start-here" className="text-[var(--accent-soft)] hover:underline">
          Start here
        </Link>{" "}
        first.
      </P>

      <H2 id="metric-strip">The metric strip</H2>
      <P>
        Five numbers at the top of every run. Each one below is given with how it is computed and
        what it should change about your decision. Worked figures come from the{" "}
        <strong className="text-[var(--ink)]">Degraded ReAct agent</strong> sample.
      </P>

      <H3>Wall clock — 41.8s</H3>
      <Code>{`wallClock = max(span.endMs) − min(span.startMs)`}</Code>
      <P>
        Real elapsed time from the first span starting to the last one finishing. Not the sum of
        span durations — overlapping work is counted once, as a clock would.
      </P>
      <P>
        <strong className="text-[var(--ink)]">How it helps:</strong> it is the only number your
        user felt. When it exceeds your latency budget, do <em>not</em> go looking for the widest
        bar — go to critical path.
      </P>

      <H3>Cost — $0.093</H3>
      <Code>{`cost(span) = trace-reported cost
             ?? inputTokens/1e6 × rate.in(model)
              + outputTokens/1e6 × rate.out(model)

cost = Σ cost(span)`}</Code>
      <P>
        Trace-supplied cost always wins; the pricing table is only a fallback. Unknown models fall
        back to a mid-tier rate, so the magnitude stays right even when the exact model is not
        recognised.
      </P>
      <P>
        <strong className="text-[var(--ink)]">How it helps:</strong> on its own, almost nothing —
        nine cents is not a problem. Multiply by your run volume. Nine cents at fifty thousand runs
        a month is $4,650, and 56% of it is recoverable.
      </P>

      <H3>Recoverable — $0.052, 56% of spend</H3>
      <Code>{`wastedSpans = dead branches ∪ thrash repeats     // unioned by id
recoverable = min( cost,  contextWaste + Σ cost(wastedSpans) )`}</Code>
      <P>
        Spend that analysis says you could remove <em>without changing what the agent does</em> —
        not by using a cheaper model or accepting worse answers. The union matters: a span caught
        by two detectors is charged once. The cap guarantees it can never exceed what the run
        actually cost.
      </P>
      <P>
        <strong className="text-[var(--ink)]">How it helps:</strong> this is the headline. Above
        25% it turns red and there is a structural problem worth an afternoon. Below 10%, stop
        optimizing cost and look at latency instead.
      </P>

      <H3>Critical path — 25.2s, 60% of wall clock</H3>
      <Code>{`work(s)    = hasChildren(s) ? 0 : s.durationMs
EF(s)      = max( EF(d) for d in deps(s) ) + work(s)
criticalMs = max EF
share      = criticalMs / wallClock`}</Code>
      <P>
        The longest chain of genuinely dependent work. 60% means a quarter of the run —{" "}
        <span className="mono text-[13px]">41.8s − 25.2s = 16.6s</span> — was spent on work that
        nothing was waiting for.
      </P>
      <P>
        <strong className="text-[var(--ink)]">How it helps:</strong> it tells you which kind of fix
        pays. A <em>high</em> share (85%+) means the run is a genuine dependency chain — make
        individual steps faster. A <em>low</em> share means most time is off-path — the win is
        parallelism, and speeding up individual steps returns nothing.
      </P>

      <H3>Tokens in — 31.7k, no cache hits</H3>
      <Code>{`tokensIn = Σ span.inputTokens
cached   = Σ span.cachedTokens`}</Code>
      <P>
        Turns amber when input is large and cached is zero. On this run, four LLM calls consumed
        31,700 input tokens with not one cache hit — which is precisely why recoverable is 56%.
      </P>
      <P>
        <strong className="text-[var(--ink)]">How it helps:</strong> it is the fastest diagnostic
        on the page. Large input with zero cache hits is the most common expensive mistake in agent
        systems, and usually the cheapest to fix — one cache breakpoint after the system prompt.
      </P>

      <H3>Slack — per span, in the waterfall</H3>
      <Code>{`LF(s)    = min( LF(x) − work(x) for x in successors(s) )  or projectEnd
slack(s) = LF(s) − EF(s)`}</Code>
      <P>
        How much later a span could have finished without moving the finish line.{" "}
        <strong className="text-[var(--ink)]">A span with slack is not worth optimizing</strong> —
        making it faster returns exactly zero wall-clock. This is the single most useful thing the
        waterfall tells you, and the thing a plain span-tree viewer cannot.
      </P>

      <H2 id="samples">The three sample runs</H2>
      <P>
        Synthetic, but not arbitrary: each was built so a specific part of the engine has something
        to find, and one was built so it has nothing to find.
      </P>

      <H3>Degraded ReAct agent — the full sweep</H3>
      <P>
        A support agent handling a refund request, doing almost everything wrong at once. Use it to
        see every detector fire on one trace.
      </P>
      <Table
        head={["What was planted", "Which detector catches it", "Reported"]}
        rows={[
          ["Four LLM turns re-sending the whole conversation, no caching", "Context re-send", <span key="a" className="text-[var(--critical)]">$0.052</span>],
          [<>Three searches: <K>&quot;refund policy for damaged items&quot;</K>, <K>&quot;policy for refunds on damaged item&quot;</K>, <K>&quot;refunds policy damaged items rules&quot;</K></>, "Semantic loops — no two are string-identical", <span key="b" className="text-[var(--critical)]">2.7s thrash</span>],
          ["fetch_order and fetch_customer run back to back with no dependency", "Missed parallelism", <span key="c" className="text-[var(--warn)]">5.2s</span>],
          ["A knowledge-base retrieval nobody ever reads", "Dead branch", <span key="d" className="text-[var(--info)]">4.0s</span>],
          ["An SMTP failure followed by a successful resend", "Error grouping + retry classification", <span key="e" className="text-[var(--warn)]">retry, not thrash</span>],
        ]}
      />
      <Note>
        Note what it does <em>not</em> say. The resend is reported as a{" "}
        <strong className="text-[var(--ink)]">retry</strong>, not thrash, because it followed an
        error. Classifying legitimate retries as waste would be the fastest way to make the tool
        untrustworthy.
      </Note>

      <H3>OpenTelemetry export — proof of compatibility</H3>
      <P>
        A research agent, but the point is the format, not the agent. This is raw OTLP as an
        instrumented stack emits it: <K>resourceSpans</K>, nanosecond timestamps, and GenAI
        semantic-convention attributes — <K>gen_ai.usage.input_tokens</K>,{" "}
        <K>gen_ai.request.model</K>, <K>gen_ai.operation.name</K>.
      </P>
      <P>
        Nothing was converted for it. Use this one to answer &quot;will it work with what we
        already emit?&quot; — it reports <span className="mono text-[13px]">33% recoverable</span>{" "}
        and a duplicated <K>web_search</K> from a payload nobody reshaped.
      </P>

      <H3>Healthy run — the control</H3>
      <P>
        A pricing agent doing the same category of work, correctly: 2,920 of 3,300 input tokens
        served from cache, two lookups genuinely overlapping in time, no repeats, every span
        reaching the answer.
      </P>
      <P>
        Result: <span className="mono text-[13px] text-[var(--ok)]">0% waste</span>, one
        informational note about slack, and a green confirmation instead of a findings list.
      </P>
      <Note>
        <strong className="text-[var(--ink)]">This is the most important of the three.</strong>{" "}
        Any detector suite can find problems if it is willing to invent them. Load this one second
        in a demo — the contrast is what makes the first run&apos;s 56% believable.
      </Note>

      <H2 id="findings">Findings</H2>      <H2 id="findings">Findings</H2>
      <P>
        Ranked by severity, then by dollars, then by milliseconds. The number on the right is what
        the finding costs you — red for money, amber for time. Some findings only waste time and
        carry no dollar figure.
      </P>
      <Table
        head={["Severity", "Meaning"]}
        rows={[
          [<span key="c" className="text-[var(--critical)]">CRITICAL</span>, "Real money or a failure. Over 30% of spend, a thrash loop of three or more, or an errored span."],
          [<span key="w" className="text-[var(--warn)]">WARN</span>, "Worth fixing but bounded — a two-call loop, a retry, sequential independent work."],
          [<span key="i" className="text-[var(--info)]">INFO</span>, "Context rather than a defect. Slack, small dead branches."],
        ]}
      />
      <P>Click a finding to expand it and highlight the spans it refers to in the waterfall below.</P>

      <H3>An empty findings list is a result</H3>
      <P>
        When a run is clean you get a green confirmation, not a blank panel. A tool that always
        finds something cannot be trusted when it does.
      </P>

      <H2 id="waterfall">The waterfall</H2>
      <P>
        Horizontal position is <em>when</em>, width is <em>how long</em>, colour is <em>what kind</em> of
        work. Click any span to inspect it.
      </P>
      <CriticalPathDiagram />
      <Table
        head={["What you see", "What it means"]}
        rows={[
          [<span key="1" className="mono text-[12.5px]">solid, glowing, CP</span>, "On the critical path. Speeding this up speeds up the whole run."],
          [<span key="2" className="mono text-[12.5px]">dimmed</span>, "Has slack. It finishes before anything needs it."],
          [<span key="3" className="mono text-[12.5px]">dashed trail</span>, "How much slack. Hover for the exact figure."],
          [<span key="4" className="mono text-[12.5px]">red bar + ERR</span>, "The span reported a failure."],
          [<span key="5" className="mono text-[12.5px]">full-width top bar</span>, "A container span. Its duration is its children's, so it is excluded from path arithmetic."],
        ]}
      />
      <Note>
        The container exclusion matters. A parent that wraps five seconds of children also lasts
        five seconds — counting both would double-book the same time and make every run look like
        it was 100% critical path.
      </Note>

      <H2 id="span-inspector">Span inspector</H2>
      <P>Clicking a span opens its detail: duration, start offset, slack with a plain-English verdict, tokens in and out, cached tokens, cost, model — and the actual prompt and output text, side by side.</P>
      <P>
        If there is no text you are told why: either the trace never carried it, or the run was
        saved with redaction on. Measurements are unaffected either way.
      </P>

      <H2 id="cost-attribution">Cost attribution</H2>
      <P>
        Cost grouped by span <em>name</em>, not by individual span — so three calls to the same tool
        collapse into one row marked <K>3×</K>. Sorted by spend.
      </P>
      <P>
        The normal shape is one or two LLM rows holding nearly all the cost. When it is not — when
        an embedding or reranking node is a third of your spend — this chart is where you see it.
      </P>

      <H2 id="formats">Supported formats</H2>
      <P>Adapters are tried in order and the first match wins. Detection is automatic; you never pick a format.</P>
      <Table
        head={["Format", "Recognised by"]}
        rows={[
          ["OpenTelemetry / OTLP JSON", <>Honours the GenAI semantic conventions — <K>gen_ai.usage.*</K>, <K>gen_ai.request.model</K>, <K>gen_ai.operation.name</K></>],
          ["Langfuse export", <>An <K>observations</K> array with <K>startTime</K></>],
          ["LangSmith / LangGraph run tree", <>Nested <K>child_runs</K> with <K>run_type</K></>],
          ["Native span array", <>A flat <K>spans</K> array — see a sample run for the shape</>],
        ]}
      />
      <P>
        If nothing matches you get an explicit error naming the supported formats, rather than an
        empty or misleading analysis.
      </P>

      <H2 id="api">Ingest API</H2>
      <P>
        For pushing traces from CI or production. Issue a key from the right rail of your workspace.
      </P>
      <Code>{`POST /api/ingest
Authorization: Bearer axr_...
content-type: application/json

<any supported trace format>`}</Code>
      <P>The response is designed to be asserted on:</P>
      <Code>{`{
  "id": "8d4e1451-…",
  "spans": 6,
  "costUsd": 0.03525,
  "recoverableUsd": 0,
  "wasteShare": 0,
  "findings": [ { "severity": "warn", "title": "…" } ]
}`}</Code>
      <Table
        head={["Query", "Effect"]}
        rows={[
          [<K key="1">?redact=false</K>, "Keep prompt and completion text. Redacted by default."],
          [<K key="2">?force=true</K>, "Store even if an identical trace arrived in the last ten minutes."],
        ]}
      />
      <H3>Duplicate handling</H3>
      <P>
        Each trace is fingerprinted by its structure. An identical payload arriving within ten
        minutes is treated as a redelivery: you get <K>deduplicated: true</K> and the original
        run&apos;s id, with a 200 rather than an error, so CI assertions keep working. Outside that
        window it is stored as a new run — a nightly job should record every night.
      </P>

      <H2 id="privacy">Privacy and redaction</H2>
      <P>
        Analysis runs entirely in your browser. Nothing is uploaded unless you choose to save a run.
      </P>
      <P>
        When you do, prompt and completion text is stripped by default. The analysis is computed{" "}
        <em>before</em> redaction and stored alongside it, so a redacted run still shows every
        finding — you lose the ability to read the prompts, not the ability to see what was wrong.
      </P>
      <Table
        head={["Kept when you save", "Removed by default"]}
        rows={[
          ["Span names, kinds, parentage", "System prompts"],
          ["Timings, token counts, model ids", "Tool arguments and output"],
          ["Computed findings and costs", "Model completions"],
        ]}
      />
      <P>
        Tenant isolation is enforced by Postgres row-level security, not by application code: a
        query that omits its filter returns nothing rather than leaking.
      </P>

      <H2 id="pipeline-recap">How it fits together</H2>
      <PipelineDiagram />
      <P>
        No model runs in the analysis path, so the same trace always yields the same findings. The
        optional <K>explain + prioritise</K> step sends only the computed evidence — never the raw
        trace — and ranks findings by expected value of fix. It cannot invent a finding, because it
        never sees the material one would be invented from.
      </P>
      <ContextGrowthDiagram />

      <Link href="/login"
            className="inline-flex items-center gap-2 mt-4 text-[14px] px-5 py-2.5 rounded-[9px]
                       bg-[var(--accent)] text-[#08090c] font-medium hover:bg-[var(--accent-soft)] interactive">
        Analyze a trace <ArrowRight size={15} />
      </Link>
      <div className="h-10" />
    </>
  );
}
