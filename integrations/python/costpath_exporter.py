"""
Costpath OpenTelemetry exporter.

Costpath analyses a *complete* agent run, not a live stream. A normal OTLP
exporter ships spans in batches as they finish, which would deliver half a run
at a time and make critical-path and dead-branch analysis meaningless.

This exporter therefore buffers spans by trace id and posts a whole trace once
its root span ends. It never raises into your application and never blocks the
request path.

    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from costpath_exporter import CostpathExporter

    provider.add_span_processor(
        SimpleSpanProcessor(
            CostpathExporter(
                endpoint="https://your-costpath.vercel.app",
                api_key=os.environ["COSTPATH_API_KEY"],
            )
        )
    )

Requires: opentelemetry-sdk, requests
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Any, Dict, List, Optional, Sequence

try:
    from opentelemetry.sdk.trace import ReadableSpan
    from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
except ImportError as exc:  # pragma: no cover
    raise ImportError("costpath_exporter requires opentelemetry-sdk") from exc

import requests

log = logging.getLogger("costpath")

# Attributes worth carrying even when they are not GenAI semconv. Everything
# else is passed through untouched — Costpath ignores what it does not know.
_PROMPT_KEYS = ("gen_ai.prompt", "input.value", "gen_ai.input.messages", "input")
_COMPLETION_KEYS = ("gen_ai.completion", "output.value", "gen_ai.output.messages", "output")


def _otlp_value(v: Any) -> Dict[str, Any]:
    if isinstance(v, bool):
        return {"boolValue": v}
    if isinstance(v, int):
        return {"intValue": v}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, (list, tuple)):
        return {"stringValue": json.dumps(list(v), default=str)[:8000]}
    return {"stringValue": str(v)[:8000]}


class CostpathExporter(SpanExporter):
    """Buffers spans per trace and posts each complete trace once."""

    def __init__(
        self,
        endpoint: Optional[str] = None,
        api_key: Optional[str] = None,
        *,
        service_name: str = "agent",
        redact: bool = True,
        timeout: float = 5.0,
        max_spans_per_trace: int = 5000,
        trace_ttl_seconds: float = 600.0,
    ) -> None:
        self.endpoint = (endpoint or os.getenv("COSTPATH_ENDPOINT", "")).rstrip("/")
        self.api_key = api_key or os.getenv("COSTPATH_API_KEY", "")
        self.service_name = service_name
        self.redact = redact
        self.timeout = timeout
        self.max_spans_per_trace = max_spans_per_trace
        self.trace_ttl_seconds = trace_ttl_seconds

        self._buf: Dict[str, List[dict]] = {}
        self._seen_at: Dict[str, float] = {}
        self._lock = threading.Lock()
        self._enabled = bool(self.endpoint and self.api_key)

        if not self._enabled:
            log.info("costpath: disabled (no endpoint or api key) — spans are dropped")

    # ---------------------------------------------------------------- export

    def export(self, spans: Sequence["ReadableSpan"]) -> "SpanExportResult":
        if not self._enabled:
            return SpanExportResult.SUCCESS

        try:
            complete: List[str] = []

            with self._lock:
                for span in spans:
                    ctx = span.get_span_context()
                    tid = format(ctx.trace_id, "032x")

                    bucket = self._buf.setdefault(tid, [])
                    if len(bucket) < self.max_spans_per_trace:
                        bucket.append(self._encode(span))
                    self._seen_at[tid] = time.time()

                    # a span with no parent is the root: the run is over
                    if span.parent is None:
                        complete.append(tid)

                self._evict_stale()

            for tid in complete:
                self._flush(tid)

        except Exception:                      # never break the host app
            log.debug("costpath: export failed", exc_info=True)

        return SpanExportResult.SUCCESS

    # --------------------------------------------------------------- encode

    def _encode(self, span: "ReadableSpan") -> dict:
        ctx = span.get_span_context()
        attrs = dict(span.attributes or {})

        if self.redact:
            for k in (*_PROMPT_KEYS, *_COMPLETION_KEYS):
                attrs.pop(k, None)

        status_code = 2 if (span.status and span.status.is_unset is False
                            and not span.status.is_ok) else 1

        return {
            "traceId": format(ctx.trace_id, "032x"),
            "spanId": format(ctx.span_id, "016x"),
            "parentSpanId": format(span.parent.span_id, "016x") if span.parent else "",
            "name": span.name,
            "startTimeUnixNano": str(span.start_time),
            "endTimeUnixNano": str(span.end_time or span.start_time),
            "attributes": [{"key": k, "value": _otlp_value(v)} for k, v in attrs.items()],
            "status": {
                "code": status_code,
                **({"message": str(span.status.description)[:400]}
                   if span.status and span.status.description else {}),
            },
        }

    # ---------------------------------------------------------------- flush

    def _flush(self, trace_id: str) -> None:
        with self._lock:
            spans = self._buf.pop(trace_id, [])
            self._seen_at.pop(trace_id, None)
        if not spans:
            return

        payload = {
            "resourceSpans": [{
                "resource": {"attributes": [
                    {"key": "service.name", "value": {"stringValue": self.service_name}}
                ]},
                "scopeSpans": [{"scope": {"name": "costpath-exporter"}, "spans": spans}],
            }]
        }

        # off the request path — a slow analyzer must never slow the agent
        threading.Thread(target=self._post, args=(payload, trace_id), daemon=True).start()

    def _post(self, payload: dict, trace_id: str) -> None:
        try:
            r = requests.post(
                f"{self.endpoint}/api/ingest",
                json=payload,
                headers={"Authorization": f"Bearer {self.api_key}"},
                params={"redact": "true" if self.redact else "false"},
                timeout=self.timeout,
            )
            if r.status_code >= 400:
                log.warning("costpath: ingest %s — %s", r.status_code, r.text[:200])
            else:
                body = r.json()
                if body.get("deduplicated"):
                    log.debug("costpath: trace %s deduplicated", trace_id[:8])
                else:
                    log.info(
                        "costpath: %s spans, $%.4f, %.0f%% recoverable — %s",
                        body.get("spans"), body.get("costUsd", 0),
                        (body.get("wasteShare") or 0) * 100, body.get("id"),
                    )
        except Exception:
            log.debug("costpath: post failed", exc_info=True)

    def _evict_stale(self) -> None:
        """Drop traces whose root span never arrived — a crash, or a run that
        was never closed. Without this the buffer grows without bound."""
        cutoff = time.time() - self.trace_ttl_seconds
        for tid in [t for t, seen in self._seen_at.items() if seen < cutoff]:
            self._buf.pop(tid, None)
            self._seen_at.pop(tid, None)

    # -------------------------------------------------------------- shutdown

    def force_flush(self, timeout_millis: int = 30_000) -> bool:
        for tid in list(self._buf):
            self._flush(tid)
        return True

    def shutdown(self) -> None:
        self.force_flush()
