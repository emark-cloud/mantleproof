# Skill: USDY / mUSD — Ondo RWA

USDY is Ondo's tokenized short-term US Treasuries note; **mUSD** is `rUSDY` —
the *rebasing* wrapper pegged to $1 (balance grows; price fixed). They are
distinct instruments, **not 1:1 fungible**. Pricing is the Ondo
`RWADynamicRateOracle`, which accrues continuously:
`currentPrice = (Range.dailyInterestRate ** (daysElapsed + 1)) * Range.lastSetPrice`.
Transfers route through `beforeTransfer(address,address,uint256)`, which
enforces a **blocklist** and can revert.

## Bug patterns to detect (beyond Tier 1)

- A USDY/mUSD balance read once and reused after any state transition — misses
  rebase accrual between read and use (mUSD especially: it rebases).
- Pricing USDY via a generic spot feed (`latestAnswer`/`latestRoundData`)
  instead of `RWADynamicRateOracle` — undervalues continuously-accruing USDY.
- Treating `usdyAmount == mUSDAmount` or swapping them at par with no rate.
- Integration bricked by a `beforeTransfer` blocklist revert with no
  try/catch or graceful path (locked funds / failed settlement).
- Assuming USDY redemption/transfer is permissionless or instantaneous.

## Reference

- Ondo Mantle integration: https://docs.ondo.finance/developer-guides/mantle-integration-guidelines
- `USDY.sol`, `rUSDY.sol` (= mUSD), `RWADynamicRateOracle.sol` — docs/resources.md §2.1
