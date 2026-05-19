# T12 — Tier-1 validation against real Mantle mainnet contracts

**Goal (docs/mantleproof.md §9, W2):** run the Tier-1 union against a hand-picked
set of real Mantle mainnet contracts and confirm the engine produces *meaningful*
findings — which explicitly includes **not a false-positive storm on
correctly-built contracts**.

## How to run

```bash
cd engine && python scripts/validate_tier1.py      # needs ETHERSCAN_API_KEY
```

For every address in `tests/fixtures/real_targets.json` the harness:
1. resolves verified source via the T9 Etherscan-V2 client (this also
   re-confirms, at run time, that the address is a real verified mainnet
   contract — provenance is not taken on faith),
2. best-effort fetches deployed bytecode via JSON-RPC `eth_getCode`
   (Tier 1 is source-first; RPC failure degrades to `b""`),
3. runs the five checks and rolls up findings into `tier1_report.md`.

Targets are seeded from the T2 human+on-chain-verified token map so provenance
is inherited, not re-typed.

## What this validation found (and fixed)

The first live run was the point of the exercise: it exposed real Tier-1
**precision** defects — the engine flagged the protocols' *own* token
contracts:

| FP | Cause |
|---|---|
| `meth_balance_proportional` HIGH on the mETH token | `balanceOf`+`totalSupply` present is true of *every* ERC20 |
| `replay no_block_chainid` HIGH on USDeOFT | triggered by `permit(`/`DOMAIN_SEPARATOR()` — present in every ERC2612 token |
| `replay domain_missing_chainid` MED on METHL2 | brittle regex matched an empty `EIP712Domain()` on a correct OZ contract |
| `usdy_check` ×3 on the mUSD token + its impl | auditing a protocol's own token for "misusing" that protocol |

**Fixes (T12):**
- **Integration-handle gate** — a *misuse* finding now requires evidence the
  contract calls *into* the protocol (`usdy.balanceOf(...)`, `lbPair.mint(...)`),
  not merely that it is ERC20-shaped or names the protocol.
- **Self-target guard** — `run_tier1(..., address=...)` suppresses a protocol's
  checks when the audited address *is* that protocol's token (or its known
  proxy implementation). You cannot misuse yourself.
- **replay_check restructured** to the spec's canonical bugs: a *genuine*
  EIP712Domain typehash that models `chainId` but never reads `block.chainid`
  (hardcoded chainId → HIGH) vs. a typehash that omits `chainId` (MED). Bare
  `permit(` / `DOMAIN_SEPARATOR()` no longer qualifies as a self-rolled signer.

**Result:** 10/10 real verified protocol contracts → **0 findings** (no FP
storm), while 45 unit tests prove the checks still fire on integrator misuse
(synthetic fixtures + the precision regressions in `test_tier1_precision.py`).
These FP classes are now locked by regression tests so they cannot silently
return.

## Open curation item (not blocking)

`real_targets.json` is currently the verified protocol-token set (precision
evidence). Adding known-buggy / integrator targets (vaults, routers that
*consume* USDY/mETH/sUSDe/LB) would additionally exercise the positive path on
real code — a hand-curation task like the T2 token pin. The harness re-verifies
every address it is given, so the list can be extended safely over time.
