"""T17 — Tier 2 prompt builder, skills loader, and runner orchestration.

Pure/offline: a fake provider stands in for the LLM (live Gemini is exercised
separately by test_llm). These lock the guard-feeding prompt contract.
"""

from __future__ import annotations

from mantleproof.checks.base import CheckResult, HonestyLabel, Severity
from mantleproof.tier2.prompt import (
    TIER2_CHECK_ID,
    build_prompt,
    load_skills,
    number_source,
)
from mantleproof.tier2.runner import run_tier2

USDY_INTEGRATOR = (
    "contract V { IERC20 usdy; uint256 public snap;"
    " function r() external { snap = usdy.balanceOf(address(this)); } }"
)


class _FakeProvider:
    name = "fake"

    def __init__(self, out: str = "[]") -> None:
        self._out = out
        self.calls: list[tuple[str, str]] = []

    def reason(self, prompt: str, system: str) -> str:
        self.calls.append((prompt, system))
        return self._out


# --- skills loader ----------------------------------------------------------

def test_load_skills_are_real_not_scaffold():
    skills = load_skills()
    assert set(skills) == {
        "usdy",
        "meth",
        "usde",
        "merchant_moe_lb",
        "uniswap_v3",
        "eip712_replay",
    }
    for name, text in skills.items():
        assert "TODO" not in text, f"{name} still scaffold"
        assert "Bug patterns to detect" in text
        assert len(text) > 300
    assert load_skills(only={"usdy"}).keys() == {"usdy"}


def test_number_source_is_one_indexed_and_citeable():
    numbered = number_source("alpha\nbeta\ngamma")
    assert numbered.splitlines()[0] == "L1|alpha"
    assert numbered.splitlines()[2] == "L3|gamma"


# --- prompt contract (feeds the T18 guard) ---------------------------------

def test_system_prompt_enforces_grounded_json_only():
    sys, _ = build_prompt("contract C {}", b"", [], skills={})
    assert TIER2_CHECK_ID in sys
    assert "JSON ONLY" in sys
    assert "[unsupported]" in sys and "dropped one tier" in sys
    assert "ADDITIONAL" in sys  # must not restate Tier-1


def test_user_prompt_includes_all_inputs():
    tier1 = [
        CheckResult(
            "usdy_check_v1",
            Severity.HIGH,
            HonestyLabel.ESTIMATED,
            "snapshotted balance",
            {"matched_pattern": "balance_snapshot_to_storage"},
        )
    ]
    _, user = build_prompt(
        "contract C {\n  uint x;\n}",
        b"\x60\x01",
        tier1,
        ["0xdeadbeef… vaultA"],
        skills={"usdy": "USDY brief body"},
        contract_name="CoolVault",
    )
    assert "CoolVault" in user
    assert "usdy_check_v1" in user and "balance_snapshot_to_storage" in user
    assert "skill:usdy" in user and "USDY brief body" in user
    assert "0xdeadbeef… vaultA" in user
    assert "L1|contract C {" in user and "L2|  uint x;" in user
    assert "0x6001" in user  # bytecode hex view


def test_bytecode_view_handles_empty_and_truncation():
    _, empty = build_prompt("contract C {}", b"", [], skills={})
    assert "(bytecode unavailable)" in empty
    _, big = build_prompt("contract C {}", b"\xab" * 9000, [], skills={})
    assert "truncated; 9000 bytes total" in big


# --- runner orchestration (offline, fake provider) -------------------------

def test_run_tier2_offline_pipes_inputs_to_provider():
    fake = _FakeProvider('[{"check_id":"tier2_reasoning_v1","finding":"x"}]')
    out = run_tier2(
        "0xTarget",
        source=USDY_INTEGRATOR,
        contract_name="V",
        bytecode=b"",
        provider=fake,
    )
    assert out["status"] == "ok"
    assert out["provider"] == "fake"
    assert out["raw_text"] == '[{"check_id":"tier2_reasoning_v1","finding":"x"}]'
    # Tier-1 union ran and is carried for the guard (usdy snapshot fired)
    assert any(f["check_id"] == "usdy_check_v1" for f in out["tier1"])
    assert len(out["skills_loaded"]) == 6
    assert out["user_prompt_chars"] > out["system_prompt_chars"] > 0
    # the provider actually received the built (user, system) prompt
    user, system = fake.calls[0]
    assert "TIER-1 FINDINGS" in user and TIER2_CHECK_ID in system


def test_run_tier2_unverified_source_short_circuits(monkeypatch):
    import mantleproof.source.mantlescan as ms

    class _NoSrc:
        def __init__(self, *a, **k): ...
        def get_source(self, *a, **k):
            return None

    monkeypatch.setattr(ms, "MantlescanClient", _NoSrc)
    out = run_tier2("0xUnverified")  # no source passed → resolves (mocked) → None
    assert out["status"] == "unverified_source"
    assert "raw_text" not in out
