/**
 * The mark is the product: three offset bars — a run's spans on a timeline —
 * crossed by a scan line. It reads at 16px because it is four shapes, and the
 * scan line doubles as the "critical path" idea the whole tool is built on.
 */
export function LogoMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      className={className} aria-hidden="true"
    >
      {/* spans, offset like a waterfall */}
      <rect x="3"  y="5"    width="11" height="3.2" rx="1.6" fill="var(--k-llm)" />
      <rect x="7"  y="10.4" width="9"  height="3.2" rx="1.6" fill="var(--k-tool)" />
      <rect x="5"  y="15.8" width="13" height="3.2" rx="1.6" fill="var(--k-llm)" opacity="0.45" />
      {/* the scan line */}
      <path d="M19.4 2.6V21.4" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark size={size} />
      <span className="font-semibold tracking-[-0.02em]">Runscan</span>
    </span>
  );
}
