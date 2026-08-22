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
      <P>Five numbers at the top of every run. Read <strong className="text-[var(--ink)]">Recoverable</strong> first — the rest is context for it.</P>
      <Table
        head={["Metric", "What it means", "What to do with it"]}
        rows={[
          [<K key="a">Wall clock</K>, "Real elapsed time from the first span to the last.", "The number a user actually waited."],
          [<K key="b">Cost</K>, "Total spend. Taken from the trace when present, otherwise estimated from model and token counts.", "Baseline for everything else."],
          [<K key="c">Recoverable</K>, "Spend that analysis says you could get back without changing what the agent does.", "The headline. Over 25% turns red."],
          [<K key="d">Critical path</K>, "How much of the wall clock is spent on work that actually gates the finish.", "A low share means most time is spent off the path — look for parallelism."],
          [<K key="e">Tokens in</K>, "Input tokens, and how many were cache hits.", <>&quot;no cache hits&quot; on a large number is the single most common expensive mistake.</>],
        ]}
      />
      <Note>
        Recoverable counts each wasted span once, even when it is caught by two detectors, and is
        capped at the run&apos;s actual cost. It can never exceed 100%.
      </Note>

      <H2 id="findings">Findings</H2>
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
