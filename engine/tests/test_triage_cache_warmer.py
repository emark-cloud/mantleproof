"""Tests for the T29 cache-warmer — pure walker against injected web3 fakes."""

from __future__ import annotations

from mantleproof.checks.base import Severity
from mantleproof.persistence.registry_reader import OnChainAudit
from mantleproof.triage import cache_warmer
from mantleproof.triage.store import CacheStore

REGISTRY = "0x60E97c83Dd184D3B0812Ce25430e9D6930eD63aE"
TARGET_HI = "0x1892f77e335c133ce4a7b28555f13ba74cbb76fa"
TARGET_INFO = "0x013e138ef6008ae5fdfde29700e3f2bc61d21e3a"


def _topic_addr(addr: str) -> str:
    """Encode an address as a 32-byte topic."""
    return "0x" + addr.lower().replace("0x", "").rjust(64, "0")


def _audit(target: str, severity: Severity, count: int = 1) -> OnChainAudit:
    return OnChainAudit(
        target=target,
        root_hash="0x" + "ab" * 32,
        severity=severity,
        ipfs_cid="bafkreitest",
        timestamp=1_716_000_000,
        submitter="0x9f17b625902B0d35a02fd790aF45cf95e9F4638a",
        audit_count=count,
    )


def test_walk_audits_collects_targets_from_topic1():
    logs = [
        {
            "blockNumber": 100,
            "transactionHash": "0xtxA",
            "topics": ["0xevt", _topic_addr(TARGET_HI)],
        },
        {
            "blockNumber": 101,
            "transactionHash": "0xtxB",
            "topics": ["0xevt", _topic_addr(TARGET_INFO)],
        },
    ]
    heads = {
        TARGET_HI.lower(): _audit(TARGET_HI, Severity.HIGH, count=1),
        TARGET_INFO.lower(): _audit(TARGET_INFO, Severity.INFO, count=2),
    }

    def get_logs(_from, _to, _addr, _topic):
        return logs

    def get_audit(target):
        return heads.get(target.lower())

    result = cache_warmer.walk_audits(
        chain_id=5000,
        registry_address=REGISTRY,
        from_block=0,
        to_block=200,
        get_logs=get_logs,
        get_audit=get_audit,
    )
    assert result.n_events == 2
    assert result.n_targets == 2
    assert result.n_dropped == 0
    targets = {r.target.lower() for r in result.snapshot.rows}
    assert targets == {TARGET_HI.lower(), TARGET_INFO.lower()}
    # Dedupe sorts INFO/count=2 ahead of HIGH/count=1 because audit_count is the
    # primary key (most-anchored first); document so future review doesn't
    # misread this as a severity bug.
    assert result.snapshot.rows[0].audit_count >= result.snapshot.rows[1].audit_count


def test_walk_audits_dedupes_repeat_event_takes_latest_block():
    logs = [
        {
            "blockNumber": 100,
            "transactionHash": "0xold",
            "topics": ["0xevt", _topic_addr(TARGET_HI)],
        },
        {
            "blockNumber": 200,
            "transactionHash": "0xnew",
            "topics": ["0xevt", _topic_addr(TARGET_HI)],
        },
    ]

    def get_logs(*_a):
        return logs

    def get_audit(target):
        return _audit(target, Severity.HIGH, count=3)

    result = cache_warmer.walk_audits(
        chain_id=5000,
        registry_address=REGISTRY,
        from_block=0,
        to_block=300,
        get_logs=get_logs,
        get_audit=get_audit,
    )
    assert result.n_events == 2
    assert len(result.snapshot.rows) == 1
    assert result.snapshot.rows[0].block_number == 200
    assert result.snapshot.rows[0].tx_hash == "0xnew"


def test_walk_audits_drops_targets_with_missing_head():
    logs = [
        {
            "blockNumber": 100,
            "transactionHash": "0xtx",
            "topics": ["0xevt", _topic_addr(TARGET_HI)],
        }
    ]

    def get_audit(_target):
        return None  # racing re-anchor; cache stays a strict subset

    result = cache_warmer.walk_audits(
        chain_id=5000,
        registry_address=REGISTRY,
        from_block=0,
        to_block=200,
        get_logs=lambda *_a: logs,
        get_audit=get_audit,
    )
    assert result.n_targets == 1
    assert result.n_dropped == 1
    assert result.snapshot.rows == ()


def test_walk_audits_persists_to_store(tmp_path):
    """Refresh + load contract: live `refresh()` writes; tests use walk_audits + save."""
    logs = [
        {
            "blockNumber": 100,
            "transactionHash": "0xtx",
            "topics": ["0xevt", _topic_addr(TARGET_HI)],
        }
    ]
    result = cache_warmer.walk_audits(
        chain_id=5000,
        registry_address=REGISTRY,
        from_block=0,
        to_block=200,
        get_logs=lambda *_a: logs,
        get_audit=lambda _t: _audit(TARGET_HI, Severity.HIGH, count=1),
    )
    store = CacheStore(data_dir=tmp_path)
    store.save(result.snapshot)
    reloaded = store.load()
    assert reloaded is not None
    assert reloaded.rows[0].severity == "high"
    assert reloaded.last_block == 200


def test_audit_submitted_topic_is_keccak_of_signature():
    # Sanity check: the topic must match what the contract emits.
    from eth_utils import keccak

    expected = "0x" + keccak(b"AuditSubmitted(address,bytes32,uint8,string)").hex()
    assert cache_warmer._audit_submitted_topic() == expected


# --- _chunked_get_logs — wraps a single-call RPC to survive drpc's range cap


def test_chunked_get_logs_single_call_when_within_chunk():
    """Range that fits in one chunk → exactly one underlying call."""
    calls: list[tuple[int, int]] = []

    def single(f, t):
        calls.append((f, t))
        return [{"blockNumber": f}]

    out = cache_warmer._chunked_get_logs(single, 100, 199, chunk_size=1000)
    assert calls == [(100, 199)]
    assert out == [{"blockNumber": 100}]


def test_chunked_get_logs_splits_wide_range_and_concatenates():
    """Wide range → N calls of ``chunk_size`` blocks each (last truncated),
    results concatenated in order."""
    calls: list[tuple[int, int]] = []

    def single(f, t):
        calls.append((f, t))
        return [{"blockNumber": f}, {"blockNumber": t}]

    out = cache_warmer._chunked_get_logs(single, 0, 24, chunk_size=10)
    # Chunks: 0..9, 10..19, 20..24 — inclusive bounds, last is short.
    assert calls == [(0, 9), (10, 19), (20, 24)]
    assert out == [
        {"blockNumber": 0}, {"blockNumber": 9},
        {"blockNumber": 10}, {"blockNumber": 19},
        {"blockNumber": 20}, {"blockNumber": 24},
    ]


def test_chunked_get_logs_empty_range_makes_no_calls():
    """``from > to`` is a no-op (matches walker semantics for fresh-install
    edge cases)."""
    calls: list[tuple[int, int]] = []

    def single(f, t):
        calls.append((f, t))
        return [{"x": 1}]

    out = cache_warmer._chunked_get_logs(single, 100, 50, chunk_size=10)
    assert calls == []
    assert out == []


def test_chunked_get_logs_single_block_range_issues_one_call():
    calls: list[tuple[int, int]] = []

    def single(f, t):
        calls.append((f, t))
        return []

    cache_warmer._chunked_get_logs(single, 42, 42, chunk_size=10)
    assert calls == [(42, 42)]


def test_chunked_get_logs_rejects_nonpositive_chunk_size():
    import pytest

    with pytest.raises(ValueError):
        cache_warmer._chunked_get_logs(lambda f, t: [], 0, 10, chunk_size=0)
