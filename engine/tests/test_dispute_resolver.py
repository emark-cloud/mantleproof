"""Unit tests for `mantleproof.dispute.resolver` — end-to-end with mocked seams."""

from __future__ import annotations

from mantleproof.checks.base import Severity
from mantleproof.dispute import resolver
from mantleproof.persistence.registry_reader import OnChainAudit, OnChainDispute

TARGET = "0x" + "11" * 20
ROOT = "0x" + "aa" * 32


def _pending_dispute(disp_id: int = 1) -> OnChainDispute:
    return OnChainDispute(
        dispute_id=disp_id,
        root_hash=ROOT,
        finding_index=0,
        disputer="0xdef" + "0" * 37,
        counter_claim_ipfs="bafkreicc",
        counter_stake=10**17,
        anti_spam_fee=0,
        status=0,  # PENDING
        submitted_at=1_716_000_000,
        resolved_at=0,
        re_audit_root_hash="0x" + "00" * 32,
    )


def _audit() -> OnChainAudit:
    return OnChainAudit(
        target=TARGET,
        root_hash=ROOT,
        severity=Severity.HIGH,
        ipfs_cid="bafkreiaudit",
        timestamp=1_716_000_000,
        submitter="0x9f17b625902B0d35a02fd790aF45cf95e9F4638a",
        audit_count=1,
        tier=2,
    )


def test_compute_reaudit_root_hash_is_deterministic():
    v = {"outcome": "RETRACTED", "rationale": "x"}
    a = resolver.compute_reaudit_root_hash(v)
    b = resolver.compute_reaudit_root_hash(dict(reversed(list(v.items()))))
    assert len(a) == 32
    assert a == b  # canonical sorted JSON


def test_resolve_one_skips_already_resolved():
    d = _pending_dispute()
    resolved = OnChainDispute(**{**d.__dict__, "status": 1})  # DISMISSED

    out = resolver.resolve_one(
        1,
        run_reaudit=lambda **_kw: {},
        dispute_loader=lambda _id: resolved,
        audit_loader=lambda _t: _audit(),
        audit_json_loader=lambda _cid: {"findings": []},
        counter_claim_fetcher=lambda _cid: {"cid": _cid, "claim": ""},
        target_lookup=lambda _rh: TARGET,
        source_loader=lambda _t: ("src", b"", "Foo"),
    )
    assert out["status"] == "already_resolved"
    assert out["on_chain_status"] == 1


def test_resolve_one_happy_path_calls_anchor():
    anchor_calls: dict = {}

    def _anchor(*, dispute_id, outcome, re_audit_root_hash):  # noqa: ANN001
        anchor_calls.update(
            dispute_id=dispute_id,
            outcome=outcome,
            re_audit_root_hash=re_audit_root_hash,
        )
        return "0xanchortx"

    def _run_reaudit(**_kw):
        return {
            "outcome": "RETRACTED",
            "outcome_uint8": 3,
            "rationale": "the original was wrong",
            "amended_finding": None,
            "raw_text": "{}",
            "provider": "fake",
        }

    out = resolver.resolve_one(
        1,
        run_reaudit=_run_reaudit,
        dispute_loader=lambda _id: _pending_dispute(),
        audit_loader=lambda _t: _audit(),
        audit_json_loader=lambda _cid: {"findings": [{"check_id": "x"}]},
        counter_claim_fetcher=lambda _cid: {"cid": _cid, "claim": "argh"},
        target_lookup=lambda _rh: TARGET,
        source_loader=lambda _t: ("contract Foo {}", b"", "Foo"),
        anchor_fn=_anchor,
    )
    assert out["status"] == "resolved"
    assert out["outcome"] == "RETRACTED"
    assert out["anchor_tx"] == "0xanchortx"
    assert out["re_audit_root_hash"].startswith("0x")
    assert len(out["re_audit_root_hash"]) == 66
    assert anchor_calls["dispute_id"] == 1
    assert anchor_calls["outcome"] == 3
    # re_audit_root_hash bytes must equal keccak of canonical verdict
    expected = resolver.compute_reaudit_root_hash(
        {
            "outcome": "RETRACTED",
            "outcome_uint8": 3,
            "rationale": "the original was wrong",
            "amended_finding": None,
            "raw_text": "{}",
            "provider": "fake",
        }
    )
    assert anchor_calls["re_audit_root_hash"] == expected


def test_resolve_one_raises_on_unknown_dispute():
    try:
        resolver.resolve_one(
            999,
            run_reaudit=lambda **_kw: {},
            dispute_loader=lambda _id: None,
            audit_loader=lambda _t: None,
            audit_json_loader=lambda _cid: {},
            counter_claim_fetcher=lambda _cid: {},
            target_lookup=lambda _rh: TARGET,
            source_loader=lambda _t: ("", b"", ""),
        )
    except RuntimeError as exc:
        assert "unknown dispute" in str(exc)
        return
    raise AssertionError("expected RuntimeError")


def test_fetch_audit_json_uses_injected_loader():
    captured = {}

    def _load(cid):
        captured["cid"] = cid
        return {"loaded": True}

    out = resolver.fetch_audit_json("bafkrei...", gateway_fetch=_load)
    assert out == {"loaded": True}
    assert captured["cid"] == "bafkrei..."
