"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  ClipboardPaste, Terminal, FlaskConical, ArrowRight, Trash2,
  Search, Pencil, Check, X, ChevronDown, ArrowUpDown, SearchX,
  ChevronLeft, ChevronRight, Filter,
} from "lucide-react";
import AppShell, { SHELL } from "@/components/AppShell";
import AuthGate from "@/components/AuthGate";
import IngestPanel from "@/components/IngestPanel";
import WorkspaceStats from "@/components/WorkspaceStats";
import { supabase } from "@/lib/supabase/client";
import type { RunRow } from "@/lib/persist";
import { ms, usd } from "@/lib/pricing";
import { Badge, Button, Card, CardLabel, Skeleton } from "@/components/ui";
import { categorise, type Category } from "@/lib/aggregate";
import { cn } from "@/lib/cn";

type SortKey = "recent" | "waste" | "recoverable" | "cost" | "duration" | "name";
type WasteFilter = "all" | "clean" | "some" | "heavy";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Newest first" },
  { key: "waste", label: "Highest waste %" },
  { key: "recoverable", label: "Most recoverable $" },
  { key: "cost", label: "Most expensive" },
  { key: "duration", label: "Slowest" },
  { key: "name", label: "Title A–Z" },
];

const WASTE_FILTERS: { key: WasteFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "clean", label: "Clean" },
  { key: "some", label: "Has waste" },
  { key: "heavy", label: "Over 25%" },
];

const PAGE_SIZE = 25;

const CATEGORY_LABEL: Record<string, string> = {
  "context-resend": "re-sent conversation prefix",
  loop: "repeated near-identical calls",
  "dead-branch": "work that never reached the answer",
  parallelism: "independent calls run sequentially",
  failure: "failed steps",
  unpriced: "cannot be priced",
  limited: "analysis limited by trace shape",
  slack: "slow steps off the critical path",
};

function RunsInner() {
  const sb = supabase();
  const router = useRouter();
  const params = useSearchParams();
  const workflowFilter = params.get("workflow");
  const sessionFilter = params.get("session");
  const userFilter = params.get("user");
  const envFilter = params.get("environment");
  const findingFilter = params.get("finding") as Category | null;
  const [page, setPage] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);
  const [runs, setRuns] = useState<RunRow[] | null>(null);

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [waste, setWaste] = useState<WasteFilter>("all");
  const [source, setSource] = useState<string>("all");

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");

  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadRuns = useCallback(async (orgId: string) => {
    if (!sb) return;
    setLoading(true);

    // Everything below happens in Postgres. With a thousand runs, fetching
    // them all to filter in the browser is not a slower version of the right
    // answer — it is a different, wrong answer, because the fetch is capped.
    let query = sb
      .from("runs")
      .select(
        "id,name,source,span_count,total_ms,cost_usd,waste_usd,waste_share,cp_share," +
        "finding_count,redacted,created_at,started_at,session_id,actor_id,environment,categories",
        { count: "exact" },
      )
      .eq("org_id", orgId);

    if (workflowFilter) query = query.eq("name", workflowFilter);
    if (sessionFilter)  query = query.eq("session_id", sessionFilter);
    if (userFilter)     query = query.eq("actor_id", userFilter);
    if (envFilter)      query = query.eq("environment", envFilter);
    if (findingFilter)  query = query.contains("categories", [findingFilter]);
    if (source !== "all") query = query.eq("source", source);

    if (waste === "clean") query = query.lte("waste_share", 0);
    if (waste === "some")  query = query.gt("waste_share", 0);
    if (waste === "heavy") query = query.gt("waste_share", 0.25);

    if (from) query = query.gte("started_at", new Date(from).toISOString());
    if (to)   query = query.lte("started_at", new Date(`${to}T23:59:59`).toISOString());

    // people remember a session id or a person, not a title — all three are searched
    const needle = q.trim();
    if (needle) {
      query = query.or(
        `name.ilike.%${needle}%,session_id.ilike.%${needle}%,actor_id.ilike.%${needle}%`,
      );
    }

    const ORDER: Record<SortKey, [string, boolean]> = {
      recent: ["started_at", false],
      waste: ["waste_share", false],
      recoverable: ["waste_usd", false],
      cost: ["cost_usd", false],
      duration: ["total_ms", false],
      name: ["name", true],
    };
    const [col, asc] = ORDER[sort];
    query = query.order(col, { ascending: asc, nullsFirst: false });

    const start = page * PAGE_SIZE;
    const { data, count, error } = await query.range(start, start + PAGE_SIZE - 1);
    if (error) setErr(error.message);
    setRuns((data as unknown as RunRow[]) ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, [sb, workflowFilter, sessionFilter, userFilter, envFilter, findingFilter,
      source, waste, from, to, q, sort, page]);

  useEffect(() => {
    if (!sb) { setRuns([]); return; }
    let alive = true;
    (async () => {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      if (!u) return;
      const { data: m } = await sb.from("memberships").select("orgs(id,name)")
        .eq("user_id", u.id).limit(1).maybeSingle();
      if (!alive || !m) return;
      const o = m.orgs as unknown as { id: string; name: string };
      setOrg(o); loadRuns(o.id);
    })();
    return () => { alive = false; };
  }, [sb, loadRuns]);

  useEffect(() => {
    if (!org || editing) return;   // don't clobber a title mid-edit
    const t = setInterval(() => loadRuns(org.id), 10_000);
    return () => clearInterval(t);
  }, [org, editing, loadRuns]);

  const sources = useMemo(
    () => [...new Set((runs ?? []).map((r) => r.source))].sort(),
    [runs],
  );

  const shown = runs ?? [];
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);
  const visible = shown;   // the server already narrowed it

  async function rename(id: string) {
    const nextName = draft.trim();
    setEditing(null);
    if (!sb || !org || !nextName) return;
    const prev = runs;
    setRuns((rs) => rs?.map((r) => (r.id === id ? { ...r, name: nextName } : r)) ?? rs);
    setErr("");
    // RLS does not reject a blocked update — it filters the row out and
    // reports success. Only the returned row proves it stuck.
    const { data, error } = await sb.from("runs").update({ name: nextName }).eq("id", id).select("id");
    if (error || !data?.length) {
      setRuns(prev ?? null);
      setErr(error?.message ??
        "Rename was blocked by row-level security. Run supabase/002_rename_runs.sql to grant UPDATE on runs.");
    }
  }

  async function remove(id: string) {
    if (!sb || !org) return;
    setRuns((rs) => rs?.filter((r) => r.id !== id) ?? rs);
    const { error } = await sb.from("runs").delete().eq("id", id);
    if (error) { setErr(error.message); loadRuns(org.id); }
    else setTotal((t) => Math.max(0, t - 1));
  }

  const empty = runs !== null && runs.length === 0 && total === 0;
  const filteredOut = runs !== null && runs.length > 0 && visible.length === 0;
  const filtersOn = q.trim() !== "" || waste !== "all" || source !== "all" || !!from || !!to
    || !!workflowFilter || !!findingFilter || !!sessionFilter || !!userFilter || !!envFilter;

  return (
    <AppShell>
      <div className={`${SHELL} py-9 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] items-start`}>
        <div className="grid gap-5">
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.025em]">
              {org?.name ?? "Your workspace"}
            </h1>
            <p className="prose-dim text-[14px] mt-1.5">
              {empty
                ? "Nothing analyzed yet. Pick a way in below."
                : loading && !runs?.length
                  ? "Loading…"
                  : `${total.toLocaleString()} matching run${total === 1 ? "" : "s"}${
                      filtersOn ? " for these filters" : ""
                    }.`}
            </p>
          </div>

          {(workflowFilter || findingFilter || sessionFilter || userFilter || envFilter) && (
            <Card className="px-4 py-3 flex items-center justify-between gap-4 border-violet-500/30 bg-violet-500/[0.05]">
              <div className="flex items-center gap-2.5 min-w-0">
                <Filter size={14} className="text-[var(--accent-soft)] shrink-0" />
                <span className="text-[13.5px]">
                  {visible.length} run{visible.length === 1 ? "" : "s"}
                  {workflowFilter && <> in <span className="mono">{workflowFilter}</span></>}
                  {sessionFilter && <> in conversation <span className="mono">{sessionFilter.slice(0, 12)}…</span></>}
                  {userFilter && <> from <span className="mono">{userFilter}</span></>}
                  {envFilter && <> in <span className="mono">{envFilter}</span></>}
                  {findingFilter && <> with <span className="mono">{CATEGORY_LABEL[findingFilter] ?? findingFilter}</span></>}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Link href="/insights" className="mono text-[11px] text-[var(--accent-soft)] hover:underline">
                  ← back to insights
                </Link>
                <button onClick={() => router.push("/runs")}
                        className="mono text-[11px] dimmer hover:text-[var(--ink)] interactive">
                  clear
                </button>
              </div>
            </Card>
          )}

          {/* toolbar */}
          {runs && runs.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 dimmer pointer-events-none" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search workflow, session or user…"
                  className="w-full text-[13px] rounded-[8px] pl-9 pr-8 py-2 bg-[var(--surface-1)]
                             border hairline outline-none focus:border-violet-500/50 interactive
                             placeholder:text-[var(--ink-3)]"
                />
                {q && (
                  <button onClick={() => setQ("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 dimmer hover:text-[var(--ink)]">
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 p-1 rounded-[9px] bg-[var(--surface-1)] border hairline">
                {WASTE_FILTERS.map((f) => (
                  <button
                    key={f.key} onClick={() => setWaste(f.key)}
                    className={cn("text-[12px] px-2.5 py-1 rounded-[6px] interactive",
                      waste === f.key ? "bg-white/[0.09] text-[var(--ink)]" : "dim hover:text-[var(--ink)]")}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 text-[12px]">
                <input
                  type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                  className="rounded-[8px] px-2.5 py-2 bg-[var(--surface-1)] border hairline
                             outline-none focus:border-violet-500/50 interactive dim
                             [color-scheme:dark]"
                />
                <span className="dimmer">→</span>
                <input
                  type="date" value={to} onChange={(e) => setTo(e.target.value)}
                  className="rounded-[8px] px-2.5 py-2 bg-[var(--surface-1)] border hairline
                             outline-none focus:border-violet-500/50 interactive dim
                             [color-scheme:dark]"
                />
                {(from || to) && (
                  <button onClick={() => { setFrom(""); setTo(""); }}
                          className="dimmer hover:text-[var(--ink)] interactive px-1" aria-label="clear dates">
                    <X size={13} />
                  </button>
                )}
              </div>

              {sources.length > 1 && (
                <Picker
                  label={source === "all" ? "All sources" : source}
                  options={[{ key: "all", label: "All sources" },
                            ...sources.map((s) => ({ key: s, label: s }))]}
                  onPick={setSource}
                />
              )}

              <Picker
                icon
                label={SORTS.find((s) => s.key === sort)!.label}
                options={SORTS.map((s) => ({ key: s.key, label: s.label }))}
                onPick={(k) => setSort(k as SortKey)}
              />
            </div>
          )}

          {err && <div className="mono text-[11px] text-[var(--critical)]">{err}</div>}

          {runs === null && (
            <div className="grid gap-2.5">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[76px]" />)}
            </div>
          )}

          {empty && (
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { icon: ClipboardPaste, title: "Paste a trace", body: "Drop in an OTLP, Langfuse or LangSmith export. Analysis runs in your browser.", href: "/analyze", cta: "Open the analyzer" },
                { icon: Terminal, title: "Push from CI", body: "Issue a key and POST traces from a post-run hook. They appear here automatically.", href: null, cta: "Key is on the right →" },
                { icon: FlaskConical, title: "Explore a sample", body: "Three bundled runs, including a degraded one with 56% recoverable spend.", href: "/analyze?sample=react", cta: "Load a sample" },
              ].map((c, i) => (
                <motion.div key={c.title}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}>
                  <Card className="p-5 h-full flex flex-col">
                    <div className="w-9 h-9 rounded-[9px] grid place-items-center bg-violet-500/10 border border-violet-500/20">
                      <c.icon size={16} className="text-[var(--accent-soft)]" />
                    </div>
                    <div className="text-[15px] mt-4">{c.title}</div>
                    <p className="prose-dim text-[13px] mt-1.5 flex-1">{c.body}</p>
                    {c.href ? (
                      <Link href={c.href} className="mono text-[11px] text-[var(--accent-soft)] hover:underline mt-4 inline-flex items-center gap-1.5">
                        {c.cta} <ArrowRight size={12} />
                      </Link>
                    ) : <span className="mono text-[11px] dimmer mt-4">{c.cta}</span>}
                  </Card>
                </motion.div>
              ))}
            </div>
          )}

          {filteredOut && (
            <Card className="p-10 text-center">
              <SearchX size={20} className="dimmer mx-auto" />
              <div className="text-[14px] mt-3">No runs match those filters</div>
              <button
                onClick={() => { setQ(""); setWaste("all"); setSource("all"); }}
                className="mono text-[11px] text-[var(--accent-soft)] hover:underline mt-2"
              >
                clear filters
              </button>
            </Card>
          )}

          {shown.length > 0 && (
            <div className="grid gap-2.5">
              {shown.map((r, i) => {
                const isEditing = editing === r.id;
                return (
                  <motion.div key={r.id} layout
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.025, ease: [0.16, 1, 0.3, 1] }}>
                    <Card className="group flex items-center gap-5 px-5 py-4 hover:border-[var(--line-strong)] interactive">
                      <div className="flex-1 min-w-0 flex items-center gap-5">
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <input
                                autoFocus value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") rename(r.id);
                                  if (e.key === "Escape") setEditing(null);
                                }}
                                className="flex-1 text-[14.5px] rounded-[7px] px-2.5 py-1.5 bg-black/40
                                           border border-violet-500/50 outline-none"
                              />
                              <button onClick={() => rename(r.id)} className="text-[var(--ok)] hover:opacity-80" aria-label="save title">
                                <Check size={15} />
                              </button>
                              <button onClick={() => setEditing(null)} className="dimmer hover:text-[var(--ink)]" aria-label="cancel">
                                <X size={15} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Link href={`/runs/${r.id}`} className="text-[14.5px] truncate hover:text-[var(--accent-soft)] interactive">
                                {r.name}
                              </Link>
                              <button
                                onClick={() => { setEditing(r.id); setDraft(r.name); }}
                                className="dimmer opacity-0 group-hover:opacity-100 hover:text-[var(--ink)] interactive shrink-0"
                                aria-label="rename run"
                              >
                                <Pencil size={12} />
                              </button>
                            </div>
                          )}
                          <div className="mono text-[10.5px] dimmer mt-1 flex items-center gap-2 flex-wrap">
                            <span>{r.source}</span><span>·</span>
                            <span>{r.span_count} spans</span><span>·</span>
                            <span>{new Date((r as unknown as { started_at?: string }).started_at ?? r.created_at).toLocaleString()}</span>
                            {(r as unknown as { session_id?: string }).session_id && (
                              <>
                                <span>·</span>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    router.push(`/runs?session=${(r as unknown as { session_id: string }).session_id}`);
                                  }}
                                  className="hover:text-[var(--accent-soft)] interactive"
                                  title="see this whole conversation"
                                >
                                  session {(r as unknown as { session_id: string }).session_id.slice(0, 8)}
                                </button>
                              </>
                            )}
                            {r.redacted && <Badge tone="neutral">redacted</Badge>}
                          </div>
                        </div>

                        <Link href={`/runs/${r.id}`} className="hidden sm:flex items-center gap-6 mono text-[12px] shrink-0">
                          <Col label="wall" value={ms(r.total_ms)} />
                          <Col label="cost" value={usd(r.cost_usd)} />
                          <Col label="recoverable" value={usd(r.waste_usd)}
                               accent={r.waste_share > 0.25 ? "var(--critical)" : undefined} />
                          <div className="w-[74px] text-right">
                            <Badge tone={r.waste_share > 0.25 ? "critical" : r.waste_share > 0 ? "warn" : "ok"}>
                              {Math.round(r.waste_share * 100)}% WASTE
                            </Badge>
                          </div>
                        </Link>
                      </div>

                      <button onClick={() => remove(r.id)}
                        className="dimmer opacity-0 group-hover:opacity-100 hover:text-[var(--critical)] interactive shrink-0"
                        aria-label="delete run">
                        <Trash2 size={14} />
                      </button>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-4 pt-1">
              <span className="mono text-[11.5px] dimmer">
                {total === 0 ? "0" : `${pageSafe * PAGE_SIZE + 1}–${Math.min((pageSafe + 1) * PAGE_SIZE, total)}`} of {total.toLocaleString()}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={pageSafe === 0}
                  className="p-1.5 rounded-[7px] border hairline interactive hover:bg-white/[0.05] disabled:opacity-25 disabled:cursor-not-allowed"
                  aria-label="previous page"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="mono text-[11.5px] dim px-2">{pageSafe + 1} / {pageCount}</span>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={pageSafe >= pageCount - 1}
                  className="p-1.5 rounded-[7px] border hairline interactive hover:bg-white/[0.05] disabled:opacity-25 disabled:cursor-not-allowed"
                  aria-label="next page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        {/* right rail */}
        <div className="grid gap-4 xl:sticky xl:top-24">
          {runs && runs.length > 0 && <WorkspaceStats runs={runs} />}
          <IngestPanel orgId={org?.id ?? null} />
        </div>
      </div>
    </AppShell>
  );
}

function Picker({
  label, options, onPick, icon,
}: { label: string; options: { key: string; label: string }[]; onPick: (k: string) => void; icon?: boolean }) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <button className="flex items-center gap-2 text-[12.5px] px-3 py-2 rounded-[8px]
                           bg-[var(--surface-1)] border hairline hover:border-[var(--line-strong)] interactive">
          {icon && <ArrowUpDown size={12} className="dimmer" />}
          <span className="truncate max-w-[150px]">{label}</span>
          <ChevronDown size={12} className="dimmer" />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={6}
          className="z-50 min-w-[190px] p-1.5 rounded-[10px] bg-[var(--surface-2)]
                     border border-[var(--line-strong)] shadow-[0_16px_48px_-12px_rgba(0,0,0,.85)]">
          {options.map((o) => (
            <Dropdown.Item key={o.key} onSelect={() => onPick(o.key)}
              className="px-2.5 py-1.5 rounded-[6px] text-[12.5px] outline-none cursor-pointer
                         data-[highlighted]:bg-white/[0.06]">
              {o.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

function Col({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="text-right w-[76px]">
      <div className="text-[9.5px] uppercase tracking-[0.12em] dimmer">{label}</div>
      <div className="mt-0.5" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  );
}

export default function Runs() {
  return (
    <AuthGate>
      <Suspense fallback={<div className="min-h-screen" />}>
        <RunsInner />
      </Suspense>
    </AuthGate>
  );
}
