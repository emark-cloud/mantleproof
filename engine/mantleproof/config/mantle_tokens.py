"""Per-network token address maps.

CRITICAL (CLAUDE.md): network-keyed, NOT flat constants. The five checks target
REAL mainnet protocol contracts even while the engine/our contracts run on
Sepolia — the source resolver reads mainnet target source independent of the
anchor chain.

The 5000 column is a build-time, human-verified artifact (T2, resolved
2026-05-19). Every address below was sourced from the protocol's official docs
AND independently verified on-chain via eth_call: `symbol()`, `name()`,
`decimals()` returned the expected values and each address has contract
bytecode. Sources: Ondo (docs.ondo.finance/addresses), Mantle mETH
(docs.mantle.xyz/meth), Ethena (docs.ethena.fi/solution-design/key-addresses),
USDT0 (docs.usdt0.to). 5003 (Sepolia) is intentionally None — these protocol
tokens are mainnet-only; testnet audit targets are still resolved against 5000.
"""

from __future__ import annotations

# chainId -> symbol -> address. None = not deployed on that chain / N/A.
TOKENS: dict[int, dict[str, str | None]] = {
    5000: {  # Mantle mainnet — verified on-chain 2026-05-19
        "USDY": "0x5bE26527e817998A7206475496fDE1E68957c5A6",
        "mUSD": "0xab575258d37EaA5C8956EfABe71F4eE8F6397cF3",
        "mETH_L2": "0xcDA86A272531e8640cD7F1a92c01839911B90bb0",
        "cmETH": "0xE6829d9a7eE3040e1276Fa75293Bde931859e8fA",
        "USDe": "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34",
        "sUSDe": "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2",
        "USDT0": "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
        "MOE": "0x4515A45337F461A11Ff0FE8aBF3c606AE5dC00c9",
    },
    5003: {  # Mantle Sepolia — protocol tokens are mainnet-only
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

# ERC-20 decimals() as read on-chain. USDT0 = 6 (USDT standard); the rest 18.
# NOTE: USDe/sUSDe report `sharedDecimals=6` as a LayerZero-OFT cross-chain
# param — their ERC-20 decimals() is 18 (verified on-chain). Accounting checks
# must use these, not the OFT param.
TOKEN_DECIMALS: dict[str, int] = {
    "USDY": 18,
    "mUSD": 18,  # rebasing (Ondo rUSDY-equivalent on Mantle) — snapshot bug surface
    "mETH_L2": 18,  # bridged L2 repr; accrues via exchange rate, not balance
    "cmETH": 18,  # restaked variant — different oracle/risk; flag mETH conflation
    "USDe": 18,
    "sUSDe": 18,  # 7-day cooldown on redemption
    "USDT0": 6,
    "MOE": 18,
}

# Known transparent-proxy implementations (for source resolution / provenance).
TOKEN_IMPL: dict[str, str] = {
    "USDY": "0x3b355A7A25E75A320f631F9736afB3Dcc9F3Ef66",
    "mUSD": "0x907D8399d13cee098cef486a8427933aac7e6271",
}

# mETH canonical staking is on Ethereum L1 (docs/resources.md §2.2), not Mantle.
# Pin so meth_check can flag L1/L2 conflation.
METH_L1_STAKING = "0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa"


def tokens_for(chain_id: int) -> dict[str, str | None]:
    if chain_id not in TOKENS:
        raise KeyError(f"No token map for chainId {chain_id}")
    return TOKENS[chain_id]


def address(symbol: str, chain_id: int = 5000) -> str:
    """Resolve a verified token address or raise (no silent None)."""
    addr = tokens_for(chain_id).get(symbol)
    if not addr:
        raise KeyError(f"{symbol} has no pinned address on chainId {chain_id}")
    return addr
