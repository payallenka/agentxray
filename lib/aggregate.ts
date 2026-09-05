import type { Analysis, Finding } from "./types";

export interface StoredRun {
  id: string;
  started_at?: string;
  name: string;
  source: string;
  span_count: number;
  total_ms: number;
  cost_usd: number;
  waste_usd: number;
  waste_share: number;
  finding_count: number;
  created_at: string;
  analysis?: Analysis;
}

/** Findings are per-run; opportunities are what they say together. */
export type Category =
  | "context-resend" | "loop" | "dead-branch" | "parallelism"
  | "failure" | "unpriced" | "limited" | "slack";

const CATEGORY_LABEL: Record<Category, string> = {
  "context-resend": "Conversation prefix re-sent uncached",
  loop: "Repeated near-identical calls",
  "dead-branch": "Work that never reached the answer",
  parallelism: "Independent calls ran sequentially",
  failure: "Failed steps",
  unpriced: "Runs that cannot be priced",
  limited: "Analysis limited by trace shape",
  slack: "Slow steps that are not on the critical path",
};

/** What to actually do about it — the reason an aggregate beats a list. */
const CATEGORY_FIX: Record<Category, string> = {
  "context-resend":
    "Add a cache breakpoint after the system prompt and tool definitions. One change, applied once, priced at roughly a tenth of a fresh input token on every later turn.",
  loop:
    "Add a dedup guard keyed on the normalised arguments, or fix the step that keeps re-asking. Repeats cost money and push noise into the context.",
  "dead-branch":
    "Remove the call, or make its result actually feed the answer. It is computed and billed either way.",
  parallelism:
    "Dispatch these concurrently. Wall clock drops from their sum to the slowest one.",
  failure:
    "Fix the failing step or bound its retries. A failure that is retried still pays for both attempts.",
  unpriced:
    "Record token usage on model calls, so cost can be attributed at all. Until then these runs are invisible in every spend figure.",
  limited:
    "Attribution needs to see how data moved between steps. Traces that pass structured results carry no quotable text, so some analysis is withheld rather than guessed.",
  slack:
    "Nothing. These look slow but finish before anything needs them — optimising them returns no wall clock.",
};

export function categorise(f: Finding): Category {
  const id = f.id;
  if (id.startsWith("context-resend")) return "context-resend";
  if (id.startsWith("loop-")) return "loop";
  if (id.startsWith("dead-branch")) return "dead-branch";
  if (id.startsWith("parallel")) return "parallelism";
  if (id.startsWith("error-")) return "failure";
  if (id.startsWith("no-model-calls") || id.startsWith("no-usage") || id.startsWith("partial-usage"))
    return "unpriced";
  if (id.startsWith("dataflow-")) return "limited";
  return "slack";
}

export interface Opportunity {
  category: Category;
  label: string;
  fix: string;
  runs: number;          // how many runs show it
  totalRuns: number;
  usd: number;
  ms: number;
  severity: Finding["severity"];
  /** for loops: which step repeats most */
  examples: string[];
  /** the worst affected runs, so the claim can be checked */
  worst: { id: string; name: string; usd: number; ms: number; detail: string }[];
  /** which workflows it shows up in */
  workflows: { name: string; runs: number }[];
}

export function opportunities(runs: StoredRun[]): Opportunity[] {
  const acc = new Map<Category, {
    runs: Set<string>; usd: number; ms: number;
    severity: Finding["severity"]; examples: Map<string, number>;
    hits: { id: string; name: string; usd: number; ms: number; detail: string }[];
    flows: Map<string, number>;
  }>();

  for (const r of runs) {
    for (const f of r.analysis?.findings ?? []) {
      const c = categorise(f);
      const e = acc.get(c) ?? {
        runs: new Set<string>(), usd: 0, ms: 0,
        severity: "info" as Finding["severity"], examples: new Map<string, number>(),
        hits: [] as { id: string; name: string; usd: number; ms: number; detail: string }[],
        flows: new Map<string, number>(),
      };
      e.runs.add(r.id);
      e.usd += f.wastedUsd ?? 0;
      e.ms += f.wastedMs ?? 0;
      const rank = { critical: 0, warn: 1, info: 2 };
      if (rank[f.severity] < rank[e.severity]) e.severity = f.severity;
      // the tool name inside a loop title is the actionable detail
      const m = f.title.match(/^([\w.\-]+) (?:called|retried|failed)/);
      if (m) e.examples.set(m[1], (e.examples.get(m[1]) ?? 0) + 1);
      e.hits.push({
        id: r.id, name: r.name, usd: f.wastedUsd ?? 0, ms: f.wastedMs ?? 0, detail: f.detail,
      });
      const flow = r.name.replace(/\s*\(.*\)\s*$/, "").trim();
      e.flows.set(flow, (e.flows.get(flow) ?? 0) + 1);
      acc.set(c, e);
    }
  }

  return [...acc.entries()]
    .map(([category, e]) => ({
      category,
      label: CATEGORY_LABEL[category],
      fix: CATEGORY_FIX[category],
      runs: e.runs.size,
      totalRuns: runs.length,
      usd: e.usd,
      ms: e.ms,
      severity: e.severity,
      examples: [...e.examples.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
        .map(([n, c]) => `${n} ×${c}`),
      worst: e.hits.sort((a, b) => b.usd - a.usd || b.ms - a.ms).slice(0, 5),
      workflows: [...e.flows.entries()].sort((a, b) => b[1] - a[1])
        .map(([name, runs]) => ({ name, runs })),
    }))
    .sort((a, b) => b.usd - a.usd || b.ms - a.ms || b.runs - a.runs);
}

export type Dimension = "workflow" | "session" | "user" | "environment";

export const DIMENSIONS: { key: Dimension; label: string; noun: string }[] = [
  { key: "workflow", label: "Workflow", noun: "workflow" },
  { key: "session", label: "Conversation", noun: "session" },
  { key: "user", label: "User", noun: "user" },
  { key: "environment", label: "Environment", noun: "environment" },
];

/** Which dimensions this data actually has — hide selectors that would be empty. */
export function availableDimensions(runs: StoredRun[]): Dimension[] {
  const out: Dimension[] = ["workflow"];
  for (const d of ["session", "user", "environment"] as const)
    if (runs.some((r) => keyFor(r, d))) out.push(d);
  return out;
}

function keyFor(r: StoredRun, d: Dimension): string | undefined {
  if (d === "workflow") return r.name.replace(/\s*\(.*\)\s*$/, "").trim();
  const a = (r.analysis as unknown as { attributes?: Record<string, string> } | undefined)?.attributes;
  return a?.[d];
}

export interface WorkflowRow {
  name: string;          // the grouping key — an id when grouping by session or user
  label: string;         // what to actually show a person
  sublabel?: string;     // the id, kept visible but secondary
  runs: number;
  costUsd: number;
  wasteUsd: number;
  wasteShare: number;
  avgMs: number;
  p95Ms: number;
  topCategory?: Category;
}

export function byWorkflow(runs: StoredRun[], dimension: Dimension = "workflow"): WorkflowRow[] {
  const acc = new Map<string, StoredRun[]>();
  for (const r of runs) {
    const k = keyFor(r, dimension);
    if (!k) continue;                      // not every run carries every dimension
    (acc.get(k) ?? acc.set(k, []).get(k)!).push(r);
  }

  return [...acc.entries()].map(([name, rs]) => {
    const costUsd = rs.reduce((a, r) => a + r.cost_usd, 0);
    const wasteUsd = rs.reduce((a, r) => a + r.waste_usd, 0);
    const durs = rs.map((r) => r.total_ms).sort((a, b) => a - b);
    const counts = new Map<Category, number>();
    for (const r of rs)
      for (const f of r.analysis?.findings ?? []) {
        const c = categorise(f);
        if (c === "slack" || c === "limited") continue;   // not actionable
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    // A uuid is not a name. For a conversation the useful label is what it did
    // and when; the id stays visible underneath because it is what you paste
    // into Langfuse.
    let label = name;
    let sublabel: string | undefined;
    if (dimension === "session" || dimension === "user") {
      const flows = new Map<string, number>();
      for (const r of rs) {
        const k = r.name.replace(/\s*\(.*\)\s*$/, "").trim();
        flows.set(k, (flows.get(k) ?? 0) + 1);
      }
      const top = [...flows.entries()].sort((a, b) => b[1] - a[1]);
      const when = rs
        .map((r) => new Date(r.started_at ?? r.created_at).getTime())
        .sort((a, b) => a - b)[0];
      const stamp = Number.isFinite(when)
        ? new Date(when).toLocaleString(undefined,
            { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        : "";
      label = dimension === "session"
        ? [top.map(([f, n]) => (top.length > 1 ? `${f} ×${n}` : f)).slice(0, 2).join(" + "), stamp]
            .filter(Boolean).join(" · ")
        : `${top[0]?.[0] ?? "user"} · ${rs.length} run${rs.length === 1 ? "" : "s"} from ${stamp}`;
      sublabel = name;
    }

    return {
      name, label, sublabel, runs: rs.length, costUsd, wasteUsd,
      wasteShare: costUsd ? wasteUsd / costUsd : 0,
      avgMs: durs.reduce((a, b) => a + b, 0) / durs.length,
      p95Ms: durs[Math.min(durs.length - 1, Math.floor(durs.length * 0.95))],
      topCategory: top,
    };
  }).sort((a, b) => b.costUsd - a.costUsd);
}

export function dailySeries(runs: StoredRun[]) {
  const acc = new Map<string, { runs: number; cost: number; waste: number }>();
  for (const r of runs) {
    const day = (r.started_at ?? r.created_at).slice(0, 10);
    const e = acc.get(day) ?? { runs: 0, cost: 0, waste: 0 };
    e.runs++; e.cost += r.cost_usd; e.waste += r.waste_usd;
    acc.set(day, e);
  }
  return [...acc.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, v]) => ({ day, ...v }));
}
