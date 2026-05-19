"""Named bytecode pattern registry.

T8 ships the *infrastructure* + generic primitives. Check-specific named
patterns (e.g. ``lb_no_bin_validation_v1``) are registered by their check
modules in T10 via :func:`register`. Everything here is pure/offline.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from mantleproof.bytecode.disasm import (
    find_address_constants,
    find_selectors,
    has_opcode,
    pushes_value,
)


@dataclass(frozen=True, slots=True)
class PatternHit:
    pattern_id: str
    matched: bool
    evidence: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class MatchContext:
    chain_id: int
    addresses: frozenset[str] = frozenset()  # protocol addresses of interest
    selectors: frozenset[str] = frozenset()  # selectors of interest


PatternFn = Callable[[bytes | str, MatchContext], PatternHit]

_REGISTRY: dict[str, PatternFn] = {}


def register(pattern_id: str, fn: PatternFn) -> None:
    """Register a named pattern (used by check modules in T10)."""
    if pattern_id in _REGISTRY:
        raise ValueError(f"duplicate pattern id: {pattern_id}")
    _REGISTRY[pattern_id] = fn


def registered_ids() -> list[str]:
    return sorted(_REGISTRY)


def match_patterns(
    code: bytes | str,
    *,
    chain_id: int,
    addresses: frozenset[str] | None = None,
    selectors: frozenset[str] | None = None,
) -> list[PatternHit]:
    """Run every registered pattern; return only the hits that matched."""
    ctx = MatchContext(
        chain_id=chain_id,
        addresses=frozenset(a.lower() for a in (addresses or ())),
        selectors=frozenset(s.lower() for s in (selectors or ())),
    )
    hits: list[PatternHit] = []
    for fn in _REGISTRY.values():
        hit = fn(code, ctx)
        if hit.matched:
            hits.append(hit)
    return hits


# --- generic primitives the check modules compose ---------------------------


def address_constant_present(code: bytes | str, address: str) -> PatternHit:
    """A specific protocol address is embedded as a PUSH20 constant."""
    addr = address.lower()
    present = addr in {a.lower() for a in find_address_constants(code)}
    return PatternHit(
        "address_constant_present",
        present,
        {"address": addr} if present else {},
    )


def selector_present(code: bytes | str, selector: str) -> PatternHit:
    """A specific 4-byte function selector appears as a PUSH4 constant."""
    sel = selector.lower()
    if not sel.startswith("0x"):
        sel = "0x" + sel
    present = sel in {s.lower() for s in find_selectors(code)}
    return PatternHit("selector_present", present, {"selector": sel} if present else {})


def hardcoded_chainid(code: bytes | str, ctx: MatchContext) -> PatternHit:
    """Heuristic: bytecode embeds Ethereum mainnet chainId (1) as a constant
    while the active chain is not mainnet and CHAINID opcode is absent —
    the classic forked-EIP-712 replay bug (docs/resources.md §2.7).
    """
    if ctx.chain_id == 1:
        return PatternHit("hardcoded_chainid_1", False)
    suspicious = pushes_value(code, 1) and not has_opcode(code, "CHAINID")
    return PatternHit(
        "hardcoded_chainid_1",
        suspicious,
        {"note": "PUSH 1 present, no CHAINID opcode"} if suspicious else {},
    )


# Register the chainId heuristic now; address/selector primitives are
# parameterized and registered per-check in T10.
register("hardcoded_chainid_1", hardcoded_chainid)
