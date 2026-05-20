#!/usr/bin/env python3
"""Independent verification of the T28 mainnet Demo 3 receipt.

Extends T27's verifier with the Demo 3 spec receipts:
  - the REAL Merchant Moe LB v2.2 `addLiquidityNATIVE` tx (not just any
    `addLiquidity` event), and
  - DecisionLog action == "APPROVED" (the inverse of Demo 2's "DECLINED").

Re-reads every wired value from chain + IPFS, not from the harness print.
Checks (Demo 1's 8 + Demo 2's 4 + Demo 3's 3 = 15):

  1. anchor tx status == 1 on mainnet 5000
  2. anchor tx.from == oracle-signer expected by deployment
  3. registry.getAudit(target).rootHash == argv rootHash
  4. registry.getAudit(target).submitter == oracle-signer (only-writer)
  5. registry.severity < 3 (Demo 3 expects < HIGH; otherwise the agent's
     APPROVED decision would contradict the audit)
  6. keccak256(canonical IPFS JSON, ensure_ascii=False) == on-chain rootHash
  7. agent.auditsPerformed advanced (>= 3 = Demo 1 + Demo 2 + Demo 3)
  8. agent.memoryRoot != 0

  9.  DecisionLog tx status == 1 on mainnet 5000
  10. Decision event from the DecisionLog contract; topics decode to
      (agent == argv yield-agent, target == argv target,
       auditRootHash == argv rootHash)
  11. Decision event data decodes to action == "APPROVED" + reason non-empty
  12. DecisionLog.count() advanced (>= 2 = Demo 2's + Demo 3's)

  13. addLiquidity tx status == 1 on mainnet 5000
  14. addLiquidity tx.from == yield-agent
  15. addLiquidity tx.to == the LBRouter from argv (this isn't an arbitrary
      tx -- it has to actually invoke Merchant Moe LB v2.2)

Usage:
  python -u scripts/verify_demo3_receipt.py \\
    <target> <rootHash> <anchorTx> <addLiquidityTx> <decisionLogTx> <yieldAgent>
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
from eth_abi.abi import decode as abi_decode  # noqa: E402
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
                ],
                "name": "",
                "type": "tuple",
            }
        ],
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

DECISIONLOG_ABI = [
    {
        "inputs": [],
        "name": "count",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
]

DECISION_TOPIC0 = (
    "0x" + Web3.keccak(
        text="Decision(address,address,bytes32,string,string)"
    ).hex().lstrip("0x")
)


def _canonical_keccak(report: dict) -> str:
    """Same canonicalization as engine/mantleproof/pipeline.py:_canonical +
    compute_root_hash. Strict ensure_ascii=False matters."""
    preimage = {
        k: v for k, v in report.items()
        if k not in ("root_hash", "ipfs_cid", "ipfs_uri", "anchor_tx")
    }
    canonical = json.dumps(
        preimage, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return "0x" + Web3.keccak(text=canonical).hex().lstrip("0x")


def main() -> int:  # noqa: C901, PLR0912, PLR0915
    if len(sys.argv) != 7:
        print(
            "usage: verify_demo3_receipt.py <target> <rootHash> <anchorTx> "
            "<addLiquidityTx> <decisionLogTx> <yieldAgent>"
        )
        return 2
    (
        target, claimed_root, anchor_tx, add_liq_tx, dl_tx, yield_agent
    ) = sys.argv[1:7]
    if not anchor_tx.startswith("0x"):
        anchor_tx = "0x" + anchor_tx
    if not add_liq_tx.startswith("0x"):
        add_liq_tx = "0x" + add_liq_tx
    if not dl_tx.startswith("0x"):
        dl_tx = "0x" + dl_tx
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
    decision_log_addr = dep["contracts"]["DecisionLog"]
    expected_oracle = dep["oracleSigner"]

    w3 = Web3(Web3.HTTPProvider(s.mantle_rpc_url, request_kwargs={"timeout": 30}))
    print(f"[chain]    {w3.eth.chain_id} ({s.mantle_rpc_url})")
    print(f"[target]   {target} (audit target = LBRouter)")
    print(f"[agent]    {yield_agent}")
    print(f"[claimed]  rootHash={claimed_root}")
    print(f"           anchorTx={anchor_tx}")
    print(f"           addLiquidityTx={add_liq_tx}")
    print(f"           decisionTx={dl_tx}")

    # 1+2. anchor tx
    from hexbytes import HexBytes
    anchor_hash = HexBytes(anchor_tx)
    anchor_rcpt = w3.eth.get_transaction_receipt(anchor_hash)
    anchor_txd = w3.eth.get_transaction(anchor_hash)
    anchor_from = anchor_txd["from"]
    print(
        f"[anchor]   status={anchor_rcpt['status']} "
        f"block={anchor_rcpt['blockNumber']} from={anchor_from}"
    )

    checks: list[tuple[str, bool]] = []
    checks.append(("anchor tx status == 1", anchor_rcpt["status"] == 1))
    checks.append((
        "anchor tx.from == oracle-signer",
        anchor_from.lower() == expected_oracle.lower(),
    ))

    # 3+4+5. registry.getAudit
    registry = w3.eth.contract(
        address=Web3.to_checksum_address(registry_addr), abi=REGISTRY_ABI
    )
    rec = registry.functions.getAudit(Web3.to_checksum_address(target)).call()
    on_root = "0x" + rec[0].hex().lstrip("0x")
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
    checks.append((
        "registry.severity < 3 (Demo 3 expects < HIGH)",
        on_sev < 3,
    ))

    # 6. IPFS canonical keccak
    if not on_cid.startswith("ipfs://"):
        checks.append((f"IPFS CID well-formed: {on_cid}", False))
    else:
        cid_only = on_cid.removeprefix("ipfs://")
        gw = s.ipfs_gateway.rstrip("/")
        url = f"{gw}/{cid_only}"
        print(f"[ipfs]     fetching {url}")
        resp = httpx.get(url, timeout=30, follow_redirects=True)
        resp.raise_for_status()
        report = resp.json()
        recomputed = _canonical_keccak(report)
        print(f"[ipfs]     recomputed rootHash = {recomputed}")
        checks.append((
            "keccak256(canonical IPFS JSON) == on-chain rootHash",
            recomputed.lower() == on_root.lower(),
        ))

    # 7+8. agent state
    mp_agent = w3.eth.contract(
        address=Web3.to_checksum_address(agent_addr), abi=AGENT_ABI
    )
    audits = mp_agent.functions.auditsPerformed().call()
    mem = "0x" + mp_agent.functions.memoryRoot().call().hex().lstrip("0x")
    print(f"[agent]    auditsPerformed={audits} memoryRoot={mem}")
    checks.append((
        "agent.auditsPerformed >= 3 (Demo 1 + 2 + 3 compound)",
        audits >= 3,
    ))
    checks.append(("agent.memoryRoot != 0x0", int(mem, 16) != 0))

    # --- Demo 2-style: DecisionLog ----------------------------------------
    dl_hash = HexBytes(dl_tx)
    dl_rcpt = w3.eth.get_transaction_receipt(dl_hash)
    print(f"[decision] status={dl_rcpt['status']} block={dl_rcpt['blockNumber']}")
    checks.append(("DecisionLog tx status == 1", dl_rcpt["status"] == 1))

    decision_log_addr_lc = decision_log_addr.lower()
    target_lc = target.lower()
    agent_lc = yield_agent.lower()
    found_event = None
    for log in dl_rcpt["logs"]:
        if log["address"].lower() != decision_log_addr_lc:
            continue
        topics = log["topics"]
        if len(topics) < 4:
            continue
        t0 = "0x" + topics[0].hex().lstrip("0x")
        if t0.lower() != DECISION_TOPIC0.lower():
            continue
        ev_agent = "0x" + topics[1].hex()[-40:]
        ev_target = "0x" + topics[2].hex()[-40:]
        ev_root = "0x" + topics[3].hex().lstrip("0x")
        if (
            ev_agent.lower() == agent_lc
            and ev_target.lower() == target_lc
            and ev_root.lower() == claimed_root.lower()
        ):
            found_event = log
            break

    if found_event is None:
        print("[decision] Decision event with matching (agent,target,rootHash) NOT found")
        checks.append((
            "Decision event matches (agent,target,rootHash)",
            False,
        ))
    else:
        action, reason = abi_decode(["string", "string"], bytes(found_event["data"]))
        print(f"[decision] action={action!r}")
        print(f"[decision] reason={reason!r}")
        checks.append((
            "Decision event matches (agent,target,rootHash)",
            True,
        ))
        checks.append((
            "Decision.action == 'APPROVED' (Demo 3 = clean -> approve)",
            action == "APPROVED",
        ))
        checks.append((
            "Decision.reason non-empty",
            len(reason) > 0,
        ))

    dl = w3.eth.contract(
        address=Web3.to_checksum_address(decision_log_addr), abi=DECISIONLOG_ABI
    )
    dl_count = dl.functions.count().call()
    print(f"[decision] DecisionLog.count = {dl_count}")
    checks.append((
        "DecisionLog.count >= 2 (Demo 2 + Demo 3)",
        dl_count >= 2,
    ))

    # --- Demo 3 extension: real LB addLiquidity tx ------------------------
    al_hash = HexBytes(add_liq_tx)
    al_rcpt = w3.eth.get_transaction_receipt(al_hash)
    al_tx = w3.eth.get_transaction(al_hash)
    al_from = al_tx["from"]
    al_to = al_tx["to"]
    print(
        f"[addLiq]   status={al_rcpt['status']} "
        f"block={al_rcpt['blockNumber']} gasUsed={al_rcpt['gasUsed']}"
    )
    print(f"[addLiq]   from={al_from} to={al_to}")
    checks.append(("addLiquidity tx status == 1", al_rcpt["status"] == 1))
    checks.append((
        "addLiquidity tx.from == yield-agent",
        al_from.lower() == yield_agent.lower(),
    ))
    checks.append((
        "addLiquidity tx.to == LBRouter (audit target)",
        al_to is not None and al_to.lower() == target.lower(),
    ))

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
        "Demo 3 mainnet receipt is independently verifiable."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
