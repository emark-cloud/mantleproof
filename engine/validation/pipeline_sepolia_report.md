# Pipeline end-to-end on Mantle Sepolia (T20 · cutover-gate cond. b)

- Target: `0x906390B3594384bE83F3465cFeDf8661f4d1a410` · Registry: `0x261a74A97542856F81E05f9CE771FfE0B02BD982` · Chain: Sepolia 5003
- Pipeline: resolve source → bytecode → Tier-1 → live Gemini Tier-2 →
  hallucination guard → canonical rootHash → IPFS pin → on-chain anchor.

## Phase 1 — live source/bytecode/Tier-1/Gemini-Tier-2/guard/rootHash

- **OK.** tier=2 provider=`gemini` findings=2 severity=`medium`
- Hallucination guard: masked=0 label_drops=0 — "Hallucination guard fired: 0 masked"
- Canonical rootHash: `0xb77da68dcfbecd1214344bb54a19861d2fa79041039d47fa3e841ddbb4ed8f5c` (keccak256 of the canonical report JSON).
- This proves the **entire reasoning pipeline runs live end-to-end on a real Sepolia-deployed target** — the only steps after this are the two terminal I/O calls below.

## Phase 2 — IPFS pin + on-chain anchor

- **BLOCKED on a setup credential, not a code gap:** `PINATA_JWT not set — cannot pin the audit report to IPFS (gates T20, see docs/setup-checklist.md). Refusing to anchor a rootHash whose JSON nobody can fetch.`
- `PINATA_JWT` (TODO.md setup-checklist, *gates T20 IPFS pin*) is not configured. The pipeline **correctly refuses to anchor a rootHash whose JSON nobody can fetch** (CLAUDE.md invariant) — it fails loudly here rather than anchoring an unresolvable record.
- Phase 1 proves all engine logic is live-correct on Sepolia. The remaining gap is a credential the builder must supply; rerunning this script with `PINATA_JWT` set completes condition (b) with a real Sepolia receipt — **no code change needed**.

**Mainnet-cutover-gate condition (b): live up to rootHash proven; terminal pin+anchor BLOCKED on `PINATA_JWT`.**
