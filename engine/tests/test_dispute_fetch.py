"""Unit tests for `mantleproof.dispute.fetch` — counter-claim parsing."""

from __future__ import annotations

import json

import pytest

from mantleproof.dispute import fetch

CID = "bafkreidisputeclaim"


def test_gateway_url_normalizes_trailing_slash():
    url = fetch.gateway_url(CID, gateway="https://gw.example.com/ipfs")
    assert url == "https://gw.example.com/ipfs/" + CID
    url2 = fetch.gateway_url(CID, gateway="https://gw.example.com/ipfs/")
    assert url2 == "https://gw.example.com/ipfs/" + CID


def test_parse_counter_claim_plaintext():
    body = b"the rebase snapshot finding is wrong because xyz"
    out = fetch.parse_counter_claim(CID, body)
    assert out["cid"] == CID
    assert out["raw"] is None
    assert "rebase snapshot" in out["claim"]


def test_parse_counter_claim_json_with_claim_field():
    body = json.dumps({"claim": "actual claim text", "extra": "ignored"}).encode()
    out = fetch.parse_counter_claim(CID, body)
    assert out["raw"] == {"claim": "actual claim text", "extra": "ignored"}
    assert out["claim"] == "actual claim text"


def test_parse_counter_claim_json_no_claim_field_falls_back_to_text():
    body = json.dumps({"text": "alt field"}).encode()
    out = fetch.parse_counter_claim(CID, body)
    assert out["claim"] == "alt field"


def test_parse_counter_claim_truncates_long_claim():
    body = ("x" * 20_000).encode()
    out = fetch.parse_counter_claim(CID, body)
    assert len(out["claim"]) == 8000


def test_parse_counter_claim_rejects_empty():
    with pytest.raises(ValueError):
        fetch.parse_counter_claim(CID, b"")


def test_parse_counter_claim_rejects_blank():
    with pytest.raises(ValueError):
        fetch.parse_counter_claim(CID, b"   \n  \t")
