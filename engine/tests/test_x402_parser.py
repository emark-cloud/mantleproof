"""Pure tests for the X-PAYMENT header parser (T11)."""

from __future__ import annotations

import base64
import json

from mantleproof.x402.parser import parse_payment_header


def _valid_payload() -> dict:
    return {
        "x402Version": 1,
        "scheme": "exact",
        "network": "base",
        "payload": {
            "signature": "0x" + "ab" * 65,
            "authorization": {
                "from": "0xpayer000000000000000000000000000000000000",
                "to": "0xpayto000000000000000000000000000000000000",
                "value": "500000",
                "validAfter": "0",
                "validBefore": "9999999999",
                "nonce": "0x" + "cd" * 32,
            },
        },
    }


def _encode(d: dict) -> str:
    return base64.b64encode(json.dumps(d).encode("utf-8")).decode("ascii")


def test_parser_happy_path():
    p, err = parse_payment_header(_encode(_valid_payload()))
    assert err is None
    assert p is not None
    assert p.x402Version == 1
    assert p.scheme == "exact"
    assert p.network == "base"
    assert p.payload.authorization.value == "500000"
    # ``from`` is preserved through the keyword-conflict translation.
    assert p.payload.authorization.to_dict()["from"].startswith("0xpayer")


def test_parser_rejects_empty_header():
    _, err = parse_payment_header("")
    assert err is not None
    assert "empty" in err.lower()


def test_parser_rejects_bad_base64():
    _, err = parse_payment_header("not-base64!!!")
    assert err is not None
    assert "base64" in err.lower()


def test_parser_rejects_non_json():
    _, err = parse_payment_header(base64.b64encode(b"not json").decode("ascii"))
    assert err is not None
    assert "json" in err.lower()


def test_parser_rejects_wrong_version():
    p = _valid_payload()
    p["x402Version"] = 2
    _, err = parse_payment_header(_encode(p))
    assert err is not None
    assert "x402Version" in err


def test_parser_rejects_wrong_scheme():
    p = _valid_payload()
    p["scheme"] = "subscription"
    _, err = parse_payment_header(_encode(p))
    assert err is not None
    assert "scheme" in err


def test_parser_rejects_wrong_network():
    p = _valid_payload()
    p["network"] = "polygon"
    _, err = parse_payment_header(_encode(p))
    assert err is not None
    assert "network" in err


def test_parser_rejects_missing_authorization_fields():
    p = _valid_payload()
    del p["payload"]["authorization"]["nonce"]
    _, err = parse_payment_header(_encode(p))
    assert err is not None
    assert "nonce" in err


def test_parser_round_trip_preserves_signature_bytes():
    p, _ = parse_payment_header(_encode(_valid_payload()))
    assert p is not None
    assert p.payload.signature == "0x" + "ab" * 65
