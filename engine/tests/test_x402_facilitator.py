"""Tests for the facilitator HTTP client (T11) — pure payload shape + mocked POSTs."""

from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest

from mantleproof.x402 import facilitator as fac_mod
from mantleproof.x402.builder import build_payment_requirements
from mantleproof.x402.facilitator import (
    _payload_for_verify,
    _resolve,
    settle,
    verify,
)
from mantleproof.x402.types import Eip3009Authorization, ExactEvmPayload, PaymentPayload

TARGET = "0x1892f77e335C133Ce4a7B28555f13bA74cBB76fA"
PAY_TO = "0x2a3080AA52DE07702dd30b81cC97C3527e605B6A"


def _resp(
    status: int,
    url: str = "https://fac.example/verify",
    json_body=None,
    text=None,
) -> httpx.Response:
    """Build an httpx.Response with a request attached so raise_for_status works."""
    req = httpx.Request("POST", url)
    if text is not None:
        return httpx.Response(status, request=req, text=text)
    return httpx.Response(status, request=req, json=json_body or {})


def _payment() -> PaymentPayload:
    return PaymentPayload(
        x402Version=1,
        scheme="exact",
        network="base",
        payload=ExactEvmPayload(
            signature="0x" + "ab" * 65,
            authorization=Eip3009Authorization(
                from_="0xpayer000000000000000000000000000000000000",
                to=PAY_TO,
                value="500000",
                validAfter="0",
                validBefore="9999999999",
                nonce="0x" + "cd" * 32,
            ),
        ),
    )


def test_payload_shape_contains_both_halves():
    """The body sent to ``/verify`` MUST carry both the payment + the requirements."""
    pay = _payment()
    req = build_payment_requirements(
        target=TARGET, pay_to=PAY_TO, resource_path=f"/x402/audit/{TARGET}"
    )
    body = _payload_for_verify(pay, req)
    assert body["x402Version"] == 1
    assert body["paymentPayload"]["network"] == "base"
    assert body["paymentRequirements"]["payTo"] == PAY_TO
    assert body["paymentRequirements"]["maxAmountRequired"] == "500000"


def test_verify_unwraps_facilitator_response(monkeypatch):
    pay = _payment()
    req = build_payment_requirements(
        target=TARGET, pay_to=PAY_TO, resource_path=f"/x402/audit/{TARGET}"
    )
    captured: dict = {}

    def fake_post(url, json, headers, timeout):  # noqa: A002 — match httpx signature
        captured["url"] = url
        captured["body"] = json
        captured["headers"] = headers
        return _resp(
            200,
            url,
            {"isValid": True, "payer": "0xpayer000000000000000000000000000000000000"},
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    v = verify(pay, req, facilitator_url="https://fac.example/")
    assert v.is_valid is True
    assert v.payer == "0xpayer000000000000000000000000000000000000"
    assert v.invalid_reason is None
    assert captured["url"] == "https://fac.example/verify"
    assert captured["body"]["paymentRequirements"]["payTo"] == PAY_TO


def test_verify_surfaces_invalid_reason(monkeypatch):
    pay = _payment()
    req = build_payment_requirements(
        target=TARGET, pay_to=PAY_TO, resource_path=f"/x402/audit/{TARGET}"
    )
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *_a, **_k: _resp(200, json_body={"isValid": False, "invalidReason": "expired"}),
    )
    v = verify(pay, req)
    assert v.is_valid is False
    assert v.invalid_reason == "expired"


def test_settle_returns_base_tx(monkeypatch):
    pay = _payment()
    req = build_payment_requirements(
        target=TARGET, pay_to=PAY_TO, resource_path=f"/x402/audit/{TARGET}"
    )
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *_a, **_k: _resp(
            200,
            json_body={
                "success": True,
                "transaction": "0x" + "11" * 32,
                "network": "base",
                "payer": "0xpayer000000000000000000000000000000000000",
            },
        ),
    )
    s = settle(pay, req)
    assert s.success is True
    assert s.transaction == "0x" + "11" * 32
    assert s.network == "base"
    assert s.error_reason is None


def test_settle_surfaces_facilitator_error(monkeypatch):
    pay = _payment()
    req = build_payment_requirements(
        target=TARGET, pay_to=PAY_TO, resource_path=f"/x402/audit/{TARGET}"
    )
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *_a, **_k: _resp(
            200, json_body={"success": False, "errorReason": "insufficient_funds"}
        ),
    )
    s = settle(pay, req)
    assert s.success is False
    assert s.transaction is None
    assert s.error_reason == "insufficient_funds"


def test_verify_raises_on_facilitator_5xx(monkeypatch):
    pay = _payment()
    req = build_payment_requirements(
        target=TARGET, pay_to=PAY_TO, resource_path=f"/x402/audit/{TARGET}"
    )
    monkeypatch.setattr(httpx, "post", lambda *_a, **_k: _resp(503, text="oops"))
    with pytest.raises(httpx.HTTPStatusError):
        verify(pay, req)


# --- facilitator selection (_resolve) — x402org testnet vs CDP mainnet --------


def _fake_settings(**kw) -> SimpleNamespace:
    base = dict(
        x402_facilitator="x402org",
        x402_facilitator_url="https://x402.org/facilitator",
        cdp_api_key_id="",
        cdp_api_key_secret="",
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_resolve_x402org_is_plain_unauthenticated(monkeypatch):
    monkeypatch.setattr(fac_mod, "get_settings", lambda: _fake_settings())
    url, headers = _resolve("verify", None)
    assert url == "https://x402.org/facilitator/verify"
    assert headers == {}


def test_resolve_explicit_url_override_bypasses_settings(monkeypatch):
    """The test-injection seam: an explicit URL is honored verbatim with no
    auth — even when settings say cdp."""
    monkeypatch.setattr(
        fac_mod,
        "get_settings",
        lambda: _fake_settings(
            x402_facilitator="cdp", cdp_api_key_id="x", cdp_api_key_secret="y"
        ),
    )
    url, headers = _resolve("settle", "https://fac.example/")
    assert url == "https://fac.example/settle"
    assert headers == {}


def test_resolve_cdp_without_keys_raises(monkeypatch):
    monkeypatch.setattr(
        fac_mod, "get_settings", lambda: _fake_settings(x402_facilitator="cdp")
    )
    with pytest.raises(RuntimeError, match="CDP_API_KEY"):
        _resolve("verify", None)


def test_resolve_cdp_targets_cdp_host_with_bearer(monkeypatch):
    monkeypatch.setattr(
        fac_mod,
        "get_settings",
        lambda: _fake_settings(
            x402_facilitator="cdp", cdp_api_key_id="kid", cdp_api_key_secret="ksecret"
        ),
    )
    monkeypatch.setattr(fac_mod, "_cdp_bearer", lambda kid, ksec, path: f"JWT[{path}]")
    url, headers = _resolve("settle", None)
    assert url == "https://api.cdp.coinbase.com/platform/v2/x402/settle"
    assert headers == {"Authorization": "Bearer JWT[/platform/v2/x402/settle]"}
