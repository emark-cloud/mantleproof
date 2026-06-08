"""Background refresh scheduler — keeps the file-backed cache/feed warm.

In the hosted deploy there is no external cron: a separate Railway service
can't share this service's disk, and the T29 stores are local JSON files
(`engine/data/{cache,feed}.json`). So the API process refreshes its own
stores on a timer — once on boot, then every ``MANTLEPROOF_REFRESH_INTERVAL_S``
seconds (default 900 = 15 min). Mount a Railway volume at ``/app/data`` so the
warmed stores survive redeploys.

Each tick runs the same walk as ``python -m mantleproof.triage.refresh --both``
and is idempotent + best-effort: a failed walk (e.g. RPC blip) is logged and
the loop continues to the next tick. The HTTP routes only ever *read* the
stores, so a slow walk never blocks the API.

Disable entirely with ``MANTLEPROOF_BACKGROUND_REFRESH=0`` (CI / local dev).
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

log = logging.getLogger(__name__)

DEFAULT_INTERVAL_S = 900


def _interval_s() -> int:
    """Refresh period in seconds; falls back to the default on bad/empty input."""
    raw = os.getenv("MANTLEPROOF_REFRESH_INTERVAL_S", "")
    try:
        val = int(raw)
    except ValueError:
        return DEFAULT_INTERVAL_S
    return val if val > 0 else DEFAULT_INTERVAL_S


def _enabled() -> bool:
    return os.getenv("MANTLEPROOF_BACKGROUND_REFRESH", "1") != "0"


def _cache_window_blocks() -> int | None:
    """Optional override for the cache walk's look-back window.

    Anchored audits can be far older than the cache walker's ~24h default
    (the mainnet demo audits sit ~640k blocks / ~2 weeks back), so the hosted
    deploy widens this via ``MANTLEPROOF_CACHE_WINDOW_BLOCKS``. The walk is
    chunked, so a large window just means more ``eth_getLogs`` calls. ``None``
    (unset/invalid) keeps ``cache_warmer.DEFAULT_WINDOW_BLOCKS``.
    """
    raw = os.getenv("MANTLEPROOF_CACHE_WINDOW_BLOCKS", "")
    try:
        val = int(raw)
    except ValueError:
        return None
    return val if val > 0 else None


def run_once() -> dict[str, Any]:
    """Blocking: one cache+feed walk (mirrors ``refresh --both``). Never raises.

    Each store is walked independently so a feed failure still persists the
    cache (and vice versa). Returns a per-store summary for the log line.
    """
    from mantleproof.triage import cache_warmer, deploy_feed
    from mantleproof.triage.store import CacheStore, FeedStore

    out: dict[str, Any] = {}
    try:
        window = _cache_window_blocks()
        cache_kwargs = {"window_blocks": window} if window is not None else {}
        cache = cache_warmer.refresh(store=CacheStore(), **cache_kwargs)
        out["cache"] = {
            "targets": cache.n_targets,
            "rows": len(cache.snapshot.rows),
            "last_block": cache.snapshot.last_block,
        }
    except Exception as exc:  # noqa: BLE001 — a bad tick must not kill the loop
        out["cache"] = {"error": f"{type(exc).__name__}: {exc}"}
    try:
        feed = deploy_feed.refresh(store=FeedStore(), cache_store=CacheStore())
        out["feed"] = {
            "new_contracts": feed.n_new_contracts,
            "rows": len(feed.snapshot.rows),
            "last_block": feed.snapshot.last_block,
        }
    except Exception as exc:  # noqa: BLE001
        out["feed"] = {"error": f"{type(exc).__name__}: {exc}"}
    return out


async def _loop() -> None:
    interval = _interval_s()
    log.info("background refresh loop started (interval=%ss)", interval)
    while True:
        try:
            summary = await asyncio.to_thread(run_once)
            log.info("background refresh tick: %s", summary)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 — the loop must survive anything
            log.exception("background refresh tick crashed")
        await asyncio.sleep(interval)


def start() -> asyncio.Task[None] | None:
    """Spawn the refresh loop as a background task, or skip if disabled.

    Returns the task so the caller (FastAPI lifespan) can cancel it on shutdown.
    """
    if not _enabled():
        log.info("background refresh disabled (MANTLEPROOF_BACKGROUND_REFRESH=0)")
        return None
    return asyncio.create_task(_loop(), name="mantleproof-refresh")
