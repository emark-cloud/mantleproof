"""T10 — dex_check: Merchant Moe Liquidity Book (primary) + Uniswap V3."""

from mantleproof.checks import dex_check
from mantleproof.checks.base import HonestyLabel, Severity

CHAIN = 5000


def _pats(results):
    return {r.evidence.get("matched_pattern") for r in results}


def test_dex_lb_positive_triggers(load_contract):
    results = dex_check.run(load_contract("dex_lb_pos.sol"), b"", CHAIN)
    assert results
    assert all(r.label is HonestyLabel.ESTIMATED for r in results)
    pats = _pats(results)
    assert "lb_no_bin_validation" in pats
    assert "lb_static_fee" in pats
    bin_finding = next(
        r for r in results if r.evidence["matched_pattern"] == "lb_no_bin_validation"
    )
    assert bin_finding.severity is Severity.HIGH
    assert bin_finding.evidence["engine"] == "merchant_moe_lb"
    # T33/T34: every finding carries a dex.* slug + a known stage.
    assert all(r.sub_detector.startswith("dex.") for r in results)
    assert all(r.stage in {"configuration", "economic", "exploitation"} for r in results)


def test_dex_lb_negative_clean(load_contract):
    assert dex_check.run(load_contract("dex_lb_neg.sol"), b"", CHAIN) == []


def test_dex_v3_positive_triggers(load_contract):
    results = dex_check.run(load_contract("dex_v3_pos.sol"), b"", CHAIN)
    assert results
    pats = _pats(results)
    assert "v3_mint_no_slippage" in pats
    assert all(r.check_id == dex_check.CHECK_ID for r in results)


def test_dex_v3_negative_clean(load_contract):
    assert dex_check.run(load_contract("dex_v3_neg.sol"), b"", CHAIN) == []


def test_dex_unrelated_contract_not_relevant():
    assert dex_check.run("contract C { uint256 x; }", b"", CHAIN) == []
