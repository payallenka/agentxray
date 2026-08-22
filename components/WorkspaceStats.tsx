"use client";

import type { RunRow } from "@/lib/persist";
import { ms, usd } from "@/lib/pricing";
import { Card, CardLabel, CountUp } from "@/components/ui";

/** The headline the workspace exists to produce: across everything analyzed,
 *  how much of the spend was recoverable. One run is a data point; the roll-up
 *  is the argument. */
export default function WorkspaceStats({ runs }: { runs: RunRow[] }) {
  if (!runs.length) return null;

  const cost = runs.reduce((a, r) => a + r.cost_usd, 0);
  const waste = runs.reduce((a, r) => a + r.waste_usd, 0);
  const wall = runs.reduce((a, r) => a + r.total_ms, 0);
  const share = cost ? waste / cost : 0;
  const worst = [...runs].sort((a, b) => b.waste_usd - a.waste_usd)[0];
  const clean = runs.filter((r) => r.waste_share <= 0).length;

  return (
    <Card className="p-5">
      <CardLabel>Across {runs.length} run{runs.length === 1 ? "" : "s"}</CardLabel>

      <div className="mt-3">
        <div className="mono text-[30px] leading-none" style={{ color: "var(--critical)" }}>
          <CountUp value={waste} format={usd} duration={0.8} />
        </div>
        <div className="text-[12.5px] dim mt-1.5">
          recoverable of <span className="mono">{usd(cost)}</span> analyzed
          {" · "}
          <span className="mono">{Math.round(share * 100)}%</span>
        </div>
      </div>

      {/* proportion of spend that is waste */}
      <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden mt-4">
        <div className="h-full rounded-full bg-[var(--critical)]"
             style={{ width: `${Math.min(100, share * 100)}%` }} />
      </div>

      <div className="grid gap-2.5 mt-4 pt-4 border-t hairline text-[12.5px]">
        <Row label="Agent time analyzed" value={ms(wall)} />
        <Row label="Runs with no waste" value={`${clean} of ${runs.length}`} />
        {worst && worst.waste_usd > 0 && (
          <Row label="Biggest single win" value={usd(worst.waste_usd)} hint={worst.name} />
        )}
      </div>
    </Card>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="dim min-w-0">
        {label}
        {hint && <span className="block mono text-[10px] dimmer truncate mt-0.5">{hint}</span>}
      </span>
      <span className="mono shrink-0">{value}</span>
    </div>
  );
}
