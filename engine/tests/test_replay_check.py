"""T10 — replay_check: EIP-712 chain-ID & cross-chain replay."""

from mantleproof.checks import replay_check
from mantleproof.checks.base import HonestyLabel, Severity

CHAIN = 5000


def _pats(results):
    return {r.evidence.get("matched_pattern") for r in results}


def test_replay_positive_fixture_triggers(load_contract):
    results = replay_check.run(load_contract("replay_pos.sol"), b"", CHAIN)
    assert results
    assert all(r.check_id == replay_check.CHECK_ID for r in results)
    assert all(r.label is HonestyLabel.ESTIMATED for r in results)
    pats = _pats(results)
    assert "no_block_chainid" in pats
    assert "domain_missing_chainid" in pats
    assert "hardcoded_2300_gas" in pats
    high = next(r for r in results if r.evidence["matched_pattern"] == "no_block_chainid")
    assert high.severity is Severity.HIGH


def test_replay_negative_fixture_clean(load_contract):
    assert replay_check.run(load_contract("replay_neg.sol"), b"", CHAIN) == []


def test_replay_non_signing_contract_not_relevant():
    src = "contract C { uint256 x; function f() external { x += 1; } }"
    assert replay_check.run(src, b"", CHAIN) == []
