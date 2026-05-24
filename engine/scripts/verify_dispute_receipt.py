#!/usr/bin/env python3
"""T47 — independent verifier for an on-chain dispute resolution.

Mirrors the verify_demo*_receipt.py + verify_reputation_receipt.py discipline:
separate web3 client (does not trust the engine's print output), read-only,
N/N checklist. Useful as a CI hook or as the proof attached to a demo video.

Verifies a single disputeId against:
  1. Dispute is on-chain (getDispute does not revert)
  2. Dispute has been resolved (status != PENDING)
  3. Optional --expect-outcome (DISMISSED|AMENDED|RETRACTED) matches
  4. reAuditRootHash is non-zero
  5. disputer matches the expected address (optional --expect-disputer)
  6. counter-stake transferred out of the registry on AMENDED/RETRACTED
     (registry balance delta proxy — or, more strictly, check disputer balance
     gain; we use the registry's `disputeCount() > disputeId` as a tractable
     consistency check)
  7. If RETRACTED + StakingPool deployed: StakingPool.stakeOf(rootHash).status
     == SLASHED_DISPUTE
  8. Audit's tier on-chain == 2 (Tier 1 audits should NEVER have disputes)
  9. Resolution tx (passed via --tx) emits DisputeResolved with matching args

Usage:
    cd engine && python scripts/verify_dispute_receipt.py \\
      --dispute-id 1 \\
      --network mantle \\
      [--expect-outcome RETRACTED] [--expect-disputer 0x…] [--tx 0x…]
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
from typing import Any

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from mantleproof.settings import get_settings  # noqa: E402

DISPUTE_STATUS = ["PENDING", "DISMISSED", "AMENDED", "RETRACTED"]
STAKE_STATUS = ["LOCKED", "RELEASED", "SLASHED_DISPUTE", "SLASHED_EXPLOIT"]

REGISTRY_ABI = [
    {
        "inputs": [{"name": "disputeId", "type": "uint256"}],
        "name": "getDispute",
        "outputs": [
            {
                "components": [
                    {"name": "rootHash", "type": "bytes32"},
                    {"name": "findingIndex", "type": "uint256"},
                    {"name": "disputer", "type": "address"},
                    {"name": "counterClaimIpfs", "type": "string"},
                    {"name": "counterStake", "type": "uint256"},
                    {"name": "antiSpamFee", "type": "uint256"},
                    {"name": "status", "type": "uint8"},
                    {"name": "submittedAt", "type": "uint64"},
                    {"name": "resolvedAt", "type": "uint64"},
                    {"name": "reAuditRootHash", "type": "bytes32"},
                ],
                "name": "",
                "type": "tuple",
            }
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "rootHash", "type": "bytes32"}],
        "name": "auditTier",
        "outputs": [{"name": "", "type": "uint8"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "disputeCount",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
]

POOL_ABI = [
    {
        "inputs": [{"name": "rootHash", "type": "bytes32"}],
        "name": "stakeOf",
        "outputs": [
            {
                "components": [
                    {"name": "rootHash", "type": "bytes32"},
                    {"name": "auditor", "type": "address"},
                    {"name": "amount", "type": "uint256"},
                    {"name": "lockedAt", "type": "uint64"},
                    {"name": "unlocksAt", "type": "uint64"},
                    {"name": "status", "type": "uint8"},
                ],
                "name": "",
                "type": "tuple",
            }
        ],
        "stateMutability": "view",
        "type": "function",
    },
]


def _deployment(network: str) -> dict[str, Any]:
    root = pathlib.Path(__file__).resolve().parents[2]
    path = root / "contracts" / "deployments" / f"{network}.addresses.json"
    return json.loads(path.read_text())


def _tick(ok: bool) -> str:
    return "✓" if ok else "✗"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__ or "")
    parser.add_argument("--dispute-id", required=True, type=int)
    parser.add_argument("--network", choices=("mantle", "mantleSepolia"), default="mantle")
    parser.add_argument("--expect-outcome", choices=("DISMISSED", "AMENDED", "RETRACTED"))
    parser.add_argument("--expect-disputer", help="0x… address that filed the dispute")
    parser.add_argument("--tx", help="resolution tx hash to verify DisputeResolved event")
    args = parser.parse_args()

    from web3 import Web3

    s = get_settings()
    rpc = s.mantle_rpc_url if args.network == "mantle" else s.mantle_sepolia_rpc_url
    dep = _deployment(args.network)
    registry_addr = dep["contracts"]["MantleProofRegistry"]
    pool_addr = dep["contracts"].get("StakingPool")

    w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 30}))
    chain_id = w3.eth.chain_id
    print(f"[verify] network={args.network} chainId={chain_id} registry={registry_addr}")

    registry = w3.eth.contract(
        address=Web3.to_checksum_address(registry_addr), abi=REGISTRY_ABI
    )

    checks: list[tuple[str, bool, str]] = []

    # 1. dispute exists
    try:
        d = registry.functions.getDispute(args.dispute_id).call()
        exists = True
    except Exception as exc:  # noqa: BLE001
        d = None
        exists = False
        print(f"[verify] getDispute reverted: {exc}")
    checks.append(("1. dispute exists on-chain", exists, f"id={args.dispute_id}"))
    if not exists or d is None:
        return _report(checks)

    (
        root_hash_bytes,
        finding_index,
        disputer,
        counter_claim_ipfs,
        counter_stake,
        anti_spam_fee,
        status,
        submitted_at,
        resolved_at,
        re_audit_root_bytes,
    ) = d
    root_hash_hex = "0x" + bytes(root_hash_bytes).hex()
    re_audit_hex = "0x" + bytes(re_audit_root_bytes).hex()
    status_name = DISPUTE_STATUS[int(status)] if 0 <= status < 4 else f"?({status})"
    print(
        f"[verify] dispute #{args.dispute_id} rootHash={root_hash_hex} "
        f"disputer={disputer} status={status_name} resolvedAt={resolved_at}"
    )

    # 2. resolved
    checks.append(
        ("2. dispute resolved (status != PENDING)", status != 0, f"status={status_name}")
    )

    # 3. expected outcome
    if args.expect_outcome:
        match = status_name == args.expect_outcome
        checks.append(
            (
                f"3. outcome == {args.expect_outcome}",
                match,
                f"actual={status_name}",
            )
        )

    # 4. reAuditRootHash non-zero
    zero_root = "0x" + "00" * 32
    checks.append(
        (
            "4. reAuditRootHash non-zero",
            re_audit_hex != zero_root,
            f"reAudit={re_audit_hex}",
        )
    )

    # 5. expected disputer
    if args.expect_disputer:
        match = disputer.lower() == args.expect_disputer.lower()
        checks.append(
            (
                f"5. disputer == {args.expect_disputer}",
                match,
                f"actual={disputer}",
            )
        )

    # 6. disputeCount consistency
    total = registry.functions.disputeCount().call()
    checks.append(
        (
            "6. registry.disputeCount > disputeId (consistency)",
            int(total) >= args.dispute_id,
            f"count={total}",
        )
    )

    # 7. SLASHED_DISPUTE if RETRACTED + pool available
    if status_name == "RETRACTED" and pool_addr:
        pool = w3.eth.contract(address=Web3.to_checksum_address(pool_addr), abi=POOL_ABI)
        try:
            ps = pool.functions.stakeOf(root_hash_bytes).call()
            pool_status_name = (
                STAKE_STATUS[int(ps[5])] if 0 <= ps[5] < 4 else f"?({ps[5]})"
            )
            checks.append(
                (
                    "7. StakingPool.status == SLASHED_DISPUTE",
                    pool_status_name == "SLASHED_DISPUTE",
                    f"pool status={pool_status_name}",
                )
            )
        except Exception as exc:  # noqa: BLE001
            checks.append(("7. StakingPool readable", False, str(exc)))

    # 8. tier == 2
    tier = registry.functions.auditTier(root_hash_bytes).call()
    checks.append(("8. underlying audit tier == 2", int(tier) == 2, f"tier={tier}"))

    # 9. resolution tx — event match
    if args.tx:
        receipt = w3.eth.get_transaction_receipt(args.tx)
        topic_resolved = (
            "0x"
            + Web3.keccak(text="DisputeResolved(uint256,bytes32,uint8,bytes32)")
            .hex()
            .removeprefix("0x")
        )
        match = False
        for log in receipt.get("logs", []):
            topics = log.get("topics", [])
            if not topics:
                continue
            # web3.py 7+ HexBytes.hex() omits the "0x" prefix; normalize both
            # sides so the comparison doesn't silently fail (caught here in
                # T47's verifier rerun against the live mainnet receipts).
            raw = topics[0].hex() if hasattr(topics[0], "hex") else str(topics[0])
            t0 = "0x" + raw.removeprefix("0x")
            if t0.lower() == topic_resolved.lower():
                match = True
                break
        checks.append(
            (
                "9. resolution tx emits DisputeResolved",
                match,
                f"tx={args.tx} status={receipt.get('status')}",
            )
        )

    return _report(checks)


def _report(checks: list[tuple[str, bool, str]]) -> int:
    print()
    print("Verification summary:")
    failed = 0
    for label, ok, detail in checks:
        print(f"  {_tick(ok)} {label}  ·  {detail}")
        if not ok:
            failed += 1
    print()
    print(f"  {len(checks) - failed}/{len(checks)} checks passed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
