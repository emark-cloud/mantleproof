"""T8 — bytecode disasm + pattern registry. Pure, offline."""

import pytest

from mantleproof.bytecode import patterns as P
from mantleproof.bytecode.disasm import (
    disassemble,
    find_address_constants,
    find_selectors,
    has_opcode,
    iter_pushes,
    pushes_value,
)

ADDR = "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432"
SEL = "0x70a08231"  # balanceOf(address)

PUSH20_ADDR = "73" + ADDR[2:] + "00"  # PUSH20 <addr>; STOP
PUSH4_SEL = "63" + SEL[2:] + "00"  # PUSH4 <sel>; STOP
CHAINID_BUG = "600100"  # PUSH1 1; STOP   (no CHAINID -> suspicious)
CHAINID_OK = "60014600"  # PUSH1 1; CHAINID; STOP


def test_disassemble_basic():
    ins = disassemble("0x60016002016000526001601ff300")
    names = [i.name for i in ins]
    assert names[0] == "PUSH1" and "ADD" in names
    assert ins[0].operand == 1


def test_iter_pushes_and_address_scan():
    pushes = list(iter_pushes(PUSH20_ADDR))
    assert pushes and pushes[0][1] == 20
    assert ADDR in {a.lower() for a in find_address_constants(PUSH20_ADDR)}
    # zero address / tiny values are not treated as address constants
    assert find_address_constants("600100") == set()


def test_find_selectors_and_values():
    assert SEL in find_selectors(PUSH4_SEL)
    assert pushes_value("600100", 1) is True
    assert pushes_value("600100", 2) is False
    assert has_opcode(CHAINID_OK, "chainid") is True
    assert has_opcode(CHAINID_BUG, "CHAINID") is False


def test_address_and_selector_primitives():
    assert P.address_constant_present(PUSH20_ADDR, ADDR).matched is True
    assert P.address_constant_present(PUSH20_ADDR, "0x" + "11" * 20).matched is False
    assert P.selector_present(PUSH4_SEL, SEL).matched is True
    assert P.selector_present(PUSH4_SEL, "0xdeadbeef").matched is False


def test_hardcoded_chainid_heuristic():
    ctx = P.MatchContext(chain_id=5000)
    assert P.hardcoded_chainid(CHAINID_BUG, ctx).matched is True
    assert P.hardcoded_chainid(CHAINID_OK, ctx).matched is False  # CHAINID present
    # On mainnet itself, chainId 1 is not a bug
    assert P.hardcoded_chainid(CHAINID_BUG, P.MatchContext(chain_id=1)).matched is False


def test_match_patterns_runs_registered():
    hits = P.match_patterns(CHAINID_BUG, chain_id=5000)
    assert any(h.pattern_id == "hardcoded_chainid_1" and h.matched for h in hits)
    assert P.match_patterns(CHAINID_OK, chain_id=5000) == []


def test_register_rejects_duplicates():
    with pytest.raises(ValueError):
        P.register("hardcoded_chainid_1", P.hardcoded_chainid)


def test_check_modules_register_address_patterns():
    """T10: importing the check modules registers their protocol-address
    bytecode patterns into the T8 registry (idempotently)."""
    import mantleproof.checks.dex_check  # noqa: F401
    import mantleproof.checks.meth_check  # noqa: F401
    import mantleproof.checks.usde_check  # noqa: F401
    import mantleproof.checks.usdy_check  # noqa: F401

    ids = set(P.registered_ids())
    assert {
        "usdy_address_v1",
        "musd_address_v1",
        "meth_l2_address_v1",
        "cmeth_address_v1",
        "usde_address_v1",
        "susde_address_v1",
        "moe_address_v1",
    } <= ids
    # idempotent: re-registering the same id is a silent no-op, not a raise
    from mantleproof.checks._common import register_address_pattern

    register_address_pattern("usdy_address_v1", "0x" + "ab" * 20)
    assert P.registered_ids().count("usdy_address_v1") == 1
