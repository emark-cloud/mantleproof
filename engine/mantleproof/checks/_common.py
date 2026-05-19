"""Shared Tier-1 heuristic primitives for the five check modules (T10).

Tier 1 is *heuristic + bytecode pattern matching* (CLAUDE.md): cheap, offline,
no LLM. These helpers give every check the same notion of "is this contract
even relevant to protocol X" and the same source-normalisation, so the
individual checks only encode their bug-specific patterns.

Honesty labels (CLAUDE.md, non-negotiable): a Tier-1 *vulnerability* finding is
an inference from a regex/byte pattern, so it ships as ``ESTIMATED`` (heuristic).
Directly-observed facts (an address literally embedded in bytecode) are
``VERIFIED``-grade and only ever attached as evidence, never as a standalone
finding — that keeps negative fixtures genuinely clean.
"""

from __future__ import annotations

import re

from mantleproof.bytecode.disasm import find_address_constants
from mantleproof.bytecode.patterns import (
    PatternHit,
    register,
    registered_ids,
)

_LINE_COMMENT = re.compile(r"//[^\n]*")
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)


def strip_comments(source: str) -> str:
    """Remove `//` and `/* */` comments so prose never drives a heuristic.

    Tier 1 is intentionally noisy, but a contract that merely *mentions* USDY
    in a docstring is not a USDY integration — comment stripping removes the
    cheapest class of false positive before any matching runs.
    """
    s = _BLOCK_COMMENT.sub(" ", source)
    return _LINE_COMMENT.sub(" ", s)


def norm(source: str | None) -> str:
    """Lowercased, comment-free source for substring/regex matching."""
    return strip_comments(source or "").lower()


def has(low: str, *needles: str) -> bool:
    """Any needle (already lowercase) present in normalised source."""
    return any(n in low for n in needles)


def word(low: str, *words: str) -> bool:
    """Any token present as a whole word (symbol-style match)."""
    return any(re.search(rf"\b{re.escape(w)}\b", low) for w in words)


def bytecode_addresses(bytecode: bytes | None) -> set[str]:
    """Lowercased address constants embedded in deployed bytecode (PUSH20)."""
    if not bytecode:
        return set()
    return {a.lower() for a in find_address_constants(bytecode)}


def referenced(
    low: str,
    bytecode: bytes | None,
    *,
    symbols: tuple[str, ...] = (),
    addresses: tuple[str | None, ...] = (),
) -> tuple[bool, dict[str, str]]:
    """Does the contract integrate a protocol identified by `symbols`/`addresses`?

    Relevance signals, strongest first:
      * an address constant in *bytecode* (VERIFIED-grade — directly observed),
      * a pinned protocol address as a literal in *source*,
      * a protocol symbol used as a whole word in *source* (weakest).

    Returns ``(relevant, evidence)``; evidence keys feed CheckResult.evidence.
    """
    ev: dict[str, str] = {}
    addrs = tuple(a.lower() for a in addresses if a)
    consts = bytecode_addresses(bytecode)
    for a in addrs:
        if a in consts:
            ev["bytecode_address"] = a
            break
    for a in addrs:
        if a in low:
            ev["source_address"] = a
            break
    for s in symbols:
        if re.search(rf"\b{re.escape(s.lower())}\b", low):
            ev["source_symbol"] = s
            break
    return bool(ev), ev


def register_address_pattern(pattern_id: str, address: str | None) -> None:
    """Idempotently register a named 'protocol address embedded in bytecode'
    bytecode pattern (the T8 registry expects check modules to do this in T10).
    """
    if not address or pattern_id in registered_ids():
        return
    addr = address.lower()

    def _fn(code: bytes | str, _ctx: object) -> PatternHit:
        present = addr in {a.lower() for a in find_address_constants(code)} if code else False
        return PatternHit(pattern_id, present, {"address": addr} if present else {})

    register(pattern_id, _fn)
