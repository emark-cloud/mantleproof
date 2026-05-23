"""Real ERC-8004 v2 reputation integration (T37–T41).

Mirror of `engine/mantleproof/x402/` and `tier2/`: pure helpers live here, the
demo wallet wiring lives under `engine/scripts/`. The engine itself never
holds a feedback-signer key — the v2 deployed `giveFeedback` is permissionless
modulo the anti-self-feedback gate, so the payer's own wallet signs the
transaction. See `docs/erc8004-abi-notes.md` (T37) for the full ABI analysis.
"""
