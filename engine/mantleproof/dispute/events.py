"""Walker for `MantleProofRegistry.DisputeSubmitted` events.

Mirrors the discipline of ``triage/refresh.py``: bounded block-window walk,
JSON-on-disk persistence, idempotent. The frontend's `/api/disputes` will
read the same JSON (T45).

Event signature (T43):
    DisputeSubmitted(uint256 indexed disputeId, bytes32 indexed rootHash,
                     uint256 findingIndex, address indexed disputer,
                     string counterClaimIpfs, uint256 counterStake)
"""

from __future__ import annotations

import json
import pathlib
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from mantleproof.settings import get_settings

DISPUTE_SUBMITTED_TOPIC = (
    # keccak256("DisputeSubmitted(uint256,bytes32,uint256,address,string,uint256)")
    "0x" + "".join("?" for _ in range(64))  # placeholder; computed at runtime
)


def dispute_submitted_topic() -> str:
    """Pure: compute the topic0 for ``DisputeSubmitted``.

    Done at runtime (not as a module constant) so we never accidentally pin a
    stale hash if the event signature is rev'd in a future contract version.
    """
    from web3 import Web3

    sig = "DisputeSubmitted(uint256,bytes32,uint256,address,string,uint256)"
    return "0x" + Web3.keccak(text=sig).hex().removeprefix("0x")


@dataclass(frozen=True)
class DisputeRow:
    """One entry persisted to ``engine/data/disputes.json``."""

    dispute_id: int
    root_hash: str
    finding_index: int
    disputer: str
    counter_claim_ipfs: str
    counter_stake: int
    block_number: int
    tx_hash: str


def decode_log(log: dict[str, Any]) -> DisputeRow:
    """Pure: decode one DisputeSubmitted log into a DisputeRow.

    Topics: [topic0, disputeId, rootHash, disputer]. Data: (findingIndex,
    counterClaimIpfs, counterStake) ABI-encoded.
    """
    from eth_abi.abi import decode

    topics = log["topics"]
    if len(topics) < 4:
        raise ValueError(f"DisputeSubmitted log missing topics: {topics!r}")

    def _topic_int(t: Any) -> int:
        if isinstance(t, str):
            return int(t, 16)
        return int(t.hex(), 16)  # HexBytes

    def _topic_hex32(t: Any) -> str:
        if isinstance(t, str):
            return t if t.startswith("0x") else "0x" + t
        return "0x" + t.hex().removeprefix("0x")

    dispute_id = _topic_int(topics[1])
    root_hash = _topic_hex32(topics[2])
    # address topic is right-padded zeros; take last 20 bytes.
    disputer_topic_hex = _topic_hex32(topics[3])
    disputer = "0x" + disputer_topic_hex[-40:]

    data_hex = log["data"]
    if isinstance(data_hex, bytes):
        data_bytes = data_hex
    else:
        data_bytes = bytes.fromhex(data_hex[2:] if data_hex.startswith("0x") else data_hex)
    (finding_index, counter_claim_ipfs, counter_stake) = decode(
        ["uint256", "string", "uint256"], data_bytes
    )
    return DisputeRow(
        dispute_id=int(dispute_id),
        root_hash=root_hash,
        finding_index=int(finding_index),
        disputer=disputer,
        counter_claim_ipfs=str(counter_claim_ipfs),
        counter_stake=int(counter_stake),
        block_number=int(log.get("blockNumber", 0)),
        tx_hash=(
            log["transactionHash"].hex()
            if hasattr(log.get("transactionHash"), "hex")
            else str(log.get("transactionHash", ""))
        ),
    )


GetLogsFn = Callable[..., list[dict[str, Any]]]


def walk_disputes(
    *,
    from_block: int,
    to_block: int,
    registry_address: str,
    get_logs: GetLogsFn,
) -> list[DisputeRow]:
    """Pure: walk DisputeSubmitted logs over a block window. ``get_logs`` is
    injected (web3-shaped) so the walker is fully testable offline.
    """
    topic = dispute_submitted_topic()
    logs = get_logs(
        {
            "address": registry_address,
            "fromBlock": from_block,
            "toBlock": to_block,
            "topics": [topic],
        }
    )
    return [decode_log(lg) for lg in logs]


def _store_path() -> pathlib.Path:
    return (
        pathlib.Path(__file__).resolve().parents[1].parent
        / "data"
        / "disputes.json"
    )


def persist(rows: list[DisputeRow], *, last_block: int) -> pathlib.Path:
    """Atomic write of rows + last-block-seen to ``engine/data/disputes.json``."""
    path = _store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "last_block": last_block,
        "n_disputes": len(rows),
        "rows": [r.__dict__ for r in rows],
    }
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True))
    tmp.replace(path)
    return path


def refresh(*, window_blocks: int = 50_000, to_block: int | None = None) -> dict[str, Any]:
    """Live: walk the latest window and persist. Returns the summary dict."""
    s = get_settings()
    if not s.mantleproof_registry_address:
        raise RuntimeError("MANTLEPROOF_REGISTRY_ADDRESS not set")

    from web3 import Web3

    w3 = Web3(Web3.HTTPProvider(s.active_rpc_url, request_kwargs={"timeout": 30}))
    head = to_block if to_block is not None else int(w3.eth.block_number)
    start = max(0, head - window_blocks)

    def _get_logs(params: dict[str, Any]) -> list[dict[str, Any]]:
        # web3 returns AttributeDict-like objects; tests inject plain dicts.
        return list(w3.eth.get_logs(params))  # type: ignore[arg-type]

    rows = walk_disputes(
        from_block=start,
        to_block=head,
        registry_address=Web3.to_checksum_address(s.mantleproof_registry_address),
        get_logs=_get_logs,
    )
    persist(rows, last_block=head)
    return {
        "chain_id": s.chain_id,
        "last_block": head,
        "window_start": start,
        "n_disputes": len(rows),
    }
