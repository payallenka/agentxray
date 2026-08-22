"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { cloudEnabled, supabase } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui";

type State = "checking" | "in" | "out";

/** Gates the product behind a session. The marketing pages stay public;
 *  everything past the front door is one consistent signed-in experience. */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sb = supabase();
  const [state, setState] = useState<State>(cloudEnabled ? "checking" : "in");

  useEffect(() => {
    // with no project configured there is nothing to sign into — stay open
    // so the app still runs locally and in review environments
    if (!sb) { setState("in"); return; }

    let alive = true;
    (async () => {
      const { data } = await sb.auth.getSession();
      if (!alive) return;
      if (data.session) setState("in");
      else {
        setState("out");
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      }
    })();

    const { data: sub } = sb.auth.onAuthStateChange((_e: string, session: unknown) => {
      if (!alive) return;
      if (session) setState("in");
      else {
        setState("out");
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      }
    });

    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [sb, router, pathname]);

  if (state === "in") return <>{children}</>;

  // a shaped skeleton, not a spinner: the layout that is about to arrive
  return (
    <div className="mx-auto w-full max-w-[1600px] px-6 sm:px-10 lg:px-14 py-8">
      <div className="grid gap-6 xl:grid-cols-[330px_minmax(0,1fr)]">
        <div className="grid gap-4">
          <Skeleton className="h-[290px]" />
          <Skeleton className="h-[180px]" />
        </div>
        <div className="grid gap-6">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[86px]" />)}
          </div>
          <Skeleton className="h-[320px]" />
          <Skeleton className="h-[420px]" />
        </div>
      </div>
    </div>
  );
}
