"""T29 — deploy-feed walker (Mode C, visual only — not auto-audited).

Scans a small recent window of full-tx blocks looking for contract
creations (``tx.to is None``). For each new contract we ask the receipt
for the ``contractAddress`` (handles CREATE / CREATE2 uniformly), pull
the runtime bytecode, and classify:

  - "audited"          if it's already in the CacheStore (anchored on-chain).
  - "skipped:template" if the runtime bytecode keccak matches a known
                       template hash (minimal ERC-20 / proxy clones).
  - "queued"           otherwise — a real-looking unique contract.

**Bounded by design** — `window_blocks` defaults to 1500 (~50 min on
Mantle's 2s blocks). The plan-doc's "Goldsky fallback" sits here: if you
need a longer window or a denser per-block scan, switch to a hosted
subgraph rather than hammering RPC. Documented, not implemented; the
deferred slot is honest about scope.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from mantleproof.settings import get_settings
from mantleproof.triage.store import CacheStore, FeedRow, FeedSnapshot, FeedStore

log = logging.getLogger(__name__)

# Default window: ~50 minutes on Mantle 2s blocks. Walker time is roughly
# linear in window size (one `eth_getBlockByNumber(num, true)` per block,
# plus a bytecode read per new contract); 1500 ≈ 1500 RPCs.
DEFAULT_WINDOW_BLOCKS = 1500


@dataclass(frozen=True)
class FeedWalkResult:
    snapshot: FeedSnapshot
    n_blocks_scanned: int
    n_new_contracts: int


# --------------------------------------------------------------------------- #
# Template registry — keccak of common minimal-proxy runtime bytecodes. The   #
# only purpose is to greying-out "obvious template" rows in the feed so the   #
# panel matches design.md §6.1 honesty rule 4 ("Skipped contracts are visible #
# … we don't pretend we're auditing everything").                             #
#                                                                             #
# A row matching one of these gets classification = "skipped:template". The   #
# hashes are a small starter set — extend as we observe real noise on chain. #
# --------------------------------------------------------------------------- #


TEMPLATE_HASHES: dict[str, str] = {
    # EIP-1167 minimal proxy (variants normalize the implementation slot to 0).
    # We use a fuzzy match: any runtime starting with these bytes is a clone.
    # Stored as a *prefix* lookup rather than full-runtime keccak; see
    # `classify_bytecode` for the comparison logic.
}

TEMPLATE_RUNTIME_PREFIXES: tuple[str, ...] = (
    # EIP-1167 minimal proxy (the implementation address is patched in,
    # so we match the literal opcode prefix instead of a full hash).
    "0x363d3d373d3d3d363d73",
    "0x3d602d80600a3d3981f3363d3d373d3d3d363d73",
)


# --------------------------------------------------------------------------- #
# Pure layer.                                                                 #
# --------------------------------------------------------------------------- #


GetHeadBlockFn = Callable[[], int]
GetBlockFn = Callable[[int], dict[str, Any]]  # full transactions
GetReceiptFn = Callable[[str], dict[str, Any]]
GetCodeFn = Callable[[str], str]  # 0x-hex runtime bytecode


def classify_bytecode(code: str | None, audited_addrs: set[str], address: str) -> str:
    """Pure classifier. Order matters: audited first, then template, then queued."""
    if address.lower() in audited_addrs:
        return "audited"
    if not code or code == "0x":
        return "unknown"  # SELFDESTRUCT'd / 0-byte runtime
    low = code.lower()
    for prefix in TEMPLATE_RUNTIME_PREFIXES:
        if low.startswith(prefix):
            return "skipped:template"
    return "queued"


def bytecode_hash(code: str) -> str:
    from eth_utils import keccak  # type: ignore[import-untyped]

    raw = bytes.fromhex(code[2:]) if code.startswith("0x") else bytes.fromhex(code)
    return "0x" + keccak(raw).hex()


def walk_deploys(
    *,
    chain_id: int,
    from_block: int,
    to_block: int,
    get_block: GetBlockFn,
    get_receipt: GetReceiptFn,
    get_code: GetCodeFn,
    audited_addrs: set[str] | None = None,
) -> FeedWalkResult:
    """Pure walk: blocks ∈ [from_block, to_block]; one `eth_getBlock` per block."""
    audited = audited_addrs or set()
    rows: list[FeedRow] = []
    n_blocks = 0
    for num in range(from_block, to_block + 1):
        blk = get_block(num)
        n_blocks += 1
        timestamp = int(blk.get("timestamp", 0))
        for tx in blk.get("transactions", []):
            # tx may be a hex string (if get_block returned shallow) — skip.
            if not isinstance(tx, dict):
                continue
            if tx.get("to") is not None:
                continue  # not a contract creation
            tx_hash = str(tx.get("hash", "0x"))
            receipt = get_receipt(tx_hash)
            address = receipt.get("contractAddress")
            if not address:
                continue
            address = str(address)
            try:
                code = get_code(address)
            except Exception as exc:  # noqa: BLE001 — log + classify "unknown"
                log.warning("deploy_feed: get_code failed %s: %s", address, exc)
                code = None
            cls = classify_bytecode(code, {a.lower() for a in audited}, address)
            row = FeedRow(
                address=address.lower(),
                deployer=str(tx.get("from", "0x")).lower(),
                block_number=int(blk.get("number", num)),
                tx_hash=tx_hash,
                timestamp=timestamp,
                classification=cls,
                bytecode_hash=bytecode_hash(code) if code and code != "0x" else None,
                notes=None,
            )
            rows.append(row)

    snap = FeedSnapshot(
        chain_id=chain_id,
        last_block=to_block,
        rows=tuple(sorted(rows, key=lambda r: (r.block_number, r.timestamp), reverse=True)),
    )
    return FeedWalkResult(
        snapshot=snap,
        n_blocks_scanned=n_blocks,
        n_new_contracts=len(rows),
    )


# --------------------------------------------------------------------------- #
# Live wrapper.                                                               #
# --------------------------------------------------------------------------- #


def refresh(
    *,
    store: FeedStore | None = None,
    cache_store: CacheStore | None = None,
    window_blocks: int = DEFAULT_WINDOW_BLOCKS,
    to_block: int | None = None,
) -> FeedWalkResult:
    """Live: scan the last `window_blocks`, merge into store, write."""
    s = get_settings()
    from web3 import Web3

    w3 = Web3(Web3.HTTPProvider(s.active_rpc_url, request_kwargs={"timeout": 30.0}))
    chain_id = s.chain_id
    head_block = int(w3.eth.block_number)
    to_block = head_block if to_block is None else to_block
    from_block = max(0, to_block - window_blocks)

    def _get_block(num: int) -> dict[str, Any]:
        blk: Any = w3.eth.get_block(num, full_transactions=True)
        txs: list[dict[str, Any]] = []
        for tx in blk.get("transactions", []):
            # Only full-tx dicts have a meaningful `to`; bare hex hashes are
            # skipped (full_transactions=True is requested explicitly above).
            if not hasattr(tx, "get"):
                continue
            tx_any: Any = tx
            tx_hash = tx_any.get("hash")
            txs.append(
                {
                    "hash": tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash),
                    "from": str(tx_any.get("from", "0x")),
                    "to": tx_any.get("to"),
                }
            )
        return {
            "number": int(blk["number"]),
            "timestamp": int(blk["timestamp"]),
            "transactions": txs,
        }

    def _get_receipt(tx_hash: str) -> dict[str, Any]:
        r = w3.eth.get_transaction_receipt(tx_hash)  # type: ignore[arg-type]
        return {"contractAddress": r.get("contractAddress")}

    def _get_code(address: str) -> str:
        code = w3.eth.get_code(Web3.to_checksum_address(address))
        return "0x" + code.hex() if hasattr(code, "hex") else str(code)

    cache_snap = (cache_store or CacheStore()).load()
    audited = {r.target.lower() for r in (cache_snap.rows if cache_snap else ())}

    result = walk_deploys(
        chain_id=chain_id,
        from_block=from_block,
        to_block=to_block,
        get_block=_get_block,
        get_receipt=_get_receipt,
        get_code=_get_code,
        audited_addrs=audited,
    )

    target_store = store or FeedStore()
    prev_snap = target_store.load()
    merged = FeedStore.merge(
        prev_snap.rows if prev_snap else (), result.snapshot.rows
    )
    target_store.save(
        FeedSnapshot(chain_id=chain_id, last_block=to_block, rows=merged)
    )
    return result
