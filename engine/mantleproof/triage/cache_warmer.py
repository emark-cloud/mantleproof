"""T29 — anchored-audit cache warmer.

Walks ``MantleProofRegistry.AuditSubmitted`` events over a recent block
window, joins each unique target against ``getAudit(target)`` to take the
canonical head, and persists a `CacheSnapshot`.

Why event scan AND read getAudit:
  - The event tells us a target was anchored *at this block* (so the cache
    row carries the on-chain block + tx hash → links to Mantlescan).
  - `getAudit` returns the latest head (rootHash/severity/ipfsCID/...) which
    is what other agents will actually consume; if a target was re-anchored
    after the window started, the head differs from any single event in the
    window — re-reading the head keeps the cache consistent with
    "what `getAudit` would return right now."

Pure seam: ``walk_audits(rpc=…, get_logs=…, get_audit=…)`` takes injectable
callables so tests can run the full pipeline offline against fakes. Live
wrapper ``refresh()`` wires the real web3 calls.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from mantleproof.persistence.registry_reader import OnChainAudit, read_audit
from mantleproof.settings import get_settings
from mantleproof.triage.store import CacheRow, CacheSnapshot, CacheStore

log = logging.getLogger(__name__)


def _audit_submitted_topic() -> str:
    """Keccak of the canonical event signature, lazily evaluated.

    Must match the DEPLOYED event exactly — the T43 redeploy added the
    trailing ``uint8 tier`` arg (see IMantleProofRegistry.AuditSubmitted),
    and ``Severity`` is an enum so it canonicalizes to ``uint8``:

    AuditSubmitted(address indexed target, bytes32 indexed rootHash,
                   Severity severity, string ipfsCID, uint8 tier)

    The pre-T43 4-arg signature hashes to a different topic that matches
    zero on-chain logs, so leaving ``tier`` off silently empties the cache.
    """
    from eth_utils import keccak  # type: ignore[import-untyped]

    sig = b"AuditSubmitted(address,bytes32,uint8,string,uint8)"
    return "0x" + keccak(sig).hex()


# Default window: ~24h on Mantle's ~2s block time. Bounded so a fresh
# install doesn't try to walk the chain since genesis.
DEFAULT_WINDOW_BLOCKS = 50_000

# Per-call ``eth_getLogs`` block cap. Public Mantle RPCs (drpc et al.) reject
# requests wider than ~10k blocks with HTTP 400; chunking keeps the wrapper
# usable for any ``window_blocks`` without callers having to know the cap.
MAX_LOGS_RANGE = 9_500

# Severity name → uint8 (mirrors `IMantleProofRegistry.Severity`).
_SEVERITY_UINT8: dict[str, int] = {"info": 0, "low": 1, "medium": 2, "high": 3}


def _chunked_get_logs(
    single_call: Callable[[int, int], list[dict[str, Any]]],
    from_block: int,
    to_block: int,
    chunk_size: int = MAX_LOGS_RANGE,
) -> list[dict[str, Any]]:
    """Pure: split ``[from_block, to_block]`` into ``chunk_size``-block
    windows, call ``single_call(from, to)`` per chunk, concatenate the
    results. ``single_call`` is the layer that talks to the RPC (or, in
    tests, returns fakes). Inclusive bounds on both ends.

    A single-block range (``from == to``) still issues one call; an empty
    range (``from > to``) issues none.
    """
    out: list[dict[str, Any]] = []
    if chunk_size < 1:
        raise ValueError(f"chunk_size must be >= 1, got {chunk_size}")
    cur = from_block
    while cur <= to_block:
        end = min(cur + chunk_size - 1, to_block)
        out.extend(single_call(cur, end))
        cur = end + 1
    return out


@dataclass(frozen=True)
class WalkResult:
    """What `walk_audits` returns. Surfaced verbatim by the refresh CLI."""

    snapshot: CacheSnapshot
    n_events: int
    n_targets: int
    n_dropped: int  # events whose target had no head (transient race)


# --------------------------------------------------------------------------- #
# Pure walker — takes injectable seams. Each seam matches the *minimal*       #
# shape we actually use; live wrappers below adapt web3.                      #
# --------------------------------------------------------------------------- #


GetLogsFn = Callable[[int, int, str, str], list[dict[str, Any]]]
GetAuditFn = Callable[[str], OnChainAudit | None]
# Best-effort IPFS report fetch — used only to read out `contract_name`.
# Returning `None` (or any failure) leaves contract_name unset; the walker
# never raises on this seam.
GetReportFn = Callable[[str, str], dict[str, Any] | None]


def _noop_get_report(_cid: str, _expected: str) -> dict[str, Any] | None:
    """Default: skip the IPFS round-trip entirely. Live wrappers override."""
    return None


def walk_audits(
    *,
    chain_id: int,
    registry_address: str,
    from_block: int,
    to_block: int,
    get_logs: GetLogsFn,
    get_audit: GetAuditFn,
    get_report: GetReportFn = _noop_get_report,
) -> WalkResult:
    """Pure: read events, dedupe, fetch heads, return a snapshot.

    The walker NEVER raises on a missing head; if `getAudit` returns None
    for a target whose event we just saw, we count it as `n_dropped` and
    skip it (race: re-anchored between log fetch and head fetch is rare
    but possible, so we keep the cache as a strict subset of "currently
    anchored AND readable").
    """
    topic = _audit_submitted_topic()
    logs = get_logs(from_block, to_block, registry_address, topic)

    # Map (target → (block, tx)). We don't trust event order to give us a
    # count — that's `getAudit().audit_count`.
    by_target: dict[str, tuple[int, str]] = {}
    n_events = 0
    for entry in logs:
        n_events += 1
        try:
            target_topic = entry["topics"][1]  # indexed address, 32-byte
        except (KeyError, IndexError):
            continue
        # Topic addresses are 32-byte left-padded; take the last 20 bytes.
        clean = str(target_topic).lower()
        if clean.startswith("0x"):
            clean = clean[2:]
        target_hex = "0x" + clean.rjust(64, "0")[-40:]
        blk = int(entry.get("blockNumber", 0))
        tx = str(entry.get("transactionHash", "0x"))
        prev = by_target.get(target_hex)
        if prev is None or blk > prev[0]:
            by_target[target_hex] = (blk, tx)

    rows: list[CacheRow] = []
    n_dropped = 0
    for target, (block, tx) in by_target.items():
        head = get_audit(target)
        if head is None:
            log.info("cache_warmer: head missing for %s, dropping", target)
            n_dropped += 1
            continue
        # Pull contract_name from the pinned report (best-effort: a missing /
        # tampered / unreachable report leaves `contract_name = None` — the
        # row still ships, the panel still renders, search just won't match
        # that row by name). Never block the cache on IPFS.
        contract_name: str | None = None
        try:
            report = get_report(head.ipfs_cid, head.root_hash)
            if isinstance(report, dict):
                raw = report.get("contract_name")
                if isinstance(raw, str) and raw.strip():
                    contract_name = raw.strip()
        except Exception as exc:  # noqa: BLE001 — IPFS is best-effort here
            log.info("cache_warmer: report fetch failed for %s: %s", target, exc)
        rows.append(
            CacheRow(
                target=head.target,
                root_hash=head.root_hash,
                severity=head.severity.value,
                severity_uint8=_SEVERITY_UINT8[head.severity.value],
                ipfs_cid=head.ipfs_cid,
                timestamp=head.timestamp,
                submitter=head.submitter,
                audit_count=head.audit_count,
                block_number=block,
                tx_hash=tx,
                contract_name=contract_name,
            )
        )

    deduped = CacheStore.dedupe(rows)
    snap = CacheSnapshot(chain_id=chain_id, last_block=to_block, rows=deduped)
    return WalkResult(
        snapshot=snap,
        n_events=n_events,
        n_targets=len(by_target),
        n_dropped=n_dropped,
    )


# --------------------------------------------------------------------------- #
# Live wrapper — wires real web3 RPC into the pure walker.                    #
# --------------------------------------------------------------------------- #


def refresh(
    *,
    store: CacheStore | None = None,
    window_blocks: int = DEFAULT_WINDOW_BLOCKS,
    to_block: int | None = None,
) -> WalkResult:
    """Live: connect web3, scan the last `window_blocks`, write the store."""
    s = get_settings()
    if not s.mantleproof_registry_address:
        raise RuntimeError(
            "MANTLEPROOF_REGISTRY_ADDRESS not set — cannot warm cache. "
            "Set it in .env (see contracts/deployments/<network>.addresses.json)."
        )

    from typing import cast

    from web3 import Web3
    from web3.types import FilterParams

    w3 = Web3(Web3.HTTPProvider(s.active_rpc_url, request_kwargs={"timeout": 30.0}))
    chain_id = s.chain_id
    head_block = int(w3.eth.block_number)
    to_block = head_block if to_block is None else to_block
    from_block = max(0, to_block - window_blocks)

    def _get_logs(
        from_blk: int, to_blk: int, address: str, topic0: str
    ) -> list[dict[str, Any]]:
        # web3.py accepts hex-string topics at runtime; cast to satisfy the
        # static `_Hash32 | None` shape without coercing into HexBytes.
        checksum_addr = Web3.to_checksum_address(address)

        def _one_chunk(f_blk: int, t_blk: int) -> list[dict[str, Any]]:
            params = cast(
                FilterParams,
                {
                    "address": checksum_addr,
                    "topics": [topic0],
                    "fromBlock": f_blk,
                    "toBlock": t_blk,
                },
            )
            raw = w3.eth.get_logs(params)
            return [
                {
                    "blockNumber": int(entry["blockNumber"]),
                    "transactionHash": entry["transactionHash"].hex()
                    if hasattr(entry["transactionHash"], "hex")
                    else str(entry["transactionHash"]),
                    "topics": [
                        t.hex() if hasattr(t, "hex") else str(t)
                        for t in entry.get("topics", [])
                    ],
                }
                for entry in raw
            ]

        # Chunked so any ``window_blocks`` works, even past drpc's per-call cap.
        return _chunked_get_logs(_one_chunk, from_blk, to_blk)

    def _get_audit(target: str) -> OnChainAudit | None:
        return read_audit(target)

    def _get_report(cid: str, expected: str) -> dict[str, Any] | None:
        """Best-effort: pull the pinned report so the row gets a contract_name.
        Any IPFS failure -> None -> name search degrades cleanly (the row
        still ships, address search still works)."""
        from mantleproof.persistence.ipfs_fetch import fetch_report

        try:
            fr = fetch_report(cid, expected)
        except Exception as exc:  # noqa: BLE001
            log.info("cache_warmer: IPFS fetch_report failed for %s: %s", cid, exc)
            return None
        return fr.report if fr else None

    result = walk_audits(
        chain_id=chain_id,
        registry_address=s.mantleproof_registry_address,
        from_block=from_block,
        to_block=to_block,
        get_logs=_get_logs,
        get_audit=_get_audit,
        get_report=_get_report,
    )

    target_store = store or CacheStore()
    target_store.save(result.snapshot)
    return result
