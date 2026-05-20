# Pipeline end-to-end on Mantle MAINNET (T26 — demo audit anchors)

- Target: `0xeB19da38EcdAec1aAAAdE76098c7f3cAf24Ec1F0` · Registry: `0x60E97c83Dd184D3B0812Ce25430e9D6930eD63aE` · Chain: Mantle 5000
- Single live pipeline run (one Gemini call): resolve source ->
  bytecode -> Tier-1 -> live Gemini Tier-2 -> hallucination guard ->
  canonical rootHash -> IPFS pin -> on-chain anchor.

## Live engine result

- tier=2 · provider=`gemini` · findings=2 · severity=`high`
- Hallucination guard: masked=0 label_drops=0 — "Hallucination guard fired: 0 masked"
- Canonical rootHash: `0x7e669f4967df709dfec90a1ef2f3fc0d2cfeabda5dcd2a0b24c396c2620598aa`

## Terminal steps — IPFS pin + on-chain anchor

- **OK — full end-to-end mainnet receipt.**
- IPFS: `ipfs://bafkreid2k653bw2gapu3sdfacjbuu56wjs3ek7xh4grcuxal6724ex2z3e`
- Mainnet `submitAudit` tx: `0xeecb86c7163affb4381f6f1a068417d6457249ab8b0d467974394a1cc1cec88d`
- Verify: fetch IPFS JSON, drop root_hash/ipfs_*/anchor_tx keys,
  keccak256 the canonical form → equals on-chain rootHash above.
