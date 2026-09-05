# Runscan — cost and latency analysis for AI agent runs

Drop in an agent trace, get a root-cause analysis. Not a log viewer.

Existing tools (Langfuse, LangSmith, Braintrust) render the span tree and sum the
tokens — they tell you *what happened*. Runscan tells you **why the run was
slow, where the money went, and which work was wasted**, using the analysis
discipline that critical-path scheduling brought to project planning decades ago.

**Everything runs in your browser.** No upload, no account, no backend in the
analysis path.

## Scope

Runscan is a **post-hoc analyser**, not a monitoring product. To be explicit
about what it deliberately does not do:

- It does **not** collect telemetry. There is no agent, no SDK, no instrumentation.
- It does **not** monitor anything live, and has no alerting.
- It does **not** store traces by default; analysis runs client-side and nothing
  is uploaded unless you explicitly save a run.

It reads a trace that some other tool already recorded — OpenTelemetry, Langfuse,
LangSmith — and computes what that trace implies about wasted tokens and time.
Think of it as a calculator that runs over a file you already have.

## About this project

A personal, independent open-source project by Payal Lenka, built at the GrowthX
Buildathon. It is not affiliated with, endorsed by, or connected to any employer
or client. It contains no third-party proprietary code, data, or confidential
information; all sample traces are synthetic and generated for testing. Provided
free under the MIT licence, with no commercial offering.

## What it computes

| Analysis | Method |
|---|---|
| **Context re-send cost** | A ReAct loop re-sends turns 1..N−1 on turn N, so input tokens grow ~O(n²). Character-level LCP between consecutive LLM inputs splits each call into *novel* vs *carried* tokens; the carried portion not served from cache is priced at 0.9× input rate. |
| **Critical path + PERT slack** | Rebuilds the real data-flow DAG — structural parent edges *plus* dependencies inferred from 8-word-gram overlap between one span's output and another's input. Forward/backward pass yields longest path and per-span slack. A slow span with slack is not worth optimizing. |
| **Semantic loop detection** | 64-permutation MinHash over char-5-gram shingles, combined with a stemmed word-set Jaccard for short tool arguments. Clusters at ≥0.7, then classifies **thrash** vs **retry** vs **pagination**. For LLM spans only the novel suffix is compared, so conversation growth isn't mistaken for repetition. |
| **Dead branches** | Reverse reachability from the answer over data-flow edges only. Unreachable spans produced output that never influenced the result — computed, billed, discarded. |
| **Missed parallelism** | Sibling tool calls with no dependency that ran sequentially. An intervening LLM turn counts as a real decision point, so genuine ReAct ordering isn't flagged. |

## Ingest

Adapters are tried in order and the first match wins:

- **OTLP / OpenTelemetry JSON** honouring the GenAI semantic conventions (`gen_ai.usage.*`, `gen_ai.operation.name`)
- **Langfuse** export
- **LangSmith / LangGraph** run tree
- Native span format (see `lib/samples.ts`)

## Optional narration

The deterministic engine is the product. An optional LLM pass ranks findings by
expected value of fix and writes the concrete remediation. It receives **only the
computed evidence object — never the raw trace**.

Set any one of these in the environment and the "explain + prioritise" button lights up:

```
XAI_API_KEY=...        # or GROQ_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY
NARRATE_MODEL=...      # optional override
```

## Team workspaces (optional)

Local-only mode needs no configuration and never uploads anything. Adding a
Supabase project turns it into a multi-tenant product: saved runs, team
history, and programmatic ingest from CI.

**Privacy model.** Runs are saved with prompt and completion text **stripped by
default** — what persists is what was measured: span names, timings, token
counts, model ids, findings. The analysis is computed *before* redaction and
stored alongside it, so a redacted run still shows every finding. Teams that
want full retention can untick the redaction toggle per save.

**Tenant isolation is enforced by Postgres, not by application code.** Every
table has Row Level Security keyed on `memberships`; a query that forgets its
`org_id` filter returns nothing rather than leaking. The membership policy uses
a `security definer` helper to avoid recursing through its own RLS.

### Setup

1. Create a free project at [supabase.com](https://supabase.com)
2. SQL Editor → paste and run [`supabase/schema.sql`](supabase/schema.sql)
3. Authentication → Providers → make sure **Email** is enabled (magic link)
4. Add to `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...     # only needed for /api/ingest
```

Signing in creates a personal workspace automatically (trigger on
`auth.users`). Invite teammates by inserting a `memberships` row.

### Programmatic ingest

Issue a key from the workspace panel, then push traces from CI or a
post-run hook:

```bash
curl -X POST https://your-app.vercel.app/api/ingest \
  -H "Authorization: Bearer axr_..." \
  -H "content-type: application/json" \
  --data @trace.json
```

```json
{
  "id": "…",
  "spans": 13,
  "costUsd": 0.0934,
  "recoverableUsd": 0.0522,
  "wasteShare": 0.5589,
  "findings": [{ "severity": "critical", "title": "Conversation prefix re-sent uncached on every turn" }]
}
```

Keys are stored as SHA-256; the plaintext is shown once at creation. The
endpoint runs the same analysis server-side, so `wasteShare` is a number you
can assert on — fail the build when an agent regression pushes waste above a
threshold.

## Run

```bash
npm install
npm run dev
```

## Layout

```
lib/types.ts      canonical Span / Trace / Finding / Analysis contracts
lib/normalize.ts  four ingest adapters -> canonical spans
lib/analyze.ts    DAG, critical path, MinHash, context decomposition
lib/pricing.ts    model -> $/1M table
lib/samples.ts    three demo traces (degraded, OTLP, healthy)
app/page.tsx      waterfall, findings, cost attribution
app/api/narrate   provider-agnostic narration proxy
```

Adding a detector is `(spans, graph) => Finding[]` — no architectural change.
