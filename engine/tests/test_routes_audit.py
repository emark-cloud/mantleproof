"""Route tests for GET /api/audit/{address} (T7).

The handler accepts ``reader`` and ``fetcher`` injections so we can exercise
every honest-failure branch without touching a real RPC or IPFS gateway. The
live mainnet smoke lives in ``scripts/smoke_get_audit_mainnet.py``.
"""

from __future__ import annotations

import httpx
from fastapi.testclient import TestClient
from web3 import Web3

from mantleproof.api import routes_audit
from mantleproof.checks.base import Severity
from mantleproof.main import create_app
from mantleproof.persistence.ipfs_fetch import ReportFetchResult, canonicalize
from mantleproof.persistence.registry_reader import OnChainAudit

TARGET = "0x1892f77e335C133Ce4a7B28555f13bA74cBB76fA"  # EIP-55 checksum
ORACLE = "0x9f17b625902B0d35a02fd790aF45cf95e9F4638a"


def _fake_report(root_hash: str) -> dict:
    """A report whose canonical keccak equals ``root_hash``."""
    report = {
        "schema": "mantleproof/audit/v1",
        "target": TARGET,
        "chain_id": 5000,
        "tier": 2,
        "severity": "high",
        "summary": "1 high",
        "findings": [],
        "generated_at": "2026-05-20T12:00:00+00:00",
    }
    # Pin the rootHash by computing it from this exact report.
    recomputed = "0x" + Web3.keccak(text=canonicalize(report)).hex()
    assert recomputed == root_hash, "test setup: rootHash must match the fake report"
    return report


def test_get_audit_404_when_never_audited(monkeypatch):
    monkeypatch.setattr(routes_audit, "read_audit", lambda _addr: None)
    client = TestClient(create_app())
    r = client.get(f"/api/audit/{TARGET}")
    assert r.status_code == 404
    body = r.json()["detail"]
    assert body["audited"] is False
    assert body["target"] == TARGET
    assert "no on-chain audit" in body["reason"]


def test_get_audit_400_on_bad_address():
    client = TestClient(create_app())
    r = client.get("/api/audit/not-an-address")
    assert r.status_code == 400


def test_get_audit_happy_path(monkeypatch):
    root_hash = "0x" + Web3.keccak(
        text=canonicalize(
            {
                "schema": "mantleproof/audit/v1",
                "target": TARGET,
                "chain_id": 5000,
                "tier": 2,
                "severity": "high",
                "summary": "1 high",
                "findings": [],
                "generated_at": "2026-05-20T12:00:00+00:00",
            }
        )
    ).hex()
    audit = OnChainAudit(
        target=TARGET,
        root_hash=root_hash,
        severity=Severity.HIGH,
        ipfs_cid="bafkreihappy",
        timestamp=1_716_000_000,
        submitter=ORACLE,
        audit_count=1,
    )

    def fake_fetch(cid: str, expected: str) -> ReportFetchResult:
        assert cid == "bafkreihappy"
        assert expected == root_hash
        report = _fake_report(root_hash)
        return ReportFetchResult(
            cid=cid, report=report, recomputed_root_hash=root_hash, match=True
        )

    monkeypatch.setattr(routes_audit, "read_audit", lambda _addr: audit)
    monkeypatch.setattr(routes_audit, "fetch_report", fake_fetch)
    client = TestClient(create_app())

    r = client.get(f"/api/audit/{TARGET}")
    assert r.status_code == 200
    body = r.json()
    assert body["audited"] is True
    assert body["target"] == TARGET
    assert body["chain_id"] in (5000, 5003)
    assert body["anchor"]["severity"] == "high"
    assert body["anchor"]["severity_uint8"] == 3
    assert body["anchor"]["submitter"] == ORACLE
    assert body["anchor"]["ipfs_uri"] == "ipfs://bafkreihappy"
    assert body["integrity"]["match"] is True
    assert body["integrity"]["expected_root_hash"] == root_hash
    assert body["report"]["schema"] == "mantleproof/audit/v1"
    assert body["ipfs_error"] is None


def test_get_audit_surfaces_ipfs_mismatch(monkeypatch):
    """A wrong IPFS payload must NOT be hidden — match=False is public."""
    expected = "0x" + "ab" * 32

    def fake_fetch(cid: str, _expected: str) -> ReportFetchResult:
        return ReportFetchResult(
            cid=cid,
            report={"schema": "mantleproof/audit/v1", "tampered": True},
            recomputed_root_hash="0x" + "cd" * 32,
            match=False,
        )

    audit = OnChainAudit(
        target=TARGET,
        root_hash=expected,
        severity=Severity.MEDIUM,
        ipfs_cid="bafkreitampered",
        timestamp=1_716_000_000,
        submitter=ORACLE,
        audit_count=1,
    )
    monkeypatch.setattr(routes_audit, "read_audit", lambda _addr: audit)
    monkeypatch.setattr(routes_audit, "fetch_report", fake_fetch)
    client = TestClient(create_app())

    r = client.get(f"/api/audit/{TARGET}")
    assert r.status_code == 200
    body = r.json()
    assert body["integrity"]["match"] is False
    assert body["integrity"]["recomputed_root_hash"] == "0x" + "cd" * 32
    assert body["report"]["tampered"] is True  # honesty: still return what we got


def test_get_audit_handles_ipfs_fetch_failure(monkeypatch):
    """Gateway down → 200 with anchor, report=null, ipfs_error populated."""
    audit = OnChainAudit(
        target=TARGET,
        root_hash="0x" + "ee" * 32,
        severity=Severity.LOW,
        ipfs_cid="bafkreigateway-down",
        timestamp=1_716_000_000,
        submitter=ORACLE,
        audit_count=1,
    )

    def boom(_cid: str, _expected: str) -> ReportFetchResult:
        raise httpx.ConnectError("gateway unreachable")

    monkeypatch.setattr(routes_audit, "read_audit", lambda _addr: audit)
    monkeypatch.setattr(routes_audit, "fetch_report", boom)
    client = TestClient(create_app())

    r = client.get(f"/api/audit/{TARGET}")
    assert r.status_code == 200
    body = r.json()
    assert body["audited"] is True
    assert body["report"] is None
    assert body["integrity"]["match"] is None
    assert "ConnectError" in body["ipfs_error"]
