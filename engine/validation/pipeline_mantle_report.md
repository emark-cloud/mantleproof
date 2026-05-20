# Pipeline end-to-end on Mantle MAINNET (T26 — demo audit anchors)

- Target: `0x8f6679eb031799fc9c5e149dfb75b4543808912f` · Registry: `0x60E97c83Dd184D3B0812Ce25430e9D6930eD63aE` · Chain: Mantle 5000
- Single live pipeline run (one Gemini call): resolve source ->
  bytecode -> Tier-1 -> live Gemini Tier-2 -> hallucination guard ->
  canonical rootHash -> IPFS pin -> on-chain anchor.

## Live engine result

- tier=2 · provider=`gemini` · findings=4 · severity=`high`
- Hallucination guard: masked=0 label_drops=0 — "Hallucination guard fired: 0 masked"
- Canonical rootHash: `0x7443ab83b53e67fb1077446417f547809f5f6184d535080fca363a63e5e23849`

## Terminal steps — IPFS pin + on-chain anchor

- **OK — full end-to-end mainnet receipt.**
- IPFS: `ipfs://bafkreiatwd6w7h5bnjkairon23hot7cfwpd6kfpss7upqrhyvnrvjdujg4`
- Mainnet `submitAudit` tx: `0xc2a54ffa2612f12e566705c06d3adf7938ce26edccc39e7423837de0df7f0e4e`
- Verify: fetch IPFS JSON, drop root_hash/ipfs_*/anchor_tx keys,
  keccak256 the canonical form → equals on-chain rootHash above.
