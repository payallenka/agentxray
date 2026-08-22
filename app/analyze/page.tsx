"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertCircle, Check, FileUp, FlaskConical, Save } from "lucide-react";
import AppShell, { SHELL } from "@/components/AppShell";
import AuthGate from "@/components/AuthGate";
import AnalysisView from "@/components/AnalysisView";
import { normalize } from "@/lib/normalize";
import { analyze } from "@/lib/analyze";
import { buildRunPayload, contentHash, DEDUP_WINDOW_MS } from "@/lib/persist";
import { supabase } from "@/lib/supabase/client";
import { Badge, Button, Card, CardLabel, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";

interface Sample { id: string; label: string; sub: string; demonstrates: string; headline: string }

function AnalyzeInner() {
  const router = useRouter();
  const params = useSearchParams();
  const sb = supabase();
  const fileRef = useRef<HTMLInputElement>(null);

  const [samples, setSamples] = useState<Sample[]>([]);
  const [raw, setRaw] = useState("");
  const [origin, setOrigin] = useState<string>("");   // where this trace came from
  const [dragging, setDragging] = useState(false);
  const [redact, setRedact] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [dupe, setDupe] = useState<{ id: string; at: string } | null>(null);
  const [title, setTitle] = useState("");
  const [org, setOrg] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/samples").then((r) => r.json()).then(setSamples).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    (async () => {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      if (!u || !alive) return;
      setUserId(u.id);
      const { data: m } = await sb.from("memberships").select("org_id").eq("user_id", u.id).limit(1).maybeSingle();
      if (alive && m) setOrg(String(m.org_id));
    })();
    return () => { alive = false; };
  }, [sb]);

  const loadSample = useCallback(async (id: string) => {
    const r = await fetch(`/api/samples/${id}`);
    if (!r.ok) return;
    setRaw(await r.text());
    setOrigin(`sample:${id}`);
    setSavedMsg(""); setTitle("");
  }, []);

  // /analyze?sample=react deep-links from the empty state
  useEffect(() => {
    const s = params.get("sample");
    if (s) void loadSample(s);
  }, [params, loadSample]);

  const result = useMemo(() => {
    if (!raw.trim()) return { trace: null, analysis: null, error: null as string | null };
    try {
      const trace = normalize(raw);
      return { trace, analysis: analyze(trace), error: null as string | null };
    } catch (e) {
      return { trace: null, analysis: null, error: (e as Error).message };
    }
  }, [raw]);

  const { trace, analysis, error } = result;

  async function readFile(f: File) {
    setRaw(await f.text());
    setOrigin(`file:${f.name}`);
    setSavedMsg(""); setTitle("");
  }

  async function save(force = false) {
    if (!sb || !trace || !analysis || !org || !userId) return;
    setSaving(true); setSavedMsg(""); setDupe(null);

    const hash = await contentHash(trace);

    // Saving the same analysis twice is almost always a double click or a
    // forgotten tab, not intent. Offer the existing run instead.
    if (!force) {
      const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
      const { data: existing } = await sb
        .from("runs").select("id, created_at")
        .eq("org_id", org).eq("analysis->>contentHash", hash)
        .gte("created_at", since)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existing) {
        setDupe({ id: String(existing.id), at: String(existing.created_at) });
        setSaving(false);
        return;
      }
    }

    const payload = {
      ...buildRunPayload(trace, analysis, org, userId, redact, hash),
      name: title.trim() || trace.runName,
    };
    const { data, error: e } = await sb.from("runs").insert(payload).select("id").single();
    setSaving(false);
    if (e) { setSavedMsg(e.message); return; }
    router.push(`/runs/${data.id}`);
  }

  return (
    <AppShell>
      <div className={`${SHELL} py-9 grid gap-6`}>
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.025em]">New analysis</h1>
          <p className="prose-dim text-[14px] mt-1.5 max-w-[70ch]">
            Everything below runs in your browser. Nothing is sent anywhere until you choose
            to save the run to your workspace.
          </p>
        </div>

        {/* source picker */}
        <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <CardLabel>Trace</CardLabel>
              <div className="flex items-center gap-2">
                {origin && <Badge tone="neutral">{origin}</Badge>}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="mono text-[10.5px] dimmer hover:text-[var(--ink)] interactive flex items-center gap-1.5"
                >
                  <FileUp size={11} /> upload a file
                </button>
                <input
                  ref={fileRef} type="file" accept=".json,application/json" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); }}
                />
              </div>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void readFile(f);
              }}
              className={cn("relative rounded-[9px] interactive", dragging && "ring-2 ring-[var(--accent)]")}
            >
              <textarea
                value={raw}
                onChange={(e) => { setRaw(e.target.value); setOrigin("pasted"); setSavedMsg(""); setTitle(""); }}
                spellCheck={false}
                placeholder={"Paste an OTLP, Langfuse or LangSmith export here — or drop a .json file."}
                className="w-full h-56 mono text-[11px] leading-relaxed rounded-[9px] p-3.5
                           bg-black/40 border hairline outline-none focus:border-violet-500/50
                           interactive resize-y placeholder:text-[var(--ink-3)]"
              />
              {dragging && (
                <div className="absolute inset-0 grid place-items-center rounded-[9px] bg-[var(--bg)]/85 pointer-events-none">
                  <span className="mono text-[12px] text-[var(--accent-soft)]">drop to analyze</span>
                </div>
              )}
            </div>
            <div className="mono text-[10px] dimmer mt-2">
              OTLP JSON · Langfuse export · LangSmith / LangGraph run tree · native span array
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <FlaskConical size={13} className="dimmer" />
              <CardLabel>Sample runs</CardLabel>
            </div>
            <p className="prose-dim text-[12.5px] mt-2">
              Synthetic traces, each built to exercise a different part of the engine.{" "}
              <Link href="/docs#samples" className="text-[var(--accent-soft)] hover:underline">
                what each one shows
              </Link>
            </p>
            <div className="grid gap-2 mt-3">
              {samples.length === 0 && Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[50px]" />
              ))}
              {samples.map((s) => (
                <button
                  key={s.id}
                  onClick={() => void loadSample(s.id)}
                  className={cn(
                    "text-left rounded-[9px] px-3.5 py-2.5 border interactive",
                    origin === `sample:${s.id}`
                      ? "border-violet-500/45 bg-violet-500/[0.08]"
                      : "hairline hover:bg-white/[0.035] hover:border-[var(--line-strong)]",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px]">{s.label}</span>
                  </div>
                  <div className="mono text-[10px] dimmer mt-0.5">{s.sub}</div>
                  <div className={cn(
                    "mono text-[10px] mt-1.5",
                    s.headline.startsWith("0%") ? "text-[var(--ok)]" : "text-[var(--critical)]",
                  )}>
                    {s.headline}
                  </div>
                  <p className="prose-dim text-[11.5px] mt-2 leading-relaxed">{s.demonstrates}</p>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {error && (
          <Card className="p-5 border-red-500/30 flex items-start gap-3">
            <AlertCircle size={17} className="text-[var(--critical)] mt-0.5 shrink-0" />
            <div>
              <div className="text-[14px] text-[var(--critical)]">Could not read that trace</div>
              <div className="prose-dim text-[13px] mt-1">{error}</div>
            </div>
          </Card>
        )}

        {!raw.trim() && !error && (
          <Card className="p-12 text-center">
            <div className="mono text-[12px] dimmer">
              Paste a trace, drop a file, or pick a sample to begin.
            </div>
          </Card>
        )}

        {trace && analysis && (
          <>
            {/* save bar */}
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <Card className="px-5 py-4 flex items-center justify-between gap-5 flex-wrap">
                <div className="min-w-0 flex-1">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={trace.runName}
                    className="w-full max-w-[46ch] text-[14.5px] rounded-[7px] px-2.5 py-1.5 -ml-2.5
                               bg-transparent border border-transparent hover:border-[var(--line)]
                               focus:border-violet-500/50 focus:bg-black/30 outline-none interactive
                               placeholder:text-[var(--ink)]"
                  />
                  <div className="mono text-[10.5px] dimmer mt-0.5">
                    {trace.source} · analyzed locally, not saved · title is editable
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setRedact(!redact)}
                    className="flex items-center gap-2.5 text-[12.5px] dim hover:text-[var(--ink)] interactive"
                  >
                    <span className={cn(
                      "w-4 h-4 rounded-[5px] border grid place-items-center shrink-0 interactive",
                      redact ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[var(--line-strong)]",
                    )}>
                      {redact && <Check size={11} className="text-[#08090c]" strokeWidth={3} />}
                    </span>
                    redact prompt text
                  </button>
                  <Button variant="primary" size="sm" onClick={() => save()} disabled={saving || !org}>
                    <Save size={13} /> {saving ? "saving…" : "Save to workspace"}
                  </Button>
                </div>
              </Card>
            </motion.div>
            {savedMsg && <div className="mono text-[11px] text-[var(--critical)]">{savedMsg}</div>}

            {dupe && (
              <Card className="px-5 py-4 border-amber-500/30 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3">
                  <AlertCircle size={16} className="text-[var(--warn)] mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[13.5px] text-[var(--warn)]">This run is already saved</div>
                    <div className="prose-dim text-[12.5px] mt-0.5">
                      An identical trace was saved at {new Date(dupe.at).toLocaleTimeString()}.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" mono onClick={() => router.push(`/runs/${dupe.id}`)}>
                    open it
                  </Button>
                  <Button size="sm" mono variant="ghost" onClick={() => save(true)}>
                    save anyway
                  </Button>
                </div>
              </Card>
            )}

            <AnalysisView trace={trace} analysis={analysis} />
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function Analyze() {
  return (
    <AuthGate>
      <Suspense fallback={<div className="min-h-screen" />}>
        <AnalyzeInner />
      </Suspense>
    </AuthGate>
  );
}
