"""usde_check — Ethena USDe/sUSDe quirks.
SCAFFOLD — implement in T10 (Week 2). 2 fixtures each (+/-)."""

from __future__ import annotations

from mantleproof.checks.base import CheckResult

CHECK_ID = "usde_check_v1"


def run(source: str | None, bytecode: bytes, chain_id: int) -> list[CheckResult]:
    raise NotImplementedError("SCAFFOLD: usde_check (T10)")
