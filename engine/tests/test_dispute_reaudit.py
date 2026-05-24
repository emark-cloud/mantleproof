"""Unit tests for `mantleproof.dispute.reaudit` — verdict parsing + driver."""

from __future__ import annotations

import json

import pytest

from mantleproof.dispute import reaudit


def test_parse_verdict_plain_object():
    raw = '{"outcome":"DISMISSED","rationale":"weak claim"}'
    v = reaudit.parse_verdict(raw)
    assert v["outcome"] == "DISMISSED"


def test_parse_verdict_strips_markdown_fence():
    raw = '```json\n{"outcome":"AMENDED","rationale":"partial"}\n```'
    v = reaudit.parse_verdict(raw)
    assert v["outcome"] == "AMENDED"


def test_parse_verdict_extracts_object_when_surrounded_by_prose():
    raw = 'I think: {"outcome":"RETRACTED","rationale":"correct"} that is my answer'
    v = reaudit.parse_verdict(raw)
    assert v["outcome"] == "RETRACTED"


def test_parse_verdict_rejects_array():
    raw = "[]"
    with pytest.raises(ValueError):
        reaudit.parse_verdict(raw)


def test_parse_verdict_rejects_no_json():
    with pytest.raises(ValueError):
        reaudit.parse_verdict("no json here at all")


def test_to_outcome_uint8_maps_three_outcomes():
    assert reaudit.to_outcome_uint8("DISMISSED") == 1
    assert reaudit.to_outcome_uint8("amended") == 2
    assert reaudit.to_outcome_uint8(" Retracted ") == 3


def test_to_outcome_uint8_rejects_unknown():
    with pytest.raises(ValueError):
        reaudit.to_outcome_uint8("MAYBE")
    with pytest.raises(ValueError):
        reaudit.to_outcome_uint8("PENDING")


class _FakeProvider:
    name = "fake"

    def __init__(self, raw: str):
        self._raw = raw

    def reason(self, user, system):  # noqa: ANN001
        # Confirm system prompt was supplied (the canonical Tier 2 system block).
        assert "Tier-2 auditor" in system
        assert "ORIGINAL AUDIT" in user
        assert "COUNTER-CLAIM" in user
        return self._raw


def test_run_dispute_reaudit_end_to_end():
    raw = json.dumps(
        {
            "outcome": "RETRACTED",
            "rationale": "evidence shows the original was a false positive",
            "evidence": {"source_line": "L42", "matched_pattern": "no_rebase"},
        }
    )
    p = _FakeProvider(raw)

    # Avoid Tier-1 importing the real checks (it's already heavy elsewhere);
    # inject a tiny stub that returns no findings.
    out = reaudit.run_dispute_reaudit(
        original_audit={"findings": [{"check_id": "x", "severity": "high"}]},
        counter_claim={"cid": "bafkreicc", "claim": "the finding is wrong"},
        finding_index=0,
        source="contract Foo {}",
        bytecode=b"",
        chain_id=5000,
        target="0x" + "11" * 20,
        contract_name="Foo",
        provider=p,
        skills={},
        run_tier1_fn=lambda *a, **kw: [],
    )
    assert out["outcome"] == "RETRACTED"
    assert out["outcome_uint8"] == 3
    assert "false positive" in out["rationale"]
    assert out["provider"] == "fake"
