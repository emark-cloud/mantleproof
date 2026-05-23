#!/usr/bin/env python3
"""T40 — Demo: call ERC-8004 v2 ``giveFeedback(96, …)`` from a paying agent's wallet.

Mirrors the T26/T27/T28 demo discipline: one self-contained script, all
inputs explicit (CLI args + a single payer private key from env), preflight
gates run before any state-changing call, and the script prints exactly the
arguments ``verify_reputation_receipt.py`` needs for independent verification.

Pre-flight (in order, fail-loud, never broadcast on failure):

  1. ``chain_id`` matches the deployed Reputation Registry we have an address for.
  2. RPC liveness + ``chain_id`` matches.
  3. ``settings.mantleproof_agent_token_id`` is non-zero (Sepolia 5003 is 0
     until T5 is re-done — we refuse to no-op a meaningless on-chain feedback).
  4. ``assert_paid``: an ``AuditPaid(payer indexed, target indexed, amount)``
     log exists at the per-chain ``MantleProofLicense`` address. **Sybil gate.**
  5. ``assert_not_authorized``: ``isAuthorizedOrOwner(payer, agentId) == false``.
     Mirrors the v2 on-chain anti-self-feedback check; pre-flighting saves gas.
  6. Wallet balance > estimated gas (eth_estimateGas + 25% buffer).

Then build + sign + send the ``giveFeedback`` tx with the payer's own key
(loaded from ``FEEDBACK_PAYER_PRIVATE_KEY`` env at runtime, never read from
``.env``, never logged) and print the receipt for downstream verification.

Usage:
  FEEDBACK_PAYER_PRIVATE_KEY=0x... \\
    python -u scripts/give_feedback_demo.py \\
      --target=<vaultAddr> \\
      --rootHash=<auditRootHash> \\
      --value=<int> [--decimals=N] \\
      [--tag1=audit-quality] [--tag2=deployer-agent] \\
      [--endpoint=https://mantleproof.xyz/api/audit/<vault>] \\
      [--feedback-uri=ipfs://...] \\
      [--network=mantleSepolia|mantle (default: settings.mantle_network)]
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from eth_account import Account  # noqa: E402
from web3 import Web3  # noqa: E402

from mantleproof.reputation.feedback import (  # noqa: E402
    IDENTITY_REGISTRY_BY_CHAIN,
    REPUTATION_REGISTRY_BY_CHAIN,
    assert_not_authorized,
    assert_paid,
    assert_paid_via_tx,
    build_give_feedback_calldata,
    feedback_hash_of,
)
from mantleproof.settings import get_settings  # noqa: E402

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
]


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    p.add_argument("--target", required=True, help="Audit target address (was rated)")
    p.add_argument("--rootHash", required=True, help="On-chain audit rootHash")
    p.add_argument("--value", type=int, required=True, help="Feedback value (int128)")
    p.add_argument("--decimals", type=int, default=0, help="value_decimals (0..18)")
    p.add_argument("--tag1", default="audit-quality")
    p.add_argument("--tag2", default="")
    p.add_argument("--endpoint", default="")
    p.add_argument("--feedback-uri", default="")
    p.add_argument("--network", choices=("mantle", "mantleSepolia"), default=None)
    p.add_argument(
        "--paid-tx",
        default=None,
        help=(
            "Preferred sybil-gate: hash of the payForAudit tx (avoids the "
            "wide eth_getLogs scan that public RPCs reject)."
        ),
    )
    p.add_argument(
        "--from-block",
        type=int,
        default=None,
        help="eth_getLogs lower bound when --paid-tx is not supplied.",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Run pre-flights + build calldata, but do not broadcast.",
    )
    return p.parse_args()


def main() -> int:
    args = _parse_args()
    if args.network:
        os.environ["MANTLE_NETWORK"] = args.network

    s = get_settings()
    chain_id = s.chain_id
    rpc = s.active_rpc_url

    if chain_id not in REPUTATION_REGISTRY_BY_CHAIN:
        print(f"ERROR: no Reputation Registry address known for chainId {chain_id}")
        return 2
    rep_addr = Web3.to_checksum_address(REPUTATION_REGISTRY_BY_CHAIN[chain_id])
    id_addr = Web3.to_checksum_address(IDENTITY_REGISTRY_BY_CHAIN[chain_id])
    agent_id = s.mantleproof_agent_token_id
    if agent_id == 0:
        print(
            f"ERROR: mantleproof_agent_token_id=0 on chainId {chain_id}. "
            "T5 (self-registration) has not been done on this network; refusing "
            "to submit feedback against a non-existent agent identity."
        )
        return 2

    pk = os.environ.get("FEEDBACK_PAYER_PRIVATE_KEY", "")
    if not pk:
        print("ERROR: FEEDBACK_PAYER_PRIVATE_KEY env not set")
        return 2
    if not pk.startswith("0x"):
        pk = "0x" + pk
    acct = Account.from_key(pk)
    payer = acct.address

    target = Web3.to_checksum_address(args.target)
    root_hash = args.rootHash
    if not root_hash.startswith("0x"):
        root_hash = "0x" + root_hash
    if len(root_hash) != 66:
        print(f"ERROR: rootHash must be 32 bytes (0x + 64 hex), got {root_hash!r}")
        return 2

    print(f"[chain]      {chain_id} via {rpc}")
    print(f"[reputation] {rep_addr}")
    print(f"[identity]   {id_addr}")
    print(f"[agent]      tokenId={agent_id} (MantleProof)")
    print(f"[payer]      {payer}")
    print(f"[target]     {target}")
    print(f"[rootHash]   {root_hash}")
    print(
        f"[value]      {args.value} (decimals={args.decimals}) "
        f"tag1={args.tag1!r} tag2={args.tag2!r}"
    )

    w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 30}))
    if w3.eth.chain_id != chain_id:
        print(f"ERROR: RPC reports chain_id={w3.eth.chain_id}, expected {chain_id}")
        return 2

    # 4. Sybil gate. Prefer tx-receipt path (--paid-tx) over the wide
    # eth_getLogs scan that public RPCs frequently reject; fall back to a
    # bounded log scan when --from-block is supplied.
    try:
        if args.paid_tx:
            log = assert_paid_via_tx(
                payer=payer,
                target=target,
                chain_id=chain_id,
                get_receipt=w3.eth.get_transaction_receipt,  # type: ignore[arg-type]
                paid_tx=args.paid_tx,
            )
            print(f"[preflight]  ✓ AuditPaid log found inside tx {args.paid_tx}")
        else:
            from_block = args.from_block if args.from_block is not None else "earliest"
            log = assert_paid(
                payer=payer,
                target=target,
                chain_id=chain_id,
                get_logs=w3.eth.get_logs,  # type: ignore[arg-type]
                from_block=from_block,
            )
            print(f"[preflight]  ✓ AuditPaid log found (tx={log.get('transactionHash')!r})")
    except Exception as e:
        print(f"[preflight]  ✗ assert_paid: {e}")
        print(
            "             tip: re-run with --paid-tx=<payForAudit hash> "
            "(public RPCs often reject wide eth_getLogs scans)."
        )
        return 1

    # 5. Anti-self-feedback gate — mirror the on-chain require.
    identity = w3.eth.contract(address=id_addr, abi=IDENTITY_ABI)

    def _is_auth(spender: str, aid: int) -> bool:
        return bool(
            identity.functions.isAuthorizedOrOwner(
                Web3.to_checksum_address(spender), aid
            ).call()
        )

    try:
        assert_not_authorized(
            payer=payer, agent_id=agent_id, is_authorized_or_owner=_is_auth
        )
        print("[preflight]  ✓ assert_not_authorized: payer is not owner/operator/approved")
    except Exception as e:
        print(f"[preflight]  ✗ assert_not_authorized: {e}")
        return 1

    # Build calldata. feedback_hash binds the rating to (rootHash, value).
    fh = feedback_hash_of(f"{root_hash}|value={args.value}|tag1={args.tag1}|tag2={args.tag2}")
    data = build_give_feedback_calldata(
        agent_id=agent_id,
        value=args.value,
        value_decimals=args.decimals,
        tag1=args.tag1,
        tag2=args.tag2,
        endpoint=args.endpoint,
        feedback_uri=args.feedback_uri,
        feedback_hash=fh,
    )
    print(f"[calldata]   {data[:10]}…{data[-8:]} ({len(data)//2 - 1} bytes)")

    # 6. Gas estimate + balance check.
    tx_template: dict[str, Any] = {
        "to": rep_addr,
        "data": data,
        "from": payer,
        "value": 0,
    }
    try:
        gas = w3.eth.estimate_gas(tx_template)  # type: ignore[arg-type]
    except Exception as e:
        print(f"[preflight]  ✗ eth_estimateGas failed (would revert): {e}")
        return 1
    gas_with_buffer = int(gas * 1.25)
    gas_price = w3.eth.gas_price
    bal = w3.eth.get_balance(payer)
    needed = gas_with_buffer * gas_price
    print(
        f"[gas]        est={gas} buffered={gas_with_buffer} price={gas_price} "
        f"need={needed} have={bal}"
    )
    if bal < needed:
        print("[preflight]  ✗ payer balance below estimated gas cost")
        return 1

    if args.dry_run:
        print("[dry-run]    pre-flights passed; not broadcasting.")
        return 0

    # 7. Build, sign, send.
    nonce = w3.eth.get_transaction_count(payer)
    tx = {
        **tx_template,
        "nonce": nonce,
        "gas": gas_with_buffer,
        "gasPrice": gas_price,
        "chainId": chain_id,
    }
    signed = acct.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"[broadcast]  giveFeedback tx={tx_hash.hex()}")
    rcpt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
    print(
        f"[receipt]    status={rcpt['status']} block={rcpt['blockNumber']} "
        f"gasUsed={rcpt['gasUsed']}"
    )
    if rcpt["status"] != 1:
        return 1

    print("\nNext: independently verify with")
    print(
        f"  python -u scripts/verify_reputation_receipt.py"
        f" --payer={payer} --agent-id={agent_id} --network={s.mantle_network}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
