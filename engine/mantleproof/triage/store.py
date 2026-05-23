"""Atomic JSON-file persistence for the T29 cache-warmer + deploy-feed.

Why not Postgres / SQLAlchemy: the canonical Postgres task (Week-2 T11)
was retired in the Path-A redesign — the engine is stateless on the audit
hot path (pipeline.py keeps no DB) and the only persistence we actually
need is a small, append-rarely cache of "what's already anchored on
chain" and "what we've seen deployed recently". A JSON file under
`engine/data/` covers it; the *real* truth is always re-derivable from
`eth_getLogs` and `MantleProofRegistry.getAudit(...)`.

Writes are atomic (temp-then-rename) so a concurrent reader never sees
half a file. The file's `mtime` is the freshness signal exposed via
`/api/health.cache_freshness_s`; if the file doesn't exist we surface
`None` rather than fabricate a number.

Pure, no network. Tests round-trip the dataclasses, monkeypatch the path,
and check freshness boundaries.
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from collections.abc import Iterable
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

# Default data root — overridable per-store for tests + alt deploys.
DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


# --------------------------------------------------------------------------- #
# Row types — frozen so the store has well-typed input. Each store has its    #
# own row dataclass; serialization goes through `asdict` so adding a field    #
# never silently drops anything.                                              #
# --------------------------------------------------------------------------- #


@dataclass(frozen=True, slots=True)
class CacheRow:
    """One anchored audit, derived from `AuditSubmitted` events + getAudit head.

    `audit_count` is the per-target count from the registry head (not the
    number of events in the window); a re-walked target keeps the highest
    seen count so re-anchors don't appear to regress.
    """

    target: str
    root_hash: str
    severity: str  # info|low|medium|high
    severity_uint8: int
    ipfs_cid: str
    timestamp: int  # block timestamp, unix seconds
    submitter: str
    audit_count: int
    block_number: int
    tx_hash: str


@dataclass(frozen=True, slots=True)
class FeedRow:
    """One recently-observed contract creation on the active chain.

    Honesty fields: `classification` is one of:
      - "audited"        — already in the cache (anchored on-chain)
      - "queued"         — not audited yet, looks worth Tier-2 reasoning
      - "skipped:template"   — matched a known ERC-20/proxy template hash
      - "skipped:factory"    — child of a known factory (created by another contract)
      - "unknown"        — couldn't fetch bytecode (RPC blip); kept for visibility
    """

    address: str
    deployer: str
    block_number: int
    tx_hash: str
    timestamp: int
    classification: str
    bytecode_hash: str | None = None  # keccak of runtime code, for template matching
    notes: str | None = None


# --------------------------------------------------------------------------- #
# Generic atomic write + load helpers — shared by both stores.                #
# --------------------------------------------------------------------------- #


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    """Write `payload` to `path` atomically: tmp → rename, never half a file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(
        prefix=path.name + ".",
        suffix=".tmp",
        dir=str(path.parent),
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2, sort_keys=True)
        os.replace(tmp, path)  # POSIX-atomic on the same filesystem
    except Exception:
        # Best-effort cleanup; rename never partially succeeded.
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        with path.open(encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        # A truncated / corrupt file is treated as "no cache" — refresh
        # will rewrite it next run. Never crash the API on a bad disk read.
        return None


def _freshness_s(path: Path, now: float | None = None) -> int | None:
    """Seconds since `path` was last replaced; `None` if it doesn't exist."""
    if not path.exists():
        return None
    try:
        mtime = path.stat().st_mtime
    except FileNotFoundError:
        return None
    return max(0, int((now if now is not None else time.time()) - mtime))


# --------------------------------------------------------------------------- #
# CacheStore — anchored-audit index. Keyed by target; latest wins.            #
# --------------------------------------------------------------------------- #


@dataclass(frozen=True, slots=True)
class CacheSnapshot:
    chain_id: int
    last_block: int  # the latest block this snapshot was walked through
    rows: tuple[CacheRow, ...] = field(default_factory=tuple)


class CacheStore:
    """JSON-file store for anchored audits. Single file, latest snapshot wins.

    The cache is keyed on `target.lower()`: every walker run replaces the
    *snapshot*, but row order is "highest audit_count then most recent
    block" so the dashboard's PriorityCachePanel always sees the freshest
    head first.
    """

    FILENAME = "cache.json"

    def __init__(self, data_dir: Path | None = None) -> None:
        self.data_dir = (data_dir or DEFAULT_DATA_DIR).resolve()
        self.path = self.data_dir / self.FILENAME

    # ---- Pure helpers (unit-testable) --------------------------------------

    @staticmethod
    def serialize(snap: CacheSnapshot) -> dict[str, Any]:
        return {
            "chain_id": snap.chain_id,
            "last_block": snap.last_block,
            "rows": [asdict(r) for r in snap.rows],
        }

    @staticmethod
    def deserialize(payload: dict[str, Any]) -> CacheSnapshot:
        rows = tuple(
            CacheRow(**{k: r.get(k) for k in CacheRow.__dataclass_fields__})
            for r in payload.get("rows", [])
        )
        return CacheSnapshot(
            chain_id=int(payload.get("chain_id", 0)),
            last_block=int(payload.get("last_block", 0)),
            rows=rows,
        )

    @staticmethod
    def dedupe(rows: Iterable[CacheRow]) -> tuple[CacheRow, ...]:
        """Latest row per target. Sort by `audit_count desc, block desc`.

        Two AuditSubmitted events for the same target → keep the one whose
        block_number is highest; if equal, keep highest audit_count.
        """
        best: dict[str, CacheRow] = {}
        for r in rows:
            key = r.target.lower()
            cur = best.get(key)
            if cur is None:
                best[key] = r
                continue
            if (r.block_number, r.audit_count) > (cur.block_number, cur.audit_count):
                best[key] = r
        ordered = sorted(
            best.values(), key=lambda r: (r.audit_count, r.block_number), reverse=True
        )
        return tuple(ordered)

    # ---- Disk I/O ----------------------------------------------------------

    def load(self) -> CacheSnapshot | None:
        raw = _read_json(self.path)
        if raw is None:
            return None
        return self.deserialize(raw)

    def save(self, snap: CacheSnapshot) -> None:
        _atomic_write_json(self.path, self.serialize(snap))

    def freshness_s(self, now: float | None = None) -> int | None:
        return _freshness_s(self.path, now=now)


# --------------------------------------------------------------------------- #
# FeedStore — recently-observed contract creations. Bounded ring (newest N). #
# --------------------------------------------------------------------------- #


@dataclass(frozen=True, slots=True)
class FeedSnapshot:
    chain_id: int
    last_block: int
    rows: tuple[FeedRow, ...] = field(default_factory=tuple)


class FeedStore:
    """Bounded-history store of contract-creation observations.

    Walker writes the newest window each refresh; the store keeps only the
    most recent `MAX_ROWS` so the file never grows without bound.
    """

    FILENAME = "feed.json"
    MAX_ROWS = 200

    def __init__(self, data_dir: Path | None = None) -> None:
        self.data_dir = (data_dir or DEFAULT_DATA_DIR).resolve()
        self.path = self.data_dir / self.FILENAME

    @staticmethod
    def serialize(snap: FeedSnapshot) -> dict[str, Any]:
        return {
            "chain_id": snap.chain_id,
            "last_block": snap.last_block,
            "rows": [asdict(r) for r in snap.rows],
        }

    @staticmethod
    def deserialize(payload: dict[str, Any]) -> FeedSnapshot:
        rows = tuple(
            FeedRow(**{k: r.get(k) for k in FeedRow.__dataclass_fields__})
            for r in payload.get("rows", [])
        )
        return FeedSnapshot(
            chain_id=int(payload.get("chain_id", 0)),
            last_block=int(payload.get("last_block", 0)),
            rows=rows,
        )

    @staticmethod
    def merge(prev: tuple[FeedRow, ...], fresh: Iterable[FeedRow]) -> tuple[FeedRow, ...]:
        """Newest-first union; dedupe by `address` (a contract creates once)."""
        seen: set[str] = set()
        out: list[FeedRow] = []
        # `fresh` comes first so a re-walk overwrites stale classification.
        for r in list(fresh) + list(prev):
            key = r.address.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(r)
        out.sort(key=lambda r: (r.block_number, r.timestamp), reverse=True)
        return tuple(out[: FeedStore.MAX_ROWS])

    def load(self) -> FeedSnapshot | None:
        raw = _read_json(self.path)
        if raw is None:
            return None
        return self.deserialize(raw)

    def save(self, snap: FeedSnapshot) -> None:
        _atomic_write_json(self.path, self.serialize(snap))

    def freshness_s(self, now: float | None = None) -> int | None:
        return _freshness_s(self.path, now=now)


# --------------------------------------------------------------------------- #
# ReceiptStore — x402 paid-audit receipts. Keyed by rootHash (case-           #
# insensitive); newer ``recorded_at`` wins. Matched to one audit *by          #
# rootHash*, not target, so a re-audited contract's stale receipt never       #
# mis-attaches to a newer audit.                                              #
# --------------------------------------------------------------------------- #


@dataclass(frozen=True, slots=True)
class X402ReceiptRow:
    """One paid-audit receipt — the cross-chain pair (Base payment, Mantle
    anchor) that produced ``root_hash``. Persisted post-200 by the x402 route
    so the ``/api/audit`` envelope can surface who funded the audit."""

    root_hash: str            # 0x-prefixed lowercase — primary key (case-insensitive)
    target: str               # checksum address audited
    payer: str | None         # Base address that funded the audit (None on settle err)
    payment_chain: str        # e.g. "base"
    payment_chain_id: int     # 8453 (Base mainnet) / 84532 (Sepolia)
    payment_tx: str | None    # Base settle tx (None when settle failed)
    anchor_chain: str         # "mantle"
    anchor_chain_id: int      # 5000 / 5003
    anchor_tx: str | None     # Mantle submitAudit tx — normalized to 0x-prefix
    amount_base_units: str    # token base units (USDC: 6 decimals — "500000" = 0.50)
    asset: str                # ERC-20 contract on the payment chain (e.g. Base USDC)
    severity: str             # at-a-glance: info|low|medium|high
    settle_error: str | None  # surfaced honestly if post-anchor settlement failed
    recorded_at: int          # unix seconds — freshness / tiebreak


@dataclass(frozen=True, slots=True)
class ReceiptSnapshot:
    rows: tuple[X402ReceiptRow, ...] = field(default_factory=tuple)


class ReceiptStore:
    """JSON-file store of x402 paid-audit receipts.

    Keyed by ``root_hash.lower()``: every successful paid audit upserts one
    row (newer ``recorded_at`` wins). ``find_by_root_hash`` is the read path
    ``routes_audit`` uses to attach a receipt to the canonical envelope.

    Receipts span two chains by definition (payment on Base, anchor on
    Mantle), so the snapshot carries no single ``chain_id`` / ``last_block``
    — both chain ids live on each row.
    """

    FILENAME = "x402_receipts.json"

    def __init__(self, data_dir: Path | None = None) -> None:
        self.data_dir = (data_dir or DEFAULT_DATA_DIR).resolve()
        self.path = self.data_dir / self.FILENAME

    # ---- Pure helpers ------------------------------------------------------

    @staticmethod
    def serialize(snap: ReceiptSnapshot) -> dict[str, Any]:
        return {"rows": [asdict(r) for r in snap.rows]}

    @staticmethod
    def deserialize(payload: dict[str, Any]) -> ReceiptSnapshot:
        rows = tuple(
            X402ReceiptRow(**{k: r.get(k) for k in X402ReceiptRow.__dataclass_fields__})
            for r in payload.get("rows", [])
        )
        return ReceiptSnapshot(rows=rows)

    @staticmethod
    def upsert(
        rows: Iterable[X402ReceiptRow], new_row: X402ReceiptRow
    ) -> tuple[X402ReceiptRow, ...]:
        """Replace any same-rootHash row with ``new_row``; sort by
        ``recorded_at`` desc so the most-recent receipt is first."""
        key = new_row.root_hash.lower()
        out = [r for r in rows if r.root_hash.lower() != key]
        out.append(new_row)
        out.sort(key=lambda r: r.recorded_at, reverse=True)
        return tuple(out)

    # ---- Disk I/O ----------------------------------------------------------

    def load(self) -> ReceiptSnapshot | None:
        raw = _read_json(self.path)
        if raw is None:
            return None
        return self.deserialize(raw)

    def save(self, snap: ReceiptSnapshot) -> None:
        _atomic_write_json(self.path, self.serialize(snap))

    def freshness_s(self, now: float | None = None) -> int | None:
        return _freshness_s(self.path, now=now)

    def record(self, row: X402ReceiptRow) -> None:
        """Load → upsert → save. One call per successful paid audit."""
        snap = self.load() or ReceiptSnapshot()
        self.save(ReceiptSnapshot(rows=self.upsert(snap.rows, row)))

    def find_by_root_hash(self, root_hash: str) -> X402ReceiptRow | None:
        """Case-insensitive lookup. ``None`` if no file or no match."""
        snap = self.load()
        if snap is None:
            return None
        target = root_hash.lower()
        for r in snap.rows:
            if r.root_hash.lower() == target:
                return r
        return None
