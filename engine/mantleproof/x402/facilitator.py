"""Facilitator HTTP client — verify + settle the USDC payment leg on Base (T11).

The facilitator is the trusted off-chain verifier: it runs the EIP-3009
signature check and broadcasts ``transferWithAuthorization`` on Base, so the
engine needs neither a Base RPC nor a Base signer for the payment leg.

Two facilitators are supported, chosen by ``settings.x402_facilitator``:

  - ``x402org`` — the free https://x402.org/facilitator. **Base Sepolia only**
    (testnet); unauthenticated.
  - ``cdp`` — Coinbase Developer Platform at ``api.cdp.coinbase.com``. Settles
    **Base mainnet**. Every request carries a short-lived ``Authorization:
    Bearer <JWT>`` minted from the CDP API key (see ``_cdp_bearer``).

Both speak the same x402 wire shapes:

  POST .../verify  → { isValid, invalidReason?, payer }
  POST .../settle  → { success, transaction, network, payer, errorReason? }

``_payload_for_*`` is a pure assembly function so the body is unit-testable
without faking an httpx response.

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


# CDP facilitator — fixed host + base path (CDP REST API v2, x402-facilitator).
_CDP_HOST = "api.cdp.coinbase.com"
_CDP_X402_PATH = "/platform/v2/x402"


def _cdp_bearer(key_id: str, key_secret: str, request_path: str) -> str:
    """Mint a short-lived CDP JWT bound to this exact ``POST request_path``.

    Lazy import: ``cdp-sdk`` is the optional ``engine[cdp]`` extra — only the
    CDP facilitator mode needs it; CI runs x402org / mocked transports.
    """
    try:
        from cdp.auth.utils.jwt import JwtOptions, generate_jwt
    except ImportError as exc:  # pragma: no cover - install-time guard
        raise RuntimeError(
            "x402_facilitator=cdp requires the cdp-sdk package — install the "
            "engine 'cdp' extra:  pip install -e '.[cdp]'  (or: uv pip install cdp-sdk)"
        ) from exc
    return generate_jwt(
        JwtOptions(
            api_key_id=key_id,
            api_key_secret=key_secret,
            request_method="POST",
            request_host=_CDP_HOST,
            request_path=request_path,
            expires_in=120,
        )
    )


def _resolve(action: str, facilitator_url: str | None) -> tuple[str, dict[str, str]]:
    """Resolve ``(url, headers)`` for ``action`` ∈ {"verify", "settle"}.

    An explicit ``facilitator_url`` is honored verbatim with no auth — that is
    the test-injection seam, and it preserves every existing x402 unit test.
    Otherwise ``settings.x402_facilitator`` decides: ``cdp`` targets the CDP
    host and attaches a per-request JWT bearer; ``x402org`` is a plain
    unauthenticated POST.
    """
    if facilitator_url is not None:
        return facilitator_url.rstrip("/") + f"/{action}", {}
    s = get_settings()
    if s.x402_facilitator == "cdp":
        if not (s.cdp_api_key_id and s.cdp_api_key_secret):
            raise RuntimeError(
                "x402_facilitator=cdp but CDP_API_KEY_ID / CDP_API_KEY_SECRET "
                "are unset in .env — cannot authenticate to the CDP facilitator."
            )
        path = f"{_CDP_X402_PATH}/{action}"
        bearer = _cdp_bearer(s.cdp_api_key_id, s.cdp_api_key_secret, path)
        return f"https://{_CDP_HOST}{path}", {"Authorization": f"Bearer {bearer}"}
    return s.x402_facilitator_url.rstrip("/") + f"/{action}", {}


def verify(
    payment: PaymentPayload,
    requirements: PaymentRequirements,
    *,
    facilitator_url: str | None = None,
    timeout: float = 20.0,
) -> VerifyResult:
    """Live: ask the facilitator whether the signed authorization is valid."""
    url, headers = _resolve("verify", facilitator_url)
    resp = httpx.post(
        url, json=_payload_for_verify(payment, requirements), headers=headers, timeout=timeout
    )
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
    url, headers = _resolve("settle", facilitator_url)
    resp = httpx.post(
        url, json=_payload_for_settle(payment, requirements), headers=headers, timeout=timeout
    )
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
