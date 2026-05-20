"""Pure tests for canonicalize + verify_root_hash (T7).

Mirrors ``pipeline.compute_root_hash`` — the rootHash recomputed here is the
*same* hash the engine anchored on-chain, byte-for-byte. If these tests drift
from ``pipeline._canonical``, the credibility loop breaks.
"""

from __future__ import annotations

from web3 import Web3

from mantleproof.persistence.ipfs_fetch import (
    _gateway_url,
    canonicalize,
    verify_root_hash,
)


def _report_with_extras() -> dict:
    """Report after the pipeline added post-hash fields — what IPFS would return."""
    return {
        "schema": "mantleproof/audit/v1",
        "target": "0x1892F77E335C133CE4A7b28555F13Ba74cBb76FA",
        "chain_id": 5000,
        "tier": 2,
        "severity": "high",
        "summary": "1 high",
        "findings": [],
        "generated_at": "2026-05-20T12:00:00+00:00",
        # post-hash additions:
        "root_hash": "0xdeadbeef",
        "ipfs_cid": "bafkreitest",
        "ipfs_uri": "ipfs://bafkreitest",
        "anchor_tx": "0xabc",
    }


def test_canonicalize_strips_post_hash_fields():
    report = _report_with_extras()
    canon = canonicalize(report)
    # The preimage MUST NOT contain any of the post-hash keys.
    assert "root_hash" not in canon
    assert "ipfs_cid" not in canon
    assert "ipfs_uri" not in canon
    assert "anchor_tx" not in canon
    # And it MUST contain the original sealed fields.
    assert '"schema":"mantleproof/audit/v1"' in canon
    assert '"target":"0x1892F77E335C133CE4A7b28555F13Ba74cBb76FA"' in canon


def test_canonicalize_is_deterministic():
    report = _report_with_extras()
    assert canonicalize(report) == canonicalize(report)


def test_verify_root_hash_match():
    report = _report_with_extras()
    canon = canonicalize(report)
    expected = "0x" + Web3.keccak(text=canon).hex()
    recomputed, match = verify_root_hash(report, expected)
    assert match is True
    assert recomputed == expected


def test_verify_root_hash_mismatch_surfaced():
    report = _report_with_extras()
    bogus = "0x" + "11" * 32
    recomputed, match = verify_root_hash(report, bogus)
    assert match is False
    assert recomputed != bogus
    # Mismatch must be returned, not raised — the route surfaces it publicly.


def test_verify_root_hash_case_insensitive():
    report = _report_with_extras()
    canon = canonicalize(report)
    expected_lower = "0x" + Web3.keccak(text=canon).hex().lower()
    expected_mixed = expected_lower.upper().replace("0X", "0x")  # mixed case
    _, match = verify_root_hash(report, expected_mixed)
    assert match is True


def test_gateway_url_strips_ipfs_prefix():
    assert _gateway_url("ipfs://bafkrei", "https://gw.example/ipfs/") == (
        "https://gw.example/ipfs/bafkrei"
    )


def test_gateway_url_ensures_trailing_slash():
    assert _gateway_url("bafkrei", "https://gw.example/ipfs") == (
        "https://gw.example/ipfs/bafkrei"
    )
