"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import UserMenu from "@/components/UserMenu";
import { TooltipRoot } from "@/components/ui";
import { cn } from "@/lib/cn";

export const SHELL = "mx-auto w-full max-w-[1600px] px-6 sm:px-10 lg:px-14";

const TABS = [
  { href: "/runs", label: "Runs" },
  { href: "/analyze", label: "New analysis" },
];

export default function AppShell({
  children, right,
}: { children: React.ReactNode; right?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <TooltipRoot>
      <main className="min-h-screen">
        <nav className="sticky top-0 z-30 backdrop-blur-xl bg-[var(--bg)]/80 border-b hairline">
          <div className={`${SHELL} h-16 flex items-center justify-between gap-6`}>
            <div className="flex items-center gap-7 min-w-0">
              <Link href="/runs" className="flex items-center gap-2.5 shrink-0">
                <span className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]" />
                <span className="font-semibold tracking-[-0.02em]">Costpath</span>
              </Link>
              <div className="flex items-center gap-1">
                {TABS.map((t) => {
                  const on = pathname === t.href || pathname.startsWith(`${t.href}/`);
                  return (
                    <Link
                      key={t.href} href={t.href}
                      className={cn(
                        "text-[13px] px-3 py-1.5 rounded-[7px] interactive",
                        on ? "bg-white/[0.07] text-[var(--ink)]" : "dim hover:text-[var(--ink)] hover:bg-white/[0.04]",
                      )}
                    >
                      {t.label}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-5 shrink-0">
              {right}
              <UserMenu />
            </div>
          </div>
        </nav>
        {children}
      </main>
    </TooltipRoot>
  );
}
