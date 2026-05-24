# Pipeline end-to-end on Mantle Sepolia (T20 · cutover-gate cond. b)

- Target: `0x5d6874df08640bAb87C5c15b61Fb4c3E641f8956` · Registry: `0x11B395452e2bF8Ab20F21cd4deA8f9a7650CCf65` · Chain: Sepolia 5003
- **Single live pipeline run** (one Gemini call): resolve source →
  bytecode → Tier-1 → live Gemini Tier-2 → hallucination guard →
  canonical rootHash → IPFS pin → on-chain anchor. The values below are
  exactly what is pinned to IPFS and anchored on-chain.

## Live engine result

- tier=2 · provider=`gemini` · findings=1 · severity=`info`
- Hallucination guard: masked=0 label_drops=0 — "Hallucination guard fired: 0 masked"
- Canonical rootHash: `0xe550dd4ee1571beca2e3b8d8d9e5a3cb4e002c6faecf2c2092f425d8fabc3e16` (keccak256 of the canonical report JSON, root_hash/ipfs_*/anchor_tx keys excluded from the preimage).

## Terminal steps — IPFS pin + on-chain anchor

- **OK — full end-to-end, independently-verifiable receipt.**
- IPFS: `ipfs://bafkreidko6vbrtjpdglu4hhj7ymvvscmqqyf4uxef3bu5t2qjimqycripe`
- Sepolia `submitAudit` tx: `0x30262f4295b4963372fe2720f068f9a39659771d198883a24f4ab0b8b76dc697`
- Verify independently: fetch the IPFS JSON, drop the `root_hash`/`ipfs_*`/`anchor_tx` keys, keccak256 the canonical form → equals `registry.getAudit(target).rootHash` above, submitted by the oracle signer. memoryRoot compounds `keccak256(prev, rootHash)` per audit (MantleProofAgent).

**Mainnet-cutover-gate condition (b): SATISFIED ✅** — the real pipeline ran end-to-end on Sepolia and produced an independently-verifiable on-chain + IPFS receipt.
