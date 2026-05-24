"""Pure tests for the on-chain audit decoder (T7).

The live web3 path is unverifiable in CI (needs a real RPC + deployed registry);
the decode + enum-mapping logic is what we can lock down here. Live readback is
exercised by ``scripts/smoke_get_audit_mainnet.py`` outside CI.
"""

from __future__ import annotations

import pytest

from mantleproof.checks.base import Severity
from mantleproof.persistence.registry_reader import (
    decode_audit_tuple,
    severity_from_uint8,
)

ZERO_HASH = b"\x00" * 32
TARGET = "0x1892F77E335C133CE4A7b28555F13Ba74cBb76FA"


def test_severity_from_uint8_round_trip():
    assert severity_from_uint8(0) is Severity.INFO
    assert severity_from_uint8(1) is Severity.LOW
    assert severity_from_uint8(2) is Severity.MEDIUM
    assert severity_from_uint8(3) is Severity.HIGH


def test_severity_from_uint8_rejects_unknown():
    with pytest.raises(ValueError):
        severity_from_uint8(4)


def test_decode_audit_tuple_happy_path():
    # Post-T43: Report tuple gains a trailing `tier` uint8.
    raw = (
        bytes.fromhex("6a69e7d4" + "00" * 28),  # arbitrary non-zero rootHash
        3,  # High
        "bafkreibjhgewce",
        1_716_000_000,
        "0x9f17b625902B0d35a02fd790aF45cf95e9F4638a",
        2,  # tier
    )
    audit = decode_audit_tuple(TARGET, raw, audit_count=1)
    assert audit is not None
    assert audit.target == TARGET
    assert audit.root_hash.startswith("0x6a69e7d4")
    assert audit.severity is Severity.HIGH
    assert audit.ipfs_cid == "bafkreibjhgewce"
    assert audit.timestamp == 1_716_000_000
    assert audit.submitter == "0x9f17b625902B0d35a02fd790aF45cf95e9F4638a"
    assert audit.audit_count == 1
    assert audit.tier == 2


def test_decode_audit_tuple_zero_hash_returns_none():
    """Some web3 providers return zeros instead of reverting UnknownTarget."""
    raw = (ZERO_HASH, 0, "", 0, "0x" + "00" * 20, 0)
    assert decode_audit_tuple(TARGET, raw, audit_count=0) is None
