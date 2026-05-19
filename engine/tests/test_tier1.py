"""T12 — Tier-1 union runner + rpc bytecode parser. Pure, offline."""

from mantleproof.checks.base import Severity
from mantleproof.source.rpc import parse_get_code
from mantleproof.tier1 import CHECK_IDS, run_tier1, summarize

CHAIN = 5000


def test_check_ids_stable_and_complete():
    assert CHECK_IDS == (
        "usdy_check_v1",
        "meth_check_v1",
        "usde_check_v1",
        "dex_check_v1",
        "replay_check_v1",
    )


def test_clean_contract_no_false_positive_storm():
    src = "contract Plain { uint256 x; function f() external { x += 1; } }"
    assert run_tier1(src, b"", CHAIN) == []


def test_union_runs_all_checks_and_sorts_high_first(load_contract):
    findings = run_tier1(load_contract("usdy_pos.sol"), b"", CHAIN)
    assert findings
    # highest severity first
    assert findings[0].severity is Severity.HIGH
    assert any(f.check_id == "usdy_check_v1" for f in findings)
    # other checks contribute nothing for this single-protocol fixture
    assert {f.check_id for f in findings} == {"usdy_check_v1"}


def test_summarize_shape(load_contract):
    findings = run_tier1(load_contract("meth_pos.sol"), b"", CHAIN)
    s = summarize(findings)
    assert s["total"] == len(findings)
    assert s["max_severity"] == "high"
    assert s["by_check"]["meth_check_v1"] >= 1
    assert set(s["by_severity"]) == {"info", "low", "medium", "high"}
    assert summarize([]) == {
        "total": 0,
        "by_severity": {"info": 0, "low": 0, "medium": 0, "high": 0},
        "by_check": {},
        "max_severity": None,
    }


def test_parse_get_code():
    assert parse_get_code({"result": "0x"}) == b""
    assert parse_get_code({"result": "0x6001600100"}) == bytes.fromhex("6001600100")
    assert parse_get_code({}) == b""
    assert parse_get_code({"result": "0xzz"}) == b""
