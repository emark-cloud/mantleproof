# Pipeline end-to-end on Mantle MAINNET (T26 — demo audit anchors)

- Target: `0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2` · Registry: `0x60E97c83Dd184D3B0812Ce25430e9D6930eD63aE` · Chain: Mantle 5000
- Single live pipeline run (one Gemini call): resolve source ->
  bytecode -> Tier-1 -> live Gemini Tier-2 -> hallucination guard ->
  canonical rootHash -> IPFS pin -> on-chain anchor.

## Live engine result

- tier=2 · provider=`gemini` · findings=3 · severity=`medium`
- Hallucination guard: masked=0 label_drops=0 — "Hallucination guard fired: 0 masked"
- Canonical rootHash: `0xf7de2101e5ced3b0e4e3a765ac838c9a71e4a0536e4cf7f7610345fab047f33b`

## Terminal steps — IPFS pin + on-chain anchor

- **OK — full end-to-end mainnet receipt.**
- IPFS: `ipfs://bafkreicba5trh2atl63zvlzmeengfpwvearh4biu5q2xkp2i45azu22nka`
- Mainnet `submitAudit` tx: `0xd178e17152f480f9e0fe7437569317499d4b94baa9424bc7ba0d85f8b29e4a45`
- Verify: fetch IPFS JSON, drop root_hash/ipfs_*/anchor_tx keys,
  keccak256 the canonical form → equals on-chain rootHash above.
