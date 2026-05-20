# Pipeline end-to-end on Mantle MAINNET (T26 — demo audit anchors)

- Target: `0x1892f77e335c133ce4a7b28555f13ba74cbb76fa` · Registry: `0x60E97c83Dd184D3B0812Ce25430e9D6930eD63aE` · Chain: Mantle 5000
- Single live pipeline run (one Gemini call): resolve source ->
  bytecode -> Tier-1 -> live Gemini Tier-2 -> hallucination guard ->
  canonical rootHash -> IPFS pin -> on-chain anchor.

## Live engine result

- tier=2 · provider=`gemini` · findings=2 · severity=`high`
- Hallucination guard: masked=0 label_drops=0 — "Hallucination guard fired: 0 masked"
- Canonical rootHash: `0x6a69e7d466ad95bb35d932b2e40f9d6f5be16985ea1f093f16e598c05c09ca46`

## Terminal steps — IPFS pin + on-chain anchor

- **OK — full end-to-end mainnet receipt.**
- IPFS: `ipfs://bafkreibjhgq73cxpkp4gsemhix4trxjupcaidpas7lyvne3dazymb5ewce`
- Mainnet `submitAudit` tx: `0x7cfbb72bfff2bacc50603c48bbe9727730aace7d4a6d23fcb3408d1b147be4ca`
- Verify: fetch IPFS JSON, drop root_hash/ipfs_*/anchor_tx keys,
  keccak256 the canonical form → equals on-chain rootHash above.
