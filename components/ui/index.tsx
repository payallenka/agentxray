"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/cn";

/* ------------------------------- Button ------------------------------- */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-[#08090c] font-medium hover:bg-[var(--accent-soft)] " +
    "shadow-[0_1px_2px_rgba(0,0,0,.4),0_8px_24px_-12px_var(--accent-glow)]",
  secondary:
    "border border-[var(--line-strong)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] " +
    "shadow-[inset_0_1px_0_0_rgba(255,255,255,.04)]",
  ghost: "border border-transparent hover:bg-white/5 dim hover:text-[var(--ink)]",
  danger: "border border-red-500/30 text-red-300 hover:bg-red-500/10",
};

const SIZE: Record<Size, string> = {
  sm: "text-[12px] px-2.5 py-1.5 rounded-[7px]",
  md: "text-[13px] px-4 py-2 rounded-[8px]",
  lg: "text-[14px] px-5 py-2.5 rounded-[9px]",
};

export function Button({
  variant = "secondary", size = "md", mono, className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; size?: Size; mono?: boolean;
}) {
  return (
    <button
      className={cn(
        "interactive lift inline-flex items-center justify-center gap-2 whitespace-nowrap",
        "disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none",
        VARIANT[variant], SIZE[size], mono && "mono", className,
      )}
      {...rest}
    />
  );
}

/* -------------------------------- Badge -------------------------------- */

const TONE: Record<string, string> = {
  critical: "bg-[#2a1215] text-[var(--critical)] border-red-500/20",
  warn:     "bg-[#2a2010] text-[var(--warn)] border-amber-500/20",
  info:     "bg-[#0f1c24] text-[var(--info)] border-sky-500/20",
  ok:       "bg-[#0d2019] text-[var(--ok)] border-emerald-500/20",
  accent:   "bg-violet-500/12 text-[var(--accent-soft)] border-violet-500/25",
  neutral:  "bg-white/5 dim border-transparent",
};

export function Badge({
  tone = "neutral", className, children,
}: { tone?: keyof typeof TONE; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn(
      "mono text-[10px] leading-none tracking-wide px-1.5 py-1 rounded-[5px] border",
      TONE[tone], className,
    )}>
      {children}
    </span>
  );
}

/* -------------------------------- Card --------------------------------- */

export function Card({
  raised, className, children, ...rest
}: HTMLMotionProps<"div"> & { raised?: boolean }) {
  return (
    <motion.div className={cn(raised ? "panel-raised" : "panel", className)} {...rest}>
      {children}
    </motion.div>
  );
}

export function CardLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.14em] dimmer">{children}</div>;
}

/* ------------------------------- Tooltip ------------------------------- */

export function TooltipRoot({ children }: { children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={180} skipDelayDuration={300}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tip({
  label, children, side = "top",
}: { label: React.ReactNode; children: React.ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 max-w-xs px-2.5 py-1.5 rounded-[7px] text-[12px] leading-relaxed",
            "bg-[var(--surface-3)] border border-[var(--line-strong)] text-[var(--ink)]",
            "shadow-[0_8px_28px_-8px_rgba(0,0,0,.8)]",
          )}
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-[var(--line-strong)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ------------------------- animated measurement ------------------------ */

/** Counts a measurement up on mount. The numbers are the product here, so
 *  they earn a moment of attention — once, never on re-render. */
export function CountUp({
  value, format, className, duration = 0.9,
}: { value: number; format: (n: number) => string; className?: string; duration?: number }) {
  const [display, setDisplay] = React.useState(value);
  const done = React.useRef(false);

  React.useEffect(() => {
    if (done.current) { setDisplay(value); return; }
    done.current = true;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      setDisplay(value * (1 - Math.pow(1 - t, 4)));   // matches --ease-out
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className={cn("tnum", className)}>{format(display)}</span>;
}

/* --------------------------- section reveal ---------------------------- */

export function Reveal({
  children, className, delay = 0, as,
}: { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "section" }) {
  const Comp = as === "section" ? motion.section : motion.div;
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Comp>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-md bg-white/[0.04] animate-pulse", className)} />;
}
