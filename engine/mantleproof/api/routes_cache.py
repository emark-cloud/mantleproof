"""GET /api/cache — anchored-audit index (T29).

Reads the `CacheStore` JSON file and returns rows **newest first** (by anchor
``block_number``, descending). Filter ``?severity=high`` short-circuits to
one band. The PriorityCachePanel renders this as a chronological list — the
most recently anchored audits at the top.

Same honesty rules as /api/feed: cold cache → ``items: []`` with null
freshness, not a 501.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from mantleproof.triage.store import CacheStore

router = APIRouter()


def build_cache_response(
    snap_payload: dict[str, Any] | None,
    freshness_s: int | None,
    *,
    limit: int,
    severity: str | None = None,
) -> dict[str, Any]:
    """Pure: testable without disk."""
    if snap_payload is None:
        return {
            "chain_id": None,
            "last_block": None,
            "freshness_s": None,
            "filter": {"severity": severity, "limit": limit},
            "items": [],
        }
    rows = list(snap_payload.get("rows", []))
    if severity:
        rows = [r for r in rows if r.get("severity") == severity]
    # Newest anchor first; ties broken by audit_count so a re-anchor at the
    # same block stays above its older self.
    rows.sort(
        key=lambda r: (int(r.get("block_number", 0)), int(r.get("audit_count", 0))),
        reverse=True,
    )
    rows = rows[:limit]
    return {
        "chain_id": snap_payload.get("chain_id"),
        "last_block": snap_payload.get("last_block"),
        "freshness_s": freshness_s,
        "filter": {"severity": severity, "limit": limit},
        "items": rows,
    }


def _load_store_payload(store: CacheStore) -> dict[str, Any] | None:
    snap = store.load()
    if snap is None:
        return None
    return CacheStore.serialize(snap)


@router.get("/api/cache")
async def priority_cache(
    limit: int = Query(50, ge=1, le=200),
    severity: str | None = Query(None, description="filter: info | low | medium | high"),
) -> dict[str, Any]:
    store = CacheStore()
    try:
        snap_payload = _load_store_payload(store)
    except Exception:  # noqa: BLE001
        snap_payload = None
    freshness = store.freshness_s()
    return build_cache_response(snap_payload, freshness, limit=limit, severity=severity)


__all__ = ["router", "build_cache_response"]
