"""Facilitator HTTP client — verify + settle on Base via x402.org (T11).

Coinbase's hosted facilitator runs the actual EIP-3009 signature verification
and the on-chain transferWithAuthorization on Base. We don't recreate either —
the *whole point* of x402 v1 is that the facilitator is the trusted off-chain
verifier so the server doesn't need a Base RPC + a signer for the payment leg.

  POST {facilitator}/verify  → { isValid, invalidReason?, payer }
  POST {facilitator}/settle  → { success, transaction, network, payer, errorReason? }

The wire shapes are kept stable here; ``_payload_for_*`` is a pure assembly
function so we can unit-test the body without faking an httpx response.

CLAUDE.md cross-chain rule: this client touches **Base** only. The Mantle
anchor is the engine's own ``anchor_audit`` call elsewhere in the pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from mantleproof.settings import get_settings
from mantleproof.x402.types import PaymentPayload, PaymentRequirements


@dataclass(frozen=True)
class VerifyResult:
    """Outcome of ``/verify``. ``payer`` is set only on success."""

    is_valid: bool
    invalid_reason: str | None
    payer: str | None
    raw: dict[str, Any]


@dataclass(frozen=True)
class SettleResult:
    """Outcome of ``/settle``. ``transaction`` is the Base tx hash."""

    success: bool
    transaction: str | None
    network: str | None
    payer: str | None
    error_reason: str | None
    raw: dict[str, Any]


def _payload_for_verify(
    payment: PaymentPayload, requirements: PaymentRequirements
) -> dict[str, Any]:
    """Pure: body of the ``/verify`` request — same shape used by ``/settle``."""
    return {
        "x402Version": payment.x402Version,
        "paymentPayload": payment.to_dict(),
        "paymentRequirements": requirements.to_dict(),
    }


# /settle takes the same body as /verify in x402 v1.
_payload_for_settle = _payload_for_verify


def verify(
    payment: PaymentPayload,
    requirements: PaymentRequirements,
    *,
    facilitator_url: str | None = None,
    timeout: float = 20.0,
) -> VerifyResult:
    """Live: ask the facilitator whether the signed authorization is valid."""
    url = (facilitator_url or get_settings().x402_facilitator_url).rstrip("/") + "/verify"
    resp = httpx.post(url, json=_payload_for_verify(payment, requirements), timeout=timeout)
    resp.raise_for_status()
    body = resp.json() if isinstance(resp.json(), dict) else {}
    return VerifyResult(
        is_valid=bool(body.get("isValid")),
        invalid_reason=body.get("invalidReason"),
        payer=body.get("payer"),
        raw=body,
    )


def settle(
    payment: PaymentPayload,
    requirements: PaymentRequirements,
    *,
    facilitator_url: str | None = None,
    timeout: float = 60.0,
) -> SettleResult:
    """Live: ask the facilitator to broadcast transferWithAuthorization on Base.

    On success returns the Base tx hash. Settlement runs AFTER the protected
    resource is served (x402 v1 spec); a failure here does NOT invalidate the
    audit that's already anchored on Mantle.
    """
    url = (facilitator_url or get_settings().x402_facilitator_url).rstrip("/") + "/settle"
    resp = httpx.post(url, json=_payload_for_settle(payment, requirements), timeout=timeout)
    resp.raise_for_status()
    body = resp.json() if isinstance(resp.json(), dict) else {}
    return SettleResult(
        success=bool(body.get("success")),
        transaction=body.get("transaction"),
        network=body.get("network"),
        payer=body.get("payer"),
        error_reason=body.get("errorReason"),
        raw=body,
    )
