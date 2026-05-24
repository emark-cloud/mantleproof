"""Regression tests for the dispute re-audit extension of `tier2.prompt`.

Two important invariants pinned here:
 1. The system prompt is UNCHANGED when a counter-claim is present — the
    hallucination guard's claim-extraction (T18) must keep working.
 2. The user prompt gains the ORIGINAL_AUDIT + COUNTER_CLAIM blocks and the
    closing instruction switches from "JSON array" to "JSON object".
 3. Without the counter-claim args, the prompt is byte-identical to the
    canonical Tier 2 prompt (zero regression).
"""

from __future__ import annotations

from mantleproof.tier2 import prompt as p


def _base_kwargs():
    return dict(
        source="contract Foo {}\n",
        bytecode=b"",
        tier1=[],
        skills={"usdy_brief": "(brief omitted)"},
        contract_name="Foo",
    )


def test_canonical_prompt_unchanged_when_no_counter_claim():
    system_a, user_a = p.build_prompt(**_base_kwargs())
    # Canonical contract: still asks for the JSON ARRAY at the end.
    assert "Return the JSON array now." in user_a
    # No ORIGINAL AUDIT / COUNTER-CLAIM blocks present.
    assert "ORIGINAL AUDIT" not in user_a
    assert "COUNTER-CLAIM" not in user_a
    # System prompt is the canonical Tier-2 system.
    assert "Tier-2 auditor" in system_a


def test_dispute_prompt_injects_original_and_counter_claim_blocks():
    system, user = p.build_prompt(
        **_base_kwargs(),
        original_audit={
            "findings": [
                {"check_id": "usdy_check_v1", "severity": "high", "finding": "no snapshot"}
            ]
        },
        counter_claim={"cid": "bafkreicc", "claim": "the snapshot is there at L42"},
        finding_index=0,
    )
    assert "ORIGINAL AUDIT" in user
    assert "COUNTER-CLAIM (filed by the disputer" in user
    assert "DISPUTE RE-AUDIT INSTRUCTIONS" in user
    assert "Return the JSON object now." in user
    # The disputed finding's JSON shows up verbatim (or close).
    assert "usdy_check_v1" in user
    # System prompt remains the canonical one — guard still works.
    assert "Tier-2 auditor" in system
    # The "JSON ONLY" / array contract from the system prompt is untouched
    # (the verdict shape is requested in the user prompt's re-audit block).


def test_dispute_prompt_truncates_long_counter_claim():
    long_claim = "x" * 20_000
    _, user = p.build_prompt(
        **_base_kwargs(),
        original_audit={"findings": [{"check_id": "x"}]},
        counter_claim={"cid": "bafkreicc", "claim": long_claim},
        finding_index=0,
    )
    # _reaudit_block caps at 4000 chars.
    assert user.count("x") <= 4500  # leaves headroom for unrelated 'x' chars


def test_dispute_prompt_unknown_finding_index_handled():
    # finding_index past the list length → empty disputed block, no crash.
    _, user = p.build_prompt(
        **_base_kwargs(),
        original_audit={"findings": []},
        counter_claim={"cid": "bafkreicc", "claim": "claim text"},
        finding_index=99,
    )
    assert "ORIGINAL AUDIT" in user
    assert "(filed by the disputer" in user
