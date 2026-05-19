# Tier-2 precision validation report (T19)

- Chain: Mantle mainnet (5000) · LLM: gemini-2.5-flash, gemini-2.5-pro
- Targets: 10 · resolved+verified: 9 · with ≥1 surviving finding: 9
- Tier-2 raw findings: 18 · hallucination-guard masked claims: 0 · label drops: 0
- Set = verified protocol contracts (NOT integrators): the correct,
  precise result is conservative — few/zero additional findings, and
  every emitted quantitative claim grounded or guard-masked.
- Pipeline path: run_tier2 → parse_findings → apply_guard (T18).

| Address | Contract | Model | T1 | T2 raw | Masked | Drops | Surviving |
|---|---|---|---|---|---|---|---|
| `0x5bE26527e817998A7206475496fDE1E68957c5A6` | USDYW | gemini-2.5-pro | 0 | 3 | 0 | 0 | 3 |
| `0xab575258d37EaA5C8956EfABe71F4eE8F6397cF3` | rUSDYW | gemini-2.5-pro | 0 | 3 | 0 | 0 | 3 |
| `0xcDA86A272531e8640cD7F1a92c01839911B90bb0` | METHL2 | gemini-2.5-pro | 0 | 2 | 0 | 0 | 2 |
| `0xE6829d9a7eE3040e1276Fa75293Bde931859e8fA` | L2cmETH | gemini-2.5-pro | 0 | 3 | 0 | 0 | 3 |
| `0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34` | USDeOFT | gemini-2.5-pro | 0 | 2 | 0 | 0 | 2 |
| `0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2` | StakedUSDeOFT | gemini-2.5-pro | 0 | 1 | 0 | 0 | 1 |
| `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` | TetherTokenOFTExtension | gemini-2.5-pro | 0 | 1 | 0 | 0 | 1 |
| `0x4515A45337F461A11Ff0FE8aBF3c606AE5dC00c9` | — | — | — | — | — | — | ❌ resolve: ReadTimeout: The read operation timed out |
| `0x3b355A7A25E75A320f631F9736afB3Dcc9F3Ef66` | USDYW | gemini-2.5-flash | 0 | 1 | 0 | 0 | 1 |
| `0x907D8399d13cee098cef486a8427933aac7e6271` | rUSDYW | gemini-2.5-pro | 0 | 2 | 0 | 0 | 2 |

## Surviving Tier-2 findings (post-guard)

### USDYW `0x5bE26527e817998A7206475496fDE1E68957c5A6`
- **HIGH** [VERIFIED]: The `_beforeTokenTransfer` hook at L2713 checks and blocks `msg.sender` for `transferFrom`-style calls (L2722). This allows the `LIST_CONFIGURER_ROLE` (L2669) to blocklist smart contracts, such as DEX routers or lending pools. A blocklisted contract would be unable to move any USDYW tokens, effectively freezing all user assets held by that protocol and creating a systemic risk for any integrated platform on Mantle.
- **HIGH** [VERIFIED]: The `burn(address, uint256)` function at L2745 allows any account with the `BURNER_ROLE` (L2671) to unilaterally destroy tokens from any arbitrary address. This function does not require user consent or an allowance, creating a powerful and centralized risk vector where a compromised or malicious role holder can permanently delete user funds.
- **MEDIUM** [VERIFIED]: The `initialize` function at L2680 fails to grant the `LIST_CONFIGURER_ROLE` (L2669) and `BURNER_ROLE` (L2671). Consequently, critical administrative functions like `setBlocklist` (L2694) and the admin `burn` (L2745) are unusable post-deployment until the `DEFAULT_ADMIN_ROLE` holder performs a separate transaction to grant these roles. This creates an operational risk where the contract may be deployed in a partially non-functional state.

### rUSDYW `0xab575258d37EaA5C8956EfABe71F4eE8F6397cF3`
- **MEDIUM** [COMPUTED]: Allowances are denominated in the rebasing `mUSD` token unit, not the underlying stable `shares` unit. As the price of the underlying USDY token accrues value over time, `oracle.getPrice()` (L2592) increases. A fixed `mUSD` allowance, as stored in the `allowances` mapping (L2586), will correspond to a progressively smaller number of shares, calculated via `getSharesByRUSDY` (L2892). This 'allowance decay' can cause integrations that rely on long-term approvals to fail, as the approved amount may become insufficient to perform the intended operation.
- **LOW** [COMPUTED]: The `unwrap` function at L2954 calculates the amount of underlying USDY to transfer by dividing the user's shares (`usdyAmount`) by `BPS_DENOMINATOR` (L2598), which is `10000`. Due to integer division at L2959, any remainder of shares is not returned to the user but is left in the contract as part of `totalShares` (L3094), effectively donating value to all other `mUSD` holders. A user can lose up to `9999` shares (worth nearly 1 USDY) on each `unwrap` call.
- **LOW** [VERIFIED]: The role constant `USDY_MANAGER_ROLE` is initialized with the hash of the string "ADMIN_ROLE" instead of "USDY_MANAGER_ROLE". This is misleading and can cause integration issues with systems that derive role hashes from role names, as well as developer confusion.

### METHL2 `0xcDA86A272531e8640cD7F1a92c01839911B90bb0`
- **MEDIUM** [VERIFIED]: The `forceMint` function at L4516 contains inverted logic for its `excludeBlockList` boolean parameter. When `excludeBlockList` is set to `true`, the function enforces the blocklist check (L4517-L4518), and when `false`, it bypasses it. This is counter-intuitive and prone to operator error. An operator with `MINTER_ROLE` (L4516) intending to bypass the blocklist for a legitimate reason would likely set the parameter to `true` and have the transaction unexpectedly fail. Conversely, setting it to `false` (the default for booleans) unintentionally bypasses this critical security check.
- **MEDIUM** [VERIFIED]: The `supportsInterface` function at L4566 incorrectly overrides the EIP-165 implementation from its parent contracts. It fails to call `super.supportsInterface` and does not manually list all implemented interfaces. As a result, the contract will incorrectly return `false` for standard interfaces it supports, including `IERC20Upgradeable`, `IERC20MetadataUpgradeable`, and `IERC20PermitUpgradeable`. This breaks the EIP-165 discovery mechanism, hindering composability with other protocols and tools that rely on it for feature detection, such as wallets checking for `permit` support.

### L2cmETH `0xE6829d9a7eE3040e1276Fa75293Bde931859e8fA`
- **HIGH** [VERIFIED]: The `L2cmETH` contract is a LayerZero Omnichain Fungible Token (OFT) that bridges cmETH to L2. As a liquid restaking token, cmETH is yield-bearing, with value accruing via a changing exchange rate. The contract's implementation as a standard OFT fails to account for this yield accrual. It mints and burns a fixed quantity of tokens (L5003, L1190), meaning L2 holders' balances remain static and do not increase as the underlying asset accrues value. This results in a direct loss of yield for any user holding `L2cmETH`. An `exchangeRate()` function is defined in the `IL2StatusRead` interface (L5058) which the contract has access to via its `status` variable (L4958), but this function is never called.
- **MEDIUM** [VERIFIED]: The contract's `initialize` function at L4937 fails to initialize its compliance-related parent contracts, `BlockListClientUpgradeable` and `SanctionsListClientUpgradeable`. It does not call their respective initializers, `__BlocklistClientInitializable_init` (L4709) and `__SanctionsListClientInitializable_init` (L4819). Consequently, the `blocklist` and `sanctionsList` addresses are not set on deployment and default to `address(0)`. The compliance checks within the `_update` function (L4971-L4994) are designed to be inert when these addresses are zero (L4770, L4879), effectively disabling all blocklist and sanctions list enforcement until a manager manually configures them post-deployment. This creates a window where the token can operate without its intended security and compliance mechanisms.
- **LOW** [VERIFIED]: The overridden `_update` function at L4971 uses `require` statements with string messages to enforce compliance checks (e.g., L4984, L4985). The inherited contracts `BlockListClientUpgradeable` and `SanctionsListClientUpgradeable` already provide more gas-efficient custom errors for this purpose: `BlockedAccount()` (L4685) and `SanctionedAccount()` (L4795). Using string-based reverts is contrary to modern Solidity best practices and incurs unnecessary gas costs on failed transactions.

### USDeOFT `0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34`
- **MEDIUM** [COMPUTED]: A large token transfer via the `send` function can be reverted due to a `uint64` overflow. The internal function `_toSD` at L2663 converts the 18-decimal `_amountLD` to a 6-decimal shared representation by dividing by `decimalConversionRate` (1e12, computed from L2385, L2413, and L3004) and casting the result to `uint64`. If the amount to be bridged exceeds approximately 18.44 trillion tokens (`(2**64-1) * 10**12`), the cast at L2664 will fail, reverting the transaction. This creates an implicit transfer limit that is not explicitly checked, leading to a potential denial-of-service for legitimate but very large transfers.
- **LOW** [COMPUTED]: The rate limiter's capacity replenishment calculation at L3463 suffers from precision loss due to integer division. The `decay` is calculated as `(_limit * timeSinceLastDeposit) / _window`. This causes the available capacity to be replenished in discrete steps rather than continuously as a linear decay model would imply. For example, if the `limit` is smaller than the `window`, no capacity will be restored for the first `floor(_window / _limit)` seconds after a transfer. This makes the rate limit more restrictive than configured.

### StakedUSDeOFT `0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2`
- **HIGH** [VERIFIED]: The `StakedUSDeOFT` contract bridges sUSDe, a yield-bearing token, using a standard LayerZero OFT implementation that does not account for yield accrual. The contract burns tokens on the source chain and mints an identical amount on the destination chain. This 1:1 bridging mechanism causes any yield generated by the underlying sUSDe while it is locked in the bridge to be forfeited by the user. The trapped yield accrues to the bridge contract on the canonical chain, leading to a permanent loss of funds for users who bridge their sUSDe.

### TetherTokenOFTExtension `0x779Ded0c9e1022225f8E0630b35a9b54bE713736`
- **LOW** [VERIFIED]: The EIP-712 domain separator, which secures meta-transactions like `permit` and `transferWithAuthorization`, is made mutable by the contract owner. The `_EIP712NameHash` function is overridden (L2295) to depend on the result of `name()` (L2308), which can be changed by the owner via `updateNameAndSymbol` (L2299). This allows the owner to unilaterally invalidate all in-flight signatures at any time, causing user transactions to fail and enabling griefing attacks against relayers who would waste gas on now-invalid signatures.

### USDYW `0x3b355A7A25E75A320f631F9736afB3Dcc9F3Ef66`
- **HIGH** [ESTIMATED]: The `USDYW` contract is implemented as a standard ERC20 token (L1097-L1500) with fixed balances and a minter/burner mechanism. However, Ondo's native USDY, which `USDYW` likely represents given its name, accrues value continuously via an `RWADynamicRateOracle`. This `USDYW` contract lacks any mechanism to reflect this continuous value accrual or interact with an external oracle, leading to a fundamental mismatch in asset representation and potential user expectation misalignment regarding yield.

### rUSDYW `0x907D8399d13cee098cef486a8427933aac7e6271`
- **HIGH** [COMPUTED]: A zero price from the `oracle` will cause a division-by-zero revert in `getSharesByRUSDY`, leading to a denial of service for all core functions. Functions like `transfer` (L2749), `unwrap` (L2954), and `burn` (L3169) all rely on `getSharesByRUSDY` (L2895) to convert token amounts to shares. If `oracle.getPrice()` returns 0, the division on L2895 will revert, bricking all value-transfer functionality of the contract.
- **MEDIUM** [COMPUTED]: The `unwrap` and `burn` functions cause a permanent lock of underlying USDY tokens due to precision loss. These functions calculate the USDY to withdraw by dividing shares by `BPS_DENOMINATOR` (`10000` at L2598), which truncates remainders (L2959, L3177). However, the full, non-truncated amount of shares is burned from the user's balance (L2958, L3175). This burns shares for which the corresponding underlying asset is not returned to the user, trapping the dust amounts of USDY in the contract forever.

