"""Tier 2 re-audit driver for an on-chain dispute.

Loads the original audit JSON (via IPFS gateway), pulls the disputer's
counter-claim, runs the Tier 2 prompt with the extended ORIGINAL_AUDIT +
COUNTER_CLAIM blocks, and returns a structured verdict the resolver can post.

Same hallucination guard discipline as the canonical Tier 2 path. The
re-audit prompt asks for a single JSON object (verdict) instead of an array;
the parser here is small and dedicated — guard-style claim extraction still
runs against the rationale + any ``amended_finding`` text.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from mantleproof.llm.provider import LLMProvider, get_provider
from mantleproof.tier1 import run_tier1
from mantleproof.tier2.prompt import build_prompt, load_skills

_OUTCOMES = {"DISMISSED": 1, "AMENDED": 2, "RETRACTED": 3}


def parse_verdict(raw_text: str) -> dict[str, Any]:
    """Pure: extract the JSON object from the model's response.

    The model is asked for a single object (not an array). We strip ```json
    fences if present, find the first '{' and the matching last '}'. Raises
    ValueError on unrecoverable shapes.
    """
    text = raw_text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
        text = text.rstrip("`").strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < start:
        raise ValueError(f"no JSON object found in re-audit raw_text: {raw_text!r}")
    obj = json.loads(text[start : end + 1])
    if not isinstance(obj, dict):
        raise ValueError(f"re-audit verdict is not an object: {obj!r}")
    return obj


def to_outcome_uint8(outcome_str: str) -> int:
    """Pure: map the verdict's ``outcome`` string to the on-chain DisputeStatus uint8."""
    key = outcome_str.strip().upper()
    if key not in _OUTCOMES:
        raise ValueError(
            f"invalid outcome {outcome_str!r}; expected one of {sorted(_OUTCOMES)}"
        )
    return _OUTCOMES[key]


def run_dispute_reaudit(
    *,
    original_audit: dict,
    counter_claim: dict,
    finding_index: int,
    source: str,
    bytecode: bytes,
    chain_id: int,
    target: str,
    contract_name: str = "",
    provider: LLMProvider | None = None,
    skills: dict[str, str] | None = None,
    run_tier1_fn: Callable[..., list] | None = None,
) -> dict[str, Any]:
    """Run the dispute re-audit pass. Pure given an injected ``provider``.

    Returns ``{outcome, outcome_uint8, rationale, amended_finding, raw_text,
              provider}``. The caller (``resolver.run_resolver_pass``) decides
    what to do with the verdict.
    """
    if skills is None:
        skills = load_skills()
    run_t1 = run_tier1_fn or run_tier1
    tier1 = run_t1(source, bytecode, chain_id, address=target)
    system, user = build_prompt(
        source,
        bytecode,
        tier1,
        deployer_history=None,
        skills=skills,
        contract_name=contract_name,
        original_audit=original_audit,
        counter_claim=counter_claim,
        finding_index=finding_index,
    )
    p = provider or get_provider()
    raw_text = p.reason(user, system)
    verdict = parse_verdict(raw_text)
    outcome_str = str(verdict.get("outcome", "")).upper()
    return {
        "outcome": outcome_str,
        "outcome_uint8": to_outcome_uint8(outcome_str),
        "rationale": str(verdict.get("rationale", "")),
        "amended_finding": verdict.get("amended_finding"),
        "raw_text": raw_text,
        "provider": p.name,
    }
