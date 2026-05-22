"""Route tests for GET /api/health (T7).

Health must never raise — every failure mode is a soft "degraded" with an
``error`` string. These tests pin that contract.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from mantleproof.api import routes_health
from mantleproof.main import create_app


def test_health_ok_when_rpc_and_oracle_succeed(monkeypatch):
    monkeypatch.setattr(routes_health, "_live_rpc_ping", lambda: 95_569_094)
    monkeypatch.setattr(routes_health, "_live_oracle_signer", lambda: "0x9f17...638a")
    # Pin freshness so the test doesn't depend on whether the host has run the
    # T29 walker; the two T29 health tests cover the cold/warm freshness branches.
    monkeypatch.setattr(routes_health, "_live_cache_freshness", lambda: None)
    monkeypatch.setenv("MANTLEPROOF_REGISTRY_ADDRESS", "0x60E97c83Dd184D3B0812Ce25430e9D6930eD63aE")

    # Clear the lru_cache on get_settings so the env override is picked up.
    from mantleproof.settings import get_settings

    get_settings.cache_clear()  # type: ignore[attr-defined]

    client = TestClient(create_app())
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["engine"] == "ok"
    assert body["rpc"]["block_number"] == 95_569_094
    assert body["rpc"]["error"] is None
    assert body["oracle_signer"] == "0x9f17...638a"
    assert body["oracle_error"] is None
    assert body["cache_freshness_s"] is None
    get_settings.cache_clear()  # type: ignore[attr-defined]


def test_health_degraded_when_rpc_fails(monkeypatch):
    def boom() -> int:
        raise RuntimeError("rpc dead")

    monkeypatch.setattr(routes_health, "_live_rpc_ping", boom)
    monkeypatch.setattr(routes_health, "_live_oracle_signer", lambda: "0xabc")
    monkeypatch.setenv("MANTLEPROOF_REGISTRY_ADDRESS", "0x60E97c83Dd184D3B0812Ce25430e9D6930eD63aE")

    from mantleproof.settings import get_settings

    get_settings.cache_clear()  # type: ignore[attr-defined]

    client = TestClient(create_app())
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["engine"] == "degraded"
    assert "rpc dead" in body["rpc"]["error"]
    get_settings.cache_clear()  # type: ignore[attr-defined]


def test_health_degraded_when_registry_unset(monkeypatch):
    monkeypatch.setattr(routes_health, "_live_rpc_ping", lambda: 1)
    # Empty env var overrides the repo .env file in pydantic-settings'
    # precedence — delenv alone leaves the .env value in force.
    monkeypatch.setenv("MANTLEPROOF_REGISTRY_ADDRESS", "")

    from mantleproof.settings import get_settings

    get_settings.cache_clear()  # type: ignore[attr-defined]

    client = TestClient(create_app())
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["engine"] == "degraded"
    assert "REGISTRY_ADDRESS" in body["oracle_error"]
    assert body["oracle_signer"] is None
    get_settings.cache_clear()  # type: ignore[attr-defined]
