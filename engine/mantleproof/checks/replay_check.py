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

# A *genuine* EIP712Domain typehash string — must carry the canonical fields
# (name + verifyingContract), so a bare/empty `EIP712Domain()` reference or an
# unrelated `permit(`/`DOMAIN_SEPARATOR()` view on a correct OZ token does NOT
# qualify. This is what makes a contract a self-rolled EIP-712 signer.
_TYPEHASH = re.compile(r"eip712domain\s*\(\s*([^)]*?)\)")
_DIGEST_1901 = ('"\\x19\\x01"', 'hex"1901"', "1901")
_CHAINID_BOUND = ("block.chainid", "chainid()")
_GAS_2300 = re.compile(r"\b2300\b")


def _domain_fields(low: str) -> str | None:
    """Return the field list of a real EIP712Domain typehash, else None."""
    for m in _TYPEHASH.finditer(low):
        fields = m.group(1)
        if "name" in fields and "verifyingcontract" in fields:
            return fields
    return None


def run(
    source: str | None,
    bytecode: bytes,
    chain_id: int,
    *,
    address: str | None = None,
) -> list[CheckResult]:
    low = norm(source)
    if source is None:
        return []
    fields = _domain_fields(low)
    self_signs = "ecrecover" in low and any(d in low for d in _DIGEST_1901)
    if fields is None and not self_signs:
        return []  # not a self-rolled EIP-712 signer → no Tier-1 replay risk

    findings: list[CheckResult] = []
    ev = {"surface": "eip712"}
    reads_chainid = has(low, *_CHAINID_BOUND)

    if fields is not None and "chainid" in fields and not reads_chainid:
        findings.append(
            CheckResult(
                CHECK_ID,
                Severity.HIGH,
                HonestyLabel.ESTIMATED,
                "EIP-712 domain models chainId but never reads block.chainid — "
                "the chain id is hardcoded/copied (classic forked-mainnet "
                "chainId=1). Signatures replay across chains.",
                {**ev, "matched_pattern": "no_block_chainid"},
                "Encode block.chainid into the domain separator and rebuild it "
                "when the chain id changes (OZ EIP712 pattern).",
            )
        )
    elif fields is not None and "chainid" not in fields:
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
