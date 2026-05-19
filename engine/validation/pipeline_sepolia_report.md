# Pipeline end-to-end on Mantle Sepolia (T20 · cutover-gate cond. b)

- Target: `0x906390B3594384bE83F3465cFeDf8661f4d1a410` · Registry: `0x261a74A97542856F81E05f9CE771FfE0B02BD982` · Chain: Sepolia 5003
- **Single live pipeline run** (one Gemini call): resolve source →
  bytecode → Tier-1 → live Gemini Tier-2 → hallucination guard →
  canonical rootHash → IPFS pin → on-chain anchor. The values below are
  exactly what is pinned to IPFS and anchored on-chain.

## Live engine result

- tier=2 · provider=`gemini` · findings=1 · severity=`low`
- Hallucination guard: masked=0 label_drops=0 — "Hallucination guard fired: 0 masked"
- Canonical rootHash: `0x28415e3069d563a42f68ea1f631602364e23ea742900ea4d11c5c72389c0f574` (keccak256 of the canonical report JSON, root_hash/ipfs_*/anchor_tx keys excluded from the preimage).

## Terminal steps — IPFS pin + on-chain anchor

- **OK — full end-to-end, independently-verifiable receipt.**
- IPFS: `ipfs://bafkreiaccoixvbxfwjjpqvrlcwtd5bkkcjasyrvjnt7ryrgr5heu75zov4`
- Sepolia `submitAudit` tx: `0xeca296b3605c321ecbbec7250d0ce29a8c9b7486e563dbfb639cc19cafd01bdc`
- Verify independently: fetch the IPFS JSON, drop the `root_hash`/`ipfs_*`/`anchor_tx` keys, keccak256 the canonical form → equals `registry.getAudit(target).rootHash` above, submitted by the oracle signer. memoryRoot compounds `keccak256(prev, rootHash)` per audit (MantleProofAgent).

**Mainnet-cutover-gate condition (b): SATISFIED ✅** — the real pipeline ran end-to-end on Sepolia and produced an independently-verifiable on-chain + IPFS receipt.

## Independent verification (run 2026-05-19, off-pipeline reader)

Re-derived from chain + IPFS by a separate web3/httpx reader (not the pipeline):

- tx `0xeca296b3…01bdc` status **1**, block **38837152**.
- `registry.getAudit(target)` → rootHash `0x28415e30…f574` **== run**; severity
  **1** (Low, == report); ipfsCID `ipfs://bafkrei…zov4` **== run**; submitter
  `0x2a30…605B6A` **== the oracle signer** (only-writer invariant upheld).
- `MantleProofAgent.auditsPerformed` advanced to **3** (T6 smoke + 2 T20 runs);
  `memoryRoot` `0xab90…0e40` = compounded `keccak256(prev, rootHash)` (correctly
  ≠ rootHash — compounding chain by design).
- Fetched the pinned IPFS JSON, dropped `root_hash`/`ipfs_*`/`anchor_tx`,
  keccak256'd the canonical form → `0x28415e30…f574` **== pinned root_hash ==
  on-chain rootHash**. The audit is independently verifiable end-to-end.
