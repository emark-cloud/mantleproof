"""Glue for the dispute resolution loop.

Combines:
  - events.refresh()           — find pending disputes
  - persistence.registry_reader.read_dispute / read_audit — fetch context
  - fetch.fetch_counter_claim  — pull the disputer's argument
  - tier2 + reaudit            — produce the verdict
  - persistence.anchor.resolve_dispute — post on-chain

Each piece is dependency-injectable so the whole loop is unit-testable
without RPC or IPFS access.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from mantleproof.persistence.anchor import resolve_dispute as anchor_resolve
from mantleproof.persistence.registry_reader import (
    OnChainAudit,
    OnChainDispute,
    read_audit,
    read_dispute,
)


def fetch_audit_json(ipfs_cid: str, *, gateway_fetch: Callable[[str], dict]) -> dict:
    """Pure-with-seam: ``gateway_fetch`` returns the JSON body for an IPFS CID."""
    return gateway_fetch(ipfs_cid)


def compute_reaudit_root_hash(verdict: dict[str, Any]) -> bytes:
    """Pure: keccak256 over the canonical verdict JSON.

    Used as the on-chain ``reAuditRootHash`` so anyone can re-derive the
    verdict's hash from the persisted JSON — same discipline as the audit
    rootHash (pipeline.py::compute_root_hash).
    """
    from web3 import Web3

    canonical = json.dumps(
        verdict, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return bytes(Web3.keccak(text=canonical))


def resolve_one(
    dispute_id: int,
    *,
    run_reaudit: Callable[..., dict[str, Any]],
    audit_loader: Callable[[str], OnChainAudit | None] | None = None,
    dispute_loader: Callable[[int], OnChainDispute | None] | None = None,
    audit_json_loader: Callable[[str], dict] | None = None,
    counter_claim_fetcher: Callable[[str], dict[str, Any]] | None = None,
    target_lookup: Callable[[str], str] | None = None,
    source_loader: Callable[[str], tuple[str, bytes, str]] | None = None,
    anchor_fn: Callable[..., str] | None = None,
) -> dict[str, Any]:
    """Resolve a single dispute end-to-end. Returns a structured summary.

    All seams are injectable. The defaults (when an arg is ``None``) wire to
    the live registry/IPFS/anchor implementations — pass mocks in tests.
    """
    if dispute_loader is None:
        dispute_loader = read_dispute  # type: ignore[assignment]
    if audit_loader is None:
        audit_loader = read_audit  # type: ignore[assignment]

    assert dispute_loader is not None
    assert audit_loader is not None

    dispute = dispute_loader(dispute_id)
    if dispute is None:
        raise RuntimeError(f"unknown dispute id {dispute_id}")
    if dispute.status != 0:  # already resolved (PENDING == 0)
        return {
            "dispute_id": dispute_id,
            "status": "already_resolved",
            "on_chain_status": dispute.status,
        }

    # Resolve the audit's target via the registry's auditTarget mapping.
    # The caller can override (helpful in tests).
    if target_lookup is None:
        from web3 import Web3

        from mantleproof.settings import get_settings

        s = get_settings()
        w3 = Web3(Web3.HTTPProvider(s.active_rpc_url, request_kwargs={"timeout": 30}))
        reg_addr = s.mantleproof_registry_address
        if not reg_addr:
            raise RuntimeError("MANTLEPROOF_REGISTRY_ADDRESS not set")
        # Minimal one-method ABI to keep this import local + cheap.
        abi = [
            {
                "inputs": [
                    {"internalType": "bytes32", "name": "rootHash", "type": "bytes32"}
                ],
                "name": "auditTarget",
                "outputs": [
                    {"internalType": "address", "name": "", "type": "address"}
                ],
                "stateMutability": "view",
                "type": "function",
            }
        ]
        registry = w3.eth.contract(address=Web3.to_checksum_address(reg_addr), abi=abi)

        def _lookup(rh: str) -> str:
            rh_bytes = bytes.fromhex(rh[2:] if rh.startswith("0x") else rh)
            return str(registry.functions.auditTarget(rh_bytes).call())

        target_lookup = _lookup

    target = target_lookup(dispute.root_hash)
    audit = audit_loader(target)
    if audit is None:
        raise RuntimeError(
            f"audit for target {target} not found (rootHash {dispute.root_hash})"
        )

    if audit_json_loader is None:
        raise RuntimeError("audit_json_loader required (no default IPFS reader wired)")
    original_audit = audit_json_loader(audit.ipfs_cid)

    if counter_claim_fetcher is None:
        from mantleproof.dispute.fetch import fetch_counter_claim

        counter_claim_fetcher = fetch_counter_claim
    counter_claim = counter_claim_fetcher(dispute.counter_claim_ipfs)

    if source_loader is None:
        raise RuntimeError(
            "source_loader required (no default; pass a callable that returns "
            "(source, bytecode, contract_name) for the target)"
        )
    source, bytecode, contract_name = source_loader(target)

    verdict = run_reaudit(
        original_audit=original_audit,
        counter_claim=counter_claim,
        finding_index=dispute.finding_index,
        source=source,
        bytecode=bytecode,
        chain_id=0,  # not used by the prompt; left as 0 here
        target=target,
        contract_name=contract_name,
    )
    re_audit_root = compute_reaudit_root_hash(verdict)

    if anchor_fn is None:
        anchor_fn = anchor_resolve
    tx_hash = anchor_fn(
        dispute_id=dispute_id,
        outcome=verdict["outcome_uint8"],
        re_audit_root_hash=re_audit_root,
    )
    return {
        "dispute_id": dispute_id,
        "status": "resolved",
        "outcome": verdict["outcome"],
        "outcome_uint8": verdict["outcome_uint8"],
        "re_audit_root_hash": "0x" + re_audit_root.hex(),
        "anchor_tx": tx_hash,
        "rationale": verdict.get("rationale", ""),
        "amended_finding": verdict.get("amended_finding"),
    }
