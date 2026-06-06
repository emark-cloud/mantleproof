"""GET /api/queries — recent on-chain agent decisions (T29).

Reads ``DecisionLog.Decision`` events directly off the active chain — no
persistence layer, because the events are *the* source of truth for the
agent-economy proof and re-deriving them is cheap (single-contract,
small event volume, indexed `target` and `agent` topics).

The frontend's AgentQueryPanel already does this client-side via wagmi;
this endpoint is the server-side mirror so non-browser consumers (MCP
clients, dashboards on a different host) can read the same stream.
"""

from __future__ import annotations

import logging
from typing import Any, cast

from fastapi import APIRouter, HTTPException, Query

from mantleproof.settings import get_settings

router = APIRouter()
log = logging.getLogger(__name__)

# Decision(address indexed agent, address indexed target,
#         bytes32 indexed auditRootHash, string action, string reason)
DECISION_LOG_ABI = [
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "internalType": "address", "name": "agent", "type": "address"},
            {"indexed": True, "internalType": "address", "name": "target", "type": "address"},
            {
                "indexed": True,
                "internalType": "bytes32",
                "name": "auditRootHash",
                "type": "bytes32",
            },
            {"indexed": False, "internalType": "string", "name": "action", "type": "string"},
            {"indexed": False, "internalType": "string", "name": "reason", "type": "string"},
        ],
        "name": "Decision",
        "type": "event",
    }
]

# Canonical DecisionLog deployments — engine stays decoupled from
# ``../contracts/`` (CLAUDE.md), so we curate the map here.
DECISION_LOG_BY_CHAIN: dict[int, str | None] = {
    # T43 redeploy (mantle.addresses.json, 2026-05-24) — supersedes the T25
    # DecisionLog at 0x1823359f…; .env MANTLEPROOF_DECISION_LOG_ADDRESS overrides.
    5000: "0x11B395452e2bF8Ab20F21cd4deA8f9a7650CCf65",
    5003: "0x5d6874df08640bAb87C5c15b61Fb4c3E641f8956",  # Sepolia rehearsal stack
}


def _decision_topic() -> str:
    from eth_utils import keccak  # type: ignore[import-untyped]

    return "0x" + keccak(b"Decision(address,address,bytes32,string,string)").hex()


def build_queries_response(
    chain_id: int,
    decision_log_address: str | None,
    rows: list[dict[str, Any]],
    *,
    limit: int,
    error: str | None = None,
) -> dict[str, Any]:
    """Pure assembler."""
    return {
        "chain_id": chain_id,
        "decision_log_address": decision_log_address,
        "filter": {"limit": limit},
        "items": rows[:limit],
        "error": error,
    }


@router.get("/api/queries")
async def agent_queries(
    limit: int = Query(50, ge=1, le=200),
    window_blocks: int = Query(200_000, ge=1, le=1_000_000),
    decision_log_address: str | None = Query(
        None,
        description="Override the DecisionLog address (default: chain-mapped).",
    ),
) -> dict[str, Any]:
    s = get_settings()
    addr = decision_log_address or DECISION_LOG_BY_CHAIN.get(s.chain_id)
    if not addr:
        return build_queries_response(
            s.chain_id,
            None,
            [],
            limit=limit,
            error=f"DecisionLog address unknown for chain_id {s.chain_id}",
        )

    try:
        rows = _read_decisions_live(
            rpc_url=s.active_rpc_url,
            decision_log_address=addr,
            window_blocks=window_blocks,
        )
    except Exception as exc:  # noqa: BLE001 — never crash; surface as 502
        log.warning("queries: failed to read DecisionLog: %s", exc)
        raise HTTPException(status_code=502, detail=f"rpc error: {exc}") from exc

    return build_queries_response(s.chain_id, addr, rows, limit=limit)


def _read_decisions_live(
    *,
    rpc_url: str,
    decision_log_address: str,
    window_blocks: int,
) -> list[dict[str, Any]]:
    from web3 import Web3
    from web3.types import FilterParams

    w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 15.0}))
    head = int(w3.eth.block_number)
    from_block = max(0, head - window_blocks)
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(decision_log_address), abi=DECISION_LOG_ABI
    )
    topic = _decision_topic()
    params = cast(
        FilterParams,
        {
            "address": Web3.to_checksum_address(decision_log_address),
            "topics": [topic],
            "fromBlock": from_block,
            "toBlock": head,
        },
    )
    logs = w3.eth.get_logs(params)
    sorted_logs = sorted(logs, key=lambda lg: int(lg["blockNumber"]), reverse=True)
    out: list[dict[str, Any]] = []
    for entry in sorted_logs:
        try:
            decoded = contract.events.Decision().process_log(entry)
        except Exception:  # noqa: BLE001 — malformed log: skip
            continue
        block_number = int(entry["blockNumber"])
        block_any: Any = w3.eth.get_block(block_number)
        tx_hash = entry["transactionHash"]
        args = decoded["args"]
        root_hash = args["auditRootHash"]
        out.append(
            {
                "block_number": block_number,
                "timestamp": int(block_any.get("timestamp", 0)),
                "tx_hash": tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash),
                "agent": str(args["agent"]),
                "target": str(args["target"]),
                "audit_root_hash": (
                    "0x" + root_hash.hex() if hasattr(root_hash, "hex") else str(root_hash)
                ),
                "action": str(args["action"]),
                "reason": str(args["reason"]),
            }
        )
    return out


__all__ = ["router", "build_queries_response"]
