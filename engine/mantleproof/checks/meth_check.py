"""meth_check — mETH staking & bridge accounting (docs/mantleproof.md §4.2).

Critical L1/L2 distinction: mETH's canonical staking (`Staking`,
`UnstakeRequestsManager`, `Oracle`) lives on Ethereum L1; on Mantle L2 mETH is
a *bridged wrapped* representation whose value accrues via an exchange rate,
not via balance changes. Bug surface:

  H1  balance-proportional accounting — `mETH.balanceOf(x) / totalSupply * X`
      (wrong: mETH accrues by rate, not balance) (HIGH).
  H2  no exchange-rate read at all on a value/accounting path (MEDIUM).
  H3  mETH and cmETH (restaked, different oracle/risk) conflated (MEDIUM).
  H4  pre-2025-10 Validator-Queue exit timing assumed; redemption now routes
      through the Aave Liquidity Buffer (LOW).

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
from mantleproof.config.mantle_tokens import METH_L1_TOKEN, TOKENS

CHECK_ID = "meth_check_v1"

_METH = TOKENS[5000]["mETH_L2"]
_CMETH = TOKENS[5000]["cmETH"]
register_address_pattern("meth_l2_address_v1", _METH)
register_address_pattern("cmeth_address_v1", _CMETH)
register_address_pattern("meth_l1_token_v1", METH_L1_TOKEN)

# Any signal that the contract is rate-aware (then balance accounting is OK).
_RATE_SIGNALS = (
    "exchangerate",
    "exchange_rate",
    "methtoeth",
    "ethpermeth",
    "methrate",
    "getrate",
    "oracle",
    "converttoassets",
    "previewredeem",
)
_ACCOUNTING_VERBS = ("deposit", "withdraw", "redeem", "shares", "convert", "valueof")
_CONFLATE = re.compile(
    r"\b(?:cmeth\w*\s*=\s*meth\w*|meth\w*\s*=\s*cmeth\w*|"
    r"cmeth\w*\s*==\s*meth\w*|meth\w*\s*==\s*cmeth\w*)(?!\s*\()",
)
# A balanceOf call on an external mETH handle (`meth.balanceOf(`), NOT the
# contract's own `function balanceOf` — the latter is true of every ERC20.
_METH_BAL_CALL = re.compile(r"\bc?meth\w*\s*\.\s*balanceof\s*\(", re.I)


def run(
    source: str | None,
    bytecode: bytes,
    chain_id: int,
    *,
    address: str | None = None,
) -> list[CheckResult]:
    if is_self_target(address, _METH, _CMETH):
        return []
    low = norm(source)
    relevant, ev = referenced(
        low,
        bytecode,
        symbols=("mETH", "cmETH"),
        addresses=(_METH, _CMETH, METH_L1_TOKEN),
    )
    if not relevant or (source is not None and not calls_into(low, "meth", "cmeth")):
        return []
    if source is None:
        return [
            CheckResult(
                CHECK_ID,
                Severity.LOW,
                HonestyLabel.ESTIMATED,
                "mETH/cmETH integration detected in bytecode but source is "
                "unverified — Tier 1 deep checks skipped.",
                ev,
            )
        ]

    findings: list[CheckResult] = []
    rate_aware = has(low, *_RATE_SIGNALS)

    if _METH_BAL_CALL.search(low) and "totalsupply" in low and not rate_aware:
        findings.append(
            CheckResult(
                CHECK_ID,
                Severity.HIGH,
                HonestyLabel.ESTIMATED,
                "mETH accounted by balanceOf / totalSupply proportion with no "
                "exchange-rate read. mETH accrues via its exchange rate, not "
                "balance changes — proportional balance math under-counts yield.",
                {**ev, "matched_pattern": "meth_balance_proportional"},
                "Value mETH via the mETH exchange rate (bridged Oracle read or "
                "an accepted recent rate snapshot), not balanceOf proportions.",
            )
        )
    elif has(low, *_ACCOUNTING_VERBS) and not rate_aware:
        findings.append(
            CheckResult(
                CHECK_ID,
                Severity.MEDIUM,
                HonestyLabel.ESTIMATED,
                "mETH value/accounting path with no exchange-rate read. "
                "Bridged L2 mETH value ≠ token balance.",
                {**ev, "matched_pattern": "meth_no_exchange_rate"},
                "Read the mETH exchange rate before pricing positions.",
            )
        )

    if word(low, "cmeth") and word(low, "meth") and _CONFLATE.search(low):
        findings.append(
            CheckResult(
                CHECK_ID,
                Severity.MEDIUM,
                HonestyLabel.ESTIMATED,
                "mETH and cmETH used interchangeably. cmETH is the restaked "
                "variant with a different oracle and risk profile — not "
                "substitutable for mETH at par.",
                {**ev, "matched_pattern": "meth_cmeth_conflation"},
                "Track and price cmETH on its own oracle; never assign mETH "
                "and cmETH amounts to each other.",
            )
        )

    if has(low, "validatorqueue", "unstakerequest") and not has(
        low, "liquiditybuffer", "aave"
    ):
        findings.append(
            CheckResult(
                CHECK_ID,
                Severity.LOW,
                HonestyLabel.ESTIMATED,
                "Redemption logic assumes pre-2025-10 Validator-Queue exit "
                "timing; mETH redemption now routes through the Aave Liquidity "
                "Buffer — exit timing assumptions are stale.",
                {**ev, "matched_pattern": "meth_validator_queue_assumption"},
                "Account for the Liquidity Buffer (Aave) redemption route, not "
                "Validator-Queue exit timing.",
            )
        )

    return findings
