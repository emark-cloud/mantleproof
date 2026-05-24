"""Unit tests for `mantleproof.dispute.events` — walker + log decode."""

from __future__ import annotations

import json
from typing import Any

from eth_abi.abi import encode
from web3 import Web3

from mantleproof.dispute import events as ev

REGISTRY = "0x60E97c83Dd184D3B0812Ce25430e9D6930eD63aE"
ROOT = "0x" + "aa" * 32
DISPUTER = "0x4354d518eD2060b315995E68268f019C074fc1f3"
CID = "ipfs://bafkreidisputeclaim"


def _topic_hex(value: int | str) -> str:
    if isinstance(value, int):
        return "0x" + value.to_bytes(32, "big").hex()
    return value


def _addr_topic(addr: str) -> str:
    return "0x" + "0" * 24 + addr[2:].lower()


def _log(
    *,
    dispute_id: int = 1,
    root_hash: str = ROOT,
    finding_index: int = 0,
    disputer: str = DISPUTER,
    cid: str = CID,
    counter_stake: int = 0,
    block_number: int = 1234,
) -> dict[str, Any]:
    topic0 = ev.dispute_submitted_topic()
    data = encode(["uint256", "string", "uint256"], [finding_index, cid, counter_stake])
    return {
        "address": REGISTRY,
        "topics": [
            topic0,
            _topic_hex(dispute_id),
            root_hash if root_hash.startswith("0x") else "0x" + root_hash,
            _addr_topic(disputer),
        ],
        "data": "0x" + data.hex(),
        "blockNumber": block_number,
        "transactionHash": "0x" + "be" * 32,
    }


def test_dispute_submitted_topic_is_deterministic():
    topic = ev.dispute_submitted_topic()
    expected = "0x" + Web3.keccak(
        text="DisputeSubmitted(uint256,bytes32,uint256,address,string,uint256)"
    ).hex().removeprefix("0x")
    assert topic == expected


def test_decode_log_happy_path():
    row = ev.decode_log(_log(dispute_id=7, finding_index=2, counter_stake=10**17))
    assert row.dispute_id == 7
    assert row.root_hash == ROOT
    assert row.finding_index == 2
    assert row.disputer.lower() == DISPUTER.lower()
    assert row.counter_claim_ipfs == CID
    assert row.counter_stake == 10**17
    assert row.block_number == 1234


def test_decode_log_rejects_short_topics():
    log = _log()
    log["topics"] = log["topics"][:2]
    try:
        ev.decode_log(log)
    except ValueError as exc:
        assert "topics" in str(exc)
        return
    raise AssertionError("expected ValueError on short topics")


def test_walk_disputes_uses_injected_get_logs():
    captured: dict[str, Any] = {}

    def _get_logs(params):
        captured["params"] = params
        return [_log(dispute_id=1), _log(dispute_id=2, finding_index=3)]

    rows = ev.walk_disputes(
        from_block=100, to_block=200, registry_address=REGISTRY, get_logs=_get_logs
    )
    assert captured["params"]["address"] == REGISTRY
    assert captured["params"]["fromBlock"] == 100
    assert captured["params"]["toBlock"] == 200
    assert len(captured["params"]["topics"]) == 1  # only topic0 filter
    assert len(rows) == 2
    assert rows[0].dispute_id == 1 and rows[1].dispute_id == 2


def test_persist_writes_atomic_json(tmp_path, monkeypatch):
    # Redirect the store to a tmp path.
    monkeypatch.setattr(ev, "_store_path", lambda: tmp_path / "disputes.json")
    row = ev.decode_log(_log(dispute_id=3))
    ev.persist([row], last_block=999)
    body = json.loads((tmp_path / "disputes.json").read_text())
    assert body["last_block"] == 999
    assert body["n_disputes"] == 1
    assert body["rows"][0]["dispute_id"] == 3
