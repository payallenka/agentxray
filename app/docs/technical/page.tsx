import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PipelineDiagram, CriticalPathDiagram, ContextGrowthDiagram } from "@/components/Diagrams";

export const metadata = {
  title: "How it works — Agent X-Ray",
  description: "Architecture, algorithms, complexity, measured latency and known limits.",
};

const H1 = ({ children }: { children: React.ReactNode }) => (
  <h1 className="display text-[clamp(2rem,3.4vw,2.8rem)]">{children}</h1>
);
const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <h2 id={id} className="section-title text-[24px] mt-16 mb-4 scroll-mt-28">{children}</h2>
);
const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-[16.5px] font-medium mt-8 mb-2 tracking-[-0.01em]">{children}</h3>
);
const P = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <p className={`prose-dim text-[15px] my-4 ${className ?? ""}`}>{children}</p>
);
const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="my-6 pl-4 border-l-2 border-[var(--accent)] text-[15px] prose-dim">{children}</div>
);
const Warn = ({ children }: { children: React.ReactNode }) => (
  <div className="my-6 pl-4 border-l-2 border-[var(--warn)] text-[15px] prose-dim">{children}</div>
);
const Code = ({ children }: { children: React.ReactNode }) => (
  <pre className="mono text-[12px] leading-[1.7] p-4 my-5 rounded-[9px] bg-black/45 border hairline overflow-x-auto dim">{children}</pre>
);
const K = ({ children }: { children: React.ReactNode }) => (
  <span className="mono text-[13px] text-[var(--ink)]">{children}</span>
);

function Table({ head, rows, dense }: { head: string[]; rows: React.ReactNode[][]; dense?: boolean }) {
  return (
    <div className="my-6 rounded-[10px] border hairline overflow-x-auto">
      <table className="w-full border-collapse" style={{ fontSize: dense ? 12.5 : 13.5 }}>
        <thead>
          <tr className="border-b hairline">
            {head.map((h) => (
              <th key={h} className="text-left px-4 py-2.5 mono text-[10px] uppercase tracking-[0.12em] dimmer font-normal whitespace-nowrap">{h}</th>
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

export default function Technical() {
  return (
    <>
      <div className="eyebrow">Technical</div>
      <H1>How it works</H1>
      <P>
        Architecture, the algorithms and their complexity, measured latency, input limits, and the
        places this breaks. Written for someone who will push back on it.
      </P>

      {/* ---------------- audience ---------------- */}
      <H2 id="audience">Who this is for</H2>
      <Table
        head={["You are", "What you get from it"]}
        rows={[
          ["An engineer shipping an LLM agent",
           "Where the run's latency and spend actually went, and which fix returns the most. The critical path tells you which slow step is worth touching and which is free to ignore."],
          ["A team lead owning an AI budget",
           "A dollar figure for recoverable spend across every analyzed run, and which workflow is the worst offender."],
          ["A platform or infra team",
           "A CI gate. Push a trace, assert on wasteShare, fail the build when a prompt change makes an agent measurably more wasteful."],
          ["Anyone evaluating agent frameworks",
           "A neutral, format-agnostic way to compare two implementations of the same task on cost, wall clock and wasted work."],
        ]}
      />
      <P>
        <strong className="text-[var(--ink)]">Who it is not for:</strong> if you need live
        monitoring, alerting, or a trace collector, this is the wrong tool — use Langfuse,
        LangSmith or an OpenTelemetry backend. Agent X-Ray is a post-mortem analyzer that reads
        what those produce.
      </P>

      {/* ---------------- pipeline ---------------- */}
      <H2 id="pipeline">The pipeline</H2>
      <PipelineDiagram />
      <Code>{`trace JSON
   │
   ├─ normalize()      adapter match → canonical Span[]        O(n)
   │
   ├─ buildGraph()     structural + conversational + data-flow O(n²·g)
   │
   ├─ criticalPath()   forward/backward pass → EF, LF, slack   O(V+E)
   │
   ├─ contextGrowth()  LCP over consecutive LLM inputs         O(k·L)
   ├─ detectLoops()    MinHash + word Jaccard clustering       O(m²·H)
   ├─ deadBranches()   reverse reachability over data edges    O(V+E)
   ├─ missedParallel() sibling scan with dependency check      O(n log n)
   │
   └─ Finding[]        ranked by severity, then $, then ms`}</Code>
      <P>
        Every stage is a pure function of the stage before it. No I/O, no model, no randomness —
        the same trace always produces byte-identical findings.
      </P>

      {/* ---------------- graph ---------------- */}
      <H2 id="graph">Reconstructing the dependency graph</H2>
      <P>
        The span tree is a <em>structural</em> view: it says what contained what. It does not say
        what <em>gated</em> what. Everything downstream needs the second thing, so the graph is
        rebuilt with three edge kinds.
      </P>
      <Table
        head={["Edge", "Rule", "Why"]}
        rows={[
          ["Structural", <>child → parent</>, "A parent cannot finish before its children."],
          ["Conversational", <>LLM turn <K>i</K> → turn <K>i+1</K> under the same parent</>, "The conversation carries forward even when the next prompt never quotes the last reasoning verbatim."],
          ["Data flow", <>A → B when <K>B.start ≥ A.end</K> and B&apos;s input shares ≥2 distinctive 8-word-grams with A&apos;s output</>, "Recovers real dependencies the tree hides. This is the load-bearing edge."],
        ]}
      />
      <Note>
        Only data-flow and conversational edges are used for reachability. Including structural
        edges would make every span reachable from the root, and the dead-branch detector would
        never fire — that was a real bug, caught by a fixture.
      </Note>
      <P>
        Cost is <K>O(n²·g)</K> where <K>g</K> is gram-set size, but the time-ordering guard{" "}
        <K>a.endMs &gt; b.startMs</K> prunes most pairs before any set work happens.
      </P>

      {/* ---------------- algorithms ---------------- */}
      <H2 id="algorithms">The five calculations</H2>

      <H3>1 · Critical path and slack (PERT)</H3>
      <CriticalPathDiagram />
      <P>Forward pass over spans sorted by start, then a backward pass:</P>
      <Code>{`work(s)  = hasChildren(s) ? 0 : s.duration     // containers double-book time

EF(s)    = max( EF(d) for d in deps(s) ) + work(s)
projectEnd = max EF
LF(s)    = min( LF(x) − work(x) for x in successors(s) )   or projectEnd
slack(s) = LF(s) − EF(s)`}</Code>
      <P>
        The critical path is the chain ending at <K>max EF</K>, recovered through backpointers.
        A span with <K>slack &gt; 0</K> can absorb that much delay without moving the finish, so
        optimizing it returns nothing.
      </P>
      <Warn>
        The <K>work(s) = 0</K> line matters more than it looks. A parent wrapping 5s of children
        also lasts 5s; counting both double-books the same milliseconds and makes every run report
        a 100% critical path. That was the second bug the fixtures caught.
      </Warn>

      <H3>2 · Context re-send decomposition</H3>
      <ContextGrowthDiagram />
      <P>
        For consecutive LLM spans, the character-level longest common prefix of their serialized
        inputs is scaled into the reported token count:
      </P>
      <Code>{`shared   = lcpLen(input[i], input[i−1])              // characters
carried  = round( shared / len(input[i]) · tokens[i] )
uncached = max(0, carried − cache_read_input_tokens)

waste$   = uncached / 1e6 · inputRate(model) · 0.9   // a cache read ≈ 10%`}</Code>
      <P>
        The character-to-token scaling is an approximation, and a deliberate one — exact token
        counting needs the provider&apos;s tokenizer, which would mean a network call per span and
        would destroy the &quot;runs in your browser&quot; property. The prefix ratio is stable
        enough for a cost estimate, and the reported token total keeps the magnitude honest.
      </P>

      <H3>3 · Semantic loop detection</H3>
      <P>Two similarity signals, taking the stronger:</P>
      <Code>{`shingles(t)  = character 5-grams of the normalized text
minhash(t)   = 64 minima over FNV-1a permutations of those shingles
jaccard(a,b) = matching signature positions / 64

words(t)     = tokens length>2, trailing plural s stripped
setJaccard   = |A ∩ B| / |A ∪ B|

sim = max(minhashJaccard, setJaccard)      cluster at ≥ 0.70`}</Code>
      <P>
        MinHash scales to long texts; the stemmed word set rescues short JSON tool arguments where
        64 permutations over char shingles are too noisy to be reliable. Using either alone
        produced false negatives — measured on the fixtures.
      </P>
      <P>For LLM spans, only the novel suffix after the common prefix is compared:</P>
      <Code>{`if kind == "llm":
    cut = lcpLen(a, b)
    if len(a[cut:]) < 8 or len(b[cut:]) < 8:  sim = 0    # one is a prefix of
                                                          # the other: growth
    else: sim = similarity(a[cut:], b[cut:])              # not repetition`}</Code>
      <P>Clusters are then classified:</P>
      <Table dense
        head={["Class", "Test", "Reported"]}
        rows={[
          ["retry", "any member has status = error", "as a warning; retries after failure are legitimate"],
          ["pagination", "members differ only in digits", "suppressed entirely — not a defect"],
          ["thrash", "everything else", "critical at ≥3 members, warn at 2"],
        ]}
      />

      <H3>4 · Dead branches</H3>
      <Code>{`terminal = last-finishing LLM span, else last-finishing span
alive    = reverse closure over data-flow + conversational edges from terminal
liveSubtree = ancestors of anything alive

dead = spans ∉ alive ∪ liveSubtree, excluding containers,
       excluding members already charged to a thrash loop`}</Code>
      <P>
        The last exclusion prevents double billing: a repeated call is both a loop member and
        unreachable, and charging it twice was what pushed reported waste over 100% of spend.
      </P>

      <H3>5 · Missed parallelism</H3>
      <P>
        Within a parent, siblings are scanned in time order. A run accumulates while each span is
        independent of the previous one and does not overlap it. The run is flushed on:
      </P>
      <Table dense
        head={["Flush trigger", "Reason"]}
        rows={[
          ["an LLM or agent span", "In a ReAct loop an intervening model turn is a real decision point — the agent could not have chosen the second call before seeing the first."],
          ["a dependency edge", "Genuine ordering."],
          ["a loop member", "Already charged elsewhere."],
        ]}
      />
      <Code>{`saving = Σ duration − max(duration)    // reported when > 200ms`}</Code>

      {/* ---------------- metrics ---------------- */}
      <H2 id="metrics">What each metric tells you</H2>
      <P>
        Every figure is a measurement with a defined formula. This is how to read each one and
        what to do when it looks wrong.
      </P>
      <Table
        head={["Metric", "Computed as", "What it tells you", "Act when"]}
        rows={[
          [<K key="1">Wall clock</K>, <K>max(endMs) − min(startMs)</K>,
           "What a user actually waited.", "It exceeds your latency budget — then read critical path, not the biggest bar."],
          [<K key="2">Cost</K>, <>trace cost if present, else <K>Σ tokens × rate(model)</K></>,
           "Total spend for one run.", "Multiply by your run volume. This is the number that scales."],
          [<K key="3">Recoverable</K>, <>context waste + unioned wasted spans, capped at cost</>,
           "Spend you could remove without changing behaviour.", "Over 25%. Under 10% means look at latency instead."],
          [<K key="4">Critical path</K>, <K>max EF over the dependency DAG</K>,
           "How much of the wall clock is spent on work that gates the finish.",
           "A low share means most time is off-path — the win is parallelism, not faster steps."],
          [<K key="5">Tokens in / cached</K>, <>Σ <K>inputTokens</K>, Σ <K>cachedTokens</K></>,
           "Whether you are paying full price for repeated context.",
           "Large input with zero cache hits. Almost always the single biggest available saving."],
          [<K key="6">Slack (per span)</K>, <K>LF − EF</K>,
           "How late this span could finish before delaying the answer.",
           "Never optimize a span with slack. It returns exactly zero wall-clock."],
          [<K key="7">Cost by node</K>, "cost grouped by span name",
           "Which component of the agent spends the money.",
           "A non-LLM node holding a large share — an embedding or rerank step — is usually unintended."],
        ]}
      />
      <Note>
        Findings are ranked by severity, then dollars, then milliseconds — so the top item is
        always the one with the most recoverable value, not merely the most alarming.
      </Note>

      {/* ---------------- constants ---------------- */}
      <H2 id="constants">Every constant in the engine</H2>
      <P>
        Nothing below is inferred or approximate prose — these are the literal values in{" "}
        <K>lib/analyze.ts</K>, <K>lib/normalize.ts</K> and <K>lib/persist.ts</K>. Each is a
        judgement call, so each is listed with what happens if it is wrong.
      </P>
      <Table dense
        head={["Constant", "Value", "Used by", "If it were wrong"]}
        rows={[
          [<K key="a">HASHES</K>, "64", "MinHash signature length",
           "Fewer → noisier similarity, more false clusters. More → linearly slower, marginal accuracy gain."],
          [<K key="b">shingles k</K>, "5 chars", "MinHash input",
           "Smaller → everything looks similar. Larger → paraphrases stop matching."],
          [<K key="c">similarity gate</K>, "0.70", "Loop clustering",
           "Lower → unrelated calls cluster as loops. Higher → paraphrase loops go undetected. Tuned on the fixtures."],
          [<K key="d">novel-suffix floor</K>, "8 chars", "LLM loop comparison",
           "Below this, one turn is a strict prefix of the other, which is context growth, not repetition. Sets sim = 0."],
          [<K key="e">wordGrams k</K>, "8 words", "Data-flow inference",
           "Smaller → spurious edges from common phrasing. Larger → real dependencies missed."],
          [<K key="f">gram hits</K>, "≥ 2", "Data-flow edge threshold",
           "1 would fire on a single coincidental phrase. 3+ misses short tool outputs."],
          [<K key="g">token estimate</K>, <K>ceil(len / 4)</K>, "Fallback when a span reports no token count",
           "The standard ~4 chars/token heuristic. Only used when the trace omits counts."],
          [<K key="h">cache discount</K>, "0.9", "Context waste pricing",
           "Assumes a cache read costs ~10% of a fresh input token. Provider-dependent; Anthropic and OpenAI are both near this."],
          [<K key="i">parallelism floor</K>, "200 ms", "Missed-parallelism reporting",
           "Below this the saving is not worth an engineer's attention."],
          [<K key="j">slack notice</K>, <>slack &gt; 500 ms and duration &gt; 10% of wall clock</>, "Off-critical-path finding",
           "Prevents a notice for every trivially slack span."],
          [<K key="k">context severity</K>, "> 30% of spend", "critical vs warn", "Purely presentational; the dollar figure is unaffected."],
          [<K key="l">dead-branch severity</K>, "> 25% of spend", "critical vs info", "Same — presentation only."],
          [<K key="m">thrash severity</K>, "≥ 3 members", "critical vs warn", "Two similar calls are often legitimate; three rarely are."],
          [<K key="n">text truncation</K>, "4,000 chars", "normalize()", "Bounds similarity cost. Very long prompts compare on their first 4k characters."],
          [<K key="o">depth guard</K>, "64", "Parent-chain walk", "Cycle protection against malformed traces."],
          [<K key="p">dedup window</K>, "10 minutes", "Ingest and save", "Shorter → redeliveries slip through. Longer → a genuine re-run is swallowed."],
        ]}
      />

      {/* ---------------- accuracy ---------------- */}
      <H2 id="accuracy">Accuracy, and what it cannot promise</H2>
      <P>
        The detectors are not equally trustworthy, and pretending otherwise would be the
        fastest way to lose a user&apos;s confidence. They fall into two classes.
      </P>

      <H3>Exact — arithmetic over the trace</H3>
      <P>
        These are deterministic and correct by construction, given a trace that is itself correct.
        There is no threshold to tune and no way for them to be &quot;wrong&quot; other than the
        input being wrong.
      </P>
      <Table dense
        head={["Quantity", "Guarantee"]}
        rows={[
          ["Wall clock, span durations, token sums", "Direct arithmetic on reported values."],
          ["Cost", "Exact when the trace carries it; otherwise tokens × a published rate."],
          ["Critical path and slack", "Standard PERT over the constructed graph. Correct for that graph — the graph itself is the uncertain part."],
          ["Error grouping and retry counts", "Direct from reported span status."],
        ]}
      />

      <H3>Heuristic — inference about intent</H3>
      <P>
        These answer questions the trace does not literally record: <em>did B use A&apos;s
        output?</em>, <em>did the agent mean to ask that twice?</em> No amount of engineering makes
        those exact, because the ground truth was never written down.
      </P>
      <Table
        head={["Detector", "False positive", "False negative", "Confidence"]}
        rows={[
          ["Context re-send",
           "A genuinely new prompt that happens to share a long prefix.",
           "Providers that report cache hits inconsistently.",
           <span key="1" className="text-[var(--ok)]">High — the prefix is measured, only the token scaling is approximate.</span>],
          ["Semantic loops",
           "Two legitimately different queries phrased alike.",
           "A paraphrase that shares few 5-grams — different vocabulary, same meaning.",
           <span key="2" className="text-[var(--warn)]">Medium — a lexical proxy for a semantic question.</span>],
          ["Dead branches",
           "A tool returning a bare id or number produces no gram overlap, so a used result looks unused.",
           "A span whose output is quoted but never actually influenced the answer.",
           <span key="3" className="text-[var(--warn)]">Medium — this is the weakest detector.</span>],
          ["Missed parallelism",
           "A hidden dependency the trace does not express — a shared lock, a rate limit, an ordering requirement.",
           "Calls separated by an LLM turn are never flagged, by design.",
           <span key="4" className="text-[var(--ok)]">High for the timing claim, medium for the &quot;independent&quot; claim.</span>],
        ]}
      />
      <Warn>
        <strong className="text-[var(--ink)]">The honest summary:</strong> the money and time
        figures are measurements. The attributions — <em>this</em> span was wasted, <em>these</em>
        two could have run together — are well-founded inferences that can be wrong on an
        individual span. Treat a finding as a strong lead to verify, not a proof.
      </Warn>

      <H3>What backs the current confidence</H3>
      <Table dense
        head={["Evidence", "Strength"]}
        rows={[
          ["Seven fixtures across four formats, including a healthy run and a malformed payload",
           "Catches regressions and format gaps. Caught seven real bugs before any UI existed."],
          ["A healthy fixture that must stay at 0% waste",
           "The single most valuable test: it fails loudly if a detector becomes trigger-happy."],
          ["Deterministic output — same input, same findings, always",
           "Makes any regression visible as a diff rather than as noise."],
          ["Full CRUD and tenant-isolation harness against live RLS",
           "Found the missing UPDATE policy, which reported success while writing nothing."],
        ]}
      />

      <H3>What is missing, and would raise it</H3>
      <Table dense
        head={["Gap", "What it would take"]}
        rows={[
          ["No labelled corpus", "A set of real traces with human-annotated waste, to measure precision and recall per detector instead of asserting them."],
          ["No property-based tests", "Invariants worth enforcing: waste ≤ cost, critical path ≤ wall clock, slack ≥ 0, a span is never both alive and dead."],
          ["No differential testing", "Run the same logical trace through all four adapters and assert identical findings — it would have caught the Langfuse classification gap immediately."],
          ["Thresholds tuned on fixtures, not data", "0.70 and 8-word-grams were chosen because they worked on seven traces. A corpus would let them be fitted, or made adaptive."],
          ["No baseline across runs", "Per-node p50/p95 would turn \u201cthis span is slow\u201d into \u201cthis span is 4\u03c3 slower than it usually is\u201d, which is a far stronger claim."],
        ]}
      />
      <Note>
        Two invariants <em>are</em> enforced in code today, both because they were violated in
        practice: wasted spans are unioned by id before pricing, and recoverable spend is capped
        at the run&apos;s actual cost. Before those, a span caught by two detectors was billed
        twice and one fixture reported 106% waste.
      </Note>

      {/* ---------------- performance ---------------- */}
      <H2 id="performance">Why it is fast</H2>
      <P>
        There is no network in the analysis path. The trace never leaves the tab, so the latency
        budget contains no round trip, no queue, no cold start and no model call. Analysis is a
        synchronous <K>useMemo</K> — results exist before React paints.
      </P>
      <P>Measured on this machine, Node 22, bounded per-span text:</P>
      <Table dense
        head={["Spans", "Payload", "Parse + normalize", "Analyze", "Total"]}
        rows={[
          ["100", "0.1 MB", "< 1 ms", "53 ms", <span key="a" className="text-[var(--ok)]">53 ms</span>],
          ["500", "0.4 MB", "1 ms", "82 ms", <span key="b" className="text-[var(--ok)]">83 ms</span>],
          ["1,000", "0.7 MB", "3 ms", "194 ms", <span key="c" className="text-[var(--ok)]">197 ms</span>],
          ["2,000", "1.5 MB", "3 ms", "490 ms", <span key="d" className="text-[var(--warn)]">493 ms</span>],
          ["4,000", "2.9 MB", "8 ms", "1,430 ms", <span key="e" className="text-[var(--warn)]">1.4 s</span>],
          ["8,000", "5.8 MB", "15 ms", "4,778 ms", <span key="f" className="text-[var(--critical)]">4.8 s</span>],
        ]}
      />
      <P>
        Parsing is linear and effectively free — 15 ms for 5.8 MB. The cost is entirely in the two
        quadratic passes, <K>buildGraph</K> and <K>detectLoops</K>, which together are roughly 85%
        of analysis time at every size.
      </P>
      <P>
        <strong className="text-[var(--ink)]">Real agent runs are 10–60 spans.</strong> All three
        bundled samples analyze in under 25 ms, which is why the UI feels instant: the work
        finishes inside a single frame budget.
      </P>

      <H3>Where the rest of the latency goes</H3>
      <Table dense
        head={["Step", "Cost", "Note"]}
        rows={[
          ["Page load", "static prerender", "/, /docs and /login ship as static HTML"],
          ["Sample fetch", "one HTTP GET", "cached an hour"],
          ["Analysis", "3–25 ms typical", "synchronous, in-tab"],
          ["Saving a run", "one Postgres insert", "only when you ask"],
          ["Narration", "~1.5 s", "optional, streamed, never blocks the analysis"],
        ]}
      />

      {/* ---------------- limits ---------------- */}
      <H2 id="limits">Input limits</H2>
      <Table
        head={["Bound", "Value", "Set by"]}
        rows={[
          ["Comfortable", <>≤ 1,000 spans · <span className="mono">&lt; 200 ms</span></>, "Feels instant. Covers essentially every real agent run."],
          ["Acceptable", <>≤ 2,000 spans · <span className="mono">~0.5 s</span></>, "Noticeable but fine."],
          ["Degraded", <>≥ 4,000 spans · <span className="mono">1.4 s+</span></>, "The quadratic passes dominate; growth is ~n²."],
          ["Per-span text", "4,000 characters", <>Truncated in <K>normalize()</K>, bounding similarity work.</>],
          ["HTTP ingest body", "~4 MB on Vercel", "Platform request-body limit, not ours."],
          ["Paste / upload", "browser memory", "No hard cap; 8,000 spans at 5.8 MB works, it is just slow."],
        ]}
      />
      <Note>
        The fix for very large traces is known and not implemented: bucket the data-flow pass by
        time window so only temporally adjacent spans are compared, and bucket loop clustering by
        span name — both reduce the quadratic term to near-linear in practice. It has not been
        built because no real trace has needed it.
      </Note>

      {/* ---------------- validation ---------------- */}
      <H2 id="validation">How this was validated</H2>
      <P>
        Seven fixtures across four formats, including a deliberately healthy run and a malformed
        payload. Running the detectors against them before building any UI surfaced seven real
        bugs:
      </P>
      <Table dense
        head={["Symptom", "Cause"]}
        rows={[
          ["Recoverable exceeded 100% of spend", "A span caught by two detectors was billed twice."],
          ["Critical path always 100%", "Container spans double-booked their children's time."],
          ["Every LLM turn flagged dead", "Conversational edges were structural; reachability ignores structural edges."],
          ["Thrash undetected on tool args", "64-permutation MinHash is too noisy on short strings."],
          ["Normal ReAct flagged as a loop", "Consecutive turns share a growing prefix by definition."],
          ["Langfuse tool calls invisible", "Typed as generic SPAN, so classified as other and skipped."],
          ["Duplicate identical findings", "Repeated failures of one tool were not grouped."],
        ]}
      />
      <P>
        The healthy fixture is the important one: it reports <strong className="text-[var(--ink)]">0%
        waste and one informational note</strong>. A detector suite that always finds something
        cannot be trusted when it does.
      </P>
      <P>
        <K>scripts/crud-test.mts</K> drives every database operation through the anon key exactly
        as the browser does, including cross-tenant isolation. It is how the missing{" "}
        <K>UPDATE</K> policy was found — under RLS a blocked write affects zero rows and{" "}
        <em>reports success</em>.
      </P>

      {/* ---------------- honest limits ---------------- */}
      <H2 id="known-limitations">Known limitations</H2>
      <Table
        head={["Limitation", "Consequence", "Would be fixed by"]}
        rows={[
          ["Token counts are scaled from a character-level prefix ratio", "Context waste is an estimate, not an exact figure.", "Provider tokenizers — at the cost of the in-browser guarantee."],
          ["Data-flow inference needs ≥2 shared 8-word-grams", "A tool returning a bare number or id produces no edge, so it may be reported dead.", "Falling back to id/value matching for short outputs."],
          ["Both heavy passes are O(n²)", "Above ~4,000 spans it is visibly slow.", "Time-window and name bucketing."],
          ["Pricing table is a static snapshot", "Cost is approximate when the trace carries none.", "Trace-supplied cost, which is preferred whenever present."],
          ["Single-trace analysis only", "No baseline, so no \"this run is 4σ slower than usual\".", "Per-node p50/p95 across stored runs — the schema already supports it."],
        ]}
      />

      <H2 id="stack">Stack</H2>
      <Table dense
        head={["Layer", "Choice", "Why"]}
        rows={[
          ["Analysis", "TypeScript, zero dependencies", "Runs identically in the browser and in the ingest endpoint."],
          ["App", "Next.js 16, React 19, Tailwind 4", "Static prerender for public pages, route handlers for ingest."],
          ["Data", "Supabase Postgres with RLS", "Tenant isolation enforced by the database, not by application code."],
          ["UI", "Radix primitives + Framer Motion", "Own the components; the token layer stays authoritative."],
          ["Narration", "Any OpenAI-compatible provider", "Groq, xAI, Gemini or Anthropic, chosen by which key is set."],
        ]}
      />

      <P className="mt-10">
        Source: <a href="https://github.com/payallenka/agentxray" className="text-[var(--accent-soft)] hover:underline">github.com/payallenka/agentxray</a>
      </P>
      <Link href="/login"
            className="inline-flex items-center gap-2 mt-3 text-[14px] px-5 py-2.5 rounded-[9px]
                       bg-[var(--accent)] text-[#08090c] font-medium hover:bg-[var(--accent-soft)] interactive">
        Analyze a trace <ArrowRight size={15} />
      </Link>
      <div className="h-10" />
    </>
  );
}
