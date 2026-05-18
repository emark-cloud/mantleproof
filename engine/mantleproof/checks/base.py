"""Shared check primitives: severity, the five honesty labels, CheckResult.

The five honesty labels are non-negotiable (CLAUDE.md). Every finding carries
exactly one. The hallucination guard drops a finding's label one tier when a
claim cannot be verified — see tier2/hallucination_guard.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class Severity(StrEnum):
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class HonestyLabel(StrEnum):
    VERIFIED = "VERIFIED"  # strongest provenance
    COMPUTED = "COMPUTED"  # mathematically derived
    ESTIMATED = "ESTIMATED"  # heuristic
    EMULATED = "EMULATED"  # simulated
    LABELED = "LABELED"  # manual

    def dropped(self) -> HonestyLabel:
        """One-tier downgrade applied by the hallucination guard."""
        order = [
            HonestyLabel.VERIFIED,
            HonestyLabel.COMPUTED,
            HonestyLabel.ESTIMATED,
            HonestyLabel.EMULATED,
            HonestyLabel.LABELED,
        ]
        i = order.index(self)
        return order[min(i + 1, len(order) - 1)]


@dataclass(slots=True)
class CheckResult:
    check_id: str
    severity: Severity
    label: HonestyLabel
    finding: str
    evidence: dict[str, str] = field(default_factory=dict)
    suggested_fix: str = ""

    def to_dict(self) -> dict:
        return {
            "check_id": self.check_id,
            "severity": self.severity.value,
            "label": self.label.value,
            "finding": self.finding,
            "evidence": self.evidence,
            "suggested_fix": self.suggested_fix,
        }
