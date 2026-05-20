"""IPFS gateway fetch + rootHash verification (T7).

Counterpart of ``persistence/ipfs.py`` (the Pinata writer). This is the **public
read** path: any caller can fetch the audit JSON by CID and recompute the
keccak256 of its canonical form. That recomputed hash must equal the rootHash
anchored on-chain — that's the credibility loop.

``canonicalize`` and ``verify_root_hash`` are pure (unit-tested); ``fetch_report``
does the live HTTP and is the only network seam.

CLAUDE.md invariant: never anchor a rootHash whose JSON is unfetchable. The
mirror invariant here is *never claim integrity we did not verify*: if the
report's hash does not match the on-chain rootHash, ``ReportFetchResult.match``
is False and the route surfaces that publicly rather than silently trusting
either side.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx
from web3 import Web3

from mantleproof.settings import get_settings

# Keys that must be stripped before recomputing the rootHash — they are added
# AFTER the canonical preimage is sealed (see pipeline.build_report).
_NON_PREIMAGE_KEYS = {"root_hash", "ipfs_cid", "ipfs_uri", "anchor_tx"}


@dataclass(frozen=True)
class ReportFetchResult:
    """The fetched report + integrity verdict."""

    cid: str
    report: dict[str, Any]
    recomputed_root_hash: str  # 0x-prefixed hex
    match: bool  # recomputed == expected; surfaced publicly when False


def canonicalize(report: dict[str, Any]) -> str:
    """Pure: produce the rootHash preimage from a fetched report.

    Strips the post-hash fields (``root_hash``, ``ipfs_cid``, ``ipfs_uri``,
    ``anchor_tx``) so the JSON we hash is exactly the one ``pipeline.build_report``
    hashed before it added them.
    """
    preimage = {k: v for k, v in report.items() if k not in _NON_PREIMAGE_KEYS}
    return json.dumps(preimage, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def verify_root_hash(report: dict[str, Any], expected_root_hash: str) -> tuple[str, bool]:
    """Pure: recompute keccak(canonical(report)) and compare to expected.

    Returns ``(recomputed_hex, match)``. ``expected_root_hash`` is the
    0x-prefixed hex string from on-chain; case is normalised before compare.
    """
    recomputed_bytes = bytes(Web3.keccak(text=canonicalize(report)))
    recomputed_hex = "0x" + recomputed_bytes.hex()
    expected_norm = expected_root_hash.lower()
    if not expected_norm.startswith("0x"):
        expected_norm = "0x" + expected_norm
    return recomputed_hex, recomputed_hex.lower() == expected_norm


def _gateway_url(cid: str, gateway: str) -> str:
    """Pure: build the gateway URL for a CID (accepts ``ipfs://`` prefix)."""
    if cid.startswith("ipfs://"):
        cid = cid[len("ipfs://"):]
    if not gateway.endswith("/"):
        gateway = gateway + "/"
    return f"{gateway}{cid}"


def fetch_report(
    cid: str,
    expected_root_hash: str,
    *,
    gateway: str | None = None,
    timeout: float = 20.0,
) -> ReportFetchResult:
    """Live: GET the report JSON from the IPFS gateway + verify its rootHash.

    Returns the report regardless of match — the caller decides how to surface
    a mismatch (the design is: tell the user honestly, never hide it). Raises
    only on hard transport / JSON-decode failure (no audit data at all).
    """
    gateway = gateway or get_settings().ipfs_gateway
    url = _gateway_url(cid, gateway)
    resp = httpx.get(url, timeout=timeout)
    resp.raise_for_status()
    report = resp.json()
    if not isinstance(report, dict):
        raise RuntimeError(f"IPFS payload is not a JSON object: {type(report).__name__}")
    recomputed, match = verify_root_hash(report, expected_root_hash)
    return ReportFetchResult(
        cid=cid.removeprefix("ipfs://"),
        report=report,
        recomputed_root_hash=recomputed,
        match=match,
    )
