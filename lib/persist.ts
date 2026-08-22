import type { Analysis, Span, Trace } from "./types";

export interface RunRow {
  id: string;
  name: string;
  source: string;
  span_count: number;
  total_ms: number;
  cost_usd: number;
  waste_usd: number;
  waste_share: number;
  cp_share: number;
  finding_count: number;
  redacted: boolean;
  created_at: string;
}

/** Strip prompt and completion text. What remains is what we measured:
 *  span names, timings, token counts, model ids. */
export function redactSpans(spans: Span[]): Span[] {
  return spans.map(({ inputPreview, outputPreview, error, ...rest }) => ({
    ...rest,
    // keep the shape of the error, drop anything that could carry user data
    error: error ? error.slice(0, 120) : undefined,
  }));
}

export function runSummary(trace: Trace, analysis: Analysis) {
  return {
    name: trace.runName,
    source: trace.source,
    span_count: analysis.totals.spanCount,
    total_ms: analysis.totals.durationMs,
    cost_usd: analysis.totals.costUsd,
    waste_usd: analysis.waste.usd,
    waste_share: analysis.waste.shareUsd,
    cp_share: analysis.criticalPath.share,
    finding_count: analysis.findings.length,
  };
}

/** The analysis is computed BEFORE redaction and stored alongside, so a
 *  redacted run still shows every finding even though the text is gone. */
export function buildRunPayload(
  trace: Trace,
  analysis: Analysis,
  orgId: string,
  userId: string,
  redact: boolean,
) {
  const { ...serialisable } = analysis;
  return {
    org_id: orgId,
    created_by: userId,
    redacted: redact,
    ...runSummary(trace, analysis),
    spans: redact ? redactSpans(trace.spans) : trace.spans,
    analysis: {
      totals: serialisable.totals,
      criticalPath: serialisable.criticalPath,
      costByNode: serialisable.costByNode,
      findings: serialisable.findings,
      waste: serialisable.waste,
      // Map is not JSON-serialisable
      slack: Object.fromEntries((analysis as Analysis & { slack?: Map<string, number> }).slack ?? []),
    },
  };
}

/** Rehydrate a stored row into the shape the UI renders. */
export function rehydrate(row: Record<string, unknown>): { trace: Trace; analysis: Analysis & { slack: Map<string, number> } } {
  const spans = row.spans as Span[];
  const a = row.analysis as Record<string, unknown>;
  return {
    trace: {
      source: String(row.source),
      runName: String(row.name),
      spans,
      totalMs: Number(row.total_ms),
    },
    analysis: {
      ...(a as unknown as Analysis),
      slack: new Map(Object.entries((a.slack as Record<string, number>) ?? {})),
    },
  };
}
