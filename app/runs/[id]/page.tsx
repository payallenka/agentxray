"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle, Pencil, Check, X } from "lucide-react";
import AppShell, { SHELL } from "@/components/AppShell";
import AuthGate from "@/components/AuthGate";
import AnalysisView from "@/components/AnalysisView";
import { supabase } from "@/lib/supabase/client";
import { rehydrate } from "@/lib/persist";
import type { Analysis, Trace } from "@/lib/types";
import { Badge, Card, Skeleton } from "@/components/ui";

function RunInner({ id }: { id: string }) {
  const sb = supabase();
  const [data, setData] = useState<{ trace: Trace; analysis: Analysis & { slack: Map<string, number> }; redacted: boolean } | null>(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    (async () => {
      const { data: row, error } = await sb.from("runs").select("*").eq("id", id).maybeSingle();
      if (!alive) return;
      if (error || !row) { setErr(error?.message ?? "Run not found, or it belongs to another workspace."); return; }
      const r = rehydrate(row);
      setData({ ...r, redacted: Boolean(row.redacted) });
      setName(String(row.name));
    })();
    return () => { alive = false; };
  }, [sb, id]);

  async function rename() {
    const next = draft.trim();
    setEditing(false);
    if (!sb || !next || next === name) return;
    const prev = name;
    setName(next);                                   // optimistic
    setErr("");

    // a blocked update under RLS affects zero rows and reports success,
    // so the returned row is the only proof it persisted
    const { data, error } = await sb.from("runs").update({ name: next }).eq("id", id).select("id");
    if (error || !data?.length) {
      setName(prev);
      setErr(
        error?.message ??
        "Rename was blocked by row-level security. Run supabase/002_rename_runs.sql in the SQL editor to grant UPDATE on runs.",
      );
    }
  }

  return (
    <AppShell>
      <div className={`${SHELL} py-8`}>
        <Link href="/runs" className="inline-flex items-center gap-2 dim hover:text-[var(--ink)] interactive text-[13px]">
          <ArrowLeft size={14} /> All runs
        </Link>

        {err && (
          <Card className="p-5 mt-5 border-red-500/30 flex items-start gap-3">
            <AlertCircle size={17} className="text-[var(--critical)] mt-0.5 shrink-0" />
            <div>
              <div className="text-[14px] text-[var(--critical)]">Could not open that run</div>
              <div className="prose-dim text-[13px] mt-1">{err}</div>
            </div>
          </Card>
        )}

        {!data && !err && (
          <div className="grid gap-6 mt-6">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[86px]" />)}
            </div>
            <Skeleton className="h-[300px]" /><Skeleton className="h-[400px]" />
          </div>
        )}

        {data && (
          <>
            <div className="group flex items-center gap-3 flex-wrap mt-4 mb-6">
              {editing ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <input
                    autoFocus value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void rename();
                      if (e.key === "Escape") setEditing(false);
                    }}
                    className="text-[24px] font-semibold tracking-[-0.025em] rounded-[8px] px-3 py-1
                               bg-black/40 border border-violet-500/50 outline-none flex-1 max-w-[46ch]"
                  />
                  <button onClick={() => void rename()} className="text-[var(--ok)] hover:opacity-80" aria-label="save title">
                    <Check size={17} />
                  </button>
                  <button onClick={() => setEditing(false)} className="dimmer hover:text-[var(--ink)]" aria-label="cancel">
                    <X size={17} />
                  </button>
                </div>
              ) : (
                <>
                  <h1 className="text-[24px] font-semibold tracking-[-0.025em]">{name || data.trace.runName}</h1>
                  <button
                    onClick={() => { setDraft(name || data.trace.runName); setEditing(true); }}
                    className="dimmer opacity-0 group-hover:opacity-100 hover:text-[var(--ink)] interactive"
                    aria-label="rename run"
                  >
                    <Pencil size={14} />
                  </button>
                </>
              )}
              <Badge tone="neutral">{data.trace.source}</Badge>
              {data.redacted && <Badge tone="neutral">text redacted</Badge>}
            </div>
            {data.redacted && (
              <p className="prose-dim text-[13px] -mt-3 mb-6 max-w-[80ch]">
                Prompt and completion text was stripped when this run was saved. Findings are
                shown from the analysis computed before redaction.
              </p>
            )}
            {err && (
              <Card className="p-4 mb-5 border-amber-500/30 flex items-start gap-3">
                <AlertCircle size={16} className="text-[var(--warn)] mt-0.5 shrink-0" />
                <div className="prose-dim text-[13px]">{err}</div>
              </Card>
            )}
            <AnalysisView trace={data.trace} analysis={data.analysis} />
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AuthGate><RunInner id={id} /></AuthGate>;
}
