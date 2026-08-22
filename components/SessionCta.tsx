"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cloudEnabled, supabase } from "@/lib/supabase/client";
import { Button, Skeleton } from "@/components/ui";
import UserMenu from "@/components/UserMenu";

type State = "unknown" | "in" | "out";

function useSessionState(): State {
  const [state, setState] = useState<State>(cloudEnabled ? "unknown" : "out");
  const sb = supabase();

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    (async () => {
      const { data } = await sb.auth.getSession();
      if (alive) setState(data.session ? "in" : "out");
    })();
    const { data: sub } = sb.auth.onAuthStateChange((_e: string, session: unknown) => {
      if (alive) setState(session ? "in" : "out");
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [sb]);

  return state;
}

/** Nav CTA. A returning visitor should never be asked to "sign in" when they
 *  already are — the front door reads their state and changes its label. */
export function NavCta() {
  const state = useSessionState();

  if (state === "unknown") return <Skeleton className="h-[30px] w-[112px]" />;

  if (state === "in") {
    return (
      <>
        <Link href="/runs">
          <Button variant="secondary" size="sm" mono>
            open the tool <ArrowRight size={13} />
          </Button>
        </Link>
        <UserMenu compact />
      </>
    );
  }

  return (
    <>
      <Link href="/login" className="dim hover:text-[var(--ink)] interactive">
        Sign in
      </Link>
      <Link href="/login">
        <Button variant="secondary" size="sm" mono>
          get started <ArrowRight size={13} />
        </Button>
      </Link>
    </>
  );
}

export function HeroCta() {
  const state = useSessionState();
  const signedIn = state === "in";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link href={signedIn ? "/runs" : "/login"}>
        <Button variant="primary" size="lg">
          {signedIn ? "Back to your workspace" : "Start analyzing"} <ArrowRight size={15} />
        </Button>
      </Link>
      <Link href="/docs/start-here">
        <Button variant="secondary" size="lg" mono>how it works</Button>
      </Link>
      <span className="mono text-[11px] dimmer ml-1">
        {signedIn ? "signed in" : "free while in preview"}
      </span>
    </div>
  );
}
