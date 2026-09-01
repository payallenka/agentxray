import Link from "next/link";
import { ArrowRight } from "lucide-react";
import DocsNav from "@/components/DocsNav";

const SHELL = "mx-auto w-full max-w-[1600px] px-6 sm:px-10 lg:px-14";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-30 backdrop-blur-xl bg-[var(--bg)]/80 border-b hairline">
        <div className={`${SHELL} h-16 flex items-center justify-between gap-6`}>
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]" />
              <span className="font-semibold tracking-[-0.02em]">Agent X-Ray</span>
            </Link>
            <span className="dimmer">/</span>
            <span className="text-[13.5px] dim">Docs</span>
          </div>
          <div className="flex items-center gap-6 text-[13px]">
            <Link href="/" className="dim hover:text-[var(--ink)] interactive hidden sm:inline">Home</Link>
            <Link href="/login" className="flex items-center gap-1.5 text-[var(--accent-soft)] hover:underline">
              Start analyzing <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </nav>

      <div className={`${SHELL} py-12 grid lg:grid-cols-[240px_minmax(0,1fr)] gap-12 items-start`}>
        <aside className="lg:sticky lg:top-28">
          <DocsNav />
        </aside>
        <article className="min-w-0 max-w-[76ch]">{children}</article>
      </div>

      <footer className="border-t hairline">
        <div className={`${SHELL} py-8`}>
          <div className="mono text-[11px] dimmer">
            Agent X-Ray · deterministic analysis, nothing uploaded · MIT licensed
          </div>
          <p className="prose-dim text-[11.5px] mt-4 max-w-[80ch] leading-relaxed">
            A personal, independent open-source project. Not affiliated with, endorsed by, or
            connected to any employer or client. All sample traces are synthetic.
          </p>
        </div>
      </footer>
    </main>
  );
}
