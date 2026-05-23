"""dex_check — Merchant Moe Liquidity Book v2.2 (primary) + Uniswap V3
(secondary). docs/mantleproof.md §4.4.

Merchant Moe is **not** Uniswap V3: Liquidity Book uses discrete *bins*
(constant-sum within a bin), ERC-1155 LP tokens, and a *variable* fee driven
by a volatility accumulator — different bug surface from V3 tick math.

LB primary:
  H-LB1  mint/burn with no bin-id bounds validation (HIGH).
  H-LB2  static fee read; LB fee is variable (MEDIUM).
  H-LB3  Uniswap-V3-style fee-growth accounting on an LB pool (MEDIUM).
Uniswap V3 secondary:
  H-V3   LP mint with no slippage/deadline bounds — frontrun-mintable (MEDIUM).

Agni Finance: source structure unconfirmed (docs/mantleproof.md §13.4) — if
V3-equivalent the V3 sub-check covers it; otherwise it is deferred to Tier 2
reasoning. No Tier-1 Agni sub-check ships until its source is verified.

Tier 1 is heuristic → findings ship ``ESTIMATED``.
"""

from __future__ import annotations

from mantleproof.checks._common import (
    calls_into,
    has,
    is_self_target,
    norm,
    register_address_pattern,
)
from mantleproof.checks.base import CheckResult, HonestyLabel, Severity
from mantleproof.config.mantle_tokens import TOKENS

CHECK_ID = "dex_check_v1"

_MOE = TOKENS[5000]["MOE"]
register_address_pattern("moe_address_v1", _MOE)

_LB_NAMES = (
    "lbpair",
    "lbrouter",
    "lbfactory",
    "ilbpair",
    "ilbrouter",
    "liquiditybook",
    "getactiveid",
    "binstep",
    "deposittobins",
    "merchantmoe",
)
_V3_NAMES = (
    "uniswapv3",
    "iuniswapv3pool",
    "inonfungiblepositionmanager",
    "iswaprouter",
    "nonfungiblepositionmanager",
    "sqrtpricex96",
    "ticklower",
    "tickupper",
    "tickspacing",
)
_LP_VERBS = ("mint", "burn", "addliquidity", "removeliquidity", "increaseliquidity")
_BIN_GUARDS = ("activeid", "getactiveid", "binstep", "binid")
_VAR_FEE = ("getvariablefee", "volatilityaccumulator", "getoracleparameters", "getfeeparameters")
_V3_FEEGROWTH = ("feegrowth", "feegrowthglobal", "feegrowthinside", "tickcumulative")
_V3_SLIPPAGE = ("amount0min", "amount1min", "sqrtpricelimit", "deadline", "slippage")


def run(
    source: str | None,
    bytecode: bytes,
    chain_id: int,
    *,
    address: str | None = None,
) -> list[CheckResult]:
    # The MOE governance token is not an LB integrator (T12: no self-audit FP).
    if is_self_target(address, _MOE):
        return []
    low = norm(source)
    # Holding/naming MOE is not "integrates Liquidity Book" — require actual LB
    # interface usage. Misuse findings further require an LB/NPM handle call.
    lb = has(low, *_LB_NAMES)
    v3 = has(low, *_V3_NAMES)
    if not (lb or v3):
        return []
    if source is None:
        return [
            CheckResult(
                CHECK_ID,
                Severity.LOW,
                HonestyLabel.ESTIMATED,
                "DEX (LB/Uniswap V3) integration detected in bytecode but "
                "source is unverified — Tier 1 deep checks skipped.",
                {"engine": "lb" if lb else "uniswap_v3"},
                sub_detector="dex.bytecode_only",
            )
        ]

    findings: list[CheckResult] = []

    if lb and (
        calls_into(low, "lbpair", "lbrouter", "lbfactory") or "deposittobins" in low
    ):
        ev = {"engine": "merchant_moe_lb"}
        if has(low, *_LP_VERBS) and not has(low, *_BIN_GUARDS):
            findings.append(
                CheckResult(
                    CHECK_ID,
                    Severity.HIGH,
                    HonestyLabel.ESTIMATED,
                    "Liquidity Book mint/burn with no bin-id bounds "
                    "validation. Without an active-bin / bin-step check "
                    "positions can be misassigned across bins.",
                    {**ev, "matched_pattern": "lb_no_bin_validation"},
                    "Validate target bin ids against getActiveId()/bin step "
                    "bounds before mint/burn.",
                    sub_detector="dex.lb_bin_bounds",
                )
            )
        if "fee" in low and not has(low, *_VAR_FEE):
            findings.append(
                CheckResult(
                    CHECK_ID,
                    Severity.MEDIUM,
                    HonestyLabel.ESTIMATED,
                    "Liquidity Book fee read as a static value. LB fees are "
                    "variable (volatility-accumulator driven) — static reads "
                    "compute the wrong amount.",
                    {**ev, "matched_pattern": "lb_static_fee"},
                    "Read the variable fee parameters (getVariableFee / oracle "
                    "parameters), not a static fee.",
                    sub_detector="dex.lb_static_fee",
                )
            )
        if has(low, *_V3_FEEGROWTH):
            findings.append(
                CheckResult(
                    CHECK_ID,
                    Severity.MEDIUM,
                    HonestyLabel.ESTIMATED,
                    "Uniswap-V3-style fee-growth accounting applied to a "
                    "Liquidity Book pool. LB pays fees per-swap, not per "
                    "tick-crossing — feeGrowth math is invalid here.",
                    {**ev, "matched_pattern": "lb_v3_feegrowth"},
                    "Use LB per-swap fee collection semantics, not V3 "
                    "feeGrowthInside accounting.",
                    sub_detector="dex.lb_v3_fee_accounting",
                )
            )

    if v3 and calls_into(
        low, "npm", "positionmanager", "uniswapv3pool", "swaprouter", "pool"
    ):
        ev = {"engine": "uniswap_v3"}
        if has(low, "mint", "addliquidity", "increaseliquidity") and not has(
            low, *_V3_SLIPPAGE
        ):
            findings.append(
                CheckResult(
                    CHECK_ID,
                    Severity.MEDIUM,
                    HonestyLabel.ESTIMATED,
                    "Uniswap V3 LP mint with no slippage (amountMin) or "
                    "deadline bounds — frontrun-mintable position.",
                    {**ev, "matched_pattern": "v3_mint_no_slippage"},
                    "Pass amount0Min/amount1Min and a deadline on mint / "
                    "increaseLiquidity.",
                    sub_detector="dex.v3_no_slippage",
                )
            )

    return findings
