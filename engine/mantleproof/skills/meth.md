# Skill: mETH — Mantle LSP (L1 canonical, L2 bridged)

mETH is Mantle's liquid-staked ETH. **Canonical Staking + Oracle live on
Ethereum L1** (`0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa`); on Mantle L2 mETH
is a **bridged wrapped representation**. Value accrues via an **exchange rate**
(mETH→ETH), *not* via balance changes. `cmETH` is the **restaked** variant —
different oracle, different risk; never substitutable for mETH at par. Since
Oct 2025 redemption routes through a **Liquidity Buffer (Aave)**, not only the
Validator Queue.

## Bug patterns to detect (beyond Tier 1)

- Proportional balance accounting (`mETH.balanceOf(x) / totalSupply * X`) —
  wrong: mETH yield is in the exchange rate, not the balance.
- Any mETH valuation that never reads an exchange rate / Oracle (stale or
  1:1 ETH assumption).
- Treating L2 bridged mETH as having L1 liveness — bridge lag means an L2 read
  can diverge from L1 truth; time-sensitive logic is unsafe.
- Redemption logic that assumes Validator-Queue exit timing and ignores the
  Aave Liquidity Buffer route (post-2025-10).
- mETH and cmETH used interchangeably (shared oracle/price path).

## Reference

- mETH docs: https://docs.mantle.xyz/meth · exchange rate:
  https://docs.mantle.xyz/meth/concepts/risk-management/exchange-rate
- Source: https://github.com/mantle-lsp/contracts — docs/resources.md §2.2
