"""usde_check — Ethena USDe/sUSDe quirks (docs/mantleproof.md §4.3).

sUSDe redemption is gated by a multi-day cooldown (`cooldownShares` /
`cooldownAssets` → `unstake`); USDe is a synthetic dollar, not a hard $1 peg,
and sUSDe is not 1:1 convertible with USDe. Bug surface:

  H1  sUSDe redeemed synchronously expecting immediate USDe — no cooldown
      awareness (HIGH).
  H2  USDe and sUSDe treated as 1:1 convertible (MEDIUM).
  H3  USDe used as collateral with no oracle / depeg handling (LOW).

Tier 1 is heuristic → findings ship ``ESTIMATED``.
"""

from __future__ import annotations

import re

from mantleproof.checks._common import (
    calls_into,
    has,
    is_self_target,
    norm,
    referenced,
    register_address_pattern,
    word,
)
from mantleproof.checks.base import CheckResult, HonestyLabel, Severity
from mantleproof.config.mantle_tokens import TOKENS

CHECK_ID = "usde_check_v1"

_USDE = TOKENS[5000]["USDe"]
_SUSDE = TOKENS[5000]["sUSDe"]
register_address_pattern("usde_address_v1", _USDE)
register_address_pattern("susde_address_v1", _SUSDE)

_COOLDOWN = ("cooldown", "cooldownshares", "cooldownassets", "cooldownduration")
_CONVERSION = ("converttoassets", "converttoshares", "previewredeem", "previewwithdraw")
_REDEEM_VERBS = ("redeem", "withdraw", "unstake")
_PAR = re.compile(
    r"\b(?:susde\w*\s*=\s*usde\w*|usde\w*\s*=\s*susde\w*|"
    r"susde\w*\s*==\s*usde\w*|usde\w*\s*==\s*susde\w*)(?!\s*\()",
)


def run(
    source: str | None,
    bytecode: bytes,
    chain_id: int,
    *,
    address: str | None = None,
) -> list[CheckResult]:
    if is_self_target(address, _USDE, _SUSDE):
        return []
    low = norm(source)
    relevant, ev = referenced(
        low, bytecode, symbols=("USDe", "sUSDe"), addresses=(_USDE, _SUSDE)
    )
    if not relevant or (source is not None and not calls_into(low, "usde", "susde")):
        return []
    if source is None:
        return [
            CheckResult(
                CHECK_ID,
                Severity.LOW,
                HonestyLabel.ESTIMATED,
                "USDe/sUSDe integration detected in bytecode but source is "
                "unverified — Tier 1 deep checks skipped.",
                ev,
                sub_detector="usde.bytecode_only",
            )
        ]

    findings: list[CheckResult] = []

    if word(low, "susde") and has(low, *_REDEEM_VERBS) and not has(low, *_COOLDOWN):
        findings.append(
            CheckResult(
                CHECK_ID,
                Severity.HIGH,
                HonestyLabel.ESTIMATED,
                "sUSDe redemption path with no cooldown awareness. sUSDe "
                "enforces a multi-day cooldown (cooldownShares/cooldownAssets "
                "then unstake) — funds are not available synchronously.",
                {**ev, "matched_pattern": "susde_no_cooldown"},
                "Split redemption into cooldown initiation and a later "
                "unstake; never assume immediate USDe on redeem.",
                sub_detector="usde.cooldown_unawareness",
            )
        )

    if word(low, "usde") and word(low, "susde") and _PAR.search(low) and not has(
        low, *_CONVERSION
    ):
        findings.append(
            CheckResult(
                CHECK_ID,
                Severity.MEDIUM,
                HonestyLabel.ESTIMATED,
                "USDe and sUSDe assigned/compared 1:1. sUSDe accrues yield — "
                "convert via convertToAssets/previewRedeem, not at par.",
                {**ev, "matched_pattern": "usde_susde_1to1"},
                "Use ERC-4626 convertToAssets/previewRedeem for sUSDe↔USDe.",
                sub_detector="usde.par_assumption",
            )
        )

    if word(low, "usde") and has(low, "collateral") and not has(
        low, "oracle", "depeg", "price", "chainlink"
    ):
        findings.append(
            CheckResult(
                CHECK_ID,
                Severity.LOW,
                HonestyLabel.ESTIMATED,
                "USDe used as collateral with no oracle/depeg handling. USDe "
                "is a synthetic dollar, not a guaranteed $1 peg.",
                {**ev, "matched_pattern": "usde_no_depeg_handling"},
                "Price USDe via an oracle and handle depeg scenarios "
                "explicitly.",
                sub_detector="usde.no_depeg_handling",
            )
        )

    return findings
