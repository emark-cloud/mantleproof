"""T10 — usdy_check: USDY/mUSD integration correctness."""

from mantleproof.checks import usdy_check
from mantleproof.checks.base import HonestyLabel, Severity

CHAIN = 5000  # audit targets are mainnet even while the engine runs on Sepolia


def _sev(results):
    return {r.severity for r in results}


def test_usdy_positive_fixture_triggers(load_contract):
    src = load_contract("usdy_pos.sol")
    results = usdy_check.run(src, b"", CHAIN)

    assert results, "positive fixture must produce at least one finding"
    assert all(r.check_id == usdy_check.CHECK_ID for r in results)
    assert all(r.label is HonestyLabel.ESTIMATED for r in results)
    # the headline bug: a balance snapshotted into persistent storage.
    snap = [
        r for r in results
        if r.evidence.get("matched_pattern") == "balance_snapshot_to_storage"
    ]
    assert snap and snap[0].severity is Severity.HIGH
    # and the generic spot-feed pricing flag.
    assert any(r.evidence.get("matched_pattern") == "non_rwa_oracle" for r in results)
    # T33/T34: every finding carries a usdy.* slug + a known stage.
    assert all(r.sub_detector.startswith("usdy.") for r in results)
    assert all(r.stage in {"configuration", "economic", "exploitation"} for r in results)


def test_usdy_negative_fixture_clean(load_contract):
    src = load_contract("usdy_neg.sol")
    results = usdy_check.run(src, b"", CHAIN)

    assert Severity.HIGH not in _sev(results)
    assert Severity.MEDIUM not in _sev(results)
    assert results == []


def test_unrelated_contract_not_relevant():
    src = "contract Plain { uint256 x; function f() external { x = 1; } }"
    assert usdy_check.run(src, b"", CHAIN) == []
