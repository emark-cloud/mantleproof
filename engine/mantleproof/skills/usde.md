# Skill: USDe / sUSDe — Ethena

USDe is Ethena's **synthetic dollar** (delta-hedged, *not* a hard $1 peg),
bridged to Mantle as a wrapped token. **sUSDe** is staked USDe (ERC-4626) with
a **~7-day cooldown** on redemption: `cooldownShares`/`cooldownAssets` then
`unstake` after the cooldown — funds are NOT available synchronously.
sUSDe↔USDe is **not 1:1**; it accrues via `convertToAssets`/`previewRedeem`.

## Bug patterns to detect (beyond Tier 1)

- A vault/redeemer that calls sUSDe redeem/withdraw and expects USDe in the
  same tx — the cooldown bricks it during volatility (exactly when it matters).
- `usdeAmount == sUSDeAmount` or par conversion with no ERC-4626 rate call.
- USDe treated as a guaranteed $1 (hardcoded 1e18 price, no oracle) — no
  depeg handling; collateral math breaks on a depeg.
- Liquidation/withdrawal paths whose liveness assumes instant sUSDe exit.
- Ignoring that the cooldown duration is governance-settable (could change).

## Reference

- Ethena docs: https://docs.ethena.fi/ — docs/resources.md §2.3
