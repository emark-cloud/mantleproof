"""Sub-detector taxonomy — stable slug per check-emit site (T33, T34).

Single source of truth for:

  * the **slug** (e.g. ``usdy.balance_snapshot``) a consuming agent branches on,
  * the human-readable **title** and **severity** baseline,
  * the **stage** (T34): ``configuration`` / ``economic`` / ``exploitation``
    so a deployer-agent can prioritize ("block on exploitation, warn on
    economic, log on configuration").

Per-finding `severity` in the check modules is still authoritative — taxonomy's
``severity`` field is the *baseline* (matches what the check currently emits)
and gives ``pipeline.build_report``'s ``sub_detectors_available`` block honest
self-description without forcing a runtime crosscheck.

Slugs are namespaced ``<dimension>.<bug>``; ``*.bytecode_only`` is the
source-unverified fallback each dimension emits when integration is detected
via bytecode but verified source is unavailable (Tier 2 will still reason).
"""

from __future__ import annotations

from typing import Final, TypedDict


class SubDetector(TypedDict):
    slug: str
    title: str
    severity: str  # baseline; check modules emit the authoritative per-finding severity
    stage: str  # configuration | economic | exploitation


# Deterministic slug -> stage map (T34). Mirrors plan-high-leverage-improvements.md
# §Item 3 with the ``*.bytecode_only`` fallback added per-dimension.
_STAGE_BY_SLUG: Final[dict[str, str]] = {
    # configuration — surface-level wiring / domain setup
    "replay.no_chainid": "configuration",
    "replay.eip712_missing_chainid": "configuration",
    "replay.hardcoded_2300_gas": "configuration",
    "usdy.unguarded_transfer": "configuration",
    # economic — value/accounting math that under- or over-states yield
    "usdy.balance_snapshot": "economic",
    "usdy.par_assumption": "economic",
    "usdy.wrong_oracle": "economic",
    "meth.balance_proportional": "economic",
    "meth.cmeth_conflation": "economic",
    "meth.stale_redemption": "economic",
    "usde.cooldown_unawareness": "economic",
    "usde.par_assumption": "economic",
    "usde.no_depeg_handling": "economic",
    # exploitation — directly fundable by an adversary at the protocol boundary
    "meth.no_rate_read": "exploitation",
    "dex.lb_bin_bounds": "exploitation",
    "dex.lb_static_fee": "exploitation",
    "dex.lb_v3_fee_accounting": "exploitation",
    "dex.v3_no_slippage": "exploitation",
    # source-unverified fallback — bytecode-only integration detection
    "usdy.bytecode_only": "configuration",
    "meth.bytecode_only": "configuration",
    "usde.bytecode_only": "configuration",
    "dex.bytecode_only": "configuration",
}


SUB_DETECTORS: Final[dict[str, list[SubDetector]]] = {
    "usdy_check_v1": [
        {
            "slug": "usdy.balance_snapshot",
            "title": "USDY/mUSD balanceOf snapshotted into persistent storage",
            "severity": "high",
            "stage": _STAGE_BY_SLUG["usdy.balance_snapshot"],
        },
        {
            "slug": "usdy.wrong_oracle",
            "title": "USDY/mUSD priced via a generic spot feed (not RWADynamicRateOracle)",
            "severity": "medium",
            "stage": _STAGE_BY_SLUG["usdy.wrong_oracle"],
        },
        {
            "slug": "usdy.par_assumption",
            "title": "USDY and mUSD treated as 1:1 fungible",
            "severity": "medium",
            "stage": _STAGE_BY_SLUG["usdy.par_assumption"],
        },
        {
            "slug": "usdy.unguarded_transfer",
            "title": "USDY/mUSD transfer with no blocklist `beforeTransfer` handling",
            "severity": "low",
            "stage": _STAGE_BY_SLUG["usdy.unguarded_transfer"],
        },
        {
            "slug": "usdy.bytecode_only",
            "title": "USDY/mUSD integration detected in bytecode, source unverified",
            "severity": "low",
            "stage": _STAGE_BY_SLUG["usdy.bytecode_only"],
        },
    ],
    "meth_check_v1": [
        {
            "slug": "meth.balance_proportional",
            "title": "mETH accounted by balanceOf / totalSupply (no rate read)",
            "severity": "high",
            "stage": _STAGE_BY_SLUG["meth.balance_proportional"],
        },
        {
            "slug": "meth.no_rate_read",
            "title": "mETH value/accounting path with no exchange-rate read",
            "severity": "medium",
            "stage": _STAGE_BY_SLUG["meth.no_rate_read"],
        },
        {
            "slug": "meth.cmeth_conflation",
            "title": "mETH and cmETH used interchangeably",
            "severity": "medium",
            "stage": _STAGE_BY_SLUG["meth.cmeth_conflation"],
        },
        {
            "slug": "meth.stale_redemption",
            "title": "Pre-2025-10 Validator-Queue exit timing assumed",
            "severity": "low",
            "stage": _STAGE_BY_SLUG["meth.stale_redemption"],
        },
        {
            "slug": "meth.bytecode_only",
            "title": "mETH/cmETH integration detected in bytecode, source unverified",
            "severity": "low",
            "stage": _STAGE_BY_SLUG["meth.bytecode_only"],
        },
    ],
    "usde_check_v1": [
        {
            "slug": "usde.cooldown_unawareness",
            "title": "sUSDe redemption path with no cooldown awareness",
            "severity": "high",
            "stage": _STAGE_BY_SLUG["usde.cooldown_unawareness"],
        },
        {
            "slug": "usde.par_assumption",
            "title": "USDe and sUSDe assigned/compared 1:1",
            "severity": "medium",
            "stage": _STAGE_BY_SLUG["usde.par_assumption"],
        },
        {
            "slug": "usde.no_depeg_handling",
            "title": "USDe used as collateral with no oracle/depeg handling",
            "severity": "low",
            "stage": _STAGE_BY_SLUG["usde.no_depeg_handling"],
        },
        {
            "slug": "usde.bytecode_only",
            "title": "USDe/sUSDe integration detected in bytecode, source unverified",
            "severity": "low",
            "stage": _STAGE_BY_SLUG["usde.bytecode_only"],
        },
    ],
    "dex_check_v1": [
        {
            "slug": "dex.lb_bin_bounds",
            "title": "Liquidity Book mint/burn with no bin-id bounds validation",
            "severity": "high",
            "stage": _STAGE_BY_SLUG["dex.lb_bin_bounds"],
        },
        {
            "slug": "dex.lb_static_fee",
            "title": "Liquidity Book fee read as static (LB fees are variable)",
            "severity": "medium",
            "stage": _STAGE_BY_SLUG["dex.lb_static_fee"],
        },
        {
            "slug": "dex.lb_v3_fee_accounting",
            "title": "Uniswap-V3-style fee-growth accounting applied to LB pool",
            "severity": "medium",
            "stage": _STAGE_BY_SLUG["dex.lb_v3_fee_accounting"],
        },
        {
            "slug": "dex.v3_no_slippage",
            "title": "Uniswap V3 LP mint with no slippage/deadline bounds",
            "severity": "medium",
            "stage": _STAGE_BY_SLUG["dex.v3_no_slippage"],
        },
        {
            "slug": "dex.bytecode_only",
            "title": "DEX (LB/V3) integration detected in bytecode, source unverified",
            "severity": "low",
            "stage": _STAGE_BY_SLUG["dex.bytecode_only"],
        },
    ],
    "replay_check_v1": [
        {
            "slug": "replay.no_chainid",
            "title": "EIP-712 domain models chainId but never reads block.chainid",
            "severity": "high",
            "stage": _STAGE_BY_SLUG["replay.no_chainid"],
        },
        {
            "slug": "replay.eip712_missing_chainid",
            "title": "EIP712Domain typehash omits chainId",
            "severity": "medium",
            "stage": _STAGE_BY_SLUG["replay.eip712_missing_chainid"],
        },
        {
            "slug": "replay.hardcoded_2300_gas",
            "title": "Hardcoded 2300 gas stipend on a value transfer",
            "severity": "low",
            "stage": _STAGE_BY_SLUG["replay.hardcoded_2300_gas"],
        },
    ],
}


def stage_of(slug: str) -> str:
    """Deterministic stage lookup for a sub-detector slug. Empty when unknown."""
    return _STAGE_BY_SLUG.get(slug, "")


# Flat index of every known slug (for tests + JSON schema discoverability).
ALL_SLUGS: Final[frozenset[str]] = frozenset(_STAGE_BY_SLUG)
