"""T12 precision regressions — real-world false positives found by running
Tier 1 against verified Mantle mainnet contracts must stay fixed.

Each case below mirrors an actual FP from validation/tier1_report.md before
the integration-handle gate + self-target guard were added.
"""

from mantleproof.checks import meth_check, usdy_check
from mantleproof.config.mantle_tokens import TOKEN_IMPL, TOKENS
from mantleproof.tier1 import run_tier1

CHAIN = 5000

# An ordinary ERC20/OFT token: balanceOf + totalSupply + transfer + a permit,
# and it merely *is named* mETH/USDe. It does not call into any protocol.
ERC20_SHAPED = """
contract METHL2 {
    mapping(address => uint256) _bal;
    uint256 public totalSupply;
    function balanceOf(address a) public view returns (uint256) { return _bal[a]; }
    function transfer(address to, uint256 v) external returns (bool) {
        _bal[msg.sender] -= v; _bal[to] += v; return true;
    }
    function permit(address o, address s, uint256 v) external {}
}
"""


def test_plain_erc20_token_is_not_an_integrator():
    # Was: meth_balance_proportional HIGH (every ERC20 has balanceOf+totalSupply).
    assert run_tier1(ERC20_SHAPED, b"", CHAIN) == []


def test_self_target_guard_suppresses_protocol_own_token():
    # Even integrator-looking source is suppressed when the audited address
    # IS the protocol token (you cannot misuse yourself).
    integrator = (
        "contract V { IERC20 meth; function f() external {"
        " uint256 b = meth.balanceOf(address(this));"
        " uint256 s = meth.totalSupply(); require(b < s); } }"
    )
    addr = TOKENS[5000]["mETH_L2"]
    assert any(r.check_id == "meth_check_v1" for r in run_tier1(integrator, b"", CHAIN))
    assert run_tier1(integrator, b"", CHAIN, address=addr) == []
    assert meth_check.run(integrator, b"", CHAIN, address=addr) == []


def test_self_guard_covers_proxy_implementation():
    # mUSD impl 0x907D… is still the protocol — guard the impl address too.
    impl = TOKEN_IMPL["mUSD"]
    integrator = (
        "contract W { IERC20 usdy; uint256 public snap;"
        " function r() external { snap = usdy.balanceOf(address(this)); } }"
    )
    assert usdy_check.run(integrator, b"", CHAIN)  # fires without the address
    assert usdy_check.run(integrator, b"", CHAIN, address=impl) == []
