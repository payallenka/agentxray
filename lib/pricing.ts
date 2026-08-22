// $ per 1M tokens. Used only when the trace does not carry its own cost.
const TABLE: Record<string, { in: number; out: number }> = {
  "claude-opus-5": { in: 5, out: 25 },
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4-turbo": { in: 10, out: 30 },
  "text-embedding-3-small": { in: 0.02, out: 0 },
  "text-embedding-3-large": { in: 0.13, out: 0 },
};

const FALLBACK = { in: 3, out: 15 };

export function priceFor(model?: string) {
  if (!model) return FALLBACK;
  const key = model.toLowerCase();
  if (TABLE[key]) return TABLE[key];
  const hit = Object.keys(TABLE).find((k) => key.includes(k) || k.includes(key));
  return hit ? TABLE[hit] : FALLBACK;
}

export function estimateCost(model: string | undefined, inTok = 0, outTok = 0) {
  const p = priceFor(model);
  return (inTok / 1e6) * p.in + (outTok / 1e6) * p.out;
}

export const usd = (n: number) =>
  n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(3)}` : `$${n.toFixed(5)}`;

export const ms = (n: number) =>
  n >= 10000 ? `${(n / 1000).toFixed(1)}s` : n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`;
