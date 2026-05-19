"""T10/T12 — replay_check: EIP-712 chain-ID & cross-chain replay."""

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
    assert "hardcoded_2300_gas" in pats
    high = next(r for r in results if r.evidence["matched_pattern"] == "no_block_chainid")
    assert high.severity is Severity.HIGH


def test_replay_negative_fixture_clean(load_contract):
    assert replay_check.run(load_contract("replay_neg.sol"), b"", CHAIN) == []


def test_replay_domain_missing_chainid_medium():
    src = """contract S {
        bytes32 constant TH = keccak256(
            "EIP712Domain(string name,string version,address verifyingContract)");
        function v(bytes32 h, uint8 a, bytes32 b, bytes32 c) external pure {
            bytes32 d = keccak256(abi.encodePacked("\\x19\\x01", TH, h));
            ecrecover(d, a, b, c);
        }
    }"""
    results = replay_check.run(src, b"", CHAIN)
    pats = _pats(results)
    assert "domain_missing_chainid" in pats
    f = next(r for r in results if r.evidence["matched_pattern"] == "domain_missing_chainid")
    assert f.severity is Severity.MEDIUM
    assert "no_block_chainid" not in pats  # no chainId field → not the H1 case


def test_replay_correct_oz_permit_not_flagged():
    """Regression (T12, USDeOFT-class FP): a correct OZ EIP712 token that
    reads block.chainid and exposes permit()/DOMAIN_SEPARATOR() must NOT fire."""
    src = """contract Token {
        bytes32 constant TH = keccak256(
          "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
        function _ds() internal view returns (bytes32) {
            return keccak256(abi.encode(TH, keccak256("T"), keccak256("1"),
                                        block.chainid, address(this)));
        }
        function permit(address o, address s, uint256 val) external {}
        function DOMAIN_SEPARATOR() external view returns (bytes32) { return _ds(); }
    }"""
    assert replay_check.run(src, b"", CHAIN) == []


def test_replay_non_signing_contract_not_relevant():
    src = "contract C { uint256 x; function f() external { x += 1; } }"
    assert replay_check.run(src, b"", CHAIN) == []
