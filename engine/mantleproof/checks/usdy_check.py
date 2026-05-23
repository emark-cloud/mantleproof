"""usdy_check — USDY/mUSD integration correctness (docs/mantleproof.md §4.1).

USDY (Ondo) and mUSD on Mantle accrue value continuously and route transfers
through a blocklist `beforeTransfer` hook; pricing is the Ondo
`RWADynamicRateOracle`, not a spot feed. The classic integration bugs:

  H1  balance-snapshot accounting — a USDY/mUSD `balanceOf` cached into
      *persistent storage* and reused, silently dropping accrual (HIGH).
  H2  unguarded transfers — no `try`/handling around the blocklist
      `beforeTransfer` revert path (LOW).
  H3  wrong price feed — a generic `latestAnswer`/`latestRoundData` spot feed
      instead of Ondo's `RWADynamicRateOracle` (MEDIUM).
  H4  USDY and mUSD treated as 1:1 fungible (MEDIUM).

Tier 1 is heuristic → findings ship ``ESTIMATED``; Tier 2 reasons on top.
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
from mantleproof.config.mantle_tokens import TOKEN_IMPL, TOKENS

CHECK_ID = "usdy_check_v1"

_USDY = TOKENS[5000]["USDY"]
_MUSD = TOKENS[5000]["mUSD"]
# A protocol token's *proxy implementation* is still the protocol itself —
# guard those addresses too (T12: mUSD impl 0x907D… self-audit FP).
_SELF = (_USDY, _MUSD, TOKEN_IMPL.get("USDY"), TOKEN_IMPL.get("mUSD"))
register_address_pattern("usdy_address_v1", _USDY)
register_address_pattern("musd_address_v1", _MUSD)

# LHS identifier assigned from a `.balanceOf(` call.
_BAL_ASSIGN = re.compile(r"(\w+)\s*=\s*[\w.\[\]() ]*\.balanceof\s*\(", re.I)
# State-variable declarations only: require an explicit visibility/mutability
# keyword so plain function-local `uint256 x = ...` is NOT matched (a local
# cache is not the rebase-losing storage snapshot we are after).
_STATE_VAR = re.compile(
    r"\b(?:uint256|uint|int256|int|mapping\s*\([^;]*?\))\s+"
    r"(?:public|private|internal|immutable)\s+(\w+)\s*[;=]",
    re.I,
)


def _snapshot_to_storage(low: str) -> str | None:
    """A USDY/mUSD balance assigned into a state variable → rebase lost."""
    assigned = {m.group(1) for m in _BAL_ASSIGN.finditer(low)}
    if not assigned:
        return None
    state = {m.group(1) for m in _STATE_VAR.finditer(low)}
    hit = assigned & state
    return sorted(hit)[0] if hit else None


def run(
    source: str | None,
    bytecode: bytes,
    chain_id: int,
    *,
    address: str | None = None,
) -> list[CheckResult]:
    # A protocol's own token cannot misuse the protocol (T12: no self-audit FP).
    if is_self_target(address, *_SELF):
        return []
    low = norm(source)
    relevant, ev = referenced(
        low, bytecode, symbols=("USDY", "mUSD", "rUSDY"), addresses=(_USDY, _MUSD)
    )
    # Misuse findings require evidence the contract *integrates* USDY/mUSD
    # (an external call on a usdy/musd handle), not merely ERC20-shaped source.
    if not relevant or (source is not None and not calls_into(low, "usdy", "musd", "rusdy")):
        return []
    if source is None:
        return [
            CheckResult(
                CHECK_ID,
                Severity.LOW,
                HonestyLabel.ESTIMATED,
                "USDY/mUSD integration detected in bytecode but source is "
                "unverified — Tier 1 deep checks skipped; Tier 2 will reason "
                "over bytecode.",
                ev,
                sub_detector="usdy.bytecode_only",
            )
        ]

    findings: list[CheckResult] = []

    snap = _snapshot_to_storage(low)
    if snap:
        findings.append(
            CheckResult(
                CHECK_ID,
                Severity.HIGH,
                HonestyLabel.ESTIMATED,
                f"USDY/mUSD balanceOf snapshotted into persistent storage "
                f"(`{snap}`). USDY accrues continuously; a cached balance "
                f"misses all rebase between snapshot and use.",
                {**ev, "matched_pattern": "balance_snapshot_to_storage"},
                "Read balanceOf live at point of use, or track shares and "
                "convert via the current rate; never persist a raw balance.",
                sub_detector="usdy.balance_snapshot",
            )
        )

    if word(low, "rwadynamicrateoracle"):
        pass  # correct oracle in use
    elif has(low, "latestanswer", "latestrounddata", "getprice", "aggregatorv3"):
        findings.append(
            CheckResult(
                CHECK_ID,
                Severity.MEDIUM,
                HonestyLabel.ESTIMATED,
                "USDY/mUSD priced via a generic spot price feed. USDY must be "
                "valued through Ondo's RWADynamicRateOracle (continuous "
                "accrual), not a Chainlink-style spot answer.",
                {**ev, "matched_pattern": "non_rwa_oracle"},
                "Price USDY via RWADynamicRateOracle.getPrice() / the Ondo "
                "rate; reserve spot feeds for non-RWA assets.",
                sub_detector="usdy.wrong_oracle",
            )
        )

    if word(low, "musd", "rusdy") and word(low, "usdy"):
        if re.search(r"\bm?usd\w*\s*=\s*\w*usdy\w*\b", low) or re.search(
            r"\busdy\w*\s*=\s*\w*musd\w*\b", low
        ):
            findings.append(
                CheckResult(
                    CHECK_ID,
                    Severity.MEDIUM,
                    HonestyLabel.ESTIMATED,
                    "USDY and mUSD amounts assigned 1:1. They are distinct "
                    "instruments with different accrual — not fungible at par.",
                    {**ev, "matched_pattern": "usdy_musd_1to1"},
                    "Convert between USDY and mUSD via their respective rates; "
                    "never treat the amounts as interchangeable.",
                    sub_detector="usdy.par_assumption",
                )
            )

    if has(low, ".transfer(", ".transferfrom(") and "try " not in low:
        findings.append(
            CheckResult(
                CHECK_ID,
                Severity.LOW,
                HonestyLabel.ESTIMATED,
                "USDY/mUSD transfer with no handling for the blocklist "
                "`beforeTransfer` revert path; a blocked counterparty bricks "
                "the flow.",
                {**ev, "matched_pattern": "unguarded_blocklist_transfer"},
                "Wrap transfers in try/catch or pre-check blocklist status and "
                "fail gracefully.",
                sub_detector="usdy.unguarded_transfer",
            )
        )

    return findings
