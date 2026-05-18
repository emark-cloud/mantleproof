"""meth_check — mETH staking & bridge accounting (L1 canonical / L2 bridged).
SCAFFOLD — implement in T10 (Week 2). 2 fixtures each (+/-)."""

from __future__ import annotations

from mantleproof.checks.base import CheckResult

CHECK_ID = "meth_check_v1"


def run(source: str | None, bytecode: bytes, chain_id: int) -> list[CheckResult]:
    raise NotImplementedError("SCAFFOLD: meth_check (T10)")
