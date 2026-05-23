"""T10 — meth_check: mETH staking & bridge accounting."""

from mantleproof.checks import meth_check
from mantleproof.checks.base import HonestyLabel, Severity

CHAIN = 5000


def _patterns(results):
    return {r.evidence.get("matched_pattern") for r in results}


def test_meth_positive_fixture_triggers(load_contract):
    src = load_contract("meth_pos.sol")
    results = meth_check.run(src, b"", CHAIN)

    assert results
    assert all(r.check_id == meth_check.CHECK_ID for r in results)
    assert all(r.label is HonestyLabel.ESTIMATED for r in results)
    pats = _patterns(results)
    assert "meth_balance_proportional" in pats
    assert "meth_cmeth_conflation" in pats
    prop = next(
        r for r in results if r.evidence["matched_pattern"] == "meth_balance_proportional"
    )
    assert prop.severity is Severity.HIGH
    # T33/T34: every finding carries a meth.* slug + a known stage.
    assert all(r.sub_detector.startswith("meth.") for r in results)
    assert all(r.stage in {"configuration", "economic", "exploitation"} for r in results)


def test_meth_negative_fixture_clean(load_contract):
    src = load_contract("meth_neg.sol")
    results = meth_check.run(src, b"", CHAIN)
    assert results == []


def test_meth_unrelated_contract_not_relevant():
    assert meth_check.run("contract C { uint256 x; }", b"", CHAIN) == []
