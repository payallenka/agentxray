"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Clock } from "lucide-react";
import AppShell, { SHELL } from "@/components/AppShell";
import AuthGate from "@/components/AuthGate";
import { supabase } from "@/lib/supabase/client";
import { byWorkflow, dailySeries, opportunities, type StoredRun } from "@/lib/aggregate";
import { ms, usd } from "@/lib/pricing";
import { Badge, Card, CardLabel, CountUp, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";

const WINDOWS = [
  { key: "24h", label: "Last 24h", hours: 24 },
  { key: "7d", label: "Last 7 days", hours: 24 * 7 },
  { key: "30d", label: "Last 30 days", hours: 24 * 30 },
  { key: "all", label: "All time", hours: 0 },
] as const;

const SEV_TONE = { critical: "critical", warn: "warn", info: "info" } as const;

function InsightsInner() {
  const sb = supabase();
  const [all, setAll] = useState<StoredRun[] | null>(null);
  const [win, setWin] = useState<(typeof WINDOWS)[number]["key"]>("7d");

  const load = useCallback(async () => {
    if (!sb) { setAll([]); return; }
    const { data } = await sb
      .from("runs")
      .select("id,name,source,span_count,total_ms,cost_usd,waste_usd,waste_share,finding_count,created_at,analysis")
      .order("created_at", { ascending: false })
      .limit(500);
    setAll((data as StoredRun[]) ?? []);
  }, [sb]);

  useEffect(() => { load(); }, [load]);

  const runs = useMemo(() => {
    if (!all) return [];
    const w = WINDOWS.find((x) => x.key === win)!;
    if (!w.hours) return all;
    const cutoff = Date.now() - w.hours * 3600_000;
    return all.filter((r) => +new Date(r.created_at) >= cutoff);
  }, [all, win]);

  const opps = useMemo(() => opportunities(runs), [runs]);
  const flows = useMemo(() => byWorkflow(runs), [runs]);
  const series = useMemo(() => dailySeries(runs), [runs]);

  const cost = runs.reduce((a, r) => a + r.cost_usd, 0);
  const waste = runs.reduce((a, r) => a + r.waste_usd, 0);
  const wall = runs.reduce((a, r) => a + r.total_ms, 0);
  const clean = runs.filter((r) => r.waste_share <= 0).length;

  // what the window actually contains, since "last 7 days" says nothing about coverage
  const span = all?.length
    ? { newest: new Date(all[0].created_at), oldest: new Date(all[all.length - 1].created_at) }
    : null;

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
            {runs.length} of {all!.length} stored runs ·{" "}
            {span.oldest.toLocaleString()} → {span.newest.toLocaleString()}
            {runs.length === 0 && " · nothing in this window"}
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
                  {opps.map((o, i) => (
                    <motion.div
                      key={o.category}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                      className="rounded-[9px] border hairline p-4"
                    >
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0">
                          <Badge tone={SEV_TONE[o.severity]}>{o.severity.toUpperCase()}</Badge>
                          <span className="text-[14.5px]">{o.label}</span>
                        </div>
                        <div className="flex items-center gap-4 mono text-[12px] shrink-0">
                          {o.usd > 0 && <span className="text-[var(--critical)]">{usd(o.usd)}</span>}
                          {o.ms > 0 && <span className="text-[var(--warn)]">{ms(o.ms)}</span>}
                          <span className="dimmer">{o.runs}/{o.totalRuns} runs</span>
                        </div>
                      </div>

                      {/* how widespread, at a glance */}
                      <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden mt-3">
                        <div className="h-full rounded-full bg-[var(--accent)]"
                             style={{ width: `${(o.runs / o.totalRuns) * 100}%` }} />
                      </div>

                      <p className="prose-dim text-[13px] mt-3">{o.fix}</p>
                      {o.examples.length > 0 && (
                        <div className="mono text-[11px] dimmer mt-2">
                          most often: {o.examples.join(" · ")}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </Card>

            {/* where it happens */}
            <Card className="p-6">
              <CardLabel>By workflow</CardLabel>
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-[13px] border-collapse">
                  <thead>
                    <tr className="border-b hairline">
                      {["Workflow", "Runs", "Cost", "Recoverable", "Avg", "p95", "Biggest issue"].map((h) => (
                        <th key={h} className="text-left px-3 py-2 mono text-[10px] uppercase tracking-[0.12em] dimmer font-normal whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {flows.map((f, i) => (
                      <tr key={f.name} className={i % 2 ? "bg-white/[0.015]" : ""}>
                        <td className="px-3 py-2.5 mono">{f.name}</td>
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
            {series.length > 1 && (
              <Card className="p-6">
                <CardLabel>Spend per day</CardLabel>
                <div className="flex items-end gap-1.5 h-28 mt-5">
                  {series.map((d) => {
                    const max = Math.max(...series.map((x) => x.cost)) || 1;
                    return (
                      <div key={d.day} className="flex-1 flex flex-col justify-end items-center gap-1 group">
                        <div className="w-full rounded-t-[3px] bg-[var(--accent)] relative"
                             style={{ height: `${Math.max((d.cost / max) * 100, 2)}%` }}>
                          <div className="absolute bottom-0 left-0 right-0 rounded-t-[3px] bg-[var(--critical)]"
                               style={{ height: `${d.cost ? (d.waste / d.cost) * 100 : 0}%` }} />
                        </div>
                        <span className="mono text-[9px] dimmer">{d.day.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 mono text-[10px] dimmer mt-3 pt-3 border-t hairline">
                  <span className="flex items-center gap-1.5"><i className="w-2.5 h-2 rounded-sm bg-[var(--accent)]" /> spend</span>
                  <span className="flex items-center gap-1.5"><i className="w-2.5 h-2 rounded-sm bg-[var(--critical)]" /> recoverable</span>
                </div>
              </Card>
            )}

            <Link href="/runs" className="mono text-[12px] text-[var(--accent-soft)] hover:underline inline-flex items-center gap-1.5">
              browse individual runs <ArrowRight size={12} />
            </Link>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function Insights() {
  return <AuthGate><InsightsInner /></AuthGate>;
}
