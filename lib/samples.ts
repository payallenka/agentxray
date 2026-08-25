/* Demo traces. Each one is a realistic export shape, not a hand-tuned fixture:
   sample 1 is our native span format, sample 2 is raw OTLP with GenAI
   semantic conventions, sample 3 is a healthy run for contrast. */

const SYS =
  "You are a support agent for Northwind Retail. Available tools: search_docs, fetch_order, " +
  "fetch_customer, check_inventory, send_email. Always cite the policy section you relied on. " +
  "Never promise a refund above $500 without escalating to a human supervisor. Be concise and " +
  "never speculate about delivery dates you have not verified through fetch_order. ";

const U1 = "USER: My blender arrived with a cracked jug. Can I get a refund on order 88214?";

const DOCS_OUT =
  "Policy section 4.2 damaged goods: customers may request a full refund within thirty days of " +
  "delivery when the item arrives physically damaged, no return shipping charge applies.";

const ORDER_OUT =
  "Order 88214 was delivered on 2026-08-14 to Pune 411045, containing one unit of blender-pro-900 " +
  "at a paid price of 4290 rupees, payment method card ending 4417.";

const CUST_OUT =
  "Customer 51203 Aryan Malik joined 2024-11-02, lifetime value 38400 rupees, two prior refunds " +
  "both approved, current loyalty tier gold with no open disputes on the account.";

const KB_OUT =
  "Knowledge base article 771 explains how to descale a blender motor housing using citric acid " +
  "solution and warm water over a twenty minute soak cycle before rinsing thoroughly.";

const C1 = SYS + U1;
const C2 = C1 + " ASSISTANT: calling search_docs. OBSERVATION: " + DOCS_OUT;
const C3 = C2 + " ASSISTANT: calling fetch_order. OBSERVATION: " + ORDER_OUT +
  " ASSISTANT: calling fetch_customer. OBSERVATION: " + CUST_OUT;
const C4 = C3 + " ASSISTANT: calling send_email. OBSERVATION: refund confirmation dispatched.";

export const SAMPLE_REACT = JSON.stringify(
  {
    runName: "support_agent · refund request (degraded run)",
    spans: [
      { id: "root", parentId: null, name: "support_agent", kind: "agent", start: 0, end: 41800 },

      { id: "s1", parentId: "root", name: "planner", kind: "llm", start: 100, end: 2400,
        model: "gpt-4o", inputTokens: 1200, outputTokens: 180,
        input: C1, output: "I should look up the damaged goods refund policy first." },

      { id: "s2", parentId: "root", name: "search_docs", kind: "tool", start: 2500, end: 4100,
        input: '{"query":"refund policy for damaged items"}', output: DOCS_OUT },
      { id: "s3", parentId: "root", name: "search_docs", kind: "tool", start: 4200, end: 5600,
        input: '{"query":"policy for refunds on damaged item"}',
        output: "Policy section 4.2 damaged goods refunds within thirty days of delivery." },
      { id: "s4", parentId: "root", name: "search_docs", kind: "tool", start: 5700, end: 7000,
        input: '{"query":"refunds policy damaged items rules"}',
        output: "Policy 4.2 covers damaged goods refund eligibility for thirty days." },

      { id: "s5", parentId: "root", name: "react_turn_2", kind: "llm", start: 7100, end: 11200,
        model: "gpt-4o", inputTokens: 4800, outputTokens: 220,
        input: C2, output: "Now I need the order details and the customer record." },

      { id: "s6", parentId: "root", name: "fetch_order", kind: "tool", start: 11300, end: 14100,
        input: '{"order_id":"88214"}', output: ORDER_OUT },
      { id: "s7", parentId: "root", name: "fetch_customer", kind: "tool", start: 14200, end: 16900,
        input: '{"customer_id":"51203"}', output: CUST_OUT },

      { id: "s8", parentId: "root", name: "vector_search_kb", kind: "retrieval", start: 17000, end: 19500,
        model: "text-embedding-3-small", inputTokens: 900, outputTokens: 0,
        input: '{"query":"blender maintenance"}', output: KB_OUT },

      { id: "s9", parentId: "root", name: "react_turn_3", kind: "llm", start: 19600, end: 25400,
        model: "gpt-4o", inputTokens: 9600, outputTokens: 340,
        input: C3, output: "Eligible under policy 4.2. Sending the refund confirmation." },

      { id: "s10", parentId: "root", name: "send_email", kind: "tool", start: 25500, end: 27000,
        status: "error", error: "SMTP 421 service not available, closing transmission channel",
        input: '{"to":"customer@example.com","template":"refund_approved"}' },
      { id: "s11", parentId: "root", name: "send_email", kind: "tool", start: 27100, end: 28600,
        input: '{"to":"customer@example.com","template":"refund_approved"}',
        output: "refund confirmation dispatched" },

      { id: "s12", parentId: "root", name: "final_answer", kind: "llm", start: 28700, end: 41700,
        model: "gpt-4o", inputTokens: 15200, outputTokens: 900,
        input: C4,
        output: "Your refund for order 88214 is approved under policy section 4.2." },
    ],
  },
  null,
  2,
);

/* ---- raw OTLP, GenAI semantic conventions ---- */

const ns = (msVal: number) => String(1_760_000_000_000_000_000 + msVal * 1_000_000);
const attr = (key: string, v: string | number) =>
  typeof v === "number"
    ? { key, value: { intValue: v } }
    : { key, value: { stringValue: v } };

const otlpSpan = (
  id: string, parent: string | null, name: string, s: number, e: number,
  attrs: { key: string; value: Record<string, unknown> }[] = [], err?: string,
) => ({
  traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
  spanId: id,
  parentSpanId: parent ?? "",
  name,
  startTimeUnixNano: ns(s),
  endTimeUnixNano: ns(e),
  attributes: attrs,
  status: err ? { code: 2, message: err } : { code: 1 },
});

export const SAMPLE_OTLP = JSON.stringify(
  {
    resourceSpans: [
      {
        resource: { attributes: [attr("service.name", "research-agent")] },
        scopeSpans: [
          {
            scope: { name: "opentelemetry.instrumentation.langchain" },
            spans: [
              otlpSpan("a1", null, "research_agent", 0, 28400, [attr("gen_ai.operation.name", "agent")]),
              otlpSpan("a2", "a1", "chat gpt-4o", 200, 6100, [
                attr("gen_ai.system", "openai"),
                attr("gen_ai.operation.name", "chat"),
                attr("gen_ai.request.model", "gpt-4o"),
                attr("gen_ai.usage.input_tokens", 2100),
                attr("gen_ai.usage.output_tokens", 260),
                attr("gen_ai.prompt", SYS + "USER: Summarise the Q3 competitive landscape."),
                attr("gen_ai.completion", "I will search the market reports and the pricing pages."),
              ]),
              otlpSpan("a3", "a1", "web_search", 6200, 12400, [
                attr("gen_ai.operation.name", "execute_tool"),
                attr("input.value", '{"q":"Q3 competitive landscape market share"}'),
                attr("output.value", DOCS_OUT),
              ]),
              otlpSpan("a4", "a1", "web_search", 12500, 18900, [
                attr("gen_ai.operation.name", "execute_tool"),
                attr("input.value", '{"q":"competitive landscape Q3 market share report"}'),
                attr("output.value", "Duplicate market share summary for the third quarter."),
              ]),
              otlpSpan("a5", "a1", "chat gpt-4o", 19000, 28300, [
                attr("gen_ai.system", "openai"),
                attr("gen_ai.operation.name", "chat"),
                attr("gen_ai.request.model", "gpt-4o"),
                attr("gen_ai.usage.input_tokens", 8700),
                attr("gen_ai.usage.output_tokens", 1100),
                attr("gen_ai.prompt", SYS + "USER: Summarise the Q3 competitive landscape. OBSERVATION: " + DOCS_OUT),
                attr("gen_ai.completion", "Here is the Q3 summary."),
              ]),
            ],
          },
        ],
      },
    ],
  },
  null,
  2,
);

/* ---- a healthy run, for contrast ---- */

export const SAMPLE_HEALTHY = JSON.stringify(
  {
    runName: "pricing_agent · quote (healthy run)",
    spans: [
      { id: "h0", parentId: null, name: "pricing_agent", kind: "agent", start: 0, end: 5400 },
      { id: "h1", parentId: "h0", name: "plan", kind: "llm", start: 50, end: 1200,
        model: "claude-haiku-4-5", inputTokens: 900, outputTokens: 120, cachedTokens: 820,
        input: SYS + "USER: quote 40 units of sku-221", output: "Fetch the sku and the tier." },
      { id: "h2", parentId: "h0", name: "fetch_sku", kind: "tool", start: 1250, end: 2100,
        input: '{"sku":"221"}', output: ORDER_OUT },
      { id: "h3", parentId: "h0", name: "fetch_tier", kind: "tool", start: 1250, end: 1900,
        input: '{"customer":"51203"}', output: CUST_OUT },
      { id: "h4", parentId: "h0", name: "answer", kind: "llm", start: 2200, end: 5300,
        model: "claude-haiku-4-5", inputTokens: 2400, outputTokens: 380, cachedTokens: 2100,
        input: SYS + "USER: quote 40 units of sku-221 OBSERVATION: " + ORDER_OUT + " " + CUST_OUT,
        output: "Quoted 40 units at the gold tier rate." },
    ],
  },
  null,
  2,
);

export interface SampleMeta {
  id: string;
  label: string;
  sub: string;
  /** what this run is meant to teach */
  demonstrates: string;
  /** the headline result, so the reader knows what to look for */
  headline: string;
  body: string;
}

export const SAMPLES: SampleMeta[] = [
  {
    id: "react",
    label: "Degraded ReAct agent",
    sub: "native format · 13 spans · 41.8s",
    demonstrates:
      "Every detector at once. A support agent that re-sends its whole conversation uncached, " +
      "searches the same thing three times in different words, fetches two independent records " +
      "one after the other, retrieves a knowledge-base article nobody reads, and fails an email " +
      "before retrying it.",
    headline: "$0.052 recoverable — 56% of spend",
    body: SAMPLE_REACT,
  },
  {
    id: "otlp",
    label: "OpenTelemetry export",
    sub: "OTLP + GenAI semconv · 5 spans",
    demonstrates:
      "That an untouched OpenTelemetry export works with no conversion. Raw OTLP with GenAI " +
      "semantic conventions — gen_ai.usage.*, gen_ai.request.model — parsed straight from the " +
      "wire format an instrumented stack already emits.",
    headline: "$0.013 recoverable — 33% of spend",
    body: SAMPLE_OTLP,
  },
  {
    id: "healthy",
    label: "Healthy run",
    sub: "cached, parallel, no loops · 5 spans",
    demonstrates:
      "The control case, and the most important of the three. Prefixes cached, independent work " +
      "overlapping, no repeats, every span reaching the answer. A detector suite that always " +
      "finds something cannot be trusted when it does.",
    headline: "0% waste — nothing to fix",
    body: SAMPLE_HEALTHY,
  },
];
