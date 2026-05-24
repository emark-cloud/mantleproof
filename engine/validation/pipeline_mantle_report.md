# Pipeline end-to-end on Mantle MAINNET (T26 — demo audit anchors)

- Target: `0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a` · Registry: `0x5CEafE0FD8b2A9BD2eC6aCdf3f5e024c21CA65A5` · Chain: Mantle 5000
- Single live pipeline run (one Gemini call): resolve source ->
  bytecode -> Tier-1 -> live Gemini Tier-2 -> hallucination guard ->
  canonical rootHash -> IPFS pin -> on-chain anchor.

## Live engine result

- tier=2 · provider=`gemini` · findings=2 · severity=`medium`
- Hallucination guard: masked=0 label_drops=0 — "Hallucination guard fired: 0 masked"
- Canonical rootHash: `0x37ff62a05f9e66151b36846e28a77494ccc9733a298200d3aa62b1a607d3b373`

## Terminal steps — IPFS pin + on-chain anchor

- **OK — full end-to-end mainnet receipt.**
- IPFS: `ipfs://bafkreifzfxwlznwviwyiaq7wc673f7yzripwscccvwrdmzuye24higb7bi`
- Mainnet `submitAudit` tx: `0xdce37de275d561d8aa9bf3836fb7eec4d120d4a968f5a2315232435a1dca2349`
- Verify: fetch IPFS JSON, drop root_hash/ipfs_*/anchor_tx keys,
  keccak256 the canonical form → equals on-chain rootHash above.
