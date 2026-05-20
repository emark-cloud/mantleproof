"""T29 — cache + feed refresh CLI.

Usage::

    python -m mantleproof.triage.refresh --both
    python -m mantleproof.triage.refresh --cache --window-blocks 50000
    python -m mantleproof.triage.refresh --feed  --window-blocks 1500

Cron-friendly: idempotent (re-runnable any time; latest wins), prints a
single summary line per store + exits 0 on success / 1 on hard failure
(e.g. RPC unreachable). The HTTP routes read the JSON stores; they don't
trigger walks themselves, so a long-running walker never blocks the API.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from typing import Any

from mantleproof.triage import cache_warmer, deploy_feed
from mantleproof.triage.store import CacheStore, FeedStore


def _summary(kind: str, payload: dict[str, Any]) -> str:
    return f"[{kind}] " + " ".join(f"{k}={v}" for k, v in payload.items())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="refresh", description="T29 cache/feed walker")
    parser.add_argument("--cache", action="store_true", help="walk AuditSubmitted events")
    parser.add_argument("--feed", action="store_true", help="walk recent contract creations")
    parser.add_argument(
        "--both", action="store_true", help="run cache then feed (cache enriches feed)"
    )
    parser.add_argument("--window-blocks", type=int, default=None)
    parser.add_argument("--to-block", type=int, default=None)
    parser.add_argument(
        "--json", action="store_true", help="emit a machine-readable JSON summary"
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true", help="log walker progress to stderr"
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.WARNING,
        stream=sys.stderr,
        format="%(levelname)s %(name)s %(message)s",
    )

    if not (args.cache or args.feed or args.both):
        parser.error("specify --cache, --feed, or --both")

    do_cache = args.cache or args.both
    do_feed = args.feed or args.both

    summaries: dict[str, dict[str, Any]] = {}
    rc = 0

    if do_cache:
        try:
            kwargs: dict[str, Any] = {}
            if args.window_blocks is not None:
                kwargs["window_blocks"] = args.window_blocks
            if args.to_block is not None:
                kwargs["to_block"] = args.to_block
            cache_result = cache_warmer.refresh(store=CacheStore(), **kwargs)
            summaries["cache"] = {
                "chain_id": cache_result.snapshot.chain_id,
                "last_block": cache_result.snapshot.last_block,
                "events": cache_result.n_events,
                "targets": cache_result.n_targets,
                "dropped": cache_result.n_dropped,
                "rows_persisted": len(cache_result.snapshot.rows),
            }
            if not args.json:
                print(_summary("cache", summaries["cache"]))
        except Exception as exc:  # noqa: BLE001 — surface, don't swallow
            summaries["cache"] = {"error": f"{type(exc).__name__}: {exc}"}
            print(f"[cache] FAILED: {exc}", file=sys.stderr)
            rc = 1

    if do_feed:
        try:
            feed_kwargs: dict[str, Any] = {}
            if args.window_blocks is not None:
                feed_kwargs["window_blocks"] = args.window_blocks
            if args.to_block is not None:
                feed_kwargs["to_block"] = args.to_block
            feed_result = deploy_feed.refresh(
                store=FeedStore(), cache_store=CacheStore(), **feed_kwargs
            )
            summaries["feed"] = {
                "chain_id": feed_result.snapshot.chain_id,
                "last_block": feed_result.snapshot.last_block,
                "blocks_scanned": feed_result.n_blocks_scanned,
                "new_contracts": feed_result.n_new_contracts,
                "rows_persisted": len(feed_result.snapshot.rows),
            }
            if not args.json:
                print(_summary("feed", summaries["feed"]))
        except Exception as exc:  # noqa: BLE001
            summaries["feed"] = {"error": f"{type(exc).__name__}: {exc}"}
            print(f"[feed] FAILED: {exc}", file=sys.stderr)
            rc = 1

    if args.json:
        print(json.dumps(summaries, indent=2, sort_keys=True))

    return rc


if __name__ == "__main__":
    sys.exit(main())
