
## Dispute #1 — DISMISSED  (2026-05-24T13:29:58.732014+00:00)
- status: `resolved`
- outcome: **DISMISSED** (uint8 1)
- reAuditRootHash: `0x5865fb0b62b5dbbd60d005b1b444a8faac937e82a421d9bf16fdf024fca54510`
- anchor tx: `384a043ab23bccc33836eb96aee90deebc4517197201f4a99ada4809379edfe8`
- rationale: The counter-claim incorrectly addresses `addLiquidity` with standard tokens, whereas the original finding correctly identifies a risk in `swapExact...` functions when used with rebasing or fee-on-transfer tokens.


## Dispute #2 — DISMISSED  (2026-05-24T13:40:56.622053+00:00)
- status: `resolved`
- outcome: **DISMISSED** (uint8 1)
- reAuditRootHash: `0x6e3aedc3ae0214211db3e25b86d0155004c886977cad5cb718b1942a7bc60a63`
- anchor tx: `dfbc89af13cdfb287170d7c45b93373594890d7a6d31feaebad637068e982f73`
- rationale: The counter-claim addresses the `pause()` function (L86), but the disputed finding correctly identifies an unrestricted `mint()` function (L98) as a high-severity backdoor.


## Dispute #3 — DISMISSED  (2026-05-24T13:42:06.738087+00:00)
- status: `resolved`
- outcome: **DISMISSED** (uint8 1)
- reAuditRootHash: `0xe58665fb45df6b799919133ffee4f9c7b42df5b4c919378275100fb5ea8b5e4c`
- anchor tx: `0b30c05349a69de5121eebf5652c330cddf7774aa91d39c4190d09c844f88920`
- rationale: The counter-claim is dismissed because it is ungrounded and makes a false assertion about non-existent decentralized governance, while the contract code confirms the owner can unilaterally freeze all transfers via `pause()` (L86) and the `whenNotPaused` modifier (L118, L129).


## Dispute #4 — DISMISSED  (2026-05-24T13:46:24.730619+00:00)
- status: `resolved`
- outcome: **DISMISSED** (uint8 1)
- reAuditRootHash: `0x333c8c1599e4740693094ef505e530dab66aa25f3782283aa449f1178361720a`
- anchor tx: `bb6b5a612ea1d61528fb67a03963034a450a4a2ee248a769606d11cae9c1c707`
- rationale: The counter-claim's argument that the issue is LOW severity because it is a view function is invalid, as the primary risk of a misimplemented `balanceOfUnderlying` function at L68 is breaking on-chain composability with other protocols that would rely on it for correct asset valuation.


## Dispute #5 — RETRACTED  (2026-05-24T13:47:48.635473+00:00)
- status: `resolved`
- outcome: **RETRACTED** (uint8 3)
- reAuditRootHash: `0xdb4cd326eb346095bf619b4543b78fbdd37d1258d0484278e9764cc2b6372fa7`
- anchor tx: `ed264780037e07a404f5ce5b37c056523d27d1e88296d29ee1fa6f8bac8a2374`
- rationale: The finding is retracted because it incorrectly claims funds can be lost or locked in V2+ pairs; the contract code at L1204 shows the entire pre-calculated input amount is consumed to provide the user a favorable, larger output.


## Dispute #6 — DISMISSED  (2026-05-24T13:50:34.701665+00:00)
- status: `resolved`
- outcome: **DISMISSED** (uint8 1)
- reAuditRootHash: `0xf1ee2419fb62e1fc8084c3df1eee611957743eb92ce8495dff32fa9a5dac7707`
- anchor tx: `4d560ddaf66dbfd0db4d158328c6df6fb99e9763b6f2ae771a5aeaba75fbbacf`
- rationale: The counter-claim is dismissed because its premise that the contract lacks a deposit function is false, as the `deposit` function at L49 explicitly calls `susde.deposit` at L50, creating the conditions for the fund-locking bug in `withdraw`.


## Dispute #7 — DISMISSED  (2026-05-24T13:53:36.640317+00:00)
- status: `resolved`
- outcome: **DISMISSED** (uint8 1)
- reAuditRootHash: `0xab978ae7f1778df49d70b7cb642467aa9f3962eea0be84757ac1f8f20f16c0e7`
- anchor tx: `d91e50dcb9eda3b396bdf9e6928f21a087ff2407d1e91e5cf0f2c42f3d53fca9`
- rationale: The counter-claim is dismissed because its argument for lower severity relies on the temporary absence of specific token pairs, while the finding correctly identifies a latent code vulnerability for which trigger tokens (e.g., mUSD) already exist on the target chain.

