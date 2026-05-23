"""T10 — usde_check: Ethena USDe/sUSDe quirks."""

from mantleproof.checks import usde_check
from mantleproof.checks.base import HonestyLabel, Severity

CHAIN = 5000


def _patterns(results):
    return {r.evidence.get("matched_pattern") for r in results}


def test_usde_positive_fixture_triggers(load_contract):
    src = load_contract("usde_pos.sol")
    results = usde_check.run(src, b"", CHAIN)

    assert results
    assert all(r.check_id == usde_check.CHECK_ID for r in results)
    assert all(r.label is HonestyLabel.ESTIMATED for r in results)
    pats = _patterns(results)
    assert "susde_no_cooldown" in pats
    assert "usde_susde_1to1" in pats
    cd = next(r for r in results if r.evidence["matched_pattern"] == "susde_no_cooldown")
    assert cd.severity is Severity.HIGH
    # T33/T34: every finding carries a usde.* slug + a known stage.
    assert all(r.sub_detector.startswith("usde.") for r in results)
    assert all(r.stage in {"configuration", "economic", "exploitation"} for r in results)


def test_usde_negative_fixture_clean(load_contract):
    src = load_contract("usde_neg.sol")
    assert usde_check.run(src, b"", CHAIN) == []


def test_usde_unrelated_contract_not_relevant():
    assert usde_check.run("contract C { uint256 x; }", b"", CHAIN) == []
