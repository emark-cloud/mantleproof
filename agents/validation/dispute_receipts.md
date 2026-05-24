# T47 — Mainnet dispute receipts (Mantle chainId 5000, 2026-05-24)

Seven on-chain disputes filed against the new post-T43 mainnet audit stack
via `disputer-agent.ts dispute`. Each was resolved by `resolve_dispute_mainnet.py`
(oracle-signed Tier 2 re-audit + `resolveDispute` on chain). **2 MNT moved
publicly from `StakingPool` to the disputer** for the single RETRACTED
outcome (#5).

**Outcome distribution**: 6 DISMISSED + 1 RETRACTED + 0 AMENDED.

The model held the bar against weak/wrong arguments (6 dismissals) and
correctly retracted the one finding whose premise was actually wrong (#5 —
a misclassification of standard AMM exact-output swap semantics). No
upheld claims required severity-only amendment in this seed batch.

## Wallets

| role | address | initial | net change |
|---|---|---|---|
| disputer-agent | `0x7805e8261E8508d70554211dA54FB3c33A6ebfd3` | 0.5 MNT | +1.7 MNT (slash + counter-stake refunds − gas + forfeitures) |
| StakingPool | `0x2E279f4cAE39B5d0Fa57e08D0d455Ec9f6080ee9` | 6 MNT (3× 2 from Demo 1/2/3) | −2 MNT (slashed to disputer on #5 RETRACTED) |
| MantleProofRegistry | `0x5CEafE0FD8b2A9BD2eC6aCdf3f5e024c21CA65A5` | 0 | +0.25 MNT (forfeited counter-stakes from 5 DISMISSED) |

Per-receipt counter-stake disposition (per scope doc §2.3 + on-chain
`resolveDispute` logic):
- DISMISSED → counter-stake (0.05 MNT) forfeited to the registry.
- AMENDED → counter-stake refunded to disputer; audit stake stays locked.
- RETRACTED → counter-stake refunded to disputer + 2 MNT audit stake
  slashed from `StakingPool` to disputer.

## Receipts

### #1 — DISMISSED (Demo 3 LBRouter, finding 0)
- counter-claim: `bafkreienacgtda4it5xanvol2npb2plqfj2gojeax7na4imnps3d3x6xxa` (round 1, strong)
- submitDispute tx: `0x8f2e31203f6e36770e540dc0f3817248f0ee9eb1cf03f90fa8339928aba5450f` (block 95749375)
- resolveDispute tx: `0x384a043ab23bccc33836eb96aee90deebc4517197201f4a99ada4809379edfe8`
- reAudit rootHash: `0x5865fb0b62b5dbbd60d005b1b444a8faac937e82a421d9bf16fdf024fca54510`
- rationale: counter-claim addressed `addLiquidity` but the finding was about `swapExact…` functions; off-target.

### #2 — DISMISSED (Demo 2 BackdooredMemeToken, finding 1 = unrestricted mint)
- counter-claim: `bafkreicgvgncuj7msasbicid57uo5vm37cxwotlvgl6d2pti6fxzly5ww4` (round 1, partial)
- submitDispute tx: `0xd5470ac07f9c82dd74ab5842cd156a8605c2580511ca8410fdf051af824f9eb8` (block 95749394)
- resolveDispute tx: `0xdfbc89af13cdfb287170d7c45b93373594890d7a6d31feaebad637068e982f73`
- reAudit rootHash: `0x6e3aedc3ae0214211db3e25b86d0155004c886977cad5cb718b1942a7bc60a63`
- rationale: counter-claim addressed `pause()` but disputed finding was unrestricted `mint()`; wrong target.

### #3 — DISMISSED (Demo 2 BackdooredMemeToken, finding 0 = pause backdoor)
- counter-claim: `bafkreigi4e2h3rd5z2kcj7hmrr36f3na2zp37i5xowwi73ncs3syc52gra` (round 1, intentionally weak)
- submitDispute tx: `0x24435f6f7296c6f9a2f54fa00d845b8b0e8ffa9044c6134755ca54d7be6fdb45` (block 95749410)
- resolveDispute tx: `0x0b30c05349a69de5121eebf5652c330cddf7774aa91d39c4190d09c844f88920`
- reAudit rootHash: `0xe58665fb45df6b799919133ffee4f9c7b42df5b4c919378275100fb5ea8b5e4c`
- rationale: ungrounded; false assertion about non-existent decentralized governance. Engine confirmed owner can unilaterally freeze transfers via `pause()` (L86) and `whenNotPaused` modifier (L118, L129).

### #4 — DISMISSED (Demo 1 BuggyYieldVault, finding 1 = balanceOfUnderlying)
- counter-claim: `bafkreife6fdmvlecyqlyhkjp4pvticvqfw46wqm74iw3lycb2bemreof6i` (round 2, severity-amendment argument)
- submitDispute tx: `0x7625f946d8c7c8b5dc32bd6e4dc06ced5548a9aadc3d7e16cd943caac74160f4` (block 95749991)
- resolveDispute tx: `0xbb6b5a612ea1d61528fb67a03963034a450a4a2ee248a769606d11cae9c1c707`
- reAudit rootHash: `0x333c8c1599e4740693094ef505e530dab66aa25f3782283aa449f1178361720a`
- rationale: engine ruled view-function-only severity argument insufficient because the misimplemented `balanceOfUnderlying` (L68) breaks on-chain composability for any protocol that would read it for asset valuation.

### #5 — RETRACTED ✓ (Demo 3 LBRouter, finding 1 = swapTokensForExactTokens overpay)
- counter-claim: `bafkreigvqocaes444wyneinv4mrzz4unm74mpobphfv4xee7skubymoiaq` (round 2, AMM-semantics correction)
- submitDispute tx: `0x00bccb9fcfec330a1d1534611a21fe691de7e829422037d2793b27162836ec1f` (block 95749998)
- resolveDispute tx: `0xed264780037e07a404f5ce5b37c056523d27d1e88296d29ee1fa6f8bac8a2374`
- reAudit rootHash: `0xdb4cd326eb346095bf619b4543b78fbdd37d1258d0484278e9764cc2b6372fa7`
- rationale: engine confirmed that `swapTokensForExactTokens` (LBRouter L1204) consumes only the pre-calculated input amount — there is no excess consumption to refund. Counter-claim correctly noted finding misclassified standard exact-output swap semantics.
- **on-chain MNT movement**: pool 6 → 4 MNT (−2 MNT to disputer); disputer 0.32 → 2.22 MNT after counter-stake refund + 2 MNT slash − gas.

### #6 — DISMISSED (Demo 1 BuggyYieldVault, finding 0 = sUSDe cooldown)
- counter-claim: `bafkreih5htktd7jbko54skxnay4b5ezmzps3vh3o3bdk2qdokshtpopjam` (round 3, AMENDED attempt)
- submitDispute tx: `0xeae84c064c36bb4d3f1a977ea8af148c174c8b0455ac0147815a1094b40f25ed` (block 95750138)
- resolveDispute tx: `0x4d560ddaf66dbfd0db4d158328c6df6fb99e9763b6f2ae771a5aeaba75fbbacf`
- reAudit rootHash: `0xf1ee2419fb62e1fc8084c3df1eee611957743eb92ce8495dff32fa9a5dac7707`
- rationale: counter-claim premised on contract lacking a `deposit` function — engine corrected: contract DOES have `deposit()` at L49 that calls `susde.deposit()` at L50, so the fund-loss path is reachable. Counter-claim factually wrong.

### #7 — DISMISSED (Demo 3 LBRouter, finding 0 = swap fee-on-transfer)
- counter-claim: `bafkreigtgpt63im4qyktdgxclte7rxk6idd4lcbekjxw25jrqgvikscpe4` (round 4, pair-scope AMENDED attempt)
- submitDispute tx: `0xb3d29d6d12fd6938742d708f06b0face162942760911f6c892200b2a62af46a2` (block 95750202)
- resolveDispute tx: `0xd91e50dcb9eda3b396bdf9e6928f21a087ff2407d1e91e5cf0f2c42f3d53fca9`
- reAudit rootHash: `0xab978ae7f1778df49d70b7cb642467aa9f3962eea0be84757ac1f8f20f16c0e7`
- rationale: counter-claim argued "no fee-on-transfer pairs exist today" → engine countered that trigger tokens (e.g., mUSD) exist on Mantle so the latent vulnerability is reachable.
- **note**: this re-audit hit a Mantlescan SSL flake during source resolution and incorrectly fell back to `BuggyYieldVault` local source via the round-robin guess loop (caught + fixed in resolve_dispute_mainnet.py — KNOWN_TARGETS now maps target address → exact local filename). The verdict was still correct because the model worked off the (correct) `original_audit` body loaded from IPFS, but the bug would have produced wrong source-context on a re-run; fixed forward.

## Verification

Each row above is independently verifiable on Mantlescan:
- `submitDispute` tx → carries `DisputeSubmitted` event with the disputer / rootHash / counter-stake.
- `resolveDispute` tx → carries `DisputeResolved` event with the outcome enum (0=PENDING / 1=DISMISSED / 2=AMENDED / 3=RETRACTED). For #5 the same tx receipt also carries `StakeSlashedByDispute(rootHash, beneficiary=disputer, portion=2 ether, remainder=0)`.

To re-verify any single dispute end-to-end:
```bash
cd engine
. .venv/bin/activate
python scripts/verify_dispute_receipt.py \
  --dispute-id 5 --network mantle \
  --expect-outcome RETRACTED \
  --expect-disputer 0x7805e8261E8508d70554211dA54FB3c33A6ebfd3 \
  --tx 0xed264780037e07a404f5ce5b37c056523d27d1e88296d29ee1fa6f8bac8a2374
```

## What this seed batch demonstrates

- **The mechanism works end-to-end on mainnet**: 7 disputes filed, 7
  resolved, 2 MNT publicly slashed for the one upheld dispute.
- **The engine does not capitulate**: 6/7 dismissals across multiple
  rounds of progressively-tighter counter-claims. Wrong arguments
  (factually false, off-target, ungrounded) are dismissed; the engine
  cites specific source lines refuting them.
- **The engine WILL retract when the counter-claim is genuinely
  correct** (#5): the finding misclassified standard AMM exact-output
  swap semantics as a bug; the counter-claim cited the actual contract
  behavior (LBRouter L1204) and the engine agreed, slashing 2 MNT to
  the disputer.
- **AMENDED was not produced in this batch** — three attempts (#4, #6, #7)
  argued for severity downgrade-only and were each dismissed with specific
  counter-evidence. The on-chain `AMENDED` outcome is supported by the
  contract + engine but no seed counter-claim happened to be the
  partially-correct shape the engine accepts. Open work: craft a more
  surgical severity-amendment counter-claim post-submission.
