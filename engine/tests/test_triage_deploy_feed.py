"""Tests for the T29 deploy-feed walker — pure walker against injected fakes."""

from __future__ import annotations

from mantleproof.triage import deploy_feed
from mantleproof.triage.store import FeedSnapshot, FeedStore


def test_classify_audited_takes_precedence():
    audited = {"0xaaa"}
    cls = deploy_feed.classify_bytecode("0x6080604052", audited, "0xAAA")
    assert cls == "audited"


def test_classify_template_prefix():
    minimal_proxy = "0x363d3d373d3d3d363d73" + "ab" * 20 + "5af43d82803e903d91602b57fd5bf3"
    assert deploy_feed.classify_bytecode(minimal_proxy, set(), "0xbbb") == "skipped:template"


def test_classify_empty_runtime_is_unknown():
    assert deploy_feed.classify_bytecode("0x", set(), "0xccc") == "unknown"
    assert deploy_feed.classify_bytecode(None, set(), "0xccc") == "unknown"


def test_classify_default_queued():
    assert deploy_feed.classify_bytecode("0x6080604052aabbcc", set(), "0xddd") == "queued"


def test_walk_deploys_skips_non_creation_txs():
    block = {
        "number": 100,
        "timestamp": 1_000,
        "transactions": [
            {"hash": "0xtxA", "from": "0xsender", "to": "0xnotnull"},  # plain call
            {"hash": "0xtxB", "from": "0xsender", "to": None},  # creation
        ],
    }

    def get_block(_):
        return block

    def get_receipt(_):
        return {"contractAddress": "0xDEEDBEEF"}

    def get_code(_):
        return "0x6080604052aabb"

    result = deploy_feed.walk_deploys(
        chain_id=5000,
        from_block=100,
        to_block=100,
        get_block=get_block,
        get_receipt=get_receipt,
        get_code=get_code,
    )
    assert result.n_new_contracts == 1
    row = result.snapshot.rows[0]
    assert row.address == "0xdeedbeef"
    assert row.classification == "queued"


def test_walk_deploys_get_code_failure_marks_unknown():
    block = {
        "number": 101,
        "timestamp": 1_001,
        "transactions": [{"hash": "0xtxC", "from": "0xs", "to": None}],
    }

    def get_code(_):
        raise RuntimeError("rpc blip")

    result = deploy_feed.walk_deploys(
        chain_id=5000,
        from_block=101,
        to_block=101,
        get_block=lambda _: block,
        get_receipt=lambda _: {"contractAddress": "0xABC"},
        get_code=get_code,
    )
    assert result.n_new_contracts == 1
    assert result.snapshot.rows[0].classification == "unknown"


def test_walk_deploys_marks_audited_when_in_set():
    block = {
        "number": 102,
        "timestamp": 1_002,
        "transactions": [{"hash": "0xtxD", "from": "0xs", "to": None}],
    }
    result = deploy_feed.walk_deploys(
        chain_id=5000,
        from_block=102,
        to_block=102,
        get_block=lambda _: block,
        get_receipt=lambda _: {"contractAddress": "0xAUDITED"},
        get_code=lambda _: "0x6080604052aa",
        audited_addrs={"0xaudited"},
    )
    assert result.snapshot.rows[0].classification == "audited"


def test_walk_deploys_persists_and_merges(tmp_path):
    block = {
        "number": 200,
        "timestamp": 2_000,
        "transactions": [{"hash": "0xtxN", "from": "0xs", "to": None}],
    }
    fresh = deploy_feed.walk_deploys(
        chain_id=5000,
        from_block=200,
        to_block=200,
        get_block=lambda _: block,
        get_receipt=lambda _: {"contractAddress": "0xNEW"},
        get_code=lambda _: "0x60806040ff",
    )
    store = FeedStore(data_dir=tmp_path)
    store.save(FeedSnapshot(chain_id=5000, last_block=200, rows=fresh.snapshot.rows))
    snap = store.load()
    assert snap is not None
    assert snap.rows[0].address == "0xnew"
