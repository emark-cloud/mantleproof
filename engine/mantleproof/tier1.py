"""Tier-1 runner — the union of the five Mantle-specific checks (T10/T12).

Tier 1 is the cheap, offline, no-LLM pass (CLAUDE.md): for a target it runs
every check module and returns the union of findings. The order is stable so
reports diff cleanly. Tier 2 (T17+) reasons on top of this union.

This module is pure: give it source + bytecode + chain_id, get findings.
Network resolution of real targets lives in the T12 validation harness
(`scripts/validate_tier1.py`), not here.
"""

from __future__ import annotations

from mantleproof.checks import (
    dex_check,
    meth_check,
    replay_check,
    usde_check,
    usdy_check,
)
from mantleproof.checks.base import CheckResult, Severity

# Stable order = stable report diffs. Each module exposes run() + CHECK_ID.
CHECKS = (usdy_check, meth_check, usde_check, dex_check, replay_check)
CHECK_IDS = tuple(m.CHECK_ID for m in CHECKS)

_SEV_ORDER = {
    Severity.HIGH: 0,
    Severity.MEDIUM: 1,
    Severity.LOW: 2,
    Severity.INFO: 3,
}


def run_tier1(
    source: str | None,
    bytecode: bytes,
    chain_id: int,
    *,
    address: str | None = None,
) -> list[CheckResult]:
    """Run all five checks; return the union, highest severity first.

    `address` (the audited contract's own address) lets each check suppress
    self-audit false positives — a protocol's own token cannot misuse the
    protocol (T12 precision).
    """
    findings: list[CheckResult] = []
    for module in CHECKS:
        findings.extend(module.run(source, bytecode, chain_id, address=address))
    findings.sort(key=lambda r: (_SEV_ORDER[r.severity], r.check_id))
    return findings


def summarize(findings: list[CheckResult]) -> dict[str, object]:
    """Compact roll-up for a validation report row / API response."""
    by_sev: dict[str, int] = {s.value: 0 for s in Severity}
    by_check: dict[str, int] = {}
    for f in findings:
        by_sev[f.severity.value] += 1
        by_check[f.check_id] = by_check.get(f.check_id, 0) + 1
    return {
        "total": len(findings),
        "by_severity": by_sev,
        "by_check": by_check,
        "max_severity": (
            min((f.severity for f in findings), key=lambda s: _SEV_ORDER[s]).value
            if findings
            else None
        ),
    }
