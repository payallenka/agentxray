/* Inline SVG diagrams. Theme-aware via CSS variables, no external deps. */

const INK = "var(--ink)";
const DIM = "var(--ink-2)";
const DIMMER = "var(--ink-3)";
const LINE = "var(--line-strong)";
const LLM = "var(--k-llm)";
const TOOL = "var(--k-tool)";
const RET = "var(--k-retrieval)";
const BAD = "var(--critical)";
const OK = "var(--ok)";

function Frame({ children, viewBox, caption, height = "auto" }: {
  children: React.ReactNode; viewBox: string; caption?: string; height?: string;
}) {
  return (
    <figure className="my-7">
      <div className="panel p-5 overflow-x-auto">
        <svg viewBox={viewBox} className="w-full" style={{ height, minWidth: 460 }} role="img">
          {children}
        </svg>
      </div>
      {caption && (
        <figcaption className="mono text-[11px] dimmer mt-2.5 leading-relaxed">{caption}</figcaption>
      )}
    </figure>
  );
}

const T = (props: React.SVGProps<SVGTextElement>) => (
  <text fontSize="11" fontFamily="ui-monospace, monospace" fill={DIM} {...props} />
);

function Arrow({ id = "arrow", color = LINE }: { id?: string; color?: string }) {
  return (
    <defs>
      <marker id={id} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
        <path d="M0,1 L7,4 L0,7 Z" fill={color} />
      </marker>
    </defs>
  );
}

/* ---------------- 1 · what an agent is ---------------- */

export function AgentLoopDiagram() {
  return (
    <Frame viewBox="0 0 620 220" caption="An agent is an LLM that can act: it thinks, calls a tool, reads the result, and thinks again.">
      <Arrow />
      <rect x="8" y="90" width="96" height="40" rx="8" fill="none" stroke={LINE} />
      <T x="56" y="114" textAnchor="middle" fill={INK}>user asks</T>

      <line x1="108" y1="110" x2="152" y2="110" stroke={LINE} markerEnd="url(#arrow)" />

      <rect x="156" y="82" width="110" height="56" rx="8" fill="rgba(167,139,250,.10)" stroke={LLM} />
      <T x="211" y="106" textAnchor="middle" fill={LLM}>LLM</T>
      <T x="211" y="122" textAnchor="middle" fontSize="10">decides</T>

      <line x1="270" y1="110" x2="314" y2="110" stroke={LINE} markerEnd="url(#arrow)" />

      {[["fetch_order", 24], ["search_docs", 78], ["send_email", 132]].map(([label, y], i) => (
        <g key={i}>
          <rect x="318" y={y as number} width="132" height="34" rx="7"
                fill="rgba(34,211,238,.08)" stroke={TOOL} />
          <T x="384" y={(y as number) + 22} textAnchor="middle" fill={TOOL} fontSize="10.5">{label as string}</T>
        </g>
      ))}

      {/* result flows back */}
      <path d="M450 41 C 500 41 500 180 384 180 L 211 180 L 211 144"
            fill="none" stroke={LINE} strokeDasharray="4 4" markerEnd="url(#arrow)" />
      <T x="300" y="196" textAnchor="middle" fontSize="10" fill={DIMMER}>result goes back into the LLM — this is the loop</T>

      <line x1="266" y1="96" x2="266" y2="96" stroke={LINE} />
      <rect x="500" y="90" width="112" height="40" rx="8" fill="none" stroke={LINE} />
      <T x="556" y="114" textAnchor="middle" fill={INK}>answer</T>
      <path d="M266 100 C 290 60 470 60 500 100" fill="none" stroke={LINE} markerEnd="url(#arrow)" />
    </Frame>
  );
}

/* ---------------- 2 · trace and spans ---------------- */

export function TraceSpansDiagram() {
  const rows: [string, number, number, string][] = [
    ["support_agent", 0, 100, DIMMER],
    ["planner", 2, 12, LLM],
    ["search_docs", 16, 10, TOOL],
    ["fetch_order", 28, 14, TOOL],
    ["react_turn_2", 44, 20, LLM],
    ["send_email", 66, 9, TOOL],
    ["final_answer", 78, 20, LLM],
  ];
  return (
    <Frame viewBox="0 0 620 210"
      caption="The trace is the whole recording. Each bar inside it is one span — one thing the agent did, with a start, an end, and a cost.">
      <T x="0" y="12" fontSize="10" fill={DIMMER}>◄──────────────────────  one trace  ──────────────────────►</T>
      {rows.map(([name, start, width, color], i) => {
        const y = 30 + i * 24;
        const x = 132 + (start / 100) * 470;
        const w = Math.max((width / 100) * 470, 6);
        return (
          <g key={name}>
            <T x="124" y={y + 11} textAnchor="end" fontSize="10.5"
               fill={i === 0 ? INK : DIM}>{name}</T>
            <rect x={x} y={y} width={w} height="13" rx="3"
                  fill={color} opacity={i === 0 ? 0.25 : 0.85} />
          </g>
        );
      })}
      <T x="132" y="200" fontSize="10" fill={DIMMER}>0s</T>
      <T x="602" y="200" fontSize="10" fill={DIMMER} textAnchor="end">42s</T>
      <line x1="132" y1="188" x2="602" y2="188" stroke={LINE} strokeDasharray="3 3" />
    </Frame>
  );
}

/* ---------------- 3 · critical path and slack ---------------- */

export function CriticalPathDiagram() {
  return (
    <Frame viewBox="0 0 620 210"
      caption="Solid bars gate the finish — shortening them shortens the run. The dashed tail is slack: fetch_customer could take four more seconds and nothing would change.">
      <T x="0" y="14" fontSize="10.5" fill={INK}>the run finishes when the longest chain finishes</T>

      {/* critical chain */}
      <rect x="120" y="34" width="130" height="14" rx="3" fill={LLM} />
      <T x="112" y="45" textAnchor="end" fontSize="10.5">planner</T>

      <rect x="258" y="60" width="150" height="14" rx="3" fill={TOOL} />
      <T x="112" y="71" textAnchor="end" fontSize="10.5">fetch_order</T>
      <line x1="250" y1="41" x2="258" y2="67" stroke={LINE} markerEnd="url(#arrow)" />

      <rect x="416" y="86" width="176" height="14" rx="3" fill={LLM} />
      <T x="112" y="97" textAnchor="end" fontSize="10.5">final_answer</T>
      <line x1="408" y1="67" x2="416" y2="93" stroke={LINE} markerEnd="url(#arrow)" />
      <Arrow />

      <T x="600" y="30" textAnchor="end" fontSize="10" fill={LLM}>▬ critical path</T>

      {/* slack row */}
      <rect x="258" y="126" width="96" height="14" rx="3" fill={TOOL} opacity="0.4" />
      <rect x="354" y="126" width="54" height="14" rx="3" fill="none"
            stroke={LINE} strokeDasharray="4 3" />
      <T x="112" y="137" textAnchor="end" fontSize="10.5">fetch_customer</T>
      <T x="381" y="158" textAnchor="middle" fontSize="9.5" fill={DIMMER}>slack</T>

      <line x1="416" y1="120" x2="416" y2="150" stroke={LINE} strokeDasharray="2 3" />
      <T x="424" y="172" fontSize="10" fill={DIMMER}>everything after here waits on the chain above, not on fetch_customer</T>
    </Frame>
  );
}

/* ---------------- 4 · sequential vs parallel ---------------- */

export function ParallelDiagram() {
  return (
    <Frame viewBox="0 0 620 190"
      caption="Two calls that do not depend on each other. Run one after the other they cost 5.5s; run together they cost 2.8s.">
      <T x="0" y="16" fontSize="11" fill={BAD}>sequential — 5.5s</T>
      <rect x="120" y="28" width="180" height="16" rx="3" fill={TOOL} />
      <T x="112" y="40" textAnchor="end" fontSize="10.5">fetch_order</T>
      <T x="308" y="40" fontSize="10" fill={DIMMER}>2.8s</T>
      <rect x="304" y="52" width="174" height="16" rx="3" fill={TOOL} />
      <T x="112" y="64" textAnchor="end" fontSize="10.5">fetch_customer</T>
      <T x="486" y="64" fontSize="10" fill={DIMMER}>2.7s</T>
      <line x1="478" y1="22" x2="478" y2="76" stroke={BAD} strokeDasharray="3 3" />

      <T x="0" y="116" fontSize="11" fill={OK}>parallel — 2.8s</T>
      <rect x="120" y="128" width="180" height="16" rx="3" fill={TOOL} />
      <T x="112" y="140" textAnchor="end" fontSize="10.5">fetch_order</T>
      <rect x="120" y="152" width="174" height="16" rx="3" fill={TOOL} />
      <T x="112" y="164" textAnchor="end" fontSize="10.5">fetch_customer</T>
      <line x1="300" y1="122" x2="300" y2="176" stroke={OK} strokeDasharray="3 3" />
      <T x="312" y="152" fontSize="10.5" fill={OK}>2.7s saved</T>
    </Frame>
  );
}

/* ---------------- 5 · context re-send ---------------- */

export function ContextGrowthDiagram() {
  const turns: [string, number, number][] = [
    ["turn 1", 0, 1200], ["turn 2", 1200, 3600], ["turn 3", 4800, 4800], ["turn 4", 9600, 5600],
  ];
  const max = 15200;
  return (
    <Frame viewBox="0 0 620 200"
      caption="Grey is history re-sent from earlier turns; violet is what the turn actually added. By turn four you are paying full price for 9,600 tokens the model has already seen."
    >
      {turns.map(([label, carried, novel], i) => {
        const y = 22 + i * 40;
        const cw = (carried / max) * 430;
        const nw = (novel / max) * 430;
        return (
          <g key={label}>
            <T x="94" y={y + 14} textAnchor="end" fontSize="10.5">{label}</T>
            {cw > 0 && <rect x="106" y={y} width={cw} height="18" rx="3" fill={DIMMER} opacity="0.45" />}
            <rect x={106 + cw} y={y} width={nw} height="18" rx="3" fill={LLM} />
            <T x={112 + cw + nw} y={y + 13} fontSize="10" fill={DIMMER}>
              {(carried + novel).toLocaleString()} in
            </T>
          </g>
        );
      })}
      <rect x="106" y="176" width="12" height="9" rx="2" fill={DIMMER} opacity="0.45" />
      <T x="124" y="185" fontSize="10">carried — already sent before</T>
      <rect x="300" y="176" width="12" height="9" rx="2" fill={LLM} />
      <T x="318" y="185" fontSize="10">novel — new this turn</T>
    </Frame>
  );
}

/* ---------------- 6 · dead branch ---------------- */

export function DeadBranchDiagram() {
  return (
    <Frame viewBox="0 0 620 200"
      caption="Walk backwards from the answer. vector_search_kb cannot be reached, so nothing it produced influenced the result — it was computed and billed for nothing.">
      <Arrow />
      <Arrow id="deadarrow" color={BAD} />

      <rect x="8" y="76" width="104" height="36" rx="8" fill="none" stroke={LINE} />
      <T x="60" y="98" textAnchor="middle" fontSize="10.5" fill={INK}>question</T>

      <rect x="152" y="28" width="122" height="34" rx="7" fill="rgba(34,211,238,.08)" stroke={TOOL} />
      <T x="213" y="49" textAnchor="middle" fontSize="10.5" fill={TOOL}>search_docs</T>

      <rect x="152" y="124" width="122" height="34" rx="7" fill="rgba(34,211,238,.08)" stroke={TOOL} />
      <T x="213" y="145" textAnchor="middle" fontSize="10.5" fill={TOOL}>fetch_order</T>

      <rect x="314" y="76" width="122" height="36" rx="8" fill="rgba(167,139,250,.10)" stroke={LLM} />
      <T x="375" y="98" textAnchor="middle" fontSize="10.5" fill={LLM}>final_answer</T>

      <rect x="476" y="76" width="120" height="36" rx="8" fill="none" stroke={OK} />
      <T x="536" y="98" textAnchor="middle" fontSize="10.5" fill={OK}>answer</T>

      <line x1="112" y1="88" x2="148" y2="52" stroke={LINE} markerEnd="url(#arrow)" />
      <line x1="112" y1="100" x2="148" y2="138" stroke={LINE} markerEnd="url(#arrow)" />
      <line x1="274" y1="50" x2="310" y2="86" stroke={LINE} markerEnd="url(#arrow)" />
      <line x1="274" y1="140" x2="310" y2="104" stroke={LINE} markerEnd="url(#arrow)" />
      <line x1="436" y1="94" x2="472" y2="94" stroke={LINE} markerEnd="url(#arrow)" />

      {/* orphan */}
      <rect x="152" y="172" width="160" height="30" rx="7" fill="rgba(251,191,36,.06)"
            stroke={BAD} strokeDasharray="4 3" />
      <T x="232" y="191" textAnchor="middle" fontSize="10.5" fill={BAD}>vector_search_kb</T>
      <T x="330" y="191" fontSize="10" fill={BAD}>✕ nothing consumes its output</T>
    </Frame>
  );
}

/* ---------------- 7 · the pipeline ---------------- */

export function PipelineDiagram() {
  const detectors = ["critical path", "context re-send", "semantic loops", "dead branches", "parallelism"];
  return (
    <Frame viewBox="0 0 620 250"
      caption="Four adapters in, one common shape, one dependency graph, five detectors, one ranked list out.">
      <Arrow />
      {["OpenTelemetry", "Langfuse", "LangSmith", "native JSON"].map((s, i) => (
        <g key={s}>
          <rect x="4" y={14 + i * 32} width="108" height="24" rx="6" fill="none" stroke={LINE} />
          <T x="58" y={30 + i * 32} textAnchor="middle" fontSize="9.5">{s}</T>
          <line x1="114" y1={26 + i * 32} x2="146" y2="72" stroke={LINE} strokeOpacity="0.5" />
        </g>
      ))}

      <rect x="150" y="56" width="106" height="34" rx="7" fill="rgba(167,139,250,.10)" stroke={LLM} />
      <T x="203" y="77" textAnchor="middle" fontSize="10.5" fill={LLM}>normalize()</T>

      <line x1="256" y1="73" x2="292" y2="73" stroke={LINE} markerEnd="url(#arrow)" />
      <rect x="296" y="56" width="118" height="34" rx="7" fill="none" stroke={LINE} />
      <T x="355" y="77" textAnchor="middle" fontSize="10.5" fill={INK}>data-flow DAG</T>

      {detectors.map((d, i) => (
        <g key={d}>
          <line x1="355" y1="94" x2={72 + i * 118 + 52} y2="132" stroke={LINE} strokeOpacity="0.4" />
          <rect x={72 + i * 118} y="134" width="104" height="26" rx="6"
                fill="rgba(34,211,238,.06)" stroke={TOOL} strokeOpacity="0.5" />
          <T x={72 + i * 118 + 52} y="151" textAnchor="middle" fontSize="9" fill={TOOL}>{d}</T>
          <line x1={72 + i * 118 + 52} y1="162" x2="310" y2="196" stroke={LINE} strokeOpacity="0.4" />
        </g>
      ))}

      <rect x="212" y="198" width="196" height="34" rx="8" fill="rgba(248,113,113,.07)" stroke={BAD} />
      <T x="310" y="219" textAnchor="middle" fontSize="10.5" fill={BAD}>ranked findings · $ and ms</T>
    </Frame>
  );
}
