# `mantleproof` CLI

Two one-command surfaces over the live MantleProof oracle on **Mantle mainnet
(chainId 5000)**. Both are **pure public reads** — no wallet, no gas, no private
key.

```bash
# Prove MantleProof is real and live (≈30s of green checks against mainnet)
npx mantleproof verify

# Audit any Mantle contract — free read, structured findings + honesty labels
npx mantleproof check 0x1892f77e335c133ce4a7b28555f13ba74cbb76fa
```

## `mantleproof verify`

Connects to Mantle mainnet and runs seven real reads (no hardcoded results):

1. Registry deployed + `oracleSigner` matches the expected immutable signer.
2. MantleProof registered in Mantle's ERC-8004 Identity Registry (tokenId #96).
3. `StakingPool` holds live Tier 2 stake (pool balance).
4. Most-recent audit anchored on-chain (rootHash + age).
5. `getAudit()` returns a structured finding (severity + tier).
6. A dispute was resolved on-chain (RETRACTED → stake slashed).
7. A paying customer left ERC-8004 reputation about MantleProof.

A bonus, soft check (`Tier 2 engine reachable`) runs only when `ENGINE_URL` is
set; it never counts toward the on-chain pass total.

## `mantleproof check <address>`

Reads the latest anchored audit for the target, fetches the full report from
IPFS, **re-derives the on-chain `rootHash` from the bytes** (trustless integrity
— matches `engine/.../pipeline.py::_canonical`), and prints the findings with
their honesty labels. The deeper paid Tier 2 path (x402 / `payForAudit`) is
pointed to, never invoked — `check` never spends.

## Environment

| Var | Default | Purpose |
|---|---|---|
| `MANTLE_RPC_URL` | `https://rpc.mantle.xyz` | RPC endpoint |
| `ENGINE_URL` | _(unset)_ | optional engine base URL for the Tier-2-reachable check |
| `NO_COLOR` | _(unset)_ | disable ANSI colors |

## Build (workspace)

```bash
pnpm --filter mantleproof build
node cli/build/index.js verify
```
