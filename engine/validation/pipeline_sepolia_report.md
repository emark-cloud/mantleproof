# Pipeline end-to-end on Mantle Sepolia (T20 · cutover-gate cond. b)

- Target: `0x1892f77e335c133ce4a7b28555f13ba74cbb76fa` · Registry: `0x261a74A97542856F81E05f9CE771FfE0B02BD982` · Chain: Sepolia 5003
- **Single live pipeline run** (one Gemini call): resolve source →
  bytecode → Tier-1 → live Gemini Tier-2 → hallucination guard →
  canonical rootHash → IPFS pin → on-chain anchor. The values below are
  exactly what is pinned to IPFS and anchored on-chain.

## Live engine result

- tier=2 · provider=`gemini` · findings=3 · severity=`high`
- Hallucination guard: masked=0 label_drops=0 — "Hallucination guard fired: 0 masked"
- Canonical rootHash: `0x807b6334bdc29fdc52f32da347b544e08024fc9845d232fc26c06acc72607a2d` (keccak256 of the canonical report JSON, root_hash/ipfs_*/anchor_tx keys excluded from the preimage).

## Terminal steps — IPFS pin + on-chain anchor

- **OK — full end-to-end, independently-verifiable receipt.**
- IPFS: `ipfs://bafkreicx7hvpn2mepuyy46mzhzd47eznhivf6hjxaewcptpzpn3wkgiijm`
- Sepolia `submitAudit` tx: `0xe68ee49b50d54076d96eefdfb0222b6ab1227a08a38455cbebb54f8414398942`
- Verify independently: fetch the IPFS JSON, drop the `root_hash`/`ipfs_*`/`anchor_tx` keys, keccak256 the canonical form → equals `registry.getAudit(target).rootHash` above, submitted by the oracle signer. memoryRoot compounds `keccak256(prev, rootHash)` per audit (MantleProofAgent).

**Mainnet-cutover-gate condition (b): SATISFIED ✅** — the real pipeline ran end-to-end on Sepolia and produced an independently-verifiable on-chain + IPFS receipt.
