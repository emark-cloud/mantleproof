"""Route tests for /api/feed, /api/cache, /api/queries (T29).

Cold-start contract: when the store file doesn't exist, the route returns
``{updated_at: null, freshness_s: null, items: []}`` — honest empty state
rather than 501.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from mantleproof.api import routes_cache, routes_feed, routes_queries
from mantleproof.main import create_app
from mantleproof.triage.store import CacheStore, FeedStore


def _patch_data_dir(monkeypatch, tmp_path):
    """Point both stores at a per-test tmp dir so file IO is isolated."""
    monkeypatch.setattr(
        "mantleproof.triage.store.DEFAULT_DATA_DIR", tmp_path
    )


# --- /api/feed -----------------------------------------------------------------


def test_feed_cold_returns_empty(monkeypatch, tmp_path):
    _patch_data_dir(monkeypatch, tmp_path)
    client = TestClient(create_app())
    r = client.get("/api/feed")
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["freshness_s"] is None


def test_feed_warm_returns_rows(monkeypatch, tmp_path):
    _patch_data_dir(monkeypatch, tmp_path)
    from mantleproof.triage.store import FeedRow, FeedSnapshot

    rows = (
        FeedRow(
            address="0xabc",
            deployer="0xdead",
            block_number=99,
            tx_hash="0xtx",
            timestamp=10,
            classification="queued",
        ),
        FeedRow(
            address="0xdef",
            deployer="0xdead",
            block_number=98,
            tx_hash="0xtx2",
            timestamp=9,
            classification="audited",
        ),
    )
    FeedStore(data_dir=tmp_path).save(
        FeedSnapshot(chain_id=5000, last_block=100, rows=rows)
    )
    client = TestClient(create_app())
    r = client.get("/api/feed?limit=10")
    assert r.status_code == 200
    body = r.json()
    assert body["chain_id"] == 5000
    assert body["last_block"] == 100
    assert len(body["items"]) == 2
    assert body["freshness_s"] is not None and body["freshness_s"] >= 0


def test_feed_classification_filter(monkeypatch, tmp_path):
    _patch_data_dir(monkeypatch, tmp_path)
    from mantleproof.triage.store import FeedRow, FeedSnapshot

    rows = (
        FeedRow(
            address="0xabc",
            deployer="0xd",
            block_number=99,
            tx_hash="0xtx",
            timestamp=10,
            classification="queued",
        ),
        FeedRow(
            address="0xdef",
            deployer="0xd",
            block_number=98,
            tx_hash="0xtx2",
            timestamp=9,
            classification="skipped:template",
        ),
    )
    FeedStore(data_dir=tmp_path).save(
        FeedSnapshot(chain_id=5000, last_block=100, rows=rows)
    )
    client = TestClient(create_app())
    r = client.get("/api/feed?classification=queued")
    body = r.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["address"] == "0xabc"


# --- /api/cache ----------------------------------------------------------------


def test_cache_cold_returns_empty(monkeypatch, tmp_path):
    _patch_data_dir(monkeypatch, tmp_path)
    client = TestClient(create_app())
    r = client.get("/api/cache")
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["freshness_s"] is None


def test_cache_severity_filter_and_sort(monkeypatch, tmp_path):
    _patch_data_dir(monkeypatch, tmp_path)
    from mantleproof.triage.store import CacheRow, CacheSnapshot

    base: dict[str, Any] = {
        "ipfs_cid": "cid",
        "timestamp": 1,
        "submitter": "0xs",
        "audit_count": 1,
        "block_number": 1,
        "tx_hash": "0xtx",
        "root_hash": "0xrh",
    }
    rows = (
        CacheRow(target="0x1", severity="info", severity_uint8=0, **base),
        CacheRow(target="0x2", severity="high", severity_uint8=3, **base),
        CacheRow(target="0x3", severity="low", severity_uint8=1, **base),
    )
    CacheStore(data_dir=tmp_path).save(
        CacheSnapshot(chain_id=5000, last_block=100, rows=rows)
    )
    client = TestClient(create_app())
    r = client.get("/api/cache")
    body = r.json()
    # high should come first when no filter (severity desc).
    assert body["items"][0]["target"] == "0x2"
    # Filter narrows the band.
    r2 = client.get("/api/cache?severity=info")
    assert len(r2.json()["items"]) == 1
    assert r2.json()["items"][0]["target"] == "0x1"


def test_pure_build_feed_response_cold_state():
    out = routes_feed.build_feed_response(None, None, limit=10, classification=None)
    assert out["items"] == []
    assert out["chain_id"] is None
    assert out["freshness_s"] is None


def test_pure_build_cache_response_severity_sort():
    payload = {
        "chain_id": 5000,
        "last_block": 1,
        "rows": [
            {"target": "0x1", "severity": "info", "audit_count": 5, "block_number": 1},
            {"target": "0x2", "severity": "high", "audit_count": 1, "block_number": 1},
        ],
    }
    out = routes_cache.build_cache_response(payload, 0, limit=10, severity=None)
    assert out["items"][0]["target"] == "0x2"  # high outranks info


# --- /api/queries --------------------------------------------------------------


def test_queries_pure_response_shape():
    rows = [
        {
            "block_number": 100,
            "timestamp": 10,
            "tx_hash": "0xtx",
            "agent": "0xa",
            "target": "0xt",
            "audit_root_hash": "0xrh",
            "action": "APPROVED",
            "reason": "ok",
        }
    ]
    out = routes_queries.build_queries_response(
        5000, "0xdecisionlog", rows, limit=10
    )
    assert out["chain_id"] == 5000
    assert out["decision_log_address"] == "0xdecisionlog"
    assert out["items"][0]["action"] == "APPROVED"


def test_queries_no_address_for_chain(monkeypatch):
    """Unknown chain → honest empty payload with an error string, never 500."""
    monkeypatch.setenv("MANTLE_NETWORK", "mantleSepolia")
    monkeypatch.setattr(
        routes_queries, "DECISION_LOG_BY_CHAIN", {5000: None, 5003: None}
    )
    from mantleproof.settings import get_settings

    get_settings.cache_clear()  # type: ignore[attr-defined]
    client = TestClient(create_app())
    r = client.get("/api/queries")
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert "unknown" in (body["error"] or "").lower()
    get_settings.cache_clear()  # type: ignore[attr-defined]


# --- /api/health: cache_freshness_s wiring -------------------------------------


def test_health_cache_freshness_surfaces_store_age(monkeypatch, tmp_path):
    """When stores exist, /api/health reports the youngest mtime."""
    from mantleproof.api import routes_health
    from mantleproof.triage.store import FeedSnapshot

    _patch_data_dir(monkeypatch, tmp_path)
    FeedStore(data_dir=tmp_path).save(
        FeedSnapshot(chain_id=5000, last_block=1, rows=())
    )
    monkeypatch.setattr(routes_health, "_live_rpc_ping", lambda: 1)
    monkeypatch.setattr(routes_health, "_live_oracle_signer", lambda: "0xs")
    monkeypatch.setenv("MANTLEPROOF_REGISTRY_ADDRESS", "0x60E97c83Dd184D3B0812Ce25430e9D6930eD63aE")
    from mantleproof.settings import get_settings

    get_settings.cache_clear()  # type: ignore[attr-defined]

    client = TestClient(create_app())
    r = client.get("/api/health")
    body = r.json()
    assert body["cache_freshness_s"] is not None
    assert body["cache_freshness_s"] >= 0
    get_settings.cache_clear()  # type: ignore[attr-defined]


def test_health_cache_freshness_none_when_cold(monkeypatch, tmp_path):
    from mantleproof.api import routes_health

    _patch_data_dir(monkeypatch, tmp_path)
    monkeypatch.setattr(routes_health, "_live_rpc_ping", lambda: 1)
    monkeypatch.setattr(routes_health, "_live_oracle_signer", lambda: "0xs")
    monkeypatch.setenv("MANTLEPROOF_REGISTRY_ADDRESS", "0x60E97c83Dd184D3B0812Ce25430e9D6930eD63aE")
    from mantleproof.settings import get_settings

    get_settings.cache_clear()  # type: ignore[attr-defined]
    client = TestClient(create_app())
    r = client.get("/api/health")
    body = r.json()
    assert body["cache_freshness_s"] is None
    get_settings.cache_clear()  # type: ignore[attr-defined]
