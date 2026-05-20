# Pipeline end-to-end on Mantle Sepolia (T20 · cutover-gate cond. b)

- Target: `0x8f6679eb031799fc9c5e149dfb75b4543808912f` · Registry: `0x261a74A97542856F81E05f9CE771FfE0B02BD982` · Chain: Sepolia 5003
- **Single live pipeline run** (one Gemini call): resolve source →
  bytecode → Tier-1 → live Gemini Tier-2 → hallucination guard →
  canonical rootHash → IPFS pin → on-chain anchor. The values below are
  exactly what is pinned to IPFS and anchored on-chain.

## Live engine result

- tier=2 · provider=`gemini` · findings=4 · severity=`high`
- Hallucination guard: masked=0 label_drops=0 — "Hallucination guard fired: 0 masked"
- Canonical rootHash: `0x1b401c9fa14e056d64ef1c28659ec195452b3a95dbd5b0473aaad546ce59fe1d` (keccak256 of the canonical report JSON, root_hash/ipfs_*/anchor_tx keys excluded from the preimage).

## Terminal steps — IPFS pin + on-chain anchor

- **OK — full end-to-end, independently-verifiable receipt.**
- IPFS: `ipfs://bafkreicvon7igbzis7wzlzip7blbr64ij7ai3osddpgkzp2h6y4ocnlu34`
- Sepolia `submitAudit` tx: `0xdacfa5afd9711f73c492a306584ed6d3a4361970e852bd8901ae0194dc4f966b`
- Verify independently: fetch the IPFS JSON, drop the `root_hash`/`ipfs_*`/`anchor_tx` keys, keccak256 the canonical form → equals `registry.getAudit(target).rootHash` above, submitted by the oracle signer. memoryRoot compounds `keccak256(prev, rootHash)` per audit (MantleProofAgent).

**Mainnet-cutover-gate condition (b): SATISFIED ✅** — the real pipeline ran end-to-end on Sepolia and produced an independently-verifiable on-chain + IPFS receipt.
