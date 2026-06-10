# Pipeline end-to-end on Mantle MAINNET (T26 — demo audit anchors)

- Target: `0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a` · Registry: `0xcF3703BD76C64DA8a13461e820456d0576662aaf` · Chain: Mantle 5000
- Single live pipeline run (one Gemini call): resolve source ->
  bytecode -> Tier-1 -> live Gemini Tier-2 -> hallucination guard ->
  canonical rootHash -> IPFS pin -> on-chain anchor.

## Live engine result

- tier=2 · provider=`gemini` · findings=2 · severity=`medium`
- Hallucination guard: masked=0 label_drops=0 — "Hallucination guard fired: 0 masked"
- Canonical rootHash: `0xf9cd79fb0083b6007ef4671ee093f19a1e63e7fc698ef9c0136fc90430002a20`

## Terminal steps — IPFS pin + on-chain anchor

- **BLOCKED:** `HTTPError: 500 Server Error: Internal Server Error for url: https://mantle.drpc.org/` (rootHash recorded; nothing anchored)
