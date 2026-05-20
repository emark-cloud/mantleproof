"""GET /api/feed — recent contract creations (T29).

Reads the `FeedStore` JSON file the cache-warmer writes; never walks the
chain at request time (the walker runs as a cron / manual refresh). Honest
empty state: if the file doesn't exist the route returns
``{updated_at: null, items: [], freshness_s: null}`` rather than 501 —
the indexer is just cold, not broken.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from mantleproof.triage.store import FeedStore

router = APIRouter()


def build_feed_response(
    snap_payload: dict[str, Any] | None,
    freshness_s: int | None,
    *,
    limit: int,
    classification: str | None = None,
) -> dict[str, Any]:
    """Pure assembler — testable without disk."""
    if snap_payload is None:
        return {
            "chain_id": None,
            "last_block": None,
            "freshness_s": None,
            "filter": {"classification": classification, "limit": limit},
            "items": [],
        }
    rows = snap_payload.get("rows", [])
    if classification:
        rows = [r for r in rows if r.get("classification") == classification]
    rows = rows[:limit]
    return {
        "chain_id": snap_payload.get("chain_id"),
        "last_block": snap_payload.get("last_block"),
        "freshness_s": freshness_s,
        "filter": {"classification": classification, "limit": limit},
        "items": rows,
    }


def _load_store_payload(store: FeedStore) -> dict[str, Any] | None:
    snap = store.load()
    if snap is None:
        return None
    return FeedStore.serialize(snap)


@router.get("/api/feed")
async def deploy_feed(
    limit: int = Query(50, ge=1, le=200),
    classification: str | None = Query(
        None,
        description="filter: audited | queued | skipped:template | skipped:factory | unknown",
    ),
) -> dict[str, Any]:
    store = FeedStore()
    try:
        snap_payload = _load_store_payload(store)
    except Exception:  # noqa: BLE001 — API must never crash on a bad disk read
        snap_payload = None
    freshness = store.freshness_s()
    return build_feed_response(
        snap_payload, freshness, limit=limit, classification=classification
    )


__all__ = ["router", "build_feed_response"]
