"""
Agent X-Ray ← Langfuse sync.

Zero-touch integration. If a service already writes traces to Langfuse, this
reads them and forwards them for analysis — no code changes, no dependency, no
exporter inside the application. Nothing in the traced service is modified, so
nothing to survive a branch switch or a redeploy.

    # one-off backfill of recent history
    python langfuse_sync.py --limit 50 --min-spans 4

    # keep following: poll for new traces every 60s
    python langfuse_sync.py --watch --interval 60

Environment:
    LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL
    AGENTXRAY_ENDPOINT   default http://localhost:3000
    AGENTXRAY_API_KEY    issue one from the workspace sidebar

A cursor is kept in ~/.agentxray-sync.json so a restart does not re-send
everything; duplicates are collapsed server-side regardless.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Optional

import requests

LF_HOST = (os.getenv("LANGFUSE_BASE_URL") or os.getenv("LANGFUSE_HOST")
           or "https://cloud.langfuse.com").rstrip("/")
LF_AUTH = (os.getenv("LANGFUSE_PUBLIC_KEY", ""), os.getenv("LANGFUSE_SECRET_KEY", ""))
AX = (os.getenv("AGENTXRAY_ENDPOINT") or "http://localhost:3000").rstrip("/")
AX_KEY = os.getenv("AGENTXRAY_API_KEY", "")

STATE = Path(os.getenv("AGENTXRAY_SYNC_STATE", Path.home() / ".agentxray-sync.json"))


def load_state() -> dict:
    try:
        return json.loads(STATE.read_text())
    except Exception:
        return {"seen": []}


def save_state(state: dict) -> None:
    state["seen"] = state.get("seen", [])[-2000:]     # bounded
    try:
        STATE.write_text(json.dumps(state))
    except Exception:
        pass


def lf_get(path: str, *, retries: int = 6, **params) -> Any:
    """Langfuse Cloud rate-limits reads and occasionally times out. A long
    sync must survive both — losing a 25-minute job to one dropped packet is
    not acceptable."""
    delay = 1.0
    for attempt in range(retries):
        try:
            r = requests.get(f"{LF_HOST}/api/public/{path}", auth=LF_AUTH,
                             params=params, timeout=30)
        except (requests.Timeout, requests.ConnectionError) as exc:
            print(f"    network fault ({type(exc).__name__}), retrying in {delay:.0f}s", flush=True)
            time.sleep(delay)
            delay = min(delay * 2, 30)
            continue

        if r.status_code == 429:
            wait = float(r.headers.get("Retry-After") or delay)
            print(f"    rate limited, waiting {wait:.0f}s", flush=True)
            time.sleep(wait)
            delay = min(delay * 2, 30)
            continue
        if r.status_code >= 500:
            print(f"    upstream {r.status_code}, retrying in {delay:.0f}s", flush=True)
            time.sleep(delay)
            delay = min(delay * 2, 30)
            continue

        r.raise_for_status()
        return r.json()
    raise RuntimeError(f"gave up on {path} after {retries} attempts")


def forward(name: str, observations: list, *, redact: bool, force: bool) -> Optional[dict]:
    r = requests.post(
        f"{AX}/api/ingest",
        json={"name": name, "observations": observations},
        headers={"Authorization": f"Bearer {AX_KEY}"},
        params={"redact": "true" if redact else "false",
                **({"force": "true"} if force else {})},
        timeout=30,
    )
    try:
        body = r.json()
    except Exception:
        body = {"error": r.text[:200]}
    if r.status_code >= 400:
        print(f"  ✗ {name[:44]:<46} {r.status_code} {str(body.get('error'))[:60]}", flush=True)
        return None
    return body


def list_traces(args) -> list:
    """Walk every page. The listing endpoint is cheap; the per-trace fetch is
    not, so filter here — by name and by date — rather than downloading
    thousands of traces to discard most of them."""
    out: list = []
    page = args.page
    per_page = 100

    base: dict = {"limit": per_page}
    if args.since:
        base["fromTimestamp"] = args.since
    names = args.name or [None]

    for nm in names:
        page = args.page
        while True:
            params = dict(base)
            if nm:
                params["name"] = nm
            listing = lf_get("traces", page=page, **params)
            batch = listing.get("data", [])
            out.extend(batch)

            meta = listing.get("meta") or {}
            total_pages = meta.get("totalPages") or 1
            if page == args.page:
                label = f"name={nm}" if nm else "all names"
                print(f"  {label}: {meta.get('totalItems', '?')} traces across {total_pages} pages")

            if args.max_traces and len(out) >= args.max_traces:
                return out[: args.max_traces]
            if page >= total_pages or not batch:
                break
            page += 1
            time.sleep(args.sleep / 2)

    return out


def sync_once(args, state: dict) -> tuple[int, int, int]:
    seen = set(state.get("seen", []))
    traces = list_traces(args)
    print(f"  {len(traces)} candidate traces\n")

    ok = dupe = skipped = failed = 0
    processed = 0

    for t in traces:
        tid = t.get("id")
        name = (t.get("name") or "trace")[:44]

        if tid in seen and not args.force:
            skipped += 1
            continue

        # checkpoint, so a crash costs one batch rather than the whole run
        processed += 1
        if processed % 25 == 0:
            state["seen"] = list(seen)
            save_state(state)

        try:
            time.sleep(args.sleep)
            full = lf_get(f"traces/{tid}")
        except Exception as exc:
            print(f"  ✗ {name:<46} unreachable: {type(exc).__name__}", flush=True)
            failed += 1
            continue
        obs = full.get("observations") or []

        if len(obs) < args.min_spans:
            seen.add(tid)
            skipped += 1
            continue

        body = forward(full.get("name") or name, obs,
                       redact=not args.no_redact, force=args.force)
        if body is None:
            continue

        seen.add(tid)
        if body.get("deduplicated"):
            dupe += 1
        else:
            ok += 1
            print(f"  ✓ {name:<46} {str(body.get('spans')):>3} spans  "
                  f"${body.get('costUsd', 0):.4f}  "
                  f"{(body.get('wasteShare') or 0) * 100:>3.0f}% recoverable", flush=True)

    state["seen"] = list(seen)
    if failed:
        print(f"\n  {failed} trace(s) could not be fetched and were left for next time")
    return ok, dupe, skipped


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", type=int, default=1, help="first page to read")
    ap.add_argument("--max-traces", type=int, default=0,
                    help="stop after this many candidates (0 = every page)")
    ap.add_argument("--name", action="append",
                    help="only this trace name; repeatable. Filters server-side, "
                         "so hundreds of tiny runs are never fetched at all")
    ap.add_argument("--since", type=str, default=None,
                    help="ISO timestamp, e.g. 2026-08-25T00:00:00Z")
    ap.add_argument("--min-spans", type=int, default=3,
                    help="skip traces smaller than this — tiny runs have nothing to find")
    ap.add_argument("--sleep", type=float, default=1.0, help="pause between trace fetches")
    ap.add_argument("--no-redact", action="store_true", help="keep prompt and completion text")
    ap.add_argument("--force", action="store_true", help="re-send even if already seen")
    ap.add_argument("--watch", action="store_true", help="poll continuously")
    ap.add_argument("--interval", type=float, default=60.0, help="seconds between polls in --watch")
    args = ap.parse_args()

    for label, val in (("LANGFUSE_PUBLIC_KEY", LF_AUTH[0]),
                       ("LANGFUSE_SECRET_KEY", LF_AUTH[1]),
                       ("AGENTXRAY_API_KEY", AX_KEY)):
        if not val:
            print(f"missing {label}", file=sys.stderr)
            return 1

    print(f"langfuse   {LF_HOST}")
    print(f"agentxray  {AX}")
    print(f"cursor     {STATE}")
    print(f"redaction  {'off — prompt text will be stored' if args.no_redact else 'on'}\n")

    state = load_state()

    if not args.watch:
        ok, dupe, skipped = sync_once(args, state)
        save_state(state)
        print(f"\ningested {ok} · duplicate {dupe} · skipped {skipped}")
        return 0

    print(f"watching, every {args.interval:.0f}s — ctrl-c to stop\n")
    try:
        while True:
            ok, dupe, skipped = sync_once(args, state)
            save_state(state)
            if ok:
                print(f"  … {ok} new", flush=True)
            time.sleep(args.interval)
    except KeyboardInterrupt:
        save_state(state)
        print("\nstopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
