"""Per-network token address maps.

CRITICAL (CLAUDE.md): network-keyed, NOT flat constants. The five checks target
REAL mainnet protocol contracts even while the engine/our contracts run on
Sepolia — the source resolver reads mainnet target source via Mantlescan
independent of the anchor chain. The 5000 column is a build-time, human-verified
artifact (T2, Week 1, ~20-30 min on Mantlescan + each protocol's site). Do not
defer it. Addresses left ``None`` are unverified — verify before use.
"""

from __future__ import annotations

# chainId -> symbol -> address (checksummed). None = not yet verified / N/A.
TOKENS: dict[int, dict[str, str | None]] = {
    5000: {  # Mantle mainnet — the real audit targets (verify each in T2)
        "USDY": None,
        "mUSD": None,
        "mETH_L2": None,  # bridged wrapped representation (canonical staking is L1)
        "cmETH": None,  # restaked variant — different oracle/risk; flag conflation
        "USDe": None,
        "sUSDe": None,
        "USDT0": None,
        "MOE": "0x4515A45337F461A11Ff0FE8aBF3c606AE5dC00c9",  # Merchant Moe token
    },
    5003: {  # Mantle Sepolia — mostly None / our own test deployments
        "USDY": None,
        "mUSD": None,
        "mETH_L2": None,
        "cmETH": None,
        "USDe": None,
        "sUSDe": None,
        "USDT0": None,
        "MOE": None,
    },
}

# mETH canonical staking is on Ethereum L1 (docs/resources.md §2.2), not Mantle.
METH_L1_STAKING = "0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa"


def tokens_for(chain_id: int) -> dict[str, str | None]:
    if chain_id not in TOKENS:
        raise KeyError(f"No token map for chainId {chain_id}")
    return TOKENS[chain_id]
