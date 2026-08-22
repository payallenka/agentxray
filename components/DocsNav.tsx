"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const PAGES = [
  {
    href: "/docs/start-here",
    label: "Start here",
    sub: "No background assumed",
    sections: [
      ["what-is-an-agent", "What is an AI agent?"],
      ["what-is-a-trace", "What is a trace?"],
      ["what-is-a-span", "What is a span?"],
      ["where-traces-come-from", "Where traces come from"],
      ["the-five-detectors", "The five detectors"],
      ["critical-path", "1 · Critical path & slack"],
      ["context-resend", "2 · Context re-send"],
      ["semantic-loops", "3 · Semantic loops"],
      ["dead-branches", "4 · Dead branches"],
      ["missed-parallelism", "5 · Missed parallelism"],
      ["whole-thing", "The whole thing at once"],
      ["glossary", "Vocabulary cheat sheet"],
    ],
  },
  {
    href: "/docs/technical",
    label: "How it works",
    sub: "Architecture, algorithms, limits",
    sections: [
      ["audience", "Who this is for"],
      ["pipeline", "The pipeline"],
      ["graph", "Dependency graph"],
      ["algorithms", "The five calculations"],
      ["metrics", "What each metric tells you"],
      ["constants", "Every constant"],
      ["accuracy", "Accuracy & limits"],
      ["performance", "Why it is fast"],
      ["limits", "Input limits"],
      ["validation", "How this was validated"],
      ["known-limitations", "Known limitations"],
      ["stack", "Stack"],
    ],
  },
  {
    href: "/docs",
    label: "Reading the analysis",
    sub: "What every number means",
    sections: [
      ["metric-strip", "The metric strip"],
      ["samples", "The three sample runs"],
      ["findings", "Findings"],
      ["waterfall", "The waterfall"],
      ["span-inspector", "Span inspector"],
      ["cost-attribution", "Cost attribution"],
      ["formats", "Supported formats"],
      ["api", "Ingest API"],
      ["privacy", "Privacy & redaction"],
    ],
  },
];

export default function DocsNav() {
  const pathname = usePathname();

  return (
    <nav className="grid gap-7 text-[13px]">
      {PAGES.map((p) => {
        const active = pathname === p.href;
        return (
          <div key={p.href}>
            <Link
              href={p.href}
              className={cn("block interactive", active ? "text-[var(--ink)]" : "dim hover:text-[var(--ink)]")}
            >
              <span className="font-medium">{p.label}</span>
              <span className="block mono text-[10px] dimmer mt-0.5">{p.sub}</span>
            </Link>
            {active && (
              <div className="grid gap-0.5 mt-3 ml-px border-l hairline">
                {p.sections.map(([id, label]) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    className="dim hover:text-[var(--ink)] interactive text-[12.5px] pl-3 py-1
                               border-l border-transparent hover:border-[var(--accent)] -ml-px"
                  >
                    {label}
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
