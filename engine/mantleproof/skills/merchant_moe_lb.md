# Skill: Merchant Moe — Liquidity Book v2.2

Merchant Moe is **Liquidity Book v2.2** (Trader Joe / LFJ fork), **NOT**
Uniswap V3. Semantics differ fundamentally:

- Discrete **bins**, not ticks; **constant-sum** (x + y = k) *within* a bin.
- LP positions are **ERC-1155** (per-bin id), not ERC-721.
- **Variable fee** = base + surge driven by a **volatility accumulator** — not
  a static fee tier.
- Fees pay out **per swap**, not per tick-crossing (no V3 `feeGrowthInside`).
- First-ever LB hook "Concentrated Incentives" (Mantle-native).

## Bug patterns to detect (beyond Tier 1)

- Mint/burn into bins without validating bin id against the active bin / bin
  step bounds — positions misassigned, JIT-frontrunnable.
- Reading a static fee (or porting a V3 fee-tier assumption) — LB fee is
  dynamic; quotes/accounting come out wrong under volatility.
- V3-style `feeGrowthInside`/tick-cumulative accounting applied to an LB pool.
- ERC-1155 transfer/`onERC1155Received` hooks that ignore LB position
  semantics (treating an LP id like an ERC-721 token).
- Concentrated-Incentives range misconfigured so rewards sit where the active
  bin can never reach.

## Reference

- Docs: https://docs.merchantmoe.com/ · differences vs V3:
  https://docs.merchantmoe.com/liquidity-book/introduction-to-liquidity-book/differences-to-uniswap-v3
- Source: https://github.com/merchant-moe — docs/resources.md §2.4
