"use client";

import { useState } from "react";
import { KeyRound, Copy, Check, Terminal, ChevronRight, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Card, CardLabel } from "@/components/ui";
import { cn } from "@/lib/cn";

function curlFor(key: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `curl -X POST ${origin}/api/ingest \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "content-type: application/json" \\\n  --data @trace.json`;
}

export default function IngestPanel({ orgId }: { orgId: string | null }) {
  const sb = supabase();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [err, setErr] = useState("");

  async function issue() {
    if (!sb || !orgId) return;
    setBusy(true); setErr("");
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const plain = "axr_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plain));
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await sb.from("api_keys").insert({
      org_id: orgId, key_hash: hash, key_prefix: plain.slice(0, 12),
    });
    if (error) setErr(error.message); else setKey(plain);
    setBusy(false);
  }

  function copy(what: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(""), 1600);
  }

  return (
    <Card className="p-5">
      <button onClick={() => setOpen(!open)} className="w-full flex items-start gap-3 text-left group">
        <div className="w-8 h-8 rounded-[8px] grid place-items-center bg-white/[0.04] border hairline shrink-0">
          <Terminal size={14} className="dimmer" />
        </div>
        <div className="flex-1 min-w-0">
          <CardLabel>Analyze runs automatically</CardLabel>
          <p className="prose-dim text-[12.5px] mt-1.5">
            Your browser can&apos;t watch your production agents. An API key lets a CI job or a
            post-run hook send traces here on its own.
          </p>
          <p className="mono text-[10.5px] dimmer mt-2">
            optional · pasting and uploading need no key
          </p>
        </div>
        <ChevronRight
          size={15}
          className={cn("dimmer shrink-0 mt-1 interactive", open && "rotate-90")}
        />
      </button>

      {open && (
        <div className="mt-4 pt-4 border-t hairline">
          {!key ? (
            <>
              <ol className="grid gap-2 text-[12.5px] dim list-decimal pl-4">
                <li>Issue a key below</li>
                <li>Store it as a secret in your CI</li>
                <li>POST your trace JSON to <span className="mono text-[11px]">/api/ingest</span></li>
                <li>The run appears here within ten seconds, already analyzed</li>
              </ol>
              <p className="prose-dim text-[11.5px] mt-3">
                The response includes <span className="mono text-[10.5px]">wasteShare</span>, so
                you can fail a build when a prompt change makes an agent more wasteful.
              </p>
              <p className="prose-dim text-[11.5px] mt-2">
                Keys are stored as a SHA-256 hash — the plaintext is shown once and cannot be
                recovered, so a database leak exposes no usable key.
              </p>
              <button
                onClick={issue} disabled={busy || !orgId}
                className="mono text-[11px] px-3 py-2 mt-3 rounded-[8px] w-full
                           border border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20
                           interactive flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <KeyRound size={12} /> {busy ? "issuing…" : "Issue an API key"}
              </button>
            </>
          ) : (
            <div className="grid gap-2.5">
              <div className="flex items-start gap-2 text-[11.5px] text-[var(--warn)]">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>Copy this now — it is stored hashed and cannot be shown again.</span>
              </div>
              <Field label="api key" value={key} tone="ok"
                     copied={copied === "key"} onCopy={() => copy("key", key)} />
              <Field label="try it" value={curlFor(key)}
                     copied={copied === "curl"} onCopy={() => copy("curl", curlFor(key))} />
            </div>
          )}
          {err && <div className="mono text-[10px] text-[var(--critical)] mt-2">{err}</div>}
        </div>
      )}
    </Card>
  );
}

function Field({ label, value, copied, onCopy, tone }: {
  label: string; value: string; copied: boolean; onCopy: () => void; tone?: "ok";
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="mono text-[9.5px] uppercase tracking-[0.12em] dimmer">{label}</span>
        <button onClick={onCopy}
          className="mono text-[9.5px] dimmer hover:text-[var(--ink)] interactive flex items-center gap-1">
          {copied ? <Check size={10} className="text-[var(--ok)]" /> : <Copy size={10} />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className={cn(
        "mono text-[9.5px] leading-[1.6] p-2.5 rounded-[7px] bg-black/50 border overflow-x-auto",
        tone === "ok" ? "border-emerald-500/25 text-[var(--ok)] whitespace-pre-wrap break-all" : "hairline dim whitespace-pre",
      )}>{value}</pre>
    </div>
  );
}
