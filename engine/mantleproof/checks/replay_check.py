"""replay_check — EIP-712 chain-ID & cross-chain replay (docs/mantleproof.md §4.5).

Only runs on contracts with a signature-verification surface (EIP-712 domain
separator / ecrecover / permit). Bug surface:

  H1  domain separator never reads `block.chainid` — chain id is hardcoded or
      cached without a fork guard; signatures replay across chains (HIGH).
  H2  the EIP712Domain typehash omits `chainId` entirely (MEDIUM).
  H3  hardcoded 2300 gas stipend on a value transfer (LOW).

Tier 1 is heuristic → findings ship ``ESTIMATED``.
"""

from __future__ import annotations

import re

from mantleproof.checks._common import has, norm
from mantleproof.checks.base import CheckResult, HonestyLabel, Severity

CHECK_ID = "replay_check_v1"

_SIGN_SURFACE = (
    "domainseparator",
    "domain_separator",
    "_domainseparatorv4",
    "eip712domain",
    "domaintypehash",
    "ecrecover",
    "permit(",
    "_hashtypeddata",
)
_DOMAIN_CONSTRUCT = (
    "domainseparator",
    "domain_separator",
    "_domainseparatorv4",
    "eip712domain",
    "domaintypehash",
)
_CHAINID_BOUND = ("block.chainid", "chainid()")
_EIP712_TYPEHASH = re.compile(r"eip712domain\s*\(([^)]*)\)")
_GAS_2300 = re.compile(r"\b2300\b")


def run(source: str | None, bytecode: bytes, chain_id: int) -> list[CheckResult]:
    low = norm(source)
    if source is None or not has(low, *_SIGN_SURFACE):
        return []  # no signing surface → no replay risk

    findings: list[CheckResult] = []
    ev = {"surface": "eip712"}

    if has(low, *_DOMAIN_CONSTRUCT) and not has(low, *_CHAINID_BOUND):
        findings.append(
            CheckResult(
                CHECK_ID,
                Severity.HIGH,
                HonestyLabel.ESTIMATED,
                "EIP-712 domain separator never reads block.chainid. The chain "
                "id is hardcoded or cached with no fork guard — signatures "
                "replay across chains (classic forked-mainnet copy-paste).",
                {**ev, "matched_pattern": "no_block_chainid"},
                "Bind the domain separator to block.chainid and rebuild it "
                "when the chain id changes (OZ EIP712 pattern).",
            )
        )

    m = _EIP712_TYPEHASH.search(low)
    if m and "chainid" not in m.group(1):
        findings.append(
            CheckResult(
                CHECK_ID,
                Severity.MEDIUM,
                HonestyLabel.ESTIMATED,
                "EIP712Domain typehash omits chainId. A domain without chainId "
                "produces signatures valid on every chain.",
                {**ev, "matched_pattern": "domain_missing_chainid"},
                "Add `uint256 chainId` to the EIP712Domain typehash and "
                "include block.chainid in the encoded domain.",
            )
        )

    if _GAS_2300.search(low) and has(low, ".call", ".transfer(", ".send("):
        findings.append(
            CheckResult(
                CHECK_ID,
                Severity.LOW,
                HonestyLabel.ESTIMATED,
                "Hardcoded 2300 gas stipend on a value transfer. The 2300 "
                "stipend breaks on some L2 / smart-wallet receive paths.",
                {**ev, "matched_pattern": "hardcoded_2300_gas"},
                "Use a call with a sensible gas budget and check the return "
                "value; do not hardcode 2300.",
            )
        )

    return findings
