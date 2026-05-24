"""Unit tests for `mantleproof.staking.reader` — pure decode."""

from __future__ import annotations

from mantleproof.staking import reader


def test_decode_stake_tuple_happy_path():
    raw = (
        bytes.fromhex("aa" * 32),
        "0x" + "11" * 20,
        2 * 10**18,
        1_716_000_000,
        1_716_000_000 + 30 * 24 * 3600,
        reader.STATUS_LOCKED,
    )
    s = reader.decode_stake_tuple(raw)
    assert s is not None
    assert s.root_hash == "0x" + "aa" * 32
    assert s.amount == 2 * 10**18
    assert s.status == reader.STATUS_LOCKED
    assert s.unlocks_at - s.locked_at == 30 * 24 * 3600


def test_decode_stake_tuple_zero_root_returns_none():
    raw = (b"\x00" * 32, "0x" + "00" * 20, 0, 0, 0, 0)
    assert reader.decode_stake_tuple(raw) is None


def test_status_enum_constants():
    assert reader.STATUS_LOCKED == 0
    assert reader.STATUS_RELEASED == 1
    assert reader.STATUS_SLASHED_DISPUTE == 2
    assert reader.STATUS_SLASHED_EXPLOIT == 3  # reserved
