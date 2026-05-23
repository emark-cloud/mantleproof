"""Route tests for POST /x402/audit/{address} (T11).

Every branch of the x402 dance is exercised with injected fakes — verify,
settle, and the pipeline runner are all callables the route accepts via its
function signature, so we never touch the live facilitator or Gemini.
"""

from __future__ import annotations

import base64
import json

import pytest
from fastapi.testclient import TestClient

from mantleproof.api import routes_x402
from mantleproof.main import create_app
from mantleproof.x402.facilitator import SettleResult, VerifyResult


@pytest.fixture(autouse=True)
def _disable_default_receipt_recorder(monkeypatch):
    """Neutralize disk writes from the default recorder. Tests that assert
    recording explicitly re-patch ``_default_record_receipt`` or inject
    ``record_fn`` via the route parameter."""
    monkeypatch.setattr(routes_x402, "_default_record_receipt", lambda *_a, **_k: None)

# Use the same EIP-55 checksum target the audit-route tests do.
TARGET = "0x1892f77e335C133Ce4a7B28555f13bA74cBB76fA"
PAY_TO = "0x2a3080AA52DE07702dd30b81cC97C3527e605B6A"


def _valid_payment_b64() -> str:
    body = {
        "x402Version": 1,
        "scheme": "exact",
        "network": "base",
        "payload": {
            "signature": "0x" + "ab" * 65,
            "authorization": {
                "from": "0xpayer000000000000000000000000000000000000",
                "to": PAY_TO,
                "value": "500000",
                "validAfter": "0",
                "validBefore": "9999999999",
                "nonce": "0x" + "cd" * 32,
            },
        },
    }
    return base64.b64encode(json.dumps(body).encode("utf-8")).decode("ascii")


def _enable_paywall(monkeypatch):
    """Ensure X402_PAYTO_ADDRESS is set; reset the lru_cache so it's seen."""
    monkeypatch.setenv("X402_PAYTO_ADDRESS", PAY_TO)
    from mantleproof.settings import get_settings

    get_settings.cache_clear()  # type: ignore[attr-defined]


def test_post_returns_402_with_requirements_when_no_payment(monkeypatch):
    _enable_paywall(monkeypatch)
    client = TestClient(create_app())
    r = client.post(f"/x402/audit/{TARGET}")
    assert r.status_code == 402
    body = r.json()
    assert body["x402Version"] == 1
    assert body["error"].startswith("X-PAYMENT header is required")
    assert len(body["accepts"]) == 1
    a = body["accepts"][0]
    assert a["network"] == "base"
    assert a["scheme"] == "exact"
    assert a["payTo"] == PAY_TO
    assert a["maxAmountRequired"] == "500000"
    assert a["resource"] == f"/x402/audit/{TARGET}"


def test_post_returns_402_with_clear_error_on_bad_header(monkeypatch):
    _enable_paywall(monkeypatch)
    client = TestClient(create_app())
    r = client.post(f"/x402/audit/{TARGET}", headers={"X-PAYMENT": "not-base64!!"})
    assert r.status_code == 402
    assert "base64" in r.json()["error"].lower()


def test_post_returns_402_when_facilitator_rejects(monkeypatch):
    _enable_paywall(monkeypatch)
    monkeypatch.setattr(
        routes_x402,
        "verify",
        lambda _p, _r: VerifyResult(
            is_valid=False, invalid_reason="expired", payer=None, raw={"isValid": False}
        ),
    )
    client = TestClient(create_app())
    r = client.post(f"/x402/audit/{TARGET}", headers={"X-PAYMENT": _valid_payment_b64()})
    assert r.status_code == 402
    assert "expired" in r.json()["error"]


def test_post_returns_200_with_both_tx_on_success(monkeypatch):
    _enable_paywall(monkeypatch)
    # verify ok, settle ok, pipeline returns a fake audit envelope.
    monkeypatch.setattr(
        routes_x402,
        "verify",
        lambda _p, _r: VerifyResult(
            is_valid=True, invalid_reason=None, payer="0xpayer", raw={"isValid": True}
        ),
    )
    base_tx = "0x" + "11" * 32
    monkeypatch.setattr(
        routes_x402,
        "settle",
        lambda _p, _r: SettleResult(
            success=True,
            transaction=base_tx,
            network="base",
            payer="0xpayer",
            error_reason=None,
            raw={},
        ),
    )
    mantle_anchor = "0x" + "22" * 32

    def fake_pipeline(target):
        return {
            "schema": "mantleproof/audit/v1",
            "target": target,
            "chain_id": 5000,
            "severity": "high",
            "root_hash": "0x" + "33" * 32,
            "anchor_tx": mantle_anchor,
            "ipfs_cid": "bafkreitest",
        }

    monkeypatch.setattr(routes_x402, "_default_run_pipeline", fake_pipeline)

    client = TestClient(create_app())
    r = client.post(f"/x402/audit/{TARGET}", headers={"X-PAYMENT": _valid_payment_b64()})
    assert r.status_code == 200
    body = r.json()
    assert body["audited"] is True
    # CLAUDE.md cross-chain rule: BOTH txHashes in every response.
    assert body["x402"]["payment_tx"] == base_tx
    assert body["x402"]["anchor_tx"] == mantle_anchor
    assert body["x402"]["payment_chain"] == "base"
    assert body["x402"]["anchor_chain"] == "mantle"
    assert body["x402"]["settle_error"] is None
    assert r.headers["x-payment-response"].startswith("network=base;tx=" + base_tx)


def test_post_surfaces_settle_failure_after_anchor(monkeypatch):
    """Audit anchored, settle broke — return 200 + ``settle_error`` honestly.

    Per x402 v1 the protected resource is served before settlement; if the
    Base broadcast fails the audit is still public on Mantle and the user can
    free-read it via ``/api/audit/{address}``. Don't lie about the payment.
    """
    _enable_paywall(monkeypatch)
    monkeypatch.setattr(
        routes_x402,
        "verify",
        lambda _p, _r: VerifyResult(
            is_valid=True, invalid_reason=None, payer="0xpayer", raw={}
        ),
    )
    monkeypatch.setattr(
        routes_x402,
        "settle",
        lambda _p, _r: SettleResult(
            success=False,
            transaction=None,
            network="base",
            payer="0xpayer",
            error_reason="rpc_down",
            raw={},
        ),
    )
    mantle_anchor = "0x" + "44" * 32
    monkeypatch.setattr(
        routes_x402,
        "_default_run_pipeline",
        lambda t: {
            "schema": "mantleproof/audit/v1",
            "target": t,
            "chain_id": 5000,
            "severity": "info",
            "root_hash": "0x" + "55" * 32,
            "anchor_tx": mantle_anchor,
            "ipfs_cid": "bafkreitest2",
        },
    )

    client = TestClient(create_app())
    r = client.post(f"/x402/audit/{TARGET}", headers={"X-PAYMENT": _valid_payment_b64()})
    assert r.status_code == 200
    body = r.json()
    assert body["x402"]["payment_tx"] is None
    assert body["x402"]["settle_error"] == "rpc_down"
    # The Mantle anchor remained — the audit is still trust-anchored.
    assert body["x402"]["anchor_tx"] == mantle_anchor


def test_post_503_when_paywall_not_configured(monkeypatch):
    # Force the unconfigured state with an empty env var — this overrides the
    # repo .env file in pydantic-settings' precedence, so the test holds
    # regardless of whether X402_PAYTO_ADDRESS is set in .env.
    monkeypatch.setenv("X402_PAYTO_ADDRESS", "")
    from mantleproof.settings import get_settings

    get_settings.cache_clear()  # type: ignore[attr-defined]
    client = TestClient(create_app())
    r = client.post(f"/x402/audit/{TARGET}", headers={"X-PAYMENT": _valid_payment_b64()})
    assert r.status_code == 503


def test_post_400_on_bad_address():
    client = TestClient(create_app())
    r = client.post("/x402/audit/not-an-address")
    assert r.status_code == 400


# --- x402 receipt persistence ------------------------------------------------


def _patch_success(monkeypatch, anchor_tx: str, settle_tx: str | None, settle_err=None):
    """Wire verify/settle/pipeline so the route hits the 200 path."""
    monkeypatch.setattr(
        routes_x402, "verify",
        lambda _p, _r: VerifyResult(
            is_valid=True, invalid_reason=None, payer="0xpayer", raw={"isValid": True}
        ),
    )
    monkeypatch.setattr(
        routes_x402, "settle",
        lambda _p, _r: SettleResult(
            success=settle_tx is not None,
            transaction=settle_tx,
            network="base",
            payer="0xpayer",
            error_reason=settle_err,
            raw={},
        ),
    )
    monkeypatch.setattr(
        routes_x402, "_default_run_pipeline",
        lambda target: {
            "schema": "mantleproof/audit/v1",
            "target": target,
            "chain_id": 5000,
            "severity": "high",
            "root_hash": "0x" + "55" * 32,
            "anchor_tx": anchor_tx,
            "ipfs_cid": "bafkreireceipt",
        },
    )


def test_post_records_x402_receipt_on_success(monkeypatch):
    """The successful 200 must call the recorder with the same x402 block the
    response carries — that's how /api/audit later surfaces the paying agent."""
    _enable_paywall(monkeypatch)
    _patch_success(monkeypatch, anchor_tx="0x" + "66" * 32, settle_tx="0x" + "77" * 32)

    captured: dict = {}

    def fake_record(target, audit, x402_block):
        captured["target"] = target
        captured["audit"] = audit
        captured["x402"] = dict(x402_block)

    monkeypatch.setattr(routes_x402, "_default_record_receipt", fake_record)

    client = TestClient(create_app())
    r = client.post(f"/x402/audit/{TARGET}", headers={"X-PAYMENT": _valid_payment_b64()})
    assert r.status_code == 200
    assert captured["target"] == TARGET
    assert captured["audit"]["root_hash"] == "0x" + "55" * 32
    assert captured["x402"]["payment_tx"] == "0x" + "77" * 32
    assert captured["x402"]["anchor_tx"] == "0x" + "66" * 32
    assert captured["x402"]["payer"] == "0xpayer"
    assert captured["x402"]["payment_chain"] == "base"
    assert captured["x402"]["anchor_chain"] == "mantle"
    assert captured["x402"]["settle_error"] is None


def test_post_persistence_failure_does_not_break_200(monkeypatch):
    """A raising recorder must NOT break the paid-audit 200. The audit is
    anchored on chain regardless; honesty over disk."""
    _enable_paywall(monkeypatch)
    _patch_success(monkeypatch, anchor_tx="0x" + "88" * 32, settle_tx="0x" + "99" * 32)

    def boom(*_a, **_k):
        raise RuntimeError("disk gone")

    monkeypatch.setattr(routes_x402, "_default_record_receipt", boom)

    client = TestClient(create_app())
    r = client.post(f"/x402/audit/{TARGET}", headers={"X-PAYMENT": _valid_payment_b64()})
    assert r.status_code == 200
    body = r.json()
    assert body["x402"]["anchor_tx"] == "0x" + "88" * 32
    assert body["x402"]["payment_tx"] == "0x" + "99" * 32
