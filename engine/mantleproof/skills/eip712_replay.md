# Skill: EIP-712 chain-id & cross-chain replay

Mantle chain id is **5000**. Forked code commonly leaves Ethereum's
`chainId = 1` baked into the EIP-712 domain separator, or caches the separator
without a chain-fork guard — signatures then **replay across chains**. The
correct OZ pattern reads `block.chainid` and rebuilds the separator when the
chain id changes.

## Bug patterns to detect (beyond Tier 1)

- An `EIP712Domain` typehash that models `chainId` but the code never reads
  `block.chainid` — the chain id is hardcoded/copied (HIGH).
- A domain separator typehash that omits `chainId` entirely — valid on every
  chain.
- A separator cached in the constructor with no `block.chainid != cached`
  rebuild path (replay after a fork / on an L2 copy).
- Nonces or signed payloads that do not bind `address(this)`
  (`verifyingContract`) — cross-contract replay.
- Hardcoded `2300` gas stipend on a value transfer — OP-Stack/L2 receive
  paths and smart wallets can need more; breaks or grief-locks.

## Reference

- EIP-712: https://eips.ethereum.org/EIPS/eip-712 — docs/resources.md §2.7
