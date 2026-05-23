"""POST /x402/audit/{address} — x402-gated Tier-2 audit (T11).

Cross-chain by design (CLAUDE.md):
  payment leg : USDC on **Base** (eip155:8453), via x402.org facilitator
  audit leg   : anchored on **Mantle** (eip155:5000) by the engine's oracle signer

Both txHashes appear in every 200 response.

Protocol (x402 v1):
  1. Client POSTs without ``X-PAYMENT`` → 402 with payment requirements.
  2. Client signs an EIP-3009 ``transferWithAuthorization`` for the exact
     amount/asset/recipient (no on-chain step yet — it's a gasless signed auth).
  3. Client retries with ``X-PAYMENT: base64(json(PaymentPayload))``.
  4. Server calls facilitator ``/verify`` (cheap).
  5. On verified, server runs the full audit pipeline (Tier-1 + Tier-2 + guard
     + IPFS pin + Mantle anchor).
  6. Server calls facilitator ``/settle`` (broadcasts the Base tx).
  7. Server returns 200 with the canonical audit envelope **plus** an ``x402``
     block carrying ``payment_tx`` (Base) and the anchor_tx (Mantle).

Order is deliberate per x402 v1: verify-before, settle-after. A settlement
failure after the audit anchored is surfaced honestly (``x402.settle_error``);
the audit is already on-chain and the user can read it for free via
``/api/audit/{address}``.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from mantleproof.api.routes_audit import _normalize_address
from mantleproof.triage.store import ReceiptStore, X402ReceiptRow
from mantleproof.x402.builder import build_402_body
from mantleproof.x402.facilitator import (
    SettleResult,
    VerifyResult,
    settle,
    verify,
)
from mantleproof.x402.parser import parse_payment_header
from mantleproof.x402.types import PaymentPayload, PaymentRequirements

router = APIRouter()

# Pipeline runner is a callable so tests can inject a fake; default wires the
# real ``run_audit`` with the live source/Gemini/IPFS/anchor stack.
PipelineFn = Callable[[str], dict[str, Any]]
VerifyFn = Callable[[PaymentPayload, PaymentRequirements], VerifyResult]
SettleFn = Callable[[PaymentPayload, PaymentRequirements], SettleResult]
# Persist the cross-chain receipt so the frontend's /api/audit envelope can
# show who funded the audit. Best-effort; never breaks the 200.
RecordFn = Callable[[str, dict[str, Any], dict[str, Any]], None]


def _normalize_tx(h: str | None) -> str | None:
    """Pure: lowercase + ``0x``-prefix any tx hash for stable matching.
    Pipeline ``anchor_tx`` arrives raw-hex (no prefix); the facilitator's
    ``payment_tx`` arrives prefixed — both go in as ``0x``-lowercase."""
    if not h:
        return None
    s = h.lower()
    return s if s.startswith("0x") else "0x" + s


def _default_record_receipt(
    target: str, audit: dict[str, Any], x402_block: dict[str, Any]
) -> None:
    """Persist a paid-audit receipt mirroring the wire ``x402_block``.

    Pure-ish (one disk write via ReceiptStore). Wired by default; tests
    monkeypatch this name to inject a tmp data_dir or assert the call.
    """
    row = X402ReceiptRow(
        root_hash=str(audit.get("root_hash") or "").lower(),
        target=target,
        payer=x402_block.get("payer"),
        payment_chain=str(x402_block.get("payment_chain") or "base"),
        payment_chain_id=int(x402_block.get("payment_chain_id") or 0),
        payment_tx=_normalize_tx(x402_block.get("payment_tx")),
        anchor_chain=str(x402_block.get("anchor_chain") or "mantle"),
        anchor_chain_id=int(x402_block.get("anchor_chain_id") or 0),
        anchor_tx=_normalize_tx(x402_block.get("anchor_tx")),
        amount_base_units=str(x402_block.get("amount_base_units") or ""),
        asset=str(x402_block.get("asset") or ""),
        severity=str(audit.get("severity") or ""),
        settle_error=x402_block.get("settle_error"),
        recorded_at=int(time.time()),
    )
    ReceiptStore().record(row)


def _default_run_pipeline(target: str) -> dict[str, Any]:
    """Live default: run the engine's full Tier-2 pipeline against ``target``."""
    from mantleproof.pipeline import run_audit
    from mantleproof.settings import get_settings

    return run_audit(target, tier=2, chain_id=get_settings().chain_id)


def _build_402(target: str, resource_path: str) -> JSONResponse:
    """Compose the 402 response. ``pay_to`` honestly reports the env value (may
    be empty during local dev — the client sees that and knows to configure)."""
    from mantleproof.settings import get_settings

    pay_to = get_settings().x402_payto_address or ""
    body = build_402_body(target=target, pay_to=pay_to, resource_path=resource_path).to_dict()
    if not pay_to:
        body["error"] = (
            "x402 paywall not configured: X402_PAYTO_ADDRESS is unset on this "
            "deployment. The 402 body still describes the protocol; set the env "
            "var to receive payments."
        )
    return JSONResponse(status_code=402, content=body)


@router.post("/x402/audit/{address}")
async def x402_audit(
    address: str,
    request: Request,
    run_pipeline: PipelineFn | None = None,
    verify_fn: VerifyFn | None = None,
    settle_fn: SettleFn | None = None,
    record_fn: RecordFn | None = None,
) -> Any:
    try:
        target = _normalize_address(address)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None

    resource_path = str(request.url.path)
    payment_header = request.headers.get("x-payment")

    # 1. No payment → 402 with the protocol body.
    if not payment_header:
        return _build_402(target, resource_path)

    # 2. Parse the client's payload (cheap rejection of malformed inputs).
    payment, parse_error = parse_payment_header(payment_header)
    if payment is None:
        body = build_402_body(
            target=target,
            pay_to="",  # filled below
            resource_path=resource_path,
            error=parse_error or "X-PAYMENT header invalid",
        ).to_dict()
        from mantleproof.settings import get_settings

        body["accepts"][0]["payTo"] = get_settings().x402_payto_address or ""
        return JSONResponse(status_code=402, content=body)

    # Rebuild the requirements we expect the client to have signed against.
    from mantleproof.settings import get_settings

    pay_to = get_settings().x402_payto_address
    if not pay_to:
        raise HTTPException(
            status_code=503,
            detail=(
                "x402 paywall not configured: X402_PAYTO_ADDRESS is unset. "
                "Cannot accept payments."
            ),
        )
    from mantleproof.x402.builder import build_payment_requirements

    requirements = build_payment_requirements(
        target=target, pay_to=pay_to, resource_path=resource_path
    )

    # 3. Facilitator verify — cheap, no chain write.
    verify_call = verify_fn or verify
    try:
        v = verify_call(payment, requirements)
    except Exception as exc:  # noqa: BLE001 — facilitator outage is a 502
        raise HTTPException(
            status_code=502, detail=f"facilitator /verify failed: {exc}"
        ) from None
    if not v.is_valid:
        return JSONResponse(
            status_code=402,
            content={
                "x402Version": 1,
                "error": f"payment not valid: {v.invalid_reason or 'unknown'}",
                "accepts": [requirements.to_dict()],
                "verify": v.raw,
            },
        )

    # 4. Run the protected resource — the full audit pipeline. Mantle anchor
    #    happens inside ``run_audit``; we receive ``anchor_tx`` in the report.
    runner = run_pipeline or _default_run_pipeline
    try:
        audit = runner(target)
    except Exception as exc:  # noqa: BLE001 — pipeline failure is a 500
        # Audit failed AFTER verify succeeded but BEFORE settle. The signed
        # authorization expires unused (validBefore is short by spec). The
        # user is NOT charged. Surface honestly.
        raise HTTPException(
            status_code=500,
            detail={
                "error": f"audit pipeline failed: {exc}",
                "note": "payment was verified but not settled; the EIP-3009 "
                "authorization will expire unused.",
            },
        ) from None

    # 5. Facilitator settle — Base tx broadcast.
    settle_call = settle_fn or settle
    settle_error: str | None = None
    settle_tx: str | None = None
    settle_payer: str | None = v.payer
    try:
        s = settle_call(payment, requirements)
        if s.success:
            settle_tx = s.transaction
            settle_payer = s.payer or settle_payer
        else:
            settle_error = s.error_reason or "facilitator returned success=false"
    except Exception as exc:  # noqa: BLE001
        # Audit IS anchored on Mantle; settlement broke. Don't fail the
        # request — the user still gets the audit (and could re-call /settle).
        settle_error = f"facilitator /settle threw: {exc}"

    # 6. Compose the cross-chain envelope. Anchor tx comes from the pipeline.
    x402_block: dict[str, Any] = {
        "payment_chain": "base",
        "payment_chain_id": 8453,
        "payment_tx": settle_tx,  # nullable when settle_error is set
        "anchor_chain": "mantle",
        "anchor_chain_id": audit.get("chain_id"),
        "anchor_tx": audit.get("anchor_tx"),
        "amount_base_units": requirements.maxAmountRequired,
        "asset": requirements.asset,
        "payer": settle_payer,
        "settle_error": settle_error,
    }
    response: dict[str, Any] = {
        "audited": True,
        "target": target,
        "audit": audit,
        "x402": x402_block,
    }

    # 6b. Persist the receipt so /api/audit can surface who funded the audit.
    # Best-effort: a store-write failure must NOT break the 200 — the audit
    # is anchored on chain regardless, and the receipt can always be
    # re-derived from the live response.
    recorder = record_fn or _default_record_receipt
    try:
        recorder(target, audit, x402_block)
    except Exception as exc:  # noqa: BLE001 — never break the paid 200
        logging.getLogger(__name__).warning(
            "x402 receipt persist failed (audit still anchored): %s", exc
        )

    if settle_tx:
        return JSONResponse(
            status_code=200,
            content=response,
            headers={
                "X-PAYMENT-RESPONSE": (
                    f"network=base;tx={settle_tx};payer={settle_payer or 'unknown'}"
                )
            },
        )
    # No settle tx — return 200 anyway (audit is anchored), settle_error in body.
    return JSONResponse(status_code=200, content=response)
