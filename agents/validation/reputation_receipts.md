# Reputation receipts -- ERC-8004 v2 `giveFeedback` ledger (T40)

Real on-chain feedback that paying agents have left about MantleProof
(ERC-8004 tokenId 96). Each row is the headline T40 receipt for a single
agent; verify with `engine/scripts/verify_reputation_receipt.py`. The
on-chain reputation signal lives in Mantle's canonical Reputation Registry
`0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` -- mainnet 5000 only (Sepolia
5003's MantleProof identity is unregistered, see T5).

| timestamp | network | payer (agent) | giveFeedback tx | last index | value | tag1 | tag2 | paid-tx (sybil gate) |
|---|---|---|---|---|---|---|---|---|
| 2026-05-23T~now~ | mantle | `0x4354d518eD2060b315995E68268f019C074fc1f3` (deployer-agent, Demo 1) | `0x579fe213972b056d9d1bd83023d179052cf5084e5e4417f20302b314af4b26f5` (block 95716520) | 1 | 4 | `audit-quality` | `deployer-agent` | `0xde00a2f30eb6f10d294c109b1384ce893bc01555356dac19b986ab41c905f00a` (Demo 1 payForAudit) |

## Independent verification

```
python -u scripts/verify_reputation_receipt.py \
  --payer=0x4354d518eD2060b315995E68268f019C074fc1f3 \
  --agent-id=96 \
  --network=mantle \
  --expect-tag1=audit-quality \
  --expect-tag2=deployer-agent \
  --expect-value=4
```

Expected output (10/10):
- RPC chainId matches T37 registry table (5000)
- Reputation Registry reports v2.0.0
- payer is NOT MantleProof's owner / operator / approved-address (sybil-resistant)
- `getLastIndex(96, payer) >= 1`
- latest feedback is not revoked
- tag1 / tag2 / value match expectations
- `getSummary(96, [payer], "", "").count >= 1` and `<= getLastIndex`

## What this proves

The deployer-agent (the EOA that initiated Demo 1's audit on 2026-05-20)
came back on 2026-05-23 and rated MantleProof on-chain through the
canonical ERC-8004 v2 Reputation Registry. The feedback is permanently
queryable by any other agent via `getSummary(96, …)` -- including future
agents deciding whether to pay MantleProof for an audit themselves. This
is the spec-correct direction the original Tier 2 scope flipped to after
research found that "credit a funder agent" is structurally impossible
(see `docs/tier2-erc8004-reputation-scope.md` Context section).

**Note**: anyone can post feedback (subject to the v2 anti-self-feedback
gate). MantleProof's only operational defense against spam is the
`assert_paid` sybil gate in `engine/scripts/give_feedback_demo.py` -- we
refuse to help addresses that haven't paid via `MantleProofLicense.payForAudit`
build their feedback. The chain itself does not enforce this, which is
honest: negative feedback from real customers IS possible and IS correct.
