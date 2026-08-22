"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { LogOut, ChevronDown, LayoutGrid } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

interface Props { compact?: boolean }

/** Account control. Sign-out has to live somewhere predictable — top right,
 *  behind the identity — not buried in a panel further down the page. */
export default function UserMenu({ compact }: Props) {
  const router = useRouter();
  const sb = supabase();
  const [email, setEmail] = useState<string | null>(null);
  const [org, setOrg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    (async () => {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      if (!alive || !u) return;
      setEmail(u.email ?? null);
      const { data: m } = await sb
        .from("memberships").select("orgs(name)").eq("user_id", u.id).limit(1).maybeSingle();
      if (alive && m) setOrg((m.orgs as unknown as { name: string })?.name ?? null);
    })();
    return () => { alive = false; };
  }, [sb]);

  if (!email) return null;

  const initial = (org ?? email).slice(0, 1).toUpperCase();

  async function signOut() {
    if (!sb) return;
    setBusy(true);
    await sb.auth.signOut();
    // full reload so the middleware re-evaluates with the cookies cleared
    window.location.assign("/");
  }

  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 rounded-[8px] interactive outline-none",
            "border border-transparent hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]",
            compact ? "pl-1 pr-2 py-1" : "pl-1.5 pr-2.5 py-1.5",
          )}
        >
          <span className="w-7 h-7 rounded-full grid place-items-center bg-violet-500/15 border border-violet-500/30 shrink-0">
            <span className="text-[12px] text-[var(--accent-soft)]">{initial}</span>
          </span>
          {!compact && (
            <span className="hidden sm:block text-[13px] max-w-[140px] truncate">
              {org ?? email}
            </span>
          )}
          <ChevronDown size={13} className="dimmer" />
        </button>
      </Dropdown.Trigger>

      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 min-w-[230px] p-1.5 rounded-[10px]",
            "bg-[var(--surface-2)] border border-[var(--line-strong)]",
            "shadow-[0_16px_48px_-12px_rgba(0,0,0,.85)]",
          )}
        >
          <div className="px-2.5 py-2">
            <div className="text-[13px] truncate">{org ?? "Workspace"}</div>
            <div className="mono text-[10.5px] dimmer truncate mt-0.5">{email}</div>
          </div>

          <Dropdown.Separator className="h-px bg-[var(--line)] my-1.5" />

          <Dropdown.Item
            onSelect={() => router.push("/runs")}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-[7px] text-[13px]
                       outline-none cursor-pointer data-[highlighted]:bg-white/[0.06]"
          >
            <LayoutGrid size={14} className="dimmer" /> Workspace
          </Dropdown.Item>

          <Dropdown.Item
            disabled={busy}
            onSelect={(e) => { e.preventDefault(); signOut(); }}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-[7px] text-[13px]
                       outline-none cursor-pointer text-[var(--critical)]
                       data-[highlighted]:bg-red-500/10"
          >
            <LogOut size={14} /> {busy ? "Signing out…" : "Sign out"}
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
