"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cloudEnabled, supabase } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

type Mode = "signin" | "signup";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/insights";
  const sb = supabase();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const valid = /\S+@\S+\.\S+/.test(email) && password.length >= 6;

  async function submit() {
    if (!sb || !valid) return;
    setBusy(true); setErr(""); setNote("");

    if (mode === "signup") {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) { setErr(error.message); setBusy(false); return; }
      // no session means the project still requires email confirmation
      if (!data.session) {
        setNote("Account created. Check your inbox to confirm the address, then sign in.");
        setMode("signin");
        setBusy(false);
        return;
      }
      router.push(next);
      return;
    }

    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { setErr(error.message); setBusy(false); return; }
    router.push(next);
  }

  async function magicLink() {
    if (!sb || !/\S+@\S+\.\S+/.test(email)) { setErr("Enter your email first."); return; }
    setBusy(true); setErr(""); setNote("");
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setErr(error ? error.message : "");
    if (!error) setNote("Sign-in link sent. Check your inbox.");
    setBusy(false);
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-[1fr_520px]">
      {/* pitch side */}
      <div className="hidden lg:flex flex-col justify-between p-12 border-r hairline">
        <Link href="/" className="hover:opacity-80 transition">
          <Logo />
        </Link>

        <div className="max-w-md">
          <h2 className="text-2xl font-semibold tracking-tight leading-snug">
            A workspace keeps the runs your team has already analyzed.
          </h2>
          <div className="grid gap-4 mt-8">
            {[
              ["Shared run history", "Everyone on the team sees the same analyzed runs, with cost and waste on each."],
              ["Redacted by default", "Prompt and completion text is stripped before anything is stored. Findings survive."],
              ["Push from CI", "Issue an API key and pipe traces in. Fail the build when waste crosses a threshold."],
            ].map(([t, d]) => (
              <div key={t} className="flex gap-3">
                <span className="text-violet-400 mono text-[11px] mt-0.5">▸</span>
                <div>
                  <div className="text-[14px]">{t}</div>
                  <div className="dim text-[13px] leading-relaxed mt-0.5">{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mono text-[11px] dimmer leading-relaxed">
          Free while in preview. No card, no seat limits.
        </div>
      </div>

      {/* form side */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link href="/" className="lg:hidden block mb-8">
            <Logo />
          </Link>

          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === "signin" ? "Sign in" : "Create your workspace"}
          </h1>
          <p className="dim text-[13px] mt-1.5">
            {mode === "signin"
              ? "Welcome back."
              : "Signing up creates a workspace you can invite your team into."}
          </p>

          {!cloudEnabled ? (
            <div className="panel rounded-lg p-4 mt-6 text-[13px] dim leading-relaxed">
              Accounts are not configured on this deployment. The analyzer works without one —{" "}
              <Link href="/analyze" className="text-violet-300 hover:underline">open it here</Link>.
            </div>
          ) : (
            <>
              <div className="grid gap-3 mt-7">
                <label className="grid gap-1.5">
                  <span className="text-[11px] uppercase tracking-wider dim">Email</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    placeholder="you@company.com"
                    className="mono text-[13px] rounded-md px-3 py-2.5 bg-black/40 border hairline outline-none focus:border-violet-500/60 transition"
                  />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-[11px] uppercase tracking-wider dim">Password</span>
                  <input
                    type="password"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    placeholder="at least 6 characters"
                    className="mono text-[13px] rounded-md px-3 py-2.5 bg-black/40 border hairline outline-none focus:border-violet-500/60 transition"
                  />
                </label>

                <button
                  onClick={submit}
                  disabled={busy || !valid}
                  className="text-[14px] px-4 py-2.5 rounded-md bg-violet-500 hover:bg-violet-400 text-black font-medium transition disabled:opacity-30 disabled:cursor-not-allowed mt-1"
                >
                  {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
                </button>
              </div>

              <div className="flex items-center gap-3 my-5">
                <div className="h-px flex-1 bg-white/10" />
                <span className="mono text-[10px] dim">or</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <button
                onClick={magicLink}
                disabled={busy}
                className="w-full mono text-[12px] px-4 py-2.5 rounded-md border hairline hover:bg-white/5 transition disabled:opacity-40"
              >
                email me a sign-in link instead
              </button>

              {err && (
                <div className="mt-4 text-[13px] text-red-400 leading-relaxed">{err}</div>
              )}
              {note && (
                <div className="mt-4 text-[13px] text-emerald-400 leading-relaxed">{note}</div>
              )}

              <div className="mt-6 text-[13px] dim">
                {mode === "signin" ? (
                  <>
                    No account?{" "}
                    <button onClick={() => { setMode("signup"); setErr(""); setNote(""); }} className="text-violet-300 hover:underline">
                      Create one
                    </button>
                  </>
                ) : (
                  <>
                    Already have one?{" "}
                    <button onClick={() => { setMode("signin"); setErr(""); setNote(""); }} className="text-violet-300 hover:underline">
                      Sign in
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          <div className="mt-8 pt-5 border-t hairline mono text-[11px] dimmer leading-relaxed">
            Analysis still runs entirely in your browser — an account adds saved
            history, your team, and CI ingest.
          </div>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginInner />
    </Suspense>
  );
}
