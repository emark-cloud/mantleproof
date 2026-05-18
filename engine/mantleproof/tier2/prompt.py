"""Tier 2 prompt builder.

skills/ briefs loaded. Prompt instructs: return JSON only, every $/% claim
references a specific source line or bytecode offset (feeds the guard).
SCAFFOLD — implement in T17.
"""

from __future__ import annotations


def build_prompt(
    source: str, bytecode: bytes, tier1: list, deployer_history: list
) -> tuple[str, str]:
    raise NotImplementedError("SCAFFOLD: T17")
