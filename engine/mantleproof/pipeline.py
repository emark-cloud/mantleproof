"""Audit pipeline orchestration: Tier1 -> Tier2 -> guard -> sign -> IPFS -> anchor.

Order (CLAUDE.md / docs/mantleproof.md §5):
  1. resolve source (Mantlescan) + bytecode for the target
  2. Tier 1: run the five checks (union of findings)
  3. Tier 2: prompt + provider reasoning, skills/ loaded
  4. hallucination guard: mask unsupported claims, drop labels
  5. assemble report JSON, pin to IPFS (Pinata)
  6. anchor rootHash+severity to MantleProofRegistry, advance memoryRoot
SCAFFOLD — implement in T20 (Week 3). Must run end-to-end on Sepolia before the
mainnet cutover gate.
"""

from __future__ import annotations


def run_audit(target: str, *, tier: int = 1) -> dict:
    """Full audit for `target`. tier=2 adds the LLM reasoning + guard pass."""
    raise NotImplementedError("SCAFFOLD: pipeline.run_audit (T20)")
