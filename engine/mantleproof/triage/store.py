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
