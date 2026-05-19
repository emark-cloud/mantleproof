"""T2 — pinned Mantle mainnet token addresses are present and well-formed."""

import re

import pytest

from mantleproof.config.mantle_tokens import (
    TOKEN_DECIMALS,
    address,
    tokens_for,
)

SYMS = ["USDY", "mUSD", "mETH_L2", "cmETH", "USDe", "sUSDe", "USDT0", "MOE"]


def test_all_mainnet_addresses_pinned_and_wellformed():
    m = tokens_for(5000)
    for s in SYMS:
        assert m[s] is not None, f"{s} not pinned on mainnet"
        assert re.fullmatch(r"0x[0-9a-fA-F]{40}", m[s]), f"{s} malformed"
    assert address("MOE") == "0x4515A45337F461A11Ff0FE8aBF3c606AE5dC00c9"


def test_sepolia_is_none_and_decimals_consistent():
    assert all(v is None for v in tokens_for(5003).values())
    assert TOKEN_DECIMALS["USDT0"] == 6
    assert TOKEN_DECIMALS["USDe"] == 18  # ERC-20 decimals, not OFT sharedDecimals
    assert set(TOKEN_DECIMALS) == set(SYMS)


def test_address_raises_on_unknown():
    with pytest.raises(KeyError):
        address("MOE", 5003)  # not on testnet
    with pytest.raises(KeyError):
        address("NOPE")
