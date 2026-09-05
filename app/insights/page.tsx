"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Clock, ChevronRight } from "lucide-react";
import AppShell, { SHELL } from "@/components/AppShell";
import AuthGate from "@/components/AuthGate";
import { supabase } from "@/lib/supabase/client";
import { availableDimensions, byWorkflow, dailySeries, DIMENSIONS, opportunities,
         type Dimension, type StoredRun } from "@/lib/aggregate";
import { ms, usd } from "@/lib/pricing";
import { Badge, Card, CardLabel, CountUp, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";

const WINDOWS = [
  { key: "3h", label: "3h", hours: 3 },
  { key: "24h", label: "24h", hours: 24 },
  { key: "7d", label: "7 days", hours: 24 * 7 },
  { key: "30d", label: "30 days", hours: 24 * 30 },
  { key: "all", label: "All time", hours: 0 },
] as const;

/** Analysis blobs are large; this bounds what one page will pull. */
const MAX_ROWS = 2000;

const SEV_TONE = { critical: "critical", warn: "warn", info: "info" } as const;

function InsightsInner() {
  const sb = supabase();
  const [all, setAll] = useState<StoredRun[] | null>(null);
  const [win, setWin] = useState<(typeof WINDOWS)[number]["key"]>("7d");
  const [totalInWindow, setTotalInWindow] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [dim, setDim] = useState<Dimension>("workflow");

  const load = useCallback(async () => {
    if (!sb) { setAll([]); return; }
    const w = WINDOWS.find((x) => x.key === win)!;

    // started_at is when the agent ran. created_at is when we imported it —
    // windowing on that made every backfill land inside "the last 24 hours".
    let query = sb
      .from("runs")
      .select("id,name,source,span_count,total_ms,cost_usd,waste_usd,waste_share," +
              "finding_count,created_at,started_at,session_id,actor_id,environment,categories,analysis",
              { count: "exact" })
      .order("started_at", { ascending: false })
      .limit(MAX_ROWS);

    if (w.hours) {
      query = query.gte("started_at", new Date(Date.now() - w.hours * 3600_000).toISOString());
    }
    const { data, count } = await query;
    setAll((data as StoredRun[]) ?? []);
    setTotalInWindow(count ?? 0);
  }, [sb, win]);

  useEffect(() => { load(); }, [load]);

  const runs = all ?? [];

  const opps = useMemo(() => opportunities(runs), [runs]);
  const dims = useMemo(() => availableDimensions(runs), [runs]);
  const flows = useMemo(() => byWorkflow(runs, dim), [runs, dim]);

  // fall back if the chosen dimension is absent from the current window
  useEffect(() => { if (!dims.includes(dim)) setDim("workflow"); }, [dims, dim]);
  const series = useMemo(() => dailySeries(runs), [runs]);

  const cost = runs.reduce((a, r) => a + r.cost_usd, 0);
  const waste = runs.reduce((a, r) => a + r.waste_usd, 0);
  const wall = runs.reduce((a, r) => a + r.total_ms, 0);
  const clean = runs.filter((r) => r.waste_share <= 0).length;

  // what the window actually contains, since "last 7 days" says nothing about coverage
  const at = (r: StoredRun) => new Date((r as unknown as { started_at?: string }).started_at ?? r.created_at);
  const span = all?.length ? { newest: at(all[0]), oldest: at(all[all.length - 1]) } : null;

  return (
    <AppShell>
      <div className={`${SHELL} py-9 grid gap-6`}>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.025em]">Insights</h1>
            <p className="prose-dim text-[14px] mt-1.5">
              What {runs.length} run{runs.length === 1 ? "" : "s"} say together, rather than one at a time.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-[9px] bg-[var(--surface-1)] border hairline">
            {WINDOWS.map((w) => (
              <button
                key={w.key} onClick={() => setWin(w.key)}
                className={cn("text-[12.5px] px-3 py-1.5 rounded-[6px] interactive",
                  win === w.key ? "bg-white/[0.09] text-[var(--ink)]" : "dim hover:text-[var(--ink)]")}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* what this window actually covers */}
        {span && (
          <div className="flex items-center gap-2 mono text-[11px] dimmer -mt-2">
            <Clock size={11} />
            {runs.length.toLocaleString()}
            {totalInWindow > runs.length && ` of ${totalInWindow.toLocaleString()}`} runs ·{" "}
            {span.oldest.toLocaleString()} → {span.newest.toLocaleString()}
            {totalInWindow > MAX_ROWS && ` · capped at ${MAX_ROWS.toLocaleString()}`}
          </div>
        )}

        {!all && (
          <div className="grid gap-4">
            <Skeleton className="h-[120px]" /><Skeleton className="h-[260px]" /><Skeleton className="h-[200px]" />
          </div>
        )}

        {all && runs.length === 0 && (
          <Card className="p-10 text-center">
            <div className="text-[14px]">No runs in this window</div>
            <p className="prose-dim text-[13px] mt-1.5">Widen it, or ingest more traces.</p>
          </Card>
        )}

        {runs.length > 0 && (
          <>
            {/* headline */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {([
                ["Analysed", cost, usd, `${runs.length} runs`, undefined],
                ["Recoverable", waste, usd, `${cost ? Math.round(waste / cost * 100) : 0}% of spend`,
                 waste / (cost || 1) > 0.25 ? "var(--critical)" : undefined],
                ["Agent time", wall, ms, "wall clock", undefined],
                ["Clean runs", clean, (n: number) => `${Math.round(n)}`, `of ${runs.length}`, "var(--ok)"],
                ["Avg run", cost / runs.length, usd, ms(wall / runs.length), undefined],
              ] as const).map(([label, v, fmt, sub, accent]) => (
                <div key={label} className="panel px-4 py-3.5">
                  <CardLabel>{label}</CardLabel>
                  <div className="mono text-[21px] mt-1.5" style={accent ? { color: accent } : undefined}>
                    <CountUp value={v} format={fmt} duration={0.6} />
                  </div>
                  <div className="mono text-[10px] dimmer mt-1">{sub}</div>
                </div>
              ))}
            </div>

            {/* the point of the page */}
            <Card className="p-6">
              <CardLabel>Opportunities, ranked</CardLabel>
              <p className="prose-dim text-[13px] mt-1.5 mb-5">
                Every finding across the window, grouped by what you would actually do about it.
              </p>

              {opps.length === 0 ? (
                <div className="text-[14px] text-[var(--ok)]">Nothing to act on in this window.</div>
              ) : (
                <div className="grid gap-2.5">
                  {opps.map((o, i) => {
                    const isOpen = open === o.category;
                    return (
                    <motion.div
                      key={o.category}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                      className={cn("rounded-[9px] border overflow-hidden interactive",
                        isOpen ? "border-[var(--line-strong)] bg-white/[0.02]" : "hairline hover:border-[var(--line-strong)]")}
                    >
                      <button
                        onClick={() => setOpen(isOpen ? null : o.category)}
                        className="w-full text-left p-4 hover:bg-white/[0.02] interactive"
                      >
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-3 min-w-0">
                            <ChevronRight size={14}
                              className={cn("dimmer shrink-0 interactive", isOpen && "rotate-90")} />
                            <Badge tone={SEV_TONE[o.severity]}>{o.severity.toUpperCase()}</Badge>
                            <span className="text-[14.5px]">{o.label}</span>
                          </div>
                          <div className="flex items-center gap-4 mono text-[12px] shrink-0">
                            {o.usd > 0 && <span className="text-[var(--critical)]">{usd(o.usd)}</span>}
                            {o.ms > 0 && <span className="text-[var(--warn)]">{ms(o.ms)}</span>}
                            <span className="dimmer">{o.runs}/{o.totalRuns} runs</span>
                          </div>
                        </div>
                        <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden mt-3">
                          <div className="h-full rounded-full bg-[var(--accent)]"
                               style={{ width: `${(o.runs / o.totalRuns) * 100}%` }} />
                        </div>
                        {!isOpen && <p className="prose-dim text-[13px] mt-3">{o.fix}</p>}
                      </button>

                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          className="px-4 pb-4"
                        >
                          <div className="border-t hairline pt-4 grid gap-5">
                            <div>
                              <CardLabel>What to do</CardLabel>
                              <p className="prose-dim text-[13.5px] mt-1.5">{o.fix}</p>
                            </div>

                            {o.workflows.length > 0 && (
                              <div>
                                <CardLabel>Where it happens</CardLabel>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {o.workflows.map((w) => (
                                    <Link key={w.name} href={`/runs?workflow=${encodeURIComponent(w.name)}&finding=${o.category}`}
                                          className="mono text-[11px] px-2 py-1 rounded-[6px] border hairline
                                                     hover:border-[var(--accent)] hover:text-[var(--accent-soft)] interactive">
                                      {w.name} <span className="dimmer">×{w.runs}</span>
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            )}

                            {o.examples.length > 0 && (
                              <div>
                                <CardLabel>Which steps</CardLabel>
                                <div className="mono text-[11.5px] dim mt-2">{o.examples.join("  ·  ")}</div>
                              </div>
                            )}

                            {o.worst.length > 0 && (
                              <div>
                                <CardLabel>Worst affected — check the claim yourself</CardLabel>
                                <div className="grid gap-1 mt-2">
                                  {o.worst.map((w) => (
                                    <Link key={w.id} href={`/runs/${w.id}`}
                                          className="flex items-center justify-between gap-4 px-2.5 py-1.5 rounded-[6px]
                                                     hover:bg-white/[0.05] interactive group">
                                      <span className="mono text-[12px] truncate">{w.name}</span>
                                      <span className="flex items-center gap-3 mono text-[11px] shrink-0">
                                        {w.usd > 0 && <span className="text-[var(--critical)]">{usd(w.usd)}</span>}
                                        {w.ms > 0 && <span className="text-[var(--warn)]">{ms(w.ms)}</span>}
                                        <ArrowRight size={11} className="dimmer opacity-0 group-hover:opacity-100" />
                                      </span>
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div>
                              <CardLabel>Why this is reported</CardLabel>
                              <p className="prose-dim text-[12.5px] mt-1.5">{o.worst[0]?.detail}</p>
                            </div>

                            <Link href={`/runs?finding=${o.category}`}
                                  className="mono text-[11.5px] text-[var(--accent-soft)] hover:underline inline-flex items-center gap-1.5">
                              see all {o.runs} affected run{o.runs === 1 ? "" : "s"} <ArrowRight size={12} />
                            </Link>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* where it happens */}
            <Card className="p-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardLabel>Grouped</CardLabel>
                  <p className="prose-dim text-[12.5px] mt-1.5">
                    {dim === "session"
                      ? "One row per conversation, not per turn — a turn is not the unit anyone thinks in."
                      : dim === "user"
                      ? "One row per end user."
                      : dim === "environment"
                      ? "One row per environment, so development traffic does not distort production."
                      : "One row per workflow."}
                  </p>
                </div>
                {dims.length > 1 && (
                  <div className="flex items-center gap-1 p-1 rounded-[9px] bg-[var(--surface-2)] border hairline">
                    {DIMENSIONS.filter((d) => dims.includes(d.key)).map((d) => (
                      <button
                        key={d.key} onClick={() => setDim(d.key)}
                        className={cn("text-[12px] px-2.5 py-1 rounded-[6px] interactive",
                          dim === d.key ? "bg-white/[0.09] text-[var(--ink)]" : "dim hover:text-[var(--ink)]")}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-[13px] border-collapse">
                  <thead>
                    <tr className="border-b hairline">
                      {[DIMENSIONS.find((d) => d.key === dim)!.label,
                        dim === "session" ? "Turns" : "Runs",
                        "Cost", "Recoverable", "Avg", "p95", "Biggest issue"].map((h) => (
                        <th key={h} className="text-left px-3 py-2 mono text-[10px] uppercase tracking-[0.12em] dimmer font-normal whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {flows.map((f, i) => (
                      <tr key={f.name} className={cn("group", i % 2 ? "bg-white/[0.015]" : "", "hover:bg-white/[0.04] interactive")}>
                        <td className="px-3 py-2.5 mono">
                          <Link href={`/runs?${dim}=${encodeURIComponent(f.name)}`}
                                className="hover:text-[var(--accent-soft)] interactive inline-flex items-center gap-1.5">
                            <span className="block">
                              <span className="truncate max-w-[38ch] inline-block align-bottom">{f.label}</span>
                              {f.sublabel && (
                                <span className="block text-[10px] dimmer truncate max-w-[38ch]">{f.sublabel}</span>
                              )}
                            </span>
                            <ArrowRight size={11} className="dimmer opacity-0 group-hover:opacity-100" />
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 mono dim">{f.runs}</td>
                        <td className="px-3 py-2.5 mono">{usd(f.costUsd)}</td>
                        <td className="px-3 py-2.5 mono"
                            style={f.wasteShare > 0.25 ? { color: "var(--critical)" } : undefined}>
                          {usd(f.wasteUsd)}
                          <span className="dimmer ml-1.5">{Math.round(f.wasteShare * 100)}%</span>
                        </td>
                        <td className="px-3 py-2.5 mono dim">{ms(f.avgMs)}</td>
                        <td className="px-3 py-2.5 mono dim">{ms(f.p95Ms)}</td>
                        <td className="px-3 py-2.5 dim text-[12.5px]">
                          {f.topCategory
                            ? opps.find((o) => o.category === f.topCategory)?.label ?? "—"
                            : <span className="text-[var(--ok)]">nothing</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* trend */}
            {flows.length > 12 && (
              <div className="mono text-[11px] dimmer -mt-3">
                showing all {flows.length} groups — sorted by cost
              </div>
            )}

            {series.length > 1 && (
              <Card className="p-6">
                <div className="flex items-baseline justify-between gap-4">
                  <CardLabel>Spend per day</CardLabel>
                  <span className="mono text-[10px] dimmer">click a day to see its runs</span>
                </div>
                <div className="mt-5">
                  <div className="flex items-end gap-1.5 h-32">
                    {series.map((d) => {
                      const max = Math.max(...series.map((x) => x.cost)) || 1;
                      const h = Math.max((d.cost / max) * 100, d.cost > 0 ? 3 : 1);
                      const wasteH = d.cost ? (d.waste / d.cost) * 100 : 0;
                      return (
                        <Link
                          key={d.day}
                          href={`/runs?from=${d.day}&to=${d.day}`}
                          className="flex-1 h-full flex flex-col justify-end group relative"
                          title={`See the ${d.runs} run${d.runs === 1 ? "" : "s"} from ${d.day}`}
                        >
                          <div className="w-full rounded-t-[3px] bg-[var(--accent)] relative interactive group-hover:brightness-125"
                               style={{ height: `${h}%` }}>
                            <div className="absolute bottom-0 left-0 right-0 rounded-t-[3px] bg-[var(--critical)]"
                                 style={{ height: `${wasteH}%` }} />
                          </div>
                          <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full opacity-0
                                          group-hover:opacity-100 interactive pointer-events-none z-10
                                          mono text-[10px] whitespace-nowrap px-2 py-1 rounded-[6px]
                                          bg-[var(--surface-3)] border border-[var(--line-strong)]">
                            {usd(d.cost)} · {usd(d.waste)} recoverable · {d.runs} runs
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    {series.map((d) => (
                      <span key={d.day} className="flex-1 mono text-[9px] dimmer text-center truncate">
                        {d.day.slice(5)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-4 mono text-[10px] dimmer mt-3 pt-3 border-t hairline">
                  <span className="flex items-center gap-1.5"><i className="w-2.5 h-2 rounded-sm bg-[var(--accent)]" /> spend</span>
                  <span className="flex items-center gap-1.5"><i className="w-2.5 h-2 rounded-sm bg-[var(--critical)]" /> recoverable</span>
                </div>
              </Card>
            )}

            <div className="mono text-[11.5px] dimmer">
              Everything here drills down — an opportunity, a group, or a day on the chart —{" "}
              <Link href="/runs" className="text-[var(--accent-soft)] hover:underline">
                or browse them all
              </Link>.
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function Insights() {
  return <AuthGate><InsightsInner /></AuthGate>;
}
