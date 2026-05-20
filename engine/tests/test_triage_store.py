"""Tests for the T29 JSON-file store layer — round-trip, atomic write, freshness."""

from __future__ import annotations

import json
import time
from dataclasses import replace

from mantleproof.triage.store import (
    CacheRow,
    CacheSnapshot,
    CacheStore,
    FeedRow,
    FeedSnapshot,
    FeedStore,
)

CACHE_ROW = CacheRow(
    target="0x1892f77e335c133ce4a7b28555f13ba74cbb76fa",
    root_hash="0x6a69e7d4ca460000000000000000000000000000000000000000000000000000",
    severity="high",
    severity_uint8=3,
    ipfs_cid="bafkreibjhgewce",
    timestamp=1_716_198_400,
    submitter="0x9f17b625902B0d35a02fd790aF45cf95e9F4638a",
    audit_count=1,
    block_number=95_566_491,
    tx_hash="0x7cfbb72be4ca0000000000000000000000000000000000000000000000000000",
)


def test_cache_round_trip(tmp_path):
    store = CacheStore(data_dir=tmp_path)
    snap = CacheSnapshot(chain_id=5000, last_block=95_600_000, rows=(CACHE_ROW,))
    store.save(snap)
    loaded = store.load()
    assert loaded is not None
    assert loaded.chain_id == 5000
    assert loaded.last_block == 95_600_000
    assert loaded.rows[0] == CACHE_ROW


def test_cache_dedupe_keeps_highest_block(tmp_path):
    older = replace(CACHE_ROW, audit_count=1, block_number=1)
    newer = replace(CACHE_ROW, audit_count=2, block_number=2)
    deduped = CacheStore.dedupe([older, newer, older])
    assert len(deduped) == 1
    assert deduped[0].block_number == 2
    assert deduped[0].audit_count == 2


def test_cache_load_missing_returns_none(tmp_path):
    assert CacheStore(data_dir=tmp_path).load() is None


def test_cache_load_corrupt_file_returns_none(tmp_path):
    store = CacheStore(data_dir=tmp_path)
    store.path.parent.mkdir(parents=True, exist_ok=True)
    store.path.write_text("{not json")
    # Corrupt file → treated as no cache; never raises.
    assert store.load() is None


def test_cache_atomic_write_no_partial(tmp_path):
    """The temp file must not survive past a successful write."""
    store = CacheStore(data_dir=tmp_path)
    store.save(CacheSnapshot(chain_id=5000, last_block=1, rows=()))
    # Only the canonical file should exist; no `cache.json.*.tmp` leftovers.
    assert store.path.exists()
    siblings = [p.name for p in tmp_path.iterdir() if p.name != store.path.name]
    assert siblings == []


def test_cache_freshness_grows_with_time(tmp_path):
    store = CacheStore(data_dir=tmp_path)
    store.save(CacheSnapshot(chain_id=5000, last_block=1, rows=()))
    assert store.freshness_s() == 0 or store.freshness_s() is None or store.freshness_s() >= 0
    later = time.time() + 100
    assert (store.freshness_s(now=later) or 0) >= 99


def test_cache_freshness_none_when_missing(tmp_path):
    assert CacheStore(data_dir=tmp_path).freshness_s() is None


def test_feed_merge_dedupes_by_address(tmp_path):
    a = FeedRow(
        address="0xaaa",
        deployer="0xdead",
        block_number=10,
        tx_hash="0xtx1",
        timestamp=100,
        classification="queued",
    )
    a_re = FeedRow(
        address="0xaaa",  # same address, fresh classification wins
        deployer="0xdead",
        block_number=10,
        tx_hash="0xtx1",
        timestamp=100,
        classification="audited",
    )
    b = FeedRow(
        address="0xbbb",
        deployer="0xdead",
        block_number=12,
        tx_hash="0xtx2",
        timestamp=120,
        classification="skipped:template",
    )
    merged = FeedStore.merge((a,), [a_re, b])
    # Newest-first; `a_re` overwrites `a` on the same address.
    assert [r.address for r in merged] == ["0xbbb", "0xaaa"]
    assert merged[1].classification == "audited"


def test_feed_merge_bounded_by_max_rows(tmp_path):
    rows = [
        FeedRow(
            address=f"0x{i:040x}",
            deployer="0x0",
            block_number=i,
            tx_hash=f"0x{i}",
            timestamp=i,
            classification="queued",
        )
        for i in range(FeedStore.MAX_ROWS + 50)
    ]
    merged = FeedStore.merge((), rows)
    assert len(merged) == FeedStore.MAX_ROWS


def test_feed_round_trip(tmp_path):
    store = FeedStore(data_dir=tmp_path)
    row = FeedRow(
        address="0xaaa",
        deployer="0xdead",
        block_number=1,
        tx_hash="0xtx",
        timestamp=1,
        classification="queued",
        bytecode_hash="0xfeed",
        notes="hi",
    )
    store.save(FeedSnapshot(chain_id=5000, last_block=1, rows=(row,)))
    snap = store.load()
    assert snap is not None
    assert snap.rows[0].bytecode_hash == "0xfeed"


def test_serialize_is_pure_json(tmp_path):
    """The on-disk format must be plain JSON — humans inspect this."""
    snap = CacheSnapshot(chain_id=5000, last_block=2, rows=(CACHE_ROW,))
    payload = CacheStore.serialize(snap)
    text = json.dumps(payload, sort_keys=True)
    re_parsed = json.loads(text)
    rebuilt = CacheStore.deserialize(re_parsed)
    assert rebuilt.rows[0] == CACHE_ROW
