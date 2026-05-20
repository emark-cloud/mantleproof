"""Pure tests for the 402-body builder (T11)."""

from __future__ import annotations

from mantleproof.x402.builder import (
    TIER2_PRICE_BASE_UNITS,
    USDC_BASE_MAINNET,
    USDC_EIP712_EXTRA,
    build_402_body,
    build_payment_requirements,
)

TARGET = "0x1892f77e335C133Ce4a7B28555f13bA74cBB76fA"
PAY_TO = "0x2a3080AA52DE07702dd30b81cC97C3527e605B6A"
RESOURCE = "/x402/audit/" + TARGET


def test_payment_requirements_shape_and_defaults():
    req = build_payment_requirements(target=TARGET, pay_to=PAY_TO, resource_path=RESOURCE)
    d = req.to_dict()
    assert d["scheme"] == "exact"
    assert d["network"] == "base"
    assert d["maxAmountRequired"] == TIER2_PRICE_BASE_UNITS == "500000"  # 0.50 USDC
    assert d["resource"] == RESOURCE
    assert d["payTo"] == PAY_TO
    assert d["asset"] == USDC_BASE_MAINNET
    assert d["mimeType"] == "application/json"
    assert d["maxTimeoutSeconds"] == 60
    assert d["extra"] == USDC_EIP712_EXTRA  # EIP-712 domain pieces


def test_402_body_carries_one_accept_and_version():
    body = build_402_body(target=TARGET, pay_to=PAY_TO, resource_path=RESOURCE).to_dict()
    assert body["x402Version"] == 1
    assert body["error"] == "X-PAYMENT header is required"
    assert len(body["accepts"]) == 1
    assert body["accepts"][0]["payTo"] == PAY_TO


def test_402_body_propagates_error_string():
    body = build_402_body(
        target=TARGET,
        pay_to=PAY_TO,
        resource_path=RESOURCE,
        error="bad sig",
    ).to_dict()
    assert body["error"] == "bad sig"
