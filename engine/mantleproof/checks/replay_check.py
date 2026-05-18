"""replay_check — EIP-712 chain-id & cross-chain replay.
SCAFFOLD — implement in T10 (Week 2). 2 fixtures each (+/-)."""

from __future__ import annotations

from mantleproof.checks.base import CheckResult

CHECK_ID = "replay_check_v1"


def run(source: str | None, bytecode: bytes, chain_id: int) -> list[CheckResult]:
    raise NotImplementedError("SCAFFOLD: replay_check (T10)")
