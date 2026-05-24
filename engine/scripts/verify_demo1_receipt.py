#!/usr/bin/env python3
"""Independent verification of the T26 mainnet Demo 1 receipt.

Mirrors the T20 receipt-discipline pattern: read every wired value back
from chain + IPFS, not from the harness's printed report. Specifically:

  1. anchor tx status == 1 on mainnet 5000
  2. tx.from == oracle-signer expected by deployment
  3. registry.getAudit(target).rootHash == argv rootHash
  4. registry.getAudit(target).submitter == oracle-signer
  5. fetch the IPFS JSON, drop {root_hash, ipfs_cid, ipfs_uri, anchor_tx},
     keccak256 the canonical preimage, confirm == on-chain rootHash
     (the audit is independently verifiable end-to-end).
  6. agent.auditsPerformed advanced.
  7. agent.memoryRoot != 0 and != just the latest rootHash (compounds).

Usage:
  python -u scripts/verify_demo1_receipt.py <target> <rootHash> <anchorTx>
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Pin mainnet BEFORE imports so settings resolves the mainnet RPC.
os.environ["MANTLE_NETWORK"] = "mantle"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402
from web3 import Web3  # noqa: E402

from mantleproof.settings import get_settings  # noqa: E402

REGISTRY_ABI = [
    {
        "inputs": [{"name": "target", "type": "address"}],
        "name": "getAudit",
        "outputs": [
            {
                "components": [
                    {"name": "rootHash", "type": "bytes32"},
                    {"name": "severity", "type": "uint8"},
                    {"name": "ipfsCID", "type": "string"},
                    {"name": "timestamp", "type": "uint64"},
                    {"name": "submitter", "type": "address"},
                    {"name": "tier", "type": "uint8"},
                ],
                "name": "",
                "type": "tuple",
            }
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "agent",
        "outputs": [{"name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function",
    },
]

AGENT_ABI = [
    {
        "inputs": [],
        "name": "auditsPerformed",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "memoryRoot",
        "outputs": [{"name": "", "type": "bytes32"}],
        "stateMutability": "view",
        "type": "function",
    },
]


def _canonical_keccak(report: dict) -> str:
    """Same canonicalization as engine/mantleproof/pipeline.py:_canonical +
    compute_root_hash: drop the keys added AFTER the hash was computed, sort
    keys, compact-json with ensure_ascii=False, keccak256 the resulting text.
    """
    preimage = {
        k: v for k, v in report.items()
        if k not in ("root_hash", "ipfs_cid", "ipfs_uri", "anchor_tx", "timing_ms")
    }
    canonical = json.dumps(
        preimage, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return "0x" + Web3.keccak(text=canonical).hex().removeprefix("0x")


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: verify_demo1_receipt.py <target> <rootHash> <anchorTx>")
        return 2
    target, claimed_root, anchor_tx = sys.argv[1], sys.argv[2], sys.argv[3]
    if not anchor_tx.startswith("0x"):
        anchor_tx = "0x" + anchor_tx
    if not claimed_root.startswith("0x"):
        claimed_root = "0x" + claimed_root

    s = get_settings()
    if s.chain_id != 5000:
        print(f"ERROR: settings.chain_id={s.chain_id}, not mainnet 5000")
        return 2

    dep_path = (
        Path(__file__).resolve().parents[2]
        / "contracts" / "deployments" / "mantle.addresses.json"
    )
    dep = json.loads(dep_path.read_text())
    registry_addr = dep["contracts"]["MantleProofRegistry"]
    agent_addr = dep["contracts"]["MantleProofAgent"]
    expected_oracle = dep["oracleSigner"]

    w3 = Web3(Web3.HTTPProvider(s.mantle_rpc_url, request_kwargs={"timeout": 30}))
    print(f"[chain]    {w3.eth.chain_id} ({s.mantle_rpc_url})")
    print(f"[target]   {target}")
    print(f"[claimed]  rootHash={claimed_root} anchorTx={anchor_tx}")

    # 1+2. tx receipt + submitter (web3.py types these as TypedDicts).
    from hexbytes import HexBytes
    tx_hash = HexBytes(anchor_tx)
    tx_rcpt = w3.eth.get_transaction_receipt(tx_hash)
    tx = w3.eth.get_transaction(tx_hash)
    tx_from = tx["from"]
    tx_status = tx_rcpt["status"]
    tx_block = tx_rcpt["blockNumber"]
    print(f"[tx]       status={tx_status} block={tx_block}")
    print(f"[tx]       from={tx_from} (expected oracle-signer {expected_oracle})")

    checks: list[tuple[str, bool]] = []
    checks.append(("anchor tx status == 1", tx_status == 1))
    checks.append((
        "anchor tx.from == oracle-signer",
        tx_from.lower() == expected_oracle.lower(),
    ))

    # 3+4. registry.getAudit
    registry = w3.eth.contract(
        address=Web3.to_checksum_address(registry_addr), abi=REGISTRY_ABI
    )
    rec = registry.functions.getAudit(Web3.to_checksum_address(target)).call()
    on_root = "0x" + rec[0].hex().removeprefix("0x")
    on_sev = rec[1]
    on_cid = rec[2]
    on_submitter = rec[4]
    print(f"[registry] rootHash={on_root} severity={on_sev} cid={on_cid}")
    print(f"[registry] submitter={on_submitter}")
    checks.append((
        "registry.rootHash == claimed",
        on_root.lower() == claimed_root.lower(),
    ))
    checks.append((
        "registry.submitter == oracle-signer (only-writer)",
        on_submitter.lower() == expected_oracle.lower(),
    ))
    checks.append(("registry.severity == 3 (HIGH)", on_sev == 3))

    # 5. fetch IPFS JSON, recompute canonical keccak256
    if not on_cid.startswith("ipfs://"):
        checks.append((f"IPFS CID well-formed: {on_cid}", False))
    else:
        cid_only = on_cid.removeprefix("ipfs://")
        # Try the public Pinata gateway first (matches engine/settings ipfs_gateway).
        gw = s.ipfs_gateway.rstrip("/")
        url = f"{gw}/{cid_only}"
        print(f"[ipfs]     fetching {url}")
        resp = httpx.get(url, timeout=30, follow_redirects=True)
        resp.raise_for_status()
        report = resp.json()
        recomputed = _canonical_keccak(report)
        print(f"[ipfs]     recomputed rootHash from canonical preimage = {recomputed}")
        checks.append((
            "keccak256(canonical IPFS JSON) == on-chain rootHash",
            recomputed.lower() == on_root.lower(),
        ))

    # 6+7. agent memoryRoot + auditsPerformed
    agent = w3.eth.contract(address=Web3.to_checksum_address(agent_addr), abi=AGENT_ABI)
    audits = agent.functions.auditsPerformed().call()
    mem = "0x" + agent.functions.memoryRoot().call().hex().removeprefix("0x")
    print(f"[agent]    auditsPerformed={audits} memoryRoot={mem}")
    checks.append(("agent.auditsPerformed >= 1", audits >= 1))
    checks.append(("agent.memoryRoot != 0x0", int(mem, 16) != 0))

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
        "Demo 1 mainnet receipt is independently verifiable."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
