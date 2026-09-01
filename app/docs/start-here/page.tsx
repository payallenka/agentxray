import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  AgentLoopDiagram, TraceSpansDiagram, CriticalPathDiagram, ParallelDiagram,
  ContextGrowthDiagram, DeadBranchDiagram, PipelineDiagram,
} from "@/components/Diagrams";

export const metadata = {
  title: "Start here — Agent X-Ray",
  description: "What Agent X-Ray is, explained from zero. No background assumed.",
};

const H1 = ({ children }: { children: React.ReactNode }) => (
  <h1 className="display text-[clamp(2rem,3.4vw,2.8rem)]">{children}</h1>
);
const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <h2 id={id} className="section-title text-[24px] mt-16 mb-4 scroll-mt-28">{children}</h2>
);
const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-[17px] font-medium mt-8 mb-2.5 tracking-[-0.01em]">{children}</h3>
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

const GLOSSARY: [string, string][] = [
  ["LLM", "The AI model that reads and writes text. ChatGPT is one."],
  ["Agent", "An LLM that can also take actions, by calling tools in a loop."],
  ["Tool", "Something the agent can call — look up an order, search docs, send an email."],
  ["Trace", "The recording of everything that happened during one agent run."],
  ["Span", "One single action inside a trace, with a start time, an end time and a cost."],
  ["Token", "A chunk of text the model processes. You are billed per token."],
  ["Context", "Everything you send the model so it knows what is going on."],
  ["Cache", "Paying a reduced rate for text the model has already been shown."],
  ["Critical path", "The chain of work that decides how long the whole run takes."],
  ["Slack", "How much later a span could have finished without delaying the answer."],
  ["Thrash", "Doing the same work again and again without making progress."],
  ["Dead branch", "Work that happened, cost money, and never affected the answer."],
  ["Parallelism", "Doing independent things at the same time instead of one after another."],
  ["DAG", "A map of what depends on what. Arrows point from cause to effect."],
  ["Wall clock", "Real elapsed time — what a clock on the wall would have measured."],
  ["JSON", "A plain-text format for structured data. What traces are written in."],
  ["API", "How one program talks to another."],
  ["OpenTelemetry", "An industry standard for recording what software does."],
  ["Langfuse / LangSmith", "Platforms that record what LLM applications do."],
];

export default function StartHere() {
  return (
    <>
      <div className="eyebrow">Start here</div>
      <H1>What is all of this?</H1>
      <P>
        This page assumes no background. If you have never heard of a trace, a span or a token,
        start at the top and read straight down — everything is defined before it is used.
      </P>

      <Note>
        <strong className="text-[var(--ink)]">The one-sentence version.</strong> Agent X-Ray reads
        the record of what an AI agent did, and finds where it wasted time, money, or effort.
      </Note>

      <H2 id="what-is-an-agent">What is an AI agent?</H2>
      <P>
        You probably know what an <K>LLM</K> is — you give it text, it gives you text back.
        ChatGPT is one.
      </P>
      <P>
        An <strong className="text-[var(--ink)]">agent</strong> is an LLM that has been given the
        ability to <em>do things</em>. Instead of only answering, it can look up an order, search
        a policy document, or send an email. The things it can do are called{" "}
        <strong className="text-[var(--ink)]">tools</strong>.
      </P>
      <P>
        It works in a loop: the model thinks, picks a tool, reads what the tool returned, and
        thinks again — until it has an answer.
      </P>
      <AgentLoopDiagram />
      <P>So an agent is roughly: <K>LLM + tools + instructions + a loop</K>.</P>

      <H2 id="what-is-a-trace">What is a trace?</H2>
      <P>
        Imagine a security camera recording everything the agent did. You would end up with
        something like this:
      </P>
      <Code>{`10:00:00  agent starts
10:00:01  LLM thinks
10:00:02  search refund policy
10:00:04  search refund policy again
10:00:06  look up order
10:00:09  look up customer
10:00:12  search an unrelated knowledge base
10:00:14  send email
10:00:15  email fails
10:00:16  send email again
10:00:18  agent finishes`}</Code>
      <P>
        That recording is a <strong className="text-[var(--ink)]">trace</strong>. It holds what the
        agent was asked, which tools it called, when each thing happened, how long each took, how
        many tokens were spent, what came back, and what failed.
      </P>
      <Note>
        Agent X-Ray does not create the recording. Something else records it; X-Ray reads it
        afterwards. That makes it a <em>post-mortem</em> tool — the run already happened, and we
        are looking backwards at it, like reviewing a football match after the final whistle.
      </Note>

      <H2 id="what-is-a-span">What is a span?</H2>
      <P>
        A <strong className="text-[var(--ink)]">span</strong> is one single action inside the
        trace. If the trace is the whole trip, a span is one stop along the way.
      </P>
      <TraceSpansDiagram />
      <P>
        Every bar in the Agent X-Ray waterfall is one span. Its position is when it started, its
        width is how long it took.
      </P>

      <H2 id="where-traces-come-from">Where do traces come from?</H2>
      <P>
        Tools like <strong className="text-[var(--ink)]">OpenTelemetry</strong>,{" "}
        <strong className="text-[var(--ink)]">Langfuse</strong> and{" "}
        <strong className="text-[var(--ink)]">LangSmith</strong> watch an application while it runs
        and write down what happened. They each write it down slightly differently, which is why
        Agent X-Ray has an <em>adapter</em> for each — code that translates their format into one
        common shape before anything else happens.
      </P>
      <P>There are two ways to get a trace into Agent X-Ray:</P>
      <Code>{`A · by hand          B · automatically

Langfuse / LangSmith      your CI or production app
        ↓                          ↓
   copy the JSON            POST /api/ingest
        ↓                          ↓
   paste it in              it is already waiting`}</Code>
      <P>
        <K>POST</K> just means &quot;here is some data I am sending you&quot;, as opposed to{" "}
        <K>GET</K>, which means &quot;give me something&quot;.
      </P>

      <H2 id="the-five-detectors">The five detectors</H2>
      <P>
        A detector is a piece of logic that hunts for one specific kind of waste. There are five.
        Think of them as five inspectors, each with one job.
      </P>

      <H2 id="critical-path">1 · Critical path and slack</H2>
      <P>Think about cooking dinner. Some things depend on others, some do not.</P>
      <P>
        The <strong className="text-[var(--ink)]">critical path</strong> is the chain of work that
        decides when you can finally eat. If boiling the pasta takes ten minutes and everything
        else waits on it, dinner cannot arrive sooner than that.
      </P>
      <P>
        Everything <em>not</em> on that chain has <strong className="text-[var(--ink)]">slack</strong>:
        room to be late without delaying anything.
      </P>
      <CriticalPathDiagram />
      <Note>
        This is the idea most people find surprising:{" "}
        <strong className="text-[var(--ink)]">a slow step is not automatically worth fixing.</strong>{" "}
        If it has slack, making it faster changes nothing at all. Agent X-Ray tells you which slow
        steps actually matter.
      </Note>

      <H2 id="context-resend">2 · Context re-send</H2>
      <P>
        A <K>token</K> is a chunk of text the model processes, and you are billed per token.{" "}
        <K>Context</K> is everything you send the model so it knows what is going on.
      </P>
      <P>
        Here is the problem. Each time the agent loops, it re-sends the whole conversation so far,
        plus the new bit. So the amount you pay for grows every single turn — and most of what you
        are paying for is text the model has already been shown.
      </P>
      <ContextGrowthDiagram />
      <P>
        Providers let you <K>cache</K> a stable prefix and pay roughly a tenth of the price for it
        on later turns. This detector measures exactly how much of your spend was re-sent history
        that was never cached, and prices it.
      </P>

      <H2 id="semantic-loops">3 · Semantic loops</H2>
      <P>Suppose the agent searches three times:</P>
      <Code>{`search("refund policy for damaged items")
search("policy for refunds on damaged item")
search("refunds policy damaged items rules")`}</Code>
      <P>
        A computer comparing text exactly would call these three different searches. A human reads
        them and says: you asked the same question three times.
      </P>
      <P>
        That is a <strong className="text-[var(--ink)]">semantic loop</strong> — and the repeats
        cost money, take time, and push more junk into the context. When it happens with no
        progress, engineers call it <strong className="text-[var(--ink)]">thrashing</strong>.
      </P>
      <P>
        Catching it needs a <em>similarity</em> measure rather than an equality check. Agent X-Ray
        uses one, then sorts what it finds into three kinds: genuine thrash, a legitimate retry
        after an error, and pagination — which is not a problem at all.
      </P>

      <H2 id="dead-branches">4 · Dead branches</H2>
      <P>
        Sometimes an agent goes and fetches something that never ends up mattering. The work
        happened, the clock ran, the bill was paid — and nothing in the final answer depended on it.
      </P>
      <DeadBranchDiagram />
      <P>
        To find these, Agent X-Ray starts at the answer and walks <em>backwards</em> through what
        fed into what. Anything it cannot reach never influenced the result.
      </P>

      <H2 id="missed-parallelism">5 · Missed parallelism</H2>
      <P>
        If the agent needs both the order and the customer, and neither lookup depends on the
        other, there is no reason to wait for the first before starting the second.
      </P>
      <ParallelDiagram />
      <P>
        Doing them at the same time costs the slower of the two, not the sum. Agent X-Ray finds
        calls that could have overlapped and tells you how much time you would get back.
      </P>

      <H2 id="whole-thing">The whole thing at once</H2>
      <PipelineDiagram />
      <P>
        A trace comes in, in whatever format. It is normalized into one common shape. A dependency
        graph is built — what actually fed into what. Five detectors run over that graph. What
        comes out is a ranked list of problems, each priced in dollars and milliseconds.
      </P>
      <Note>
        All of this is ordinary arithmetic and graph traversal — there is{" "}
        <strong className="text-[var(--ink)]">no AI in the analysis</strong>. The same trace always
        produces the same findings. An optional AI step can rank and explain the findings
        afterwards, but it never decides what they are.
      </Note>

      <H2 id="glossary">Vocabulary cheat sheet</H2>
      <div className="my-6 rounded-[10px] border hairline overflow-hidden">
        {GLOSSARY.map(([term, def], i) => (
          <div key={term}
               className={`grid sm:grid-cols-[190px_minmax(0,1fr)] gap-x-5 gap-y-1 px-4 py-3 text-[13.5px] ${i % 2 ? "bg-white/[0.015]" : ""}`}>
            <span className="mono text-[12.5px] text-[var(--accent-soft)]">{term}</span>
            <span className="dim">{def}</span>
          </div>
        ))}
      </div>

      <H3>Where to go next</H3>
      <P>
        <Link href="/docs" className="text-[var(--accent-soft)] hover:underline">
          Reading the analysis
        </Link>{" "}
        walks through every number and chart in the product and explains how to interpret it.
      </P>
      <Link href="/login"
            className="inline-flex items-center gap-2 mt-3 text-[14px] px-5 py-2.5 rounded-[9px]
                       bg-[var(--accent)] text-[#08090c] font-medium hover:bg-[var(--accent-soft)] interactive">
        Try it on a sample run <ArrowRight size={15} />
      </Link>
      <div className="h-10" />
    </>
  );
}
