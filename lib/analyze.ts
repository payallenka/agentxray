import { Analysis, Finding, Span, Trace } from "./types";
import { priceFor } from "./pricing";

/* ============================ text similarity ============================ */

const tok = (s?: string) => (s ? Math.ceil(s.length / 4) : 0);

/** char-level k-gram shingles */
function shingles(text: string, k = 5): Set<string> {
  const t = text.toLowerCase().replace(/[\s"'`{}[\],:]+/g, " ").trim();
  const out = new Set<string>();
  for (let i = 0; i + k <= t.length; i++) out.add(t.slice(i, i + k));
  return out;
}

/** FNV-1a — cheap, stable, no deps */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const HASHES = 64;

/** MinHash signature: HASHES independent minima over the shingle set */
function minhash(text: string): Int32Array {
  const sig = new Int32Array(HASHES).fill(0x7fffffff);
  const sh = shingles(text);
  if (!sh.size) return sig;
  for (const s of sh) {
    const base = fnv1a(s);
    for (let i = 0; i < HASHES; i++) {
      // cheap independent-ish permutations of the base hash
      const h = (Math.imul(base ^ (i * 0x9e3779b1), 0x85ebca6b) >>> 0) & 0x7fffffff;
      if (h < sig[i]) sig[i] = h;
    }
  }
  return sig;
}

function jaccard(a: Int32Array, b: Int32Array): number {
  let eq = 0;
  for (let i = 0; i < HASHES; i++) if (a[i] === b[i]) eq++;
  return eq / HASHES;
}

/** crude stem: lowercase, drop punctuation, strip a trailing plural s */
function words(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w.length > 2)
      .map((w) => (w.endsWith("s") && w.length > 3 ? w.slice(0, -1) : w)),
  );
}

function setJaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** MinHash scales to long texts; the word set rescues short JSON arguments,
 *  where 64 permutations over char shingles is too noisy to be reliable. */
function similarity(aText: string, bText: string, aSig: Int32Array, bSig: Int32Array): number {
  return Math.max(jaccard(aSig, bSig), setJaccard(words(aText), words(bText)));
}

/** longest common prefix, in characters */
function lcpLen(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

/** 8-gram word shingles, for inferring data dependencies */
function wordGrams(text: string, k = 8): Set<string> {
  const w = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((x) => x.length > 2);
  const out = new Set<string>();
  for (let i = 0; i + k <= w.length; i++) out.add(w.slice(i, i + k).join(" "));
  return out;
}

/* ============================ dependency DAG ============================ */

export interface Graph {
  deps: Map<string, Set<string>>;   // span -> spans it depends on
  succ: Map<string, Set<string>>;   // span -> spans depending on it
  inferred: [string, string][];     // conversational carry + data flow
  dataFlow: [string, string][];     // recovered from quoted text only
}

/**
 * The span tree is a *structural* view. The real question — what actually
 * gated what — needs the data-flow graph. Edges:
 *   1. child -> parent   (a parent cannot finish before its children)
 *   2. A -> B when B started after A ended AND B's input carries a
 *      distinctive 8-gram from A's output (Jaccard over word shingles)
 */
export function buildGraph(spans: Span[]): Graph {
  const deps = new Map<string, Set<string>>(spans.map((s) => [s.id, new Set<string>()]));
  const succ = new Map<string, Set<string>>(spans.map((s) => [s.id, new Set<string>()]));
  const inferred: [string, string][] = [];
  const dataFlow: [string, string][] = [];

  const link = (from: string, to: string, isInferred = false, isDataFlow = false) => {
    if (from === to) return;
    if (deps.get(to)?.has(from)) return;
    deps.get(to)?.add(from);
    succ.get(from)?.add(to);
    if (isInferred) inferred.push([from, to]);
    if (isDataFlow) dataFlow.push([from, to]);
  };

  // structural: a parent depends on each of its children completing
  for (const s of spans) if (s.parentId && deps.has(s.parentId)) link(s.id, s.parentId);

  // conversational carry: consecutive LLM turns under the same parent are
  // sequentially dependent even when the next prompt never quotes the last
  // reasoning step verbatim
  const llmByParent = new Map<string, Span[]>();
  for (const s of spans) {
    if (s.kind !== "llm") continue;
    const k = s.parentId ?? "__root__";
    (llmByParent.get(k) ?? llmByParent.set(k, []).get(k)!).push(s);
  }
  for (const chain of llmByParent.values()) {
    chain.sort((a, b) => a.startMs - b.startMs);
    for (let i = 1; i < chain.length; i++) link(chain[i - 1].id, chain[i].id, true);
  }

  // data flow: does B's input quote A's output?
  const outGrams = new Map<string, Set<string>>();
  for (const s of spans) if (s.outputPreview) outGrams.set(s.id, wordGrams(s.outputPreview));

  for (const b of spans) {
    if (!b.inputPreview) continue;
    const bIn = wordGrams(b.inputPreview);
    if (!bIn.size) continue;
    for (const a of spans) {
      if (a.id === b.id || a.endMs > b.startMs + 1) continue;
      const aOut = outGrams.get(a.id);
      if (!aOut?.size) continue;
      let hit = 0;
      for (const g of aOut) if (bIn.has(g)) { hit++; if (hit >= 2) break; }
      if (hit >= 2) link(a.id, b.id, true, true);
    }
  }
  return { deps, succ, inferred, dataFlow };
}

/* ==================== critical path + PERT slack ==================== */

export function criticalPath(spans: Span[], g: Graph) {
  const byId = new Map(spans.map((s) => [s.id, s]));
  // a container span's elapsed time IS its children's work - counting both
  // double-books the same milliseconds onto the path
  const hasKids = new Set(spans.map((s) => s.parentId).filter(Boolean) as string[]);
  const work = (s: Span) => (hasKids.has(s.id) ? 0 : s.durationMs);
  const order = [...spans].sort((a, b) => a.startMs - b.startMs);

  // forward pass: earliest finish along the dependency chain
  const ef = new Map<string, number>();
  const prev = new Map<string, string | null>();
  for (const s of order) {
    let best = 0;
    let from: string | null = null;
    for (const d of g.deps.get(s.id) || []) {
      const v = ef.get(d) ?? 0;
      if (v > best) { best = v; from = d; }
    }
    ef.set(s.id, best + work(s));
    prev.set(s.id, from);
  }

  // the chain ending at the largest earliest-finish is the critical path
  let tail = order[0]?.id ?? "";
  for (const [id, v] of ef) if (v > (ef.get(tail) ?? 0)) tail = id;
  const path: string[] = [];
  for (let cur: string | null = tail; cur; cur = prev.get(cur) ?? null) {
    if (!hasKids.has(cur)) path.unshift(cur);
  }

  const projectEnd = ef.get(tail) ?? 0;

  // backward pass: latest finish without pushing the project end out
  const lf = new Map<string, number>();
  for (const s of [...order].reverse()) {
    const succs = g.succ.get(s.id);
    let latest = projectEnd;
    if (succs?.size) {
      for (const x of succs) {
        const xs = byId.get(x);
        if (!xs) continue;
        latest = Math.min(latest, (lf.get(x) ?? projectEnd) - work(xs));
      }
    }
    lf.set(s.id, latest);
  }

  const slack = new Map<string, number>();
  for (const s of spans) slack.set(s.id, Math.max(0, (lf.get(s.id) ?? 0) - (ef.get(s.id) ?? 0)));

  return { path, ms: projectEnd, slack };
}

/* ==================== context re-send decomposition ==================== */

/**
 * A ReAct loop re-sends turns 1..N-1 on turn N, so input tokens grow ~O(n^2).
 * Split each LLM call's input into novel vs carried, and price the carried
 * portion that was NOT served from cache. This is the single largest
 * recoverable cost in most agent runs and no trace viewer surfaces it.
 */
export function contextGrowth(spans: Span[]) {
  const llm = spans.filter((s) => s.kind === "llm").sort((a, b) => a.startMs - b.startMs);
  const rows: {
    span: Span; novel: number; carried: number; uncachedCarried: number; wasteUsd: number;
  }[] = [];

  for (let i = 0; i < llm.length; i++) {
    const s = llm[i];
    const prevS = llm[i - 1];
    const total = s.inputTokens ?? tok(s.inputPreview);
    if (!total) continue;

    let carried = 0;
    if (prevS && s.inputPreview && prevS.inputPreview) {
      const shared = lcpLen(s.inputPreview, prevS.inputPreview);
      // scale the character-level prefix into the reported token count
      carried = Math.min(total, Math.round((shared / s.inputPreview.length) * total));
    }
    const cached = s.cachedTokens ?? 0;
    const uncachedCarried = Math.max(0, carried - cached);
    // a cache read costs ~10% of a fresh input token, so 90% is recoverable
    // no known rate means no honest figure; the tokens still count
    const rate = priceFor(s.model);
    const wasteUsd = rate ? (uncachedCarried / 1e6) * rate.in * 0.9 : 0;
    rows.push({ span: s, novel: total - carried, carried, uncachedCarried, wasteUsd });
  }
  return rows;
}

/* ==================== semantic loop detection ==================== */

type LoopKind = "thrash" | "retry" | "pagination";

export function detectLoops(spans: Span[]) {
  const groups = new Map<string, Span[]>();
  for (const s of spans) {
    if (s.kind !== "tool" && s.kind !== "retrieval" && s.kind !== "llm") continue;
    const key = `${s.kind}:${s.name}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
  }

  const loops: { name: string; members: Span[]; kind: LoopKind; sim: number }[] = [];

  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    const kindOf = key.split(":")[0];
    const texts = members.map((m) => m.inputPreview ?? m.name);
    const sigs = texts.map((t) => minhash(t));
    const seen = new Set<number>();

    for (let i = 0; i < members.length; i++) {
      if (seen.has(i)) continue;
      const cluster = [i];
      let simSum = 0;
      for (let j = i + 1; j < members.length; j++) {
        if (seen.has(j)) continue;
        let sim: number;
        if (texts[i] === texts[j]) {
          sim = 1;
        } else if (kindOf === "llm") {
          // Consecutive ReAct turns always share a growing prefix, so raw
          // similarity would flag every conversation as a loop. Compare only
          // the novel suffix; if one turn is a strict prefix of the other,
          // that is context growth, not repetition.
          const cut = lcpLen(texts[i], texts[j]);
          const ai = texts[i].slice(cut);
          const bj = texts[j].slice(cut);
          sim = ai.length < 8 || bj.length < 8
            ? 0
            : similarity(ai, bj, minhash(ai), minhash(bj));
        } else {
          sim = similarity(texts[i], texts[j], sigs[i], sigs[j]);
        }
        if (sim >= 0.7) { cluster.push(j); seen.add(j); simSum += sim; }
      }
      if (cluster.length < 2) continue;
      seen.add(i);
      const group = cluster.map((x) => members[x]).sort((a, b) => a.startMs - b.startMs);

      // classify: a retry follows an error; pagination differs only in a number
      let kind: LoopKind = "thrash";
      if (group.some((m) => m.status === "error")) kind = "retry";
      else {
        const stripped = group.map((m) => (m.inputPreview ?? "").replace(/\d+/g, "#"));
        if (stripped.every((x) => x === stripped[0]) && !group.every((m) => m.inputPreview === group[0].inputPreview)) {
          kind = "pagination";
        }
      }
      loops.push({ name: key.split(":")[1], members: group, kind, sim: simSum / (cluster.length - 1) });
    }
  }
  return loops;
}

/* ==================== dead branches ==================== */

/** Walk the graph backwards from the answer over DATA-FLOW edges only.
 *  Structural child->parent edges would make everything reachable from the
 *  root, so they are deliberately excluded here. Anything unreachable
 *  produced output that never influenced the result - the agent equivalent
 *  of dead code, and directly priceable. */
/**
 * Data-flow inference reads quoted text. An agent that passes structured
 * results between steps — JSON fields, ids, typed envelopes — produces almost
 * no n-gram overlap, so nothing looks connected and everything looks dead.
 * Measure whether inference worked before trusting anything built on it.
 */
export function dataFlowCoverage(spans: Span[], g: Graph): number {
  const consumers = spans.filter(
    (s) => (s.inputPreview?.length ?? 0) >= 60 && s.kind !== "agent" && s.kind !== "chain",
  );
  if (consumers.length === 0) return 0;
  const linked = new Set(g.dataFlow.map(([, to]) => to));
  return consumers.filter((c) => linked.has(c.id)).length / consumers.length;
}

/** Below this, "unreachable" means we could not see the wiring, not that the
 *  work was wasted. */
export const MIN_DATAFLOW_COVERAGE = 0.3;

/**
 * A ceiling on what dead-branch analysis is allowed to claim. If walking back
 * from the answer leaves more than half the run's spend unreachable, the far
 * likelier explanation is that the graph is incomplete — steps passing
 * structured results rather than quoted text — not that the agent threw away
 * most of its work. An agent burning 87% of its spend on an unused planner
 * would be catastrophically broken in ways nobody needs this tool to notice.
 */
export const MAX_CREDIBLE_DEAD_SHARE = 0.5;

export function deadBranches(spans: Span[], g: Graph, exclude = new Set<string>()) {
  if (!spans.length) return [];
  if (dataFlowCoverage(spans, g) < MIN_DATAFLOW_COVERAGE) return [];
  const byId = new Map(spans.map((s) => [s.id, s]));

  // data-flow adjacency, reversed: consumer -> producers
  const producers = new Map<string, Set<string>>(spans.map((s) => [s.id, new Set<string>()]));
  for (const [from, to] of g.inferred) producers.get(to)?.add(from);

  // the answer is the last LLM span to finish, else the last span to finish
  const llm = spans.filter((s) => s.kind === "llm");
  const terminal = (llm.length ? llm : spans).reduce((a, b) => (b.endMs > a.endMs ? b : a));

  const alive = new Set<string>();
  const stack = [terminal.id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (alive.has(cur)) continue;
    alive.add(cur);
    for (const d of producers.get(cur) || []) stack.push(d);
  }

  // a container whose subtree contains live work is not itself dead
  const liveSubtree = new Set<string>();
  for (const id of alive) {
    let cur = byId.get(id)?.parentId ?? null;
    let guard = 0;
    while (cur && guard++ < 64) {
      liveSubtree.add(cur);
      cur = byId.get(cur)?.parentId ?? null;
    }
  }

  const hasKids = new Set(spans.map((s) => s.parentId).filter(Boolean) as string[]);

  /**
   * Unreachable is only meaningful when we could have found the link. Three
   * cases where "no match" means "no evidence", not "no use":
   *   - the span recorded no output at all
   *   - its output is too short to yield a distinctive 8-word-gram
   *   - its output was clipped at the preview cap, so the quoted part may
   *     simply live past the cut
   * Calling any of those dead invents waste out of missing instrumentation,
   * which on a small trace can read as 100% recoverable.
   */
  const MIN_JUDGEABLE_OUTPUT = 60;
  const judgeable = (s: Span) =>
    !s.outputTruncated &&
    (s.outputPreview?.length ?? 0) >= MIN_JUDGEABLE_OUTPUT;

  return spans.filter(
    (s) =>
      !alive.has(s.id) &&
      !liveSubtree.has(s.id) &&
      !exclude.has(s.id) &&
      !hasKids.has(s.id) &&
      judgeable(s) &&
      (s.kind === "tool" || s.kind === "retrieval" || s.kind === "llm"),
  );
}

/* ==================== missed parallelism ==================== */

export function missedParallelism(spans: Span[], g: Graph, exclude = new Set<string>()) {
  const byParent = new Map<string, Span[]>();
  for (const s of spans) {
    const k = s.parentId ?? "__root__";
    (byParent.get(k) ?? byParent.set(k, []).get(k)!).push(s);
  }
  const out: { parent: string; members: Span[]; savingMs: number }[] = [];

  for (const [parent, kids] of byParent) {
    const cand = kids.sort((a, b) => a.startMs - b.startMs);
    if (cand.length < 2) continue;

    const run: Span[] = [];
    const flush = () => {
      if (run.length >= 2) {
        const total = run.reduce((a, s) => a + s.durationMs, 0);
        const longest = Math.max(...run.map((s) => s.durationMs));
        if (total - longest > 200) out.push({ parent, members: [...run], savingMs: total - longest });
      }
      run.length = 0;
    };

    for (const s of cand) {
      // an LLM turn between two tool calls is a real decision point
      if (s.kind === "llm" || s.kind === "agent") { flush(); continue; }
      if (s.kind !== "tool" && s.kind !== "retrieval") continue;
      if (exclude.has(s.id)) { flush(); continue; }
      const last = run[run.length - 1];
      const independent = !last || (!g.deps.get(s.id)?.has(last.id) && s.startMs >= last.endMs - 1);
      if (independent) run.push(s);
      else { flush(); run.push(s); }
    }
    flush();
  }
  return out;
}

/* ============================== assemble ============================== */

export function analyze(trace: Trace): Analysis & { graph: Graph; slack: Map<string, number> } {
  const spans = trace.spans;
  const g = buildGraph(spans);
  const cp = criticalPath(spans, g);
  const growth = contextGrowth(spans);
  const loops = detectLoops(spans);
  const chargedToLoops = new Set(
    loops.flatMap((l) => l.members.slice(1).map((m) => m.id)),
  );
  const deadRaw = deadBranches(spans, g, chargedToLoops);
  const par = missedParallelism(spans, g, chargedToLoops);

  const totals = {
    durationMs: trace.totalMs,
    costUsd: spans.reduce((a, s) => a + (s.costUsd ?? 0), 0),
    inputTokens: spans.reduce((a, s) => a + (s.inputTokens ?? 0), 0),
    outputTokens: spans.reduce((a, s) => a + (s.outputTokens ?? 0), 0),
    cachedTokens: spans.reduce((a, s) => a + (s.cachedTokens ?? 0), 0),
    spanCount: spans.length,
    llmCalls: spans.filter((s) => s.kind === "llm").length,
    toolCalls: spans.filter((s) => s.kind === "tool").length,
    errors: spans.filter((s) => s.status === "error").length,
  };

  const nodeMap = new Map<string, { name: string; kind: Span["kind"]; calls: number; costUsd: number; ms: number }>();
  for (const s of spans) {
    const e = nodeMap.get(s.name) ?? { name: s.name, kind: s.kind, calls: 0, costUsd: 0, ms: 0 };
    e.calls++; e.costUsd += s.costUsd ?? 0; e.ms += s.durationMs;
    nodeMap.set(s.name, e);
  }
  const costByNode = [...nodeMap.values()]
    .map((e) => ({ ...e, share: totals.costUsd ? e.costUsd / totals.costUsd : 0 }))
    .sort((a, b) => b.costUsd - a.costUsd || b.ms - a.ms);

  const findings: Finding[] = [];

  const ctxWaste = growth.reduce((a, r) => a + r.wasteUsd, 0);
  const carriedTok = growth.reduce((a, r) => a + r.uncachedCarried, 0);
  if (ctxWaste > 0.0001) {
    findings.push({
      id: "context-resend",
      severity: ctxWaste / (totals.costUsd || 1) > 0.3 ? "critical" : "warn",
      title: "Conversation prefix re-sent uncached on every turn",
      detail:
        `${carriedTok.toLocaleString()} input tokens across ${growth.length} LLM calls were history carried ` +
        `from earlier turns and billed at full rate. The prefix is stable — a cache breakpoint after the ` +
        `system prompt and tool definitions makes these cache reads at ~10% of the price.`,
      spanIds: growth.filter((r) => r.uncachedCarried > 0).map((r) => r.span.id),
      wastedUsd: ctxWaste,
    });
  }

  for (const l of loops) {
    if (l.kind === "pagination") continue;
    const cost = l.members.slice(1).reduce((a, s) => a + (s.costUsd ?? 0), 0);
    const time = l.members.slice(1).reduce((a, s) => a + s.durationMs, 0);
    findings.push({
      id: `loop-${l.name}-${l.members[0].id}`,
      severity: l.kind === "thrash" && l.members.length >= 3 ? "critical" : "warn",
      title:
        l.kind === "retry"
          ? `${l.name} retried ${l.members.length}× after failure`
          : `${l.name} called ${l.members.length}× with near-identical input`,
      detail:
        `MinHash similarity ${(l.sim * 100).toFixed(0)}% across calls — string-identical checks would miss this. ` +
        (l.kind === "thrash"
          ? `The agent is not making progress; the repeats add context without adding information.`
          : `Retries after an error; confirm the backoff is bounded.`),
      spanIds: l.members.map((s) => s.id),
      wastedMs: time,
      wastedUsd: cost,
    });
  }

  const coverage = dataFlowCoverage(spans, g);
  const deadShare = totals.costUsd ? deadRaw.reduce((a, s) => a + (s.costUsd ?? 0), 0) / totals.costUsd : 0;
  const deadNotCredible = deadShare > MAX_CREDIBLE_DEAD_SHARE;

  if (deadNotCredible) {
    findings.push({
      id: "dataflow-incomplete",
      severity: "info",
      title: "Dead-branch analysis withheld — the result was not credible",
      detail:
        `Walking back from the answer left ${Math.round(deadShare * 100)}% of this run's spend ` +
        `unreachable, including its most expensive step. The likelier explanation is an ` +
        `incomplete picture of how data moved — steps passing structured results, ids or typed ` +
        `envelopes rather than quoting text — than an agent that discarded most of its own work. ` +
        `The finding is withheld rather than shown, because acting on it would mean deleting ` +
        `work that is almost certainly load-bearing. Cost, timing, critical path and loop ` +
        `findings are unaffected.`,
      spanIds: [],
    });
  } else if (coverage < MIN_DATAFLOW_COVERAGE && spans.length > 3) {
    findings.push({
      id: "dataflow-unreadable",
      severity: "info",
      title: "Dead-branch analysis skipped — this trace passes data structurally",
      detail:
        `Only ${Math.round(coverage * 100)}% of consuming spans quote text from an earlier span, ` +
        `so which output fed which step cannot be read from this trace. Steps here appear to pass ` +
        `structured results — JSON fields, ids, typed envelopes — which carry no quotable text. ` +
        `Reporting unreachable spans on that basis would flag work that was almost certainly used. ` +
        `Cost, timing, critical path and loop findings are unaffected.`,
      spanIds: [],
    });
  }

  const dead = deadNotCredible ? [] : deadRaw;
  const deadUsd = dead.reduce((a, s) => a + (s.costUsd ?? 0), 0);
  if (dead.length) {
    findings.push({
      id: "dead-branch",
      severity: deadUsd / (totals.costUsd || 1) > 0.25 ? "critical" : "info",
      title: `${dead.length} span${dead.length > 1 ? "s" : ""} produced output that never reached the answer`,
      detail:
        `Reachability analysis backwards from the final span over the data-flow graph found these unreachable. ` +
        `Their results were computed, billed, and discarded.`,
      spanIds: dead.map((s) => s.id),
      wastedUsd: deadUsd,
      wastedMs: dead.reduce((a, s) => a + s.durationMs, 0),
    });
  }

  for (const p of par) {
    findings.push({
      id: `parallel-${p.members[0].id}`,
      severity: "warn",
      title: `${p.members.length} independent calls ran sequentially`,
      detail:
        `No data dependency links ${p.members.map((m) => m.name).join(", ")}, and they do not overlap in time. ` +
        `Dispatching them concurrently cuts wall-clock to the slowest one.`,
      spanIds: p.members.map((s) => s.id),
      wastedMs: p.savingMs,
    });
  }

  const offPath = spans
    .filter((s) => (cp.slack.get(s.id) ?? 0) > 500 && s.durationMs > trace.totalMs * 0.1)
    .sort((a, b) => b.durationMs - a.durationMs);
  if (offPath.length) {
    findings.push({
      id: "slack",
      severity: "info",
      title: `${offPath.length} slow span${offPath.length > 1 ? "s are" : " is"} off the critical path`,
      detail:
        `${offPath.map((s) => s.name).join(", ")} look expensive but carry slack — they finish before anything ` +
        `needs them. Optimizing them returns zero wall-clock. Spend the effort on the critical path instead.`,
      spanIds: offPath.map((s) => s.id),
    });
  }

  // group identical failures — three timeouts of the same tool is one
  // problem, not three findings
  const errorsByName = new Map<string, Span[]>();
  for (const s of spans.filter((x) => x.status === "error")) {
    (errorsByName.get(s.name) ?? errorsByName.set(s.name, []).get(s.name)!).push(s);
  }
  for (const [name, group] of errorsByName) {
    const distinct = [...new Set(group.map((g) => g.error ?? ""))];
    findings.push({
      id: `error-${name}`,
      severity: "critical",
      title: group.length > 1 ? `${name} failed ${group.length}×` : `${name} failed`,
      detail:
        distinct.length === 1
          ? distinct[0] || "Span reported an error status."
          : distinct.map((d) => `• ${d}`).join("\n"),
      spanIds: group.map((g) => g.id),
      wastedMs: group.reduce((a, g) => a + g.durationMs, 0),
      wastedUsd: group.reduce((a, g) => a + (g.costUsd ?? 0), 0),
    });
  }

  // $0.00 can mean "efficient" or "unmeasured", and those are very different
  // conclusions. Never let a reader infer the first when the truth is the
  // second.
  const llmSpans = spans.filter((s) => s.kind === "llm");
  const unpriced = llmSpans.filter((s) => !s.costUsd && !s.inputTokens && !s.outputTokens);

  if (llmSpans.length === 0 && totals.costUsd === 0) {
    findings.push({
      id: "no-model-calls",
      severity: "warn",
      title: "No model calls recorded, so this run cannot be priced",
      detail:
        `This trace contains ${totals.spanCount} spans but no LLM generations, so every cost ` +
        `figure is $0.00 by absence rather than by efficiency. Timing analysis — critical path, ` +
        `slack, parallelism, dead branches — is unaffected, because it comes from timestamps. ` +
        `To recover cost and context-re-send analysis, record model calls as generations: a ` +
        `GENERATION observation in Langfuse, or a span carrying gen_ai.request.model and ` +
        `gen_ai.usage.* under OpenTelemetry.`,
      spanIds: [],
    });
  } else if (llmSpans.length > 0 && unpriced.length === llmSpans.length) {
    findings.push({
      id: "no-usage-data",
      severity: "warn",
      title: "Model calls report no token usage, so cost cannot be computed",
      detail:
        `All ${llmSpans.length} model call${llmSpans.length > 1 ? "s" : ""} reported zero tokens ` +
        `and no model name, so cost here is $0.00 by absence, not by efficiency. Timing findings ` +
        `are unaffected. Record gen_ai.usage.input_tokens and gen_ai.usage.output_tokens, or the ` +
        `usage field on a Langfuse generation, to recover cost analysis.`,
      spanIds: unpriced.map((s) => s.id),
    });
  } else if (unpriced.length > 0) {
    findings.push({
      id: "partial-usage-data",
      severity: "info",
      title: `${unpriced.length} of ${llmSpans.length} model calls report no token usage`,
      detail:
        `Cost for this run is understated: those calls count as $0.00 because the trace carries ` +
        `no usage for them, not because they were free.`,
      spanIds: unpriced.map((s) => s.id),
    });
  }

  const rank = { critical: 0, warn: 1, info: 2 } as const;
  findings.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      (b.wastedUsd ?? 0) - (a.wastedUsd ?? 0) ||
      (b.wastedMs ?? 0) - (a.wastedMs ?? 0),
  );

  // a span can be both a loop repeat and unreachable - charge it once
  const wastedSpans = new Map<string, Span>();
  for (const s of dead) wastedSpans.set(s.id, s);
  for (const l of loops) {
    if (l.kind !== "thrash") continue;
    for (const m of l.members.slice(1)) wastedSpans.set(m.id, m);
  }
  const spanWasteUsd = [...wastedSpans.values()].reduce((a, s) => a + (s.costUsd ?? 0), 0);
  const spanWasteMs = [...wastedSpans.values()].reduce((a, s) => a + s.durationMs, 0);

  const wasteMs = Math.min(
    trace.totalMs,
    par.reduce((a, p) => a + p.savingMs, 0) + spanWasteMs,
  );
  const wasteUsd = Math.min(totals.costUsd, ctxWaste + spanWasteUsd);

  return {
    totals,
    criticalPath: { spanIds: cp.path, ms: cp.ms, share: trace.totalMs ? cp.ms / trace.totalMs : 0 },
    costByNode,
    findings,
    waste: {
      ms: wasteMs,
      usd: wasteUsd,
      shareMs: trace.totalMs ? wasteMs / trace.totalMs : 0,
      shareUsd: totals.costUsd ? wasteUsd / totals.costUsd : 0,
    },
    graph: g,
    slack: cp.slack,
  };
}
