# Skill: Uniswap V3 on Mantle (UNI grant deployment)

Uniswap V3 **is** officially deployed on Mantle (Uniswap DAO $250K UNI grant).
For Uniswap pools specifically, **standard V3 tick math applies** (ticks,
`sqrtPriceX96`, `feeGrowthInside`, ERC-721 positions via the NPM) — unlike
Merchant Moe. Use this brief only for genuine Uniswap-V3-style pools.

## Bug patterns to detect (beyond Tier 1)

- `mint`/`increaseLiquidity` with no `amount0Min`/`amount1Min` and/or no
  `deadline` — frontrun-mintable / sandwichable LP.
- Missing tick-spacing validation; ticks not aligned to the pool's spacing.
- Fee-tier misread (assuming a single fee tier; pools exist at 0.05/0.3/1%).
- Rebalancing logic that mishandles in-range vs out-of-range fee accrual, or
  reads `slot0.sqrtPriceX96` as a manipulable spot oracle (no TWAP).
- Assuming a position NFT is fungible / value == liquidity without fees owed.

Agni Finance: likely V3-style but **unconfirmed source** — if a target is Agni,
reason from these V3 patterns but flag the uncertainty rather than asserting.

## Reference

- Uniswap V3 on Mantle RFC:
  https://gov.uniswap.org/t/rfc-deploy-uniswap-v3-on-mantle-network/24193 — docs/resources.md §2.6
