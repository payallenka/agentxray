export type SpanKind = "llm" | "tool" | "retrieval" | "agent" | "chain" | "other";

export interface Span {
  id: string;
  parentId: string | null;
  name: string;
  kind: SpanKind;
  startMs: number;      // relative to run start
  endMs: number;        // relative to run start
  durationMs: number;
  status: "ok" | "error";
  error?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  costUsd?: number;
  inputPreview?: string;
  outputPreview?: string;
  depth: number;
}

export interface Trace {
  source: string;       // which adapter parsed it
  runName: string;
  spans: Span[];
  totalMs: number;
}

export interface Finding {
  id: string;
  severity: "critical" | "warn" | "info";
  title: string;
  detail: string;
  spanIds: string[];
  wastedMs?: number;
  wastedUsd?: number;
}

export interface Analysis {
  totals: {
    durationMs: number;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    spanCount: number;
    llmCalls: number;
    toolCalls: number;
    errors: number;
  };
  criticalPath: { spanIds: string[]; ms: number; share: number };
  costByNode: { name: string; kind: SpanKind; calls: number; costUsd: number; ms: number; share: number }[];
  findings: Finding[];
  waste: { ms: number; usd: number; shareMs: number; shareUsd: number };
}
