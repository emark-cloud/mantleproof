"""Hallucination guard — the single most credibility-purchasing piece (CLAUDE.md).

Invariant (NEVER weaken / hide): before any Tier 2 report is signed/anchored,
every ``$``, ``%``, hex literal, and address claim in the LLM output is
regex-extracted and verified against the contract source line / bytecode offset /
Tier 1 findings. Unverifiable claims are masked ``[unsupported]`` AND the
finding's honesty label drops one tier. The count of masked claims is surfaced
publicly.

`drop_label` and `extract_claims` are pure, provider-agnostic, and unit-tested
independently of any LLM (test_hallucination_guard.py, T18).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from mantleproof.checks.base import CheckResult, HonestyLabel

# Claim patterns the guard must extract and verify (T18).
_CLAIM_PATTERNS: dict[str, re.Pattern[str]] = {
    "dollar": re.compile(r"\$\s?[\d,]+(?:\.\d+)?"),
    "percent": re.compile(r"\d+(?:\.\d+)?\s?%"),
    "address": re.compile(r"0x[a-fA-F0-9]{40}"),
    "hex": re.compile(r"0x[a-fA-F0-9]{1,64}"),
}

UNSUPPORTED_MASK = "[unsupported]"


@dataclass(slots=True)
class GuardOutcome:
    findings: list[CheckResult]
    masked_count: int  # surfaced as "Hallucination guard fired: N masked"


def drop_label(label: HonestyLabel) -> HonestyLabel:
    """Pure one-tier downgrade. Unit-tested independently of any provider (T18)."""
    return label.dropped()


def extract_claims(text: str) -> list[tuple[str, str]]:
    """Pure: return (kind, matched_text) for every verifiable claim in `text`."""
    out: list[tuple[str, str]] = []
    for kind, pat in _CLAIM_PATTERNS.items():
        out.extend((kind, m.group(0)) for m in pat.finditer(text))
    return out


def apply_guard(
    findings: list[CheckResult],
    *,
    source: str | None,
    bytecode: bytes,
    tier1: list[CheckResult],
) -> GuardOutcome:
    """Verify every claim; mask the unsupported ones and drop their label.

    SCAFFOLD — verification logic implemented in T18. The extraction +
    label-drop primitives above are real and unit-testable now.
    """
    raise NotImplementedError("SCAFFOLD: apply_guard verification (T18)")
