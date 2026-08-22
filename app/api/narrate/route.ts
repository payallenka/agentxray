import { NextRequest } from "next/server";

export const runtime = "nodejs";

/* Provider resolution. xAI, Groq and Gemini all speak the OpenAI chat
   completions shape, so one adapter covers them; Anthropic gets its own.
   The key never leaves the server and the model never sees the raw trace. */
function resolveProvider() {
  const m = process.env.NARRATE_MODEL;
  if (process.env.XAI_API_KEY)
    return { kind: "openai" as const, key: process.env.XAI_API_KEY,
             url: "https://api.x.ai/v1/chat/completions", model: m || "grok-3-mini" };
  if (process.env.GROQ_API_KEY)
    return { kind: "openai" as const, key: process.env.GROQ_API_KEY,
             url: "https://api.groq.com/openai/v1/chat/completions",
             model: m || "openai/gpt-oss-120b",
             // gpt-oss is a reasoning model: it streams a long `reasoning`
             // channel before any content and will spend the whole token
             // budget thinking if left unbounded. This is a summarisation
             // job over facts we already computed — it needs no deliberation.
             reasoningEffort: "low" as const };
  if (process.env.GEMINI_API_KEY)
    return { kind: "openai" as const, key: process.env.GEMINI_API_KEY,
             url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
             model: m || "gemini-2.0-flash" };
  if (process.env.ANTHROPIC_API_KEY)
    return { kind: "anthropic" as const, key: process.env.ANTHROPIC_API_KEY,
             url: "https://api.anthropic.com/v1/messages", model: m || "claude-sonnet-5" };
  return null;
}

const SYSTEM = `You are a performance engineer reviewing an AI agent run.

You are given ONLY a computed evidence object — findings already proven by
static analysis of the trace. Every number in it is measured, not estimated by you.

Rules:
- Never invent a finding that is not in the evidence. Never restate all of them.
- Rank by expected value of the fix: (impact x confidence) / effort.
- For the top 3 only, give the concrete change: where the cache breakpoint goes,
  which calls to gather concurrently, what dedup guard to add.
- Be specific about the numbers you were given. No hedging, no preamble.
- Under 220 words. Plain prose with short bolded lead-ins. No headings.`;

export async function POST(req: NextRequest) {
  const p = resolveProvider();
  if (!p) {
    return new Response(
      "No narration provider configured. Set XAI_API_KEY, GROQ_API_KEY, GEMINI_API_KEY or ANTHROPIC_API_KEY. The deterministic analysis above is complete without it.",
      { status: 200 },
    );
  }

  const { evidence } = await req.json();
  const user = `Evidence object for run "${evidence?.runName ?? "agent run"}":\n\n${JSON.stringify(evidence, null, 2)}`;

  const upstream =
    p.kind === "anthropic"
      ? await fetch(p.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": p.key,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: p.model, max_tokens: 1024, stream: true,
            system: SYSTEM, messages: [{ role: "user", content: user }],
          }),
        })
      : await fetch(p.url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${p.key}` },
          body: JSON.stringify({
            model: p.model, stream: true, max_tokens: 2048,
            ...("reasoningEffort" in p ? { reasoning_effort: p.reasoningEffort } : {}),
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: user },
            ],
          }),
        });

  if (!upstream.ok || !upstream.body) {
    return new Response(`Narration provider returned ${upstream.status}. ${await upstream.text()}`, { status: 200 });
  }

  // Both providers emit SSE. Reasoning models interleave a `reasoning`
  // channel we deliberately drop — the user asked for the conclusion, not
  // the deliberation.
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      const reader = upstream.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let emitted = 0;

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });

          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            let j: Record<string, unknown>;
            try { j = JSON.parse(data); } catch { continue; }

            const choices = j.choices as { delta?: { content?: string } }[] | undefined;
            const text =
              choices?.[0]?.delta?.content ??
              (j.type === "content_block_delta"
                ? (j.delta as { text?: string } | undefined)?.text
                : undefined);

            if (text) { emitted += text.length; ctrl.enqueue(enc.encode(text)); }
          }
        }

        if (emitted === 0) {
          ctrl.enqueue(enc.encode(
            "The model returned no text — it likely spent its budget reasoning. " +
            "The deterministic analysis above is unaffected.",
          ));
        }
      } catch {
        ctrl.enqueue(enc.encode("\n\n[stream interrupted]"));
      } finally {
        ctrl.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
