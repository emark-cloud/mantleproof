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
