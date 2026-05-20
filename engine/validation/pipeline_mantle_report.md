# Pipeline end-to-end on Mantle MAINNET (T26 — demo audit anchors)

- Target: `0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a` · Registry: `0x60E97c83Dd184D3B0812Ce25430e9D6930eD63aE` · Chain: Mantle 5000
- Single live pipeline run (one Gemini call): resolve source ->
  bytecode -> Tier-1 -> live Gemini Tier-2 -> hallucination guard ->
  canonical rootHash -> IPFS pin -> on-chain anchor.

## Live engine result

- tier=2 · provider=`gemini` · findings=0 · severity=`info`
- Hallucination guard: masked=0 label_drops=0 — "Hallucination guard fired: 0 masked"
- Canonical rootHash: `0xd984d08cb796ec3967b9a0a1102fda1b775427f867357989597c131835778dc1`

## Terminal steps — IPFS pin + on-chain anchor

- **OK — full end-to-end mainnet receipt.**
- IPFS: `ipfs://bafkreiasm4zzv7sfej25agecaslinw7shhkzurfp2s3zlaj7kuiby4b5te`
- Mainnet `submitAudit` tx: `0xd529d8cf3b27bb61cc31ac2e21970d33f878a4338ccc726764423bb319365271`
- Verify: fetch IPFS JSON, drop root_hash/ipfs_*/anchor_tx keys,
  keccak256 the canonical form → equals on-chain rootHash above.
