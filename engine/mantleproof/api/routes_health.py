"""GET /api/health — liveness + RPC reachability + registry invariant check (T7).

Surfaces enough state for an external consumer (frontend status dot, MCP startup
check, x402 client) to know the engine is talking to the right chain and the
registry's immutable oracle-signer is the address we expect.

``cache_freshness_s`` reads the youngest mtime of the two T29 stores
(``engine/data/cache.json``, ``engine/data/feed.json``); ``None`` when neither
file exists (cold start — honest "unknown", not a fake number).
"""

from __future__ import annotations

import time
from collections.abc import Callable
from importlib.metadata import PackageNotFoundError, version
from typing import Any

from fastapi import APIRouter

router = APIRouter()


def _engine_version() -> str:
    """Pure: read the installed package version, fall back to ``unknown``."""
    try:
        return version("mantleproof")
    except PackageNotFoundError:
        return "unknown"


PingFn = Callable[[], int]
OracleFn = Callable[[], str]
FreshnessFn = Callable[[], int | None]


def _live_rpc_ping() -> int:
    """Live: blockNumber call against the active RPC; returns the block #."""
    from web3 import Web3

    from mantleproof.settings import get_settings

    w3 = Web3(Web3.HTTPProvider(get_settings().active_rpc_url, request_kwargs={"timeout": 10.0}))
    return int(w3.eth.block_number)


def _live_oracle_signer() -> str:
    """Live: read the immutable ``oracleSigner`` off the configured registry."""
    from mantleproof.persistence.registry_reader import read_oracle_signer

    return read_oracle_signer()


def _live_cache_freshness() -> int | None:
    """Live: youngest mtime across the two T29 stores; None if both absent."""
    from mantleproof.triage.store import CacheStore, FeedStore

    candidates = [CacheStore().freshness_s(), FeedStore().freshness_s()]
    seen = [c for c in candidates if c is not None]
    return min(seen) if seen else None


def build_health(
    *,
    chain_id: int,
    network: str,
    registry_address: str,
    rpc_block: int | None,
    rpc_latency_ms: int | None,
    rpc_error: str | None,
    oracle_signer: str | None,
    oracle_error: str | None,
    cache_freshness_s: int | None = None,
) -> dict[str, Any]:
    """Pure: assemble the health payload. Lets tests check shape without I/O."""
    ok = rpc_error is None and oracle_error is None and bool(registry_address)
    return {
        "engine": "ok" if ok else "degraded",
        "version": _engine_version(),
        "network": network,
        "chain_id": chain_id,
        "registry_address": registry_address or None,
        "rpc": {
            "block_number": rpc_block,
            "latency_ms": rpc_latency_ms,
            "error": rpc_error,
        },
        "oracle_signer": oracle_signer,
        "oracle_error": oracle_error,
        # Youngest mtime of `engine/data/{cache,feed}.json`; `None` means the
        # T29 walker has never run on this host — honest "unknown".
        "cache_freshness_s": cache_freshness_s,
    }


@router.get("/api/health")
async def health(
    ping: PingFn | None = None,
    oracle: OracleFn | None = None,
    freshness: FreshnessFn | None = None,
) -> dict[str, Any]:
    from mantleproof.settings import get_settings

    s = get_settings()
    chain_id = s.chain_id

    rpc_block: int | None = None
    rpc_latency_ms: int | None = None
    rpc_error: str | None = None
    started = time.perf_counter()
    try:
        rpc_block = (ping or _live_rpc_ping)()
        rpc_latency_ms = int((time.perf_counter() - started) * 1000)
    except Exception as exc:  # noqa: BLE001 — health must never raise
        rpc_error = f"{type(exc).__name__}: {exc}"

    oracle_signer: str | None = None
    oracle_error: str | None = None
    if s.mantleproof_registry_address:
        try:
            oracle_signer = (oracle or _live_oracle_signer)()
        except Exception as exc:  # noqa: BLE001
            oracle_error = f"{type(exc).__name__}: {exc}"
    else:
        oracle_error = "MANTLEPROOF_REGISTRY_ADDRESS not set"

    try:
        cache_freshness_s = (freshness or _live_cache_freshness)()
    except Exception:  # noqa: BLE001 — disk read must not fail the route
        cache_freshness_s = None

    return build_health(
        chain_id=chain_id,
        network=s.mantle_network,
        registry_address=s.mantleproof_registry_address,
        rpc_block=rpc_block,
        rpc_latency_ms=rpc_latency_ms,
        rpc_error=rpc_error,
        oracle_signer=oracle_signer,
        oracle_error=oracle_error,
        cache_freshness_s=cache_freshness_s,
    )
