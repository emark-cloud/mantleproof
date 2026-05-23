"""Pure tests for the ERC-8004 v2 ``giveFeedback`` builder + pre-flight gates (T39).

Offline-only: dependency-injected ``get_logs`` / ``is_authorized_or_owner``
callables stand in for ``w3.eth.get_logs`` / a live ``isAuthorizedOrOwner``
call. No network.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from eth_abi.abi import decode
from eth_utils import keccak  # type: ignore[import-untyped]

from mantleproof.reputation.feedback import (
    AUDIT_PAID_TOPIC,
    GIVE_FEEDBACK_SELECTOR,
    IDENTITY_REGISTRY_BY_CHAIN,
    LICENSE_BY_CHAIN,
    MANTLEPROOF_AGENT_TOKEN_ID,
    MAX_ABS_VALUE,
    REPUTATION_REGISTRY_BY_CHAIN,
    FeedbackBuilderError,
    SybilGateError,
    assert_not_authorized,
    assert_paid,
    assert_paid_via_tx,
    build_give_feedback_calldata,
    feedback_hash_of,
)

PAYER = "0xB74a08a5aD469758F1a0fAc2cF6059de3cc4A148"  # trading-agent (T27)
TARGET = "0x8F6679EB031799fc9C5e149DFb75b4543808912F"  # BackdooredMemeToken
AGENT_ID = MANTLEPROOF_AGENT_TOKEN_ID  # 96


# ---------------------------------------------------------------------------
# Canonical addresses + selectors (immutable references — locked in T37)
# ---------------------------------------------------------------------------


def test_canonical_addresses_match_t37_findings():
    # Verified live 2026-05-23 in T37 against deployed bytecode on Mantle 5000.
    assert REPUTATION_REGISTRY_BY_CHAIN[5000] == "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63"
    assert IDENTITY_REGISTRY_BY_CHAIN[5000] == "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
    assert REPUTATION_REGISTRY_BY_CHAIN[5003] == "0x8004B663056A597Dffe9eCcC1965A193B7388713"
    assert IDENTITY_REGISTRY_BY_CHAIN[5003] == "0x8004A818BFB912233c491871b3d84c89A494BD9e"
    assert LICENSE_BY_CHAIN[5000] == "0x906390B3594384bE83F3465cFeDf8661f4d1a410"


def test_selectors_match_keccak_of_canonical_signatures():
    expected_selector = "0x" + keccak(
        text="giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)"
    ).hex()[:8]
    assert GIVE_FEEDBACK_SELECTOR == expected_selector

    expected_topic = "0x" + keccak(text="AuditPaid(address,address,uint256)").hex()
    assert AUDIT_PAID_TOPIC == expected_topic


# ---------------------------------------------------------------------------
# Builder — round-trip via abi.decode pins the wire shape
# ---------------------------------------------------------------------------


def test_build_calldata_round_trip_decodes_to_inputs():
    cd = build_give_feedback_calldata(
        agent_id=AGENT_ID,
        value=42,
        value_decimals=0,
        tag1="audit-quality",
        tag2="",
        endpoint="mantleproof.xyz/api/audit/" + TARGET,
        feedback_uri="ipfs://bafkreiatwd…ujg4",
        feedback_hash=b"\x11" * 32,
    )
    assert cd.startswith(GIVE_FEEDBACK_SELECTOR)
    payload = bytes.fromhex(cd[len(GIVE_FEEDBACK_SELECTOR):])
    (
        agent_id,
        value,
        value_decimals,
        tag1,
        tag2,
        endpoint,
        feedback_uri,
        feedback_hash,
    ) = decode(
        [
            "uint256",
            "int128",
            "uint8",
            "string",
            "string",
            "string",
            "string",
            "bytes32",
        ],
        payload,
    )
    assert agent_id == AGENT_ID
    assert value == 42
    assert value_decimals == 0
    assert tag1 == "audit-quality"
    assert tag2 == ""
    assert endpoint == "mantleproof.xyz/api/audit/" + TARGET
    assert feedback_uri == "ipfs://bafkreiatwd…ujg4"
    assert feedback_hash == b"\x11" * 32


def test_build_calldata_accepts_hex_string_feedback_hash():
    h = "0x" + "ab" * 32
    cd = build_give_feedback_calldata(agent_id=AGENT_ID, value=1, feedback_hash=h)
    payload = bytes.fromhex(cd[len(GIVE_FEEDBACK_SELECTOR):])
    (*_, fh) = decode(
        ["uint256", "int128", "uint8", "string", "string", "string", "string", "bytes32"],
        payload,
    )
    assert fh == bytes.fromhex("ab" * 32)


def test_build_calldata_negative_value_roundtrips_as_int128():
    cd = build_give_feedback_calldata(agent_id=AGENT_ID, value=-1234)
    payload = bytes.fromhex(cd[len(GIVE_FEEDBACK_SELECTOR):])
    (_, value, *_rest) = decode(
        ["uint256", "int128", "uint8", "string", "string", "string", "string", "bytes32"],
        payload,
    )
    assert value == -1234


def test_build_calldata_deterministic_for_fixed_inputs():
    args: dict[str, Any] = dict(
        agent_id=AGENT_ID, value=7, value_decimals=2, tag1="x", tag2="y",
        endpoint="https://e", feedback_uri="ipfs://u", feedback_hash=b"\x00" * 32,
    )
    assert build_give_feedback_calldata(**args) == build_give_feedback_calldata(**args)


# ---------------------------------------------------------------------------
# Builder — bound enforcement (matches on-chain `require`s)
# ---------------------------------------------------------------------------


def test_build_calldata_rejects_value_above_1e38():
    with pytest.raises(FeedbackBuilderError, match=r"\|value\| must be"):
        build_give_feedback_calldata(agent_id=AGENT_ID, value=MAX_ABS_VALUE + 1)


def test_build_calldata_rejects_value_below_neg_1e38():
    with pytest.raises(FeedbackBuilderError, match=r"\|value\| must be"):
        build_give_feedback_calldata(agent_id=AGENT_ID, value=-(MAX_ABS_VALUE + 1))


def test_build_calldata_rejects_value_decimals_above_18():
    with pytest.raises(FeedbackBuilderError, match=r"value_decimals must be"):
        build_give_feedback_calldata(agent_id=AGENT_ID, value=1, value_decimals=19)


def test_build_calldata_rejects_int128_overflow():
    # 1e38 actually fits in int128 (max ~1.7e38), but a value beyond that
    # which still satisfies the 1e38 bound is impossible — the int128 guard
    # only triggers when 1e38 is relaxed in future. Exercise directly via
    # an integer larger than int128.max while disabling 1e38 bound via a
    # value just inside it.
    huge = 2**127
    with pytest.raises(FeedbackBuilderError):
        build_give_feedback_calldata(agent_id=AGENT_ID, value=huge)


def test_build_calldata_rejects_bad_feedback_hash_length():
    with pytest.raises(FeedbackBuilderError, match=r"length 32"):
        build_give_feedback_calldata(agent_id=AGENT_ID, value=1, feedback_hash=b"\x00" * 16)


def test_build_calldata_rejects_bad_hex_feedback_hash():
    with pytest.raises(FeedbackBuilderError, match=r"0x-prefixed"):
        build_give_feedback_calldata(
            agent_id=AGENT_ID, value=1, feedback_hash="deadbeef"  # missing 0x + too short
        )


# ---------------------------------------------------------------------------
# Sybil gate — `assert_paid` via injected get_logs
# ---------------------------------------------------------------------------


def _fake_get_logs(matches: list[dict[str, Any]]) -> Callable[..., list[dict[str, Any]]]:
    captured: dict[str, Any] = {}

    def _g(filter_params: dict[str, Any]) -> list[dict[str, Any]]:
        captured["filter"] = filter_params
        return matches

    _g.captured = captured  # type: ignore[attr-defined]
    return _g


def test_assert_paid_matches_on_correct_filter():
    fake_log = {"transactionHash": "0xabc", "blockNumber": 95566491}
    get_logs = _fake_get_logs([fake_log])
    out = assert_paid(payer=PAYER, target=TARGET, chain_id=5000, get_logs=get_logs)
    assert out is fake_log

    f = get_logs.captured["filter"]  # type: ignore[attr-defined]
    assert f["address"] == LICENSE_BY_CHAIN[5000]
    assert f["topics"][0] == AUDIT_PAID_TOPIC
    assert f["topics"][1].endswith(PAYER[2:].lower())
    assert f["topics"][2].endswith(TARGET[2:].lower())


def test_assert_paid_raises_when_no_logs():
    get_logs = _fake_get_logs([])
    with pytest.raises(SybilGateError, match=r"no AuditPaid log for payer"):
        assert_paid(payer=PAYER, target=TARGET, chain_id=5000, get_logs=get_logs)


def test_assert_paid_uses_explicit_license_address_override():
    custom = "0x1111111111111111111111111111111111111111"
    fake_log = {"transactionHash": "0xabc"}
    get_logs = _fake_get_logs([fake_log])
    assert_paid(
        payer=PAYER,
        target=TARGET,
        chain_id=5000,
        get_logs=get_logs,
        license_address=custom,
    )
    assert get_logs.captured["filter"]["address"] == custom  # type: ignore[attr-defined]


def test_assert_paid_unknown_chain_raises():
    get_logs = _fake_get_logs([])
    with pytest.raises(SybilGateError, match=r"no MantleProofLicense address known"):
        assert_paid(payer=PAYER, target=TARGET, chain_id=1, get_logs=get_logs)


def test_assert_paid_returns_newest_when_many_matches():
    a, b, c = ({"i": 0}, {"i": 1}, {"i": 2})
    get_logs = _fake_get_logs([a, b, c])
    assert assert_paid(
        payer=PAYER, target=TARGET, chain_id=5000, get_logs=get_logs
    )["i"] == 2


# ---------------------------------------------------------------------------
# Sybil gate — `assert_paid_via_tx` (preferred path; avoids wide get_logs)
# ---------------------------------------------------------------------------


def _payer_topic(addr: str) -> str:
    return "0x" + "0" * 24 + addr[2:].lower()


def _make_audit_paid_receipt(
    payer: str = PAYER,
    target: str = TARGET,
    chain_id: int = 5000,
    status: int = 1,
    extra_logs: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    license_addr = LICENSE_BY_CHAIN[chain_id]
    log = {
        "address": license_addr,
        "topics": [
            AUDIT_PAID_TOPIC,
            _payer_topic(payer),
            _payer_topic(target),
        ],
        "data": "0x",
    }
    return {"status": status, "logs": [log, *(extra_logs or [])]}


def test_assert_paid_via_tx_matches_correct_event():
    rcpt = _make_audit_paid_receipt()
    out = assert_paid_via_tx(
        payer=PAYER,
        target=TARGET,
        chain_id=5000,
        get_receipt=lambda _h: rcpt,
        paid_tx="0xabc",
    )
    assert out["topics"][0] == AUDIT_PAID_TOPIC


def test_assert_paid_via_tx_raises_when_receipt_missing():
    with pytest.raises(SybilGateError, match=r"no transaction receipt"):
        assert_paid_via_tx(
            payer=PAYER,
            target=TARGET,
            chain_id=5000,
            get_receipt=lambda _h: None,
            paid_tx="0xabc",
        )


def test_assert_paid_via_tx_raises_when_status_zero():
    rcpt = _make_audit_paid_receipt(status=0)
    with pytest.raises(SybilGateError, match=r"did not succeed"):
        assert_paid_via_tx(
            payer=PAYER,
            target=TARGET,
            chain_id=5000,
            get_receipt=lambda _h: rcpt,
            paid_tx="0xabc",
        )


def test_assert_paid_via_tx_raises_when_wrong_target():
    other = "0x" + "f" * 40
    rcpt = _make_audit_paid_receipt(target=other)
    with pytest.raises(SybilGateError, match=r"no AuditPaid"):
        assert_paid_via_tx(
            payer=PAYER,
            target=TARGET,
            chain_id=5000,
            get_receipt=lambda _h: rcpt,
            paid_tx="0xabc",
        )


def test_assert_paid_via_tx_handles_hexbytes_topics():
    # web3 typically returns topics as HexBytes; assert_paid_via_tx must
    # normalise them to 0x-hex before comparing.
    class _HexBytes:
        def __init__(self, s: str) -> None:
            self._s = s.lower()
        def hex(self) -> str:
            return self._s

    license_addr = LICENSE_BY_CHAIN[5000]
    rcpt = {
        "status": 1,
        "logs": [
            {
                "address": license_addr,
                "topics": [
                    _HexBytes(AUDIT_PAID_TOPIC),
                    _HexBytes(_payer_topic(PAYER)),
                    _HexBytes(_payer_topic(TARGET)),
                ],
                "data": "0x",
            }
        ],
    }
    out = assert_paid_via_tx(
        payer=PAYER,
        target=TARGET,
        chain_id=5000,
        get_receipt=lambda _h: rcpt,
        paid_tx="0xabc",
    )
    assert out is rcpt["logs"][0]


def test_assert_paid_via_tx_ignores_other_logs_in_same_tx():
    # The tx may carry other events (Mantle native receipts, etc); the gate
    # should still find the AuditPaid one.
    license_addr = LICENSE_BY_CHAIN[5000]
    rcpt = {
        "status": 1,
        "logs": [
            {"address": "0x0000000000000000000000000000000000000000", "topics": []},
            {
                "address": license_addr,
                "topics": [
                    AUDIT_PAID_TOPIC,
                    _payer_topic(PAYER),
                    _payer_topic(TARGET),
                ],
                "data": "0x",
            },
        ],
    }
    out = assert_paid_via_tx(
        payer=PAYER,
        target=TARGET,
        chain_id=5000,
        get_receipt=lambda _h: rcpt,
        paid_tx="0xabc",
    )
    assert out["topics"][0] == AUDIT_PAID_TOPIC


# ---------------------------------------------------------------------------
# Sybil gate — `assert_not_authorized` mirrors v2 anti-self-feedback check
# ---------------------------------------------------------------------------


def test_assert_not_authorized_passes_when_payer_is_not_owner_or_operator():
    assert_not_authorized(
        payer=PAYER,
        agent_id=AGENT_ID,
        is_authorized_or_owner=lambda _a, _i: False,
    )


def test_assert_not_authorized_raises_when_payer_is_owner_or_operator():
    with pytest.raises(SybilGateError, match=r"Self-feedback not allowed"):
        assert_not_authorized(
            payer=PAYER,
            agent_id=AGENT_ID,
            is_authorized_or_owner=lambda _a, _i: True,
        )


# ---------------------------------------------------------------------------
# Misc helpers
# ---------------------------------------------------------------------------


def test_feedback_hash_of_keccaks_bytes_and_str_consistently():
    s = "audit declined: severity HIGH"
    assert feedback_hash_of(s) == feedback_hash_of(s.encode("utf-8"))
    assert len(feedback_hash_of(s)) == 32
