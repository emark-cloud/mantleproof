#!/usr/bin/env python3
"""T40 — Independent verifier for an on-chain ERC-8004 v2 reputation entry.

Mirrors the ``verify_demoN_receipt.py`` discipline: read everything back from
chain with a separate web3 client (do NOT trust the demo script's print),
and confirm the feedback landed where it claims.

Verifies (in order):

  1. RPC liveness + ``chain_id`` matches the per-chain Reputation Registry
     address we have on file (lock-in from T37).
  2. ``IIdentityRegistry.isAuthorizedOrOwner(payer, agentId) == false``
     (the payer is structurally allowed to leave feedback — i.e. it is not
     the agent's owner/operator/approved address).
  3. ``getLastIndex(agentId, payer) >= 1`` (an entry exists).
  4. ``readFeedback(agentId, payer, lastIndex)`` returns a non-revoked
     entry; optionally matches expected tag1/tag2/value.
  5. ``getSummary(agentId, [payer], "", "") .count`` matches the
     last-index minus any revocations.

Usage:
  python -u scripts/verify_reputation_receipt.py \\
    --payer=<addr> \\
    [--agent-id=96] \\
    [--network=mantleSepolia|mantle] \\
    [--expect-tag1=audit-quality] [--expect-value=<int>]
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from web3 import Web3  # noqa: E402

from mantleproof.reputation.feedback import (  # noqa: E402
    IDENTITY_REGISTRY_BY_CHAIN,
    REPUTATION_REGISTRY_BY_CHAIN,
)
from mantleproof.settings import get_settings  # noqa: E402

REPUTATION_ABI = [
    {
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "clientAddress", "type": "address"},
        ],
        "name": "getLastIndex",
        "outputs": [{"name": "", "type": "uint64"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "clientAddress", "type": "address"},
            {"name": "feedbackIndex", "type": "uint64"},
        ],
        "name": "readFeedback",
        "outputs": [
            {"name": "value", "type": "int128"},
            {"name": "valueDecimals", "type": "uint8"},
            {"name": "tag1", "type": "string"},
            {"name": "tag2", "type": "string"},
            {"name": "isRevoked", "type": "bool"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "clientAddresses", "type": "address[]"},
            {"name": "tag1", "type": "string"},
            {"name": "tag2", "type": "string"},
        ],
        "name": "getSummary",
        "outputs": [
            {"name": "count", "type": "uint64"},
            {"name": "summaryValue", "type": "int128"},
            {"name": "summaryValueDecimals", "type": "uint8"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "getVersion",
        "outputs": [{"name": "", "type": "string"}],
        "stateMutability": "pure",
        "type": "function",
    },
]

IDENTITY_ABI = [
    {
        "inputs": [
            {"name": "spender", "type": "address"},
            {"name": "agentId", "type": "uint256"},
        ],
        "name": "isAuthorizedOrOwner",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "tokenId", "type": "uint256"}],
        "name": "ownerOf",
        "outputs": [{"name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function",
    },
]


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    p.add_argument("--payer", required=True, help="Address that posted the feedback")
    p.add_argument(
        "--agent-id",
        type=int,
        default=None,
        help="Defaults to settings.mantleproof_agent_token_id",
    )
    p.add_argument("--network", choices=("mantle", "mantleSepolia"), default=None)
    p.add_argument("--expect-tag1", default=None)
    p.add_argument("--expect-tag2", default=None)
    p.add_argument("--expect-value", type=int, default=None)
    return p.parse_args()


def main() -> int:
    args = _parse_args()
    if args.network:
        os.environ["MANTLE_NETWORK"] = args.network

    s = get_settings()
    chain_id = s.chain_id
    rpc = s.active_rpc_url
    rep_addr = Web3.to_checksum_address(REPUTATION_REGISTRY_BY_CHAIN[chain_id])
    id_addr = Web3.to_checksum_address(IDENTITY_REGISTRY_BY_CHAIN[chain_id])
    agent_id = args.agent_id if args.agent_id is not None else s.mantleproof_agent_token_id
    payer = Web3.to_checksum_address(args.payer)

    w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 30}))
    actual = w3.eth.chain_id
    rep = w3.eth.contract(address=rep_addr, abi=REPUTATION_ABI)
    iden = w3.eth.contract(address=id_addr, abi=IDENTITY_ABI)

    version = rep.functions.getVersion().call()
    print(f"[chain]      {actual} via {rpc}")
    print(f"[reputation] {rep_addr} (v{version})")
    print(f"[identity]   {id_addr}")
    print(f"[agent]      tokenId={agent_id}")
    print(f"[payer]      {payer}")

    checks: list[tuple[str, bool]] = []
    checks.append(("RPC chain_id matches T37 registry table", actual == chain_id))
    checks.append(("Reputation Registry reports v2.0.0", version == "2.0.0"))

    # 2. anti-self-feedback structural check
    is_auth = iden.functions.isAuthorizedOrOwner(payer, agent_id).call()
    print(f"[identity]   isAuthorizedOrOwner({payer}, {agent_id}) = {is_auth}")
    checks.append(("payer is NOT owner/operator/approved (sybil-resistant)", not is_auth))

    # 3. getLastIndex
    last = rep.functions.getLastIndex(agent_id, payer).call()
    print(f"[reputation] getLastIndex({agent_id}, payer) = {last}")
    checks.append(("getLastIndex >= 1 (at least one feedback exists)", last >= 1))

    if last >= 1:
        value, decimals, tag1, tag2, revoked = rep.functions.readFeedback(
            agent_id, payer, last
        ).call()
        print(
            f"[reputation] readFeedback(latest) = value={value} decimals={decimals} "
            f"tag1={tag1!r} tag2={tag2!r} revoked={revoked}"
        )
        checks.append(("latest feedback is not revoked", not revoked))
        if args.expect_tag1 is not None:
            checks.append((f"tag1 == {args.expect_tag1!r}", tag1 == args.expect_tag1))
        if args.expect_tag2 is not None:
            checks.append((f"tag2 == {args.expect_tag2!r}", tag2 == args.expect_tag2))
        if args.expect_value is not None:
            checks.append((f"value == {args.expect_value}", value == args.expect_value))

    # 5. getSummary cross-check
    count, summary_value, summary_decimals = rep.functions.getSummary(
        agent_id, [payer], "", ""
    ).call()
    print(
        f"[reputation] getSummary([payer]) = count={count} "
        f"value={summary_value} decimals={summary_decimals}"
    )
    checks.append(("getSummary.count >= 1", count >= 1))
    checks.append(("getSummary.count <= getLastIndex (revocations consistent)", count <= last))

    print("\n=== Verification ===")
    fails = 0
    for name, ok in checks:
        print(f"  {'✓' if ok else '✗'} {name}")
        if not ok:
            fails += 1
    if fails:
        print(f"\nFAIL: {fails}/{len(checks)} checks failed")
        return 1
    print(
        f"\nOK: {len(checks)}/{len(checks)} checks passed — "
        "reputation receipt is independently verifiable."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
