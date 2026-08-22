"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { cloudEnabled, supabase } from "@/lib/supabase/client";
import { buildRunPayload, rehydrate, type RunRow } from "@/lib/persist";
import { ms, usd } from "@/lib/pricing";
import type { Analysis, Trace } from "@/lib/types";
import type { Session } from "@supabase/supabase-js";

interface Props {
  trace: Trace | null;
  analysis: (Analysis & { slack: Map<string, number> }) | null;
  onLoad: (t: Trace, a: Analysis & { slack: Map<string, number> }) => void;
}

interface Org { id: string; name: string; role: string }

export default function Workspace({ trace, analysis, onLoad }: Props) {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [redact, setRedact] = useState(true);
  const [newKey, setNewKey] = useState("");

  const sb = supabase();

  const loadOrg = useCallback(async (uid: string) => {
    if (!sb) return;
    const { data } = await sb
      .from("memberships")
      .select("role, orgs(id, name)")
      .eq("user_id", uid)
      .limit(1)
      .maybeSingle();
    if (!data) return;
    const o = data.orgs as unknown as { id: string; name: string };
    setOrg({ id: o.id, name: o.name, role: String(data.role) });
  }, [sb]);

  const loadRuns = useCallback(async (orgId: string) => {
    if (!sb) return;
    const { data } = await sb
      .from("runs")
      .select("id,name,source,span_count,total_ms,cost_usd,waste_usd,waste_share,cp_share,finding_count,redacted,created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(25);
    setRuns((data as RunRow[]) ?? []);
  }, [sb]);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      if (u) { setUser({ id: u.id, email: u.email }); loadOrg(u.id); }
    })();
    const { data: sub } = sb.auth.onAuthStateChange((_e: string, session: Session | null) => {
      const u = session?.user;
      setUser(u ? { id: u.id, email: u.email } : null);
      if (u) loadOrg(u.id); else { setOrg(null); setRuns([]); }
    });
    return () => sub.subscription.unsubscribe();
  }, [sb, loadOrg]);

  useEffect(() => { if (org) loadRuns(org.id); }, [org, loadRuns]);

  if (!cloudEnabled) {
    return (
      <div className="panel rounded-lg p-4">
        <div className="text-xs uppercase tracking-wider dim mb-2">Workspace</div>
        <p className="text-[13px] dim leading-relaxed">
          Running in local-only mode. Add a Supabase project to save runs, share them
          with your team and push traces from CI.
        </p>
        <code className="mono text-[10px] dim block mt-2 leading-relaxed">
          NEXT_PUBLIC_SUPABASE_URL=…<br />NEXT_PUBLIC_SUPABASE_ANON_KEY=…
        </code>
      </div>
    );
  }

  async function save() {
    if (!sb || !trace || !analysis || !org || !user) return;
    setBusy(true); setMsg("");
    const payload = buildRunPayload(trace, analysis, org.id, user.id, redact);
    const { error } = await sb.from("runs").insert(payload);
    setMsg(error ? error.message : `Saved${redact ? " (text redacted)" : ""}.`);
    if (!error) loadRuns(org.id);
    setBusy(false);
  }

  async function open(id: string) {
    if (!sb) return;
    const { data } = await sb.from("runs").select("*").eq("id", id).maybeSingle();
    if (data) { const r = rehydrate(data); onLoad(r.trace, r.analysis); }
  }

  async function remove(id: string) {
    if (!sb || !org) return;
    await sb.from("runs").delete().eq("id", id);
    loadRuns(org.id);
  }

  async function issueKey() {
    if (!sb || !org) return;
    setBusy(true);
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const plain = "axr_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plain));
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await sb.from("api_keys").insert({
      org_id: org.id, key_hash: hash, key_prefix: plain.slice(0, 12),
    });
    setNewKey(error ? "" : plain);
    setMsg(error ? error.message : "Copy this key now — it is not shown again.");
    setBusy(false);
  }

  return (
    <div className="panel rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wider dim">Workspace</div>
        {user && (
          <button onClick={() => sb?.auth.signOut()} className="mono text-[10px] dim hover:text-white">
            sign out
          </button>
        )}
      </div>

      {!user ? (
        <div className="grid gap-2">
          <p className="text-[13px] dim leading-relaxed">
            Sign in to save runs to your team workspace, keep a shared history and push
            traces from CI.
          </p>
          <Link
            href="/login"
            className="mono text-[11px] text-center px-3 py-2 rounded-md border border-violet-500/50 bg-violet-500/10 hover:bg-violet-500/20 transition"
          >
            sign in or create a workspace ▸
          </Link>
        </div>
      ) : (
        <>
          <div className="mono text-[11px] dim mb-3 truncate">
            {org?.name ?? "loading…"} <span className="opacity-60">· {user.email}</span>
          </div>

          <div className="grid gap-2">
            <label className="flex items-center gap-2 text-[12px] dim cursor-pointer">
              <input type="checkbox" checked={redact} onChange={(e) => setRedact(e.target.checked)} className="accent-violet-500" />
              redact prompt &amp; completion text
            </label>
            <button
              onClick={save}
              disabled={busy || !trace}
              className="mono text-[11px] px-3 py-2 rounded-md border border-violet-500/50 bg-violet-500/10 hover:bg-violet-500/20 disabled:opacity-40"
            >
              save this run
            </button>
          </div>

          {runs.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] uppercase tracking-wider dim mb-2">History ({runs.length})</div>
              <div className="grid gap-1 max-h-64 overflow-y-auto pr-1">
                {runs.map((r) => (
                  <div key={r.id} className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-white/5">
                    <button onClick={() => open(r.id)} className="flex-1 text-left min-w-0">
                      <div className="text-[12px] truncate">{r.name}</div>
                      <div className="mono text-[10px] dim">
                        {ms(r.total_ms)} · {usd(r.cost_usd)} ·{" "}
                        <span className={r.waste_share > 0.25 ? "text-red-400" : ""}>
                          {Math.round(r.waste_share * 100)}% waste
                        </span>
                        {r.redacted && <span className="ml-1 opacity-60">· redacted</span>}
                      </div>
                    </button>
                    <button
                      onClick={() => remove(r.id)}
                      className="mono text-[10px] dim opacity-0 group-hover:opacity-100 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 pt-3 border-t hairline">
            <button onClick={issueKey} disabled={busy} className="mono text-[10px] dim hover:text-white">
              + issue ingest API key
            </button>
            {newKey && (
              <div className="mono text-[10px] mt-2 p-2 rounded bg-black/50 border hairline break-all text-emerald-300">
                {newKey}
              </div>
            )}
          </div>
        </>
      )}

      {msg && <div className="mono text-[10px] dim mt-3 leading-relaxed">{msg}</div>}
    </div>
  );
}
