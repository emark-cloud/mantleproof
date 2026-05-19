"""Hallucination guard — the single most credibility-purchasing piece (CLAUDE.md).

Invariant (NEVER weaken / hide): before any Tier 2 report is signed/anchored,
every ``$``, ``%``, hex literal, and address claim in the LLM output is
regex-extracted and verified against the contract source line / bytecode offset /
Tier 1 findings. Unverifiable claims are masked ``[unsupported]`` AND the
finding's honesty label drops one tier. The count of masked claims is surfaced
publicly ("Hallucination guard fired: N masked").

Everything here is **pure and provider-agnostic** — no LLM, no network. The
runner hands us the provider's RAW TEXT; `parse_findings` turns it into
`CheckResult`s without relying on Anthropic tool-use structured output, and
`apply_guard` verifies + masks. Unit-tested independently of any provider
(test_hallucination_guard.py, T18).
"""

from __future__ import annotations

import dataclasses
import json
import re
from dataclasses import dataclass, field

from mantleproof.checks.base import CheckResult, HonestyLabel, Severity

# Claim patterns the guard must extract and verify. Ordered most-specific-first
# so an address span wins over the identical hex span it overlaps.
_CLAIM_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("address", re.compile(r"0x[a-fA-F0-9]{40}\b")),
    ("hex", re.compile(r"0x[a-fA-F0-9]{1,64}")),
    ("dollar", re.compile(r"\$\s?[\d,]+(?:\.\d+)?")),
    ("percent", re.compile(r"\d+(?:\.\d+)?\s?%")),
]

UNSUPPORTED_MASK = "[unsupported]"

# Claims this short (after normalisation) are too low-entropy to trust against
# bytecode — a 2-3 digit number trivially appears in any runtime hex blob, which
# would *manufacture* support. Such claims must be grounded in source / Tier-1.
_BYTECODE_MIN_LEN = 6

# Drop `$ % , 0x` and whitespace; lowercase. Applied identically to claim and
# corpus so verification is a plain substring test (auditable, no fuzzy match).
_DROP = str.maketrans("", "", " \t\n\r,$%")


def _norm(s: str) -> str:
    return s.lower().translate(_DROP).replace("0x", "")


@dataclass(slots=True)
class GuardOutcome:
    findings: list[CheckResult]
    masked_count: int  # surfaced as "Hallucination guard fired: N masked"
    per_finding_masked: list[int] = field(default_factory=list)
    dropped_labels: int = 0  # findings whose label was downgraded

    @property
    def public_note(self) -> str:
        return f"Hallucination guard fired: {self.masked_count} masked"


def drop_label(label: HonestyLabel) -> HonestyLabel:
    """Pure one-tier downgrade. Unit-tested independently of any provider (T18)."""
    return label.dropped()


def extract_claims(text: str) -> list[tuple[str, str]]:
    """Pure: return (kind, matched_text) for every verifiable claim in `text`."""
    out: list[tuple[str, str]] = []
    for kind, pat in _CLAIM_PATTERNS:
        out.extend((kind, m.group(0)) for m in pat.finditer(text))
    return out


def _spans(text: str) -> list[tuple[int, int, str]]:
    """Non-overlapping (start, end, kind), most-specific span wins a tie."""
    raw: list[tuple[int, int, int, str]] = []
    for prio, (kind, pat) in enumerate(_CLAIM_PATTERNS):
        for m in pat.finditer(text):
            raw.append((m.start(), m.end(), prio, kind))
    # earliest start, then longest, then most-specific pattern.
    raw.sort(key=lambda t: (t[0], -(t[1] - t[0]), t[2]))
    kept: list[tuple[int, int, str]] = []
    last_end = -1
    for start, end, _, kind in raw:
        if start >= last_end:
            kept.append((start, end, kind))
            last_end = end
    return kept


def parse_findings(raw_text: str) -> list[CheckResult]:
    """Pure, provider-agnostic parse of the Tier-2 JSON array into findings.

    The prompt mandates a JSON array only; we still defensively strip a stray
    ```json fence. A non-JSON / non-array body yields ``[]`` — a malformed
    Tier-2 reply must add NO findings, never crash the audit.
    """
    body = raw_text.strip()
    if body.startswith("```"):
        body = re.sub(r"^```[a-zA-Z]*\n?|\n?```$", "", body).strip()
    try:
        data = json.loads(body)
    except (json.JSONDecodeError, ValueError):
        return []
    if not isinstance(data, list):
        return []

    out: list[CheckResult] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        ev = item.get("evidence")
        out.append(
            CheckResult(
                check_id=str(item.get("check_id", "tier2_reasoning_v1")),
                severity=_coerce(Severity, item.get("severity"), Severity.INFO),
                # ESTIMATED is the conservative Tier-2 default the prompt asks for.
                label=_coerce(HonestyLabel, item.get("label"), HonestyLabel.ESTIMATED),
                finding=str(item.get("finding", "")),
                evidence={str(k): str(v) for k, v in ev.items()}
                if isinstance(ev, dict)
                else {},
                suggested_fix=str(item.get("suggested_fix", "")),
            )
        )
    return out


def _coerce(enum_cls, value, default):  # type: ignore[no-untyped-def]
    try:
        return enum_cls(str(value).lower() if enum_cls is Severity else str(value).upper())
    except ValueError:
        return default


def _corpus(source: str | None, bytecode: bytes, tier1: list[CheckResult]) -> tuple[str, str]:
    """(strict, full) normalised corpora.

    ``strict`` = source + Tier-1 text (where real $/% / short-hex claims live).
    ``full``  = strict + bytecode hex (only trustworthy for long hex/addresses).
    """
    parts: list[str] = []
    if source:
        parts.append(source)
    for r in tier1:
        parts.append(r.finding)
        parts.append(r.suggested_fix)
        parts.extend(str(v) for v in r.evidence.values())
    strict = _norm("\n".join(parts))
    full = strict + (_norm(bytecode.hex()) if bytecode else "")
    return strict, full


def _supported(kind: str, claim: str, strict: str, full: str) -> bool:
    n = _norm(claim)
    if not n:
        return True  # nothing quantitative to verify
    if kind in ("address", "hex") and len(n) >= _BYTECODE_MIN_LEN:
        return n in full
    return n in strict  # $ / % / short hex must be grounded in source or Tier-1


def _guard_text(text: str, strict: str, full: str) -> tuple[str, int]:
    """Mask every unsupported claim span in `text`. Returns (masked_text, n)."""
    spans = _spans(text)
    if not spans:
        return text, 0
    out: list[str] = []
    cur = 0
    masked = 0
    for start, end, kind in spans:
        out.append(text[cur:start])
        claim = text[start:end]
        if _supported(kind, claim, strict, full):
            out.append(claim)
        else:
            out.append(UNSUPPORTED_MASK)
            masked += 1
        cur = end
    out.append(text[cur:])
    return "".join(out), masked


def apply_guard(
    findings: list[CheckResult],
    *,
    source: str | None,
    bytecode: bytes,
    tier1: list[CheckResult],
) -> GuardOutcome:
    """Verify every claim; mask the unsupported ones and drop their label.

    Pure and provider-agnostic. For each finding the free-text ``finding`` and
    ``suggested_fix`` are scanned; any ``$``/``%``/hex/address claim not found in
    the contract source / bytecode / Tier-1 corpus is replaced with
    ``[unsupported]`` and the finding's honesty label drops exactly one tier
    (once, regardless of how many of its claims were masked). Inputs are not
    mutated.
    """
    strict, full = _corpus(source, bytecode, tier1)
    guarded: list[CheckResult] = []
    per_finding: list[int] = []
    total = 0
    dropped = 0
    for f in findings:
        new_finding, m1 = _guard_text(f.finding, strict, full)
        new_fix, m2 = _guard_text(f.suggested_fix, strict, full)
        n = m1 + m2
        per_finding.append(n)
        total += n
        label = f.label
        if n:
            label = drop_label(label)
            dropped += 1
        guarded.append(
            dataclasses.replace(
                f, finding=new_finding, suggested_fix=new_fix, label=label
            )
        )
    return GuardOutcome(
        findings=guarded,
        masked_count=total,
        per_finding_masked=per_finding,
        dropped_labels=dropped,
    )
