"""GET /api/audit/{address} — public on-chain readback + IPFS report fetch (T7).

Reads the latest anchored audit for ``address`` from ``MantleProofRegistry`` and
joins it with the IPFS-pinned report whose keccak is that audit's rootHash. The
returned JSON shape is the canonical product contract shared by:

- ``frontend/`` (Bloomberg dashboard, ``/contract/:address`` page)
- ``mcp-server/`` (the ``getAudit`` MCP tool)
- ``mcp-server/`` + x402 (the paid ``requestAudit`` tool reuses the schema)

Honest failure modes:

- never audited → 404 + ``{"audited": false}``
- anchor present, IPFS unfetchable → 200 with ``report: null`` + ``ipfs_error``
- anchor present, IPFS fetched but keccak mismatch → 200 with ``integrity: {
  match: false, recomputed_root_hash: ... }`` — surfaced, never hidden.

The handler accepts a ``reader`` and ``fetcher`` injection for offline testing;
defaults wire ``read_audit`` + ``fetch_report``.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import asdict
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from web3 import Web3

from mantleproof.persistence.ipfs_fetch import ReportFetchResult, fetch_report
from mantleproof.persistence.registry_reader import OnChainAudit, read_audit
from mantleproof.triage.store import ReceiptStore, X402ReceiptRow

router = APIRouter()

# Public block-explorer base — used only to embed a clickable tx link in the
# response; never to fetch chain state (that goes through the RPC + reader).
_EXPLORER_BY_CHAIN: dict[int, str] = {
    5000: "https://mantlescan.xyz",
    5003: "https://sepolia.mantlescan.xyz",
}


ReaderFn = Callable[[str], OnChainAudit | None]
FetcherFn = Callable[[str, str], ReportFetchResult]
ReceiptLookupFn = Callable[[str], X402ReceiptRow | None]


def _default_load_receipt(root_hash: str) -> X402ReceiptRow | None:
    """Default: read from the on-disk ReceiptStore. Monkeypatchable in tests."""
    return ReceiptStore().find_by_root_hash(root_hash)


def _explorer_address(chain_id: int, address: str) -> str:
    base = _EXPLORER_BY_CHAIN.get(chain_id, "")
    return f"{base}/address/{address}" if base else ""


def _normalize_address(raw: str) -> str:
    """Pure: validate + checksum the input address. Raises ``ValueError`` if bad."""
    if not Web3.is_address(raw):
        raise ValueError(f"invalid address: {raw!r}")
    return Web3.to_checksum_address(raw)


def build_audit_response(
    address: str,
    *,
    chain_id: int,
    audit: OnChainAudit,
    fetch: ReportFetchResult | None,
    ipfs_error: str | None = None,
    x402_receipt: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Pure: assemble the public ``/api/audit`` JSON from the on-chain + IPFS pieces.

    Shape is stable — MCP server + frontend consume it directly. ``x402`` is
    always present; ``None`` when no paid-audit receipt matches this rootHash.
    """
    integrity: dict[str, Any] = {
        "expected_root_hash": audit.root_hash,
        "recomputed_root_hash": fetch.recomputed_root_hash if fetch else None,
        "match": fetch.match if fetch else None,
    }
    return {
        "audited": True,
        "target": address,
        "chain_id": chain_id,
        "anchor": {
            "root_hash": audit.root_hash,
            "severity_uint8": {"info": 0, "low": 1, "medium": 2, "high": 3}[
                audit.severity.value
            ],
            "severity": audit.severity.value,
            "ipfs_cid": audit.ipfs_cid,
            "ipfs_uri": (
                audit.ipfs_cid
                if audit.ipfs_cid.startswith("ipfs://")
                else f"ipfs://{audit.ipfs_cid}"
            ),
            "timestamp": audit.timestamp,
            "submitter": audit.submitter,
            "audit_count": audit.audit_count,
        },
        "integrity": integrity,
        "report": fetch.report if fetch else None,
        "ipfs_error": ipfs_error,
        "explorer": {
            "target": _explorer_address(chain_id, address),
        },
        "x402": x402_receipt,
    }


@router.get("/api/audit/{address}")
async def get_audit(
    address: str,
    reader: ReaderFn | None = None,
    fetcher: FetcherFn | None = None,
    receipt_loader: ReceiptLookupFn | None = None,
) -> dict[str, Any]:
    try:
        target = _normalize_address(address)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None

    from mantleproof.settings import get_settings

    chain_id = get_settings().chain_id
    read = reader or read_audit
    audit = read(target)
    if audit is None:
        # Honest 404 — never invent a placeholder anchor.
        raise HTTPException(
            status_code=404,
            detail={
                "audited": False,
                "target": target,
                "chain_id": chain_id,
                "reason": "no on-chain audit anchored for this target",
            },
        )

    fetch_fn = fetcher or fetch_report
    fetch_result: ReportFetchResult | None = None
    ipfs_error: str | None = None
    try:
        fetch_result = fetch_fn(audit.ipfs_cid, audit.root_hash)
    except (httpx.HTTPError, RuntimeError) as exc:
        # Surface honestly; the on-chain anchor is still authoritative.
        ipfs_error = f"{type(exc).__name__}: {exc}"

    # Attach the x402 paid-audit receipt if one was recorded for this exact
    # rootHash. Best-effort: a corrupt/missing store file never breaks
    # /api/audit — the on-chain audit is authoritative on its own.
    load_receipt = receipt_loader or _default_load_receipt
    x402_receipt: dict[str, Any] | None = None
    try:
        row = load_receipt(audit.root_hash)
        if row is not None:
            x402_receipt = asdict(row)
    except Exception:  # noqa: BLE001 — corrupt store must not break /api/audit
        x402_receipt = None

    return build_audit_response(
        target,
        chain_id=chain_id,
        audit=audit,
        fetch=fetch_result,
        ipfs_error=ipfs_error,
        x402_receipt=x402_receipt,
    )
