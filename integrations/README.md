# Integrations

Runscan analyses a **complete** agent run. That shapes every integration here:
a normal OTLP exporter ships spans in batches as they finish, which would
deliver half a run at a time and make critical-path and dead-branch analysis
meaningless. Anything that sends data must send a whole trace, once.

There are three ways in, in increasing order of intrusiveness.

## 1 · Pull from a tool you already use (no code changes)

If you already write traces to Langfuse or LangSmith, nothing in your
application needs to change. Fetch completed traces on a schedule and forward
them:

```bash
# nightly, or from a post-deploy job
curl -s "https://cloud.langfuse.com/api/public/traces/$TRACE_ID" \
     -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" \
| curl -s -X POST "$COSTPATH/api/ingest" \
     -H "Authorization: Bearer $RUNSCAN_API_KEY" \
     -H "content-type: application/json" --data @-
```

Best when you cannot or should not modify the application.

## 2 · OpenTelemetry exporter (recommended)

[`python/runscan_exporter.py`](python/runscan_exporter.py) is a drop-in
`SpanExporter`. It buffers spans by trace id and posts the whole trace once its
root span ends.

```python
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from runscan_exporter import RunscanExporter

provider.add_span_processor(
    SimpleSpanProcessor(
        RunscanExporter(
            endpoint=os.environ["RUNSCAN_ENDPOINT"],
            api_key=os.environ["RUNSCAN_API_KEY"],
            service_name="support-agent",
            redact=True,        # strip prompt and completion text before sending
        )
    )
)
```

It is deliberately defensive, because an analyser must never be able to hurt
the thing it is analysing:

- **Never raises** into your application — every failure path is swallowed and logged
- **Never blocks** — the POST runs on a daemon thread, off the request path
- **Bounded memory** — traces whose root span never arrives are evicted after 10 minutes, and per-trace span count is capped
- **Redacts by default** — prompt and completion attributes are dropped before the payload is built, not after
- **Disabled cleanly** — with no endpoint or key it becomes a no-op

The richer your GenAI semantic-convention attributes, the better the analysis.
`gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`,
`gen_ai.usage.cache_read_input_tokens` and `gen_ai.request.model` drive the
cost and context-re-send numbers; `gen_ai.prompt` and `gen_ai.completion` drive
loop detection and data-flow inference, and are exactly what `redact=True`
removes — so redacted traces get weaker attribution.

## 3 · Post-run hook (most explicit)

If your framework has a completion callback, serialise the run and post it. Any
supported format works — OTLP JSON, Langfuse export, LangSmith run tree, or the
native span array.

```python
requests.post(
    f"{COSTPATH}/api/ingest",
    headers={"Authorization": f"Bearer {key}"},
    json=run.to_dict(),
    timeout=5,
)
```

## The response

Every ingest returns numbers you can assert on:

```json
{
  "id": "8d4e1451-…",
  "spans": 13,
  "costUsd": 0.0934,
  "recoverableUsd": 0.0522,
  "wasteShare": 0.5589,
  "findings": [{ "severity": "critical", "title": "…" }]
}
```

Use `wasteShare` as a CI gate. Identical payloads inside ten minutes return
`deduplicated: true` with the original id and a 200, so a redelivered webhook
will not fail your build; add `?force=true` to override.

## A note on where traces go

An ingest sends trace data to whatever endpoint you configure. If those traces
belong to an employer, a client, or your users, make sure you are entitled to
send them there — and prefer `redact=True`, or a self-hosted deployment, when
you are not certain.
