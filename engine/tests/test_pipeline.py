"""T20 — pipeline orchestration tests (Tier1→Tier2→guard→assemble→pin→anchor).

Pure / offline: the two network edges (IPFS pin, on-chain anchor) and the
Tier-2 LLM are injected as fakes, so the *entire* orchestration is exercised
without a key or a chain — the same pure-test + live-harness split as T12/T19.
The live end-to-end run on Sepolia (mainnet-cutover-gate condition b) is
`scripts/run_pipeline_sepolia.py`, deliberately not a CI test.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

import pytest

from mantleproof.checks.base import CheckResult, HonestyLabel, Severity
from mantleproof.persistence.anchor import severity_to_uint8
from mantleproof.persistence.ipfs import _pin_payload
from mantleproof.pipeline import build_report, compute_root_hash, run_audit

_FIXED = datetime(2026, 5, 19, 12, 0, 0, tzinfo=UTC)
_TARGET = "0x000000000000000000000000000000000000bEEF"
_HEX32 = re.compile(r"^0x[0-9a-f]{64}$")


class _FakeProvider:
    """LLMProvider stub: returns a canned JSON array (no network)."""

    name = "fake"

    def __init__(self, raw: str) -> None:
        self._raw = raw

    def reason(self, prompt: str, system: str) -> str:  # noqa: ARG002
        return self._raw


@pytest.fixture
def usdy_pos(load_contract):
    # 3 Tier-1 findings (high/medium/low), all ESTIMATED.
    return load_contract("usdy_pos.sol")


@pytest.fixture
def usdy_neg(load_contract):
    return load_contract("usdy_neg.sol")


def _pins():
    """A fake pin() that records the report it was handed; returns a CID."""
    box: dict = {}

    def pin(report: dict) -> str:
        box["report"] = report
        return "bafyfakecid"

    return pin, box


def _anchors():
    """A fake anchor() that records its call args; returns a txHash."""
    box: dict = {}

    def anchor(target, severity, root_hash, cid):  # noqa: ANN001
        box.update(target=target, severity=severity, root_hash=root_hash, cid=cid)
        return "0xtxhash"

    return anchor, box


# --- pure helpers -----------------------------------------------------------


def test_severity_to_uint8_matches_solidity_enum():
    # IMantleProofRegistry.Severity: Info,Low,Medium,High
    assert severity_to_uint8(Severity.INFO) == 0
    assert severity_to_uint8(Severity.LOW) == 1
    assert severity_to_uint8(Severity.MEDIUM) == 2
    assert severity_to_uint8(Severity.HIGH) == 3


def test_pin_payload_wraps_report_for_pinata():
    p = _pin_payload({"target": _TARGET, "tier": 2, "root_hash": "0xabc"})
    assert p["pinataContent"]["target"] == _TARGET  # exact JSON, not reshaped
    assert p["pinataOptions"]["cidVersion"] == 1
    assert p["pinataMetadata"]["keyvalues"]["rootHash"] == "0xabc"


def test_build_report_root_hash_is_keccak_of_canonical_preimage():
    report, root_hash, sev = build_report(
        _TARGET, tier=1, chain_id=5003, tier1=[], now=_FIXED
    )
    assert sev is Severity.INFO
    assert len(root_hash) == 32
    assert report["root_hash"] == "0x" + root_hash.hex()
    # preimage excludes the root_hash field itself (added after hashing).
    preimage = {k: v for k, v in report.items() if k != "root_hash"}
    assert compute_root_hash(preimage) == root_hash


def test_build_report_tier2_degrades_on_unverified_source():
    report, _, _ = build_report(
        _TARGET, tier=2, chain_id=5003, tier1=[],
        tier2_status="unverified_source", now=_FIXED,
    )
    assert report["tier2_skipped"] == "unverified_source"
    assert report["hallucination_guard"]["masked_count"] == 0


def test_caveat_round_trips_into_report_and_changes_root_hash():
    """Caveat is a first-class finding field — it flows into the canonical
    JSON, is hashed into rootHash, and the IPFS-pinned report carries it
    verbatim. Two reports identical except for caveat text must produce
    different rootHashes."""
    base = CheckResult(
        "usdy_check_v1", Severity.LOW, HonestyLabel.VERIFIED,
        "non-rebasing wrapper observation", {}, "",
    )
    with_caveat = CheckResult(
        "usdy_check_v1", Severity.LOW, HonestyLabel.VERIFIED,
        "non-rebasing wrapper observation", {}, "",
        caveat="wstETH-style wrapper, documented at docs.ondo.finance",
    )
    rep_a, rh_a, _ = build_report(
        _TARGET, tier=1, chain_id=5000, tier1=[base], now=_FIXED,
    )
    rep_b, rh_b, _ = build_report(
        _TARGET, tier=1, chain_id=5000, tier1=[with_caveat], now=_FIXED,
    )
    assert rep_a["findings"][0]["caveat"] == ""
    assert rep_b["findings"][0]["caveat"] == "wstETH-style wrapper, documented at docs.ondo.finance"
    assert rh_a != rh_b  # caveat text is hashed into the rootHash preimage


# --- tier 1 -----------------------------------------------------------------


def test_run_audit_tier1_offline(usdy_pos):
    pin, box = _pins()
    report = run_audit(
        _TARGET, tier=1, chain_id=5000, source=usdy_pos, bytecode=b"",
        pin=pin, do_anchor=False, now=lambda: _FIXED,
    )
    assert report["schema"] == "mantleproof/audit/v1.1"
    assert report["tier"] == 1
    assert report["severity"] == "high"
    assert report["summary"]["total"] == 3
    # T33: every check's full taxonomy is enumerated for consuming agents.
    assert "sub_detectors_available" in report
    assert "usdy_check_v1" in report["sub_detectors_available"]
    assert {sd["slug"] for sd in report["sub_detectors_available"]["usdy_check_v1"]} >= {
        "usdy.balance_snapshot", "usdy.wrong_oracle", "usdy.par_assumption",
    }
    # T33+T34: every Tier-1 finding from a known dimension has slug + stage.
    for f in report["findings"]:
        assert f["sub_detector"], f"finding from {f['check_id']} missing sub_detector"
        assert f["stage"] in {"configuration", "economic", "exploitation"}
    # T32: metrics_ref present (None when artifact absent, dict when present).
    assert "metrics_ref" in report
    mref = report["metrics_ref"]
    assert mref is None or {
        "url", "precision", "recall", "f1",
        "validation_set_size", "computed_at", "dataset_sha256",
    } <= set(mref)
    assert _HEX32.match(report["root_hash"])
    assert report["ipfs_cid"] == "bafyfakecid"
    assert report["ipfs_uri"] == "ipfs://bafyfakecid"
    assert "anchor_tx" not in report  # do_anchor=False
    assert "hallucination_guard" not in report  # tier-1 has no guard block
    assert box["report"] is report  # exactly what gets pinned


def test_run_audit_tier1_clean_contract(usdy_neg):
    pin, _ = _pins()
    report = run_audit(
        _TARGET, tier=1, chain_id=5000, source=usdy_neg, bytecode=b"",
        pin=pin, do_anchor=False, now=lambda: _FIXED,
    )
    assert report["severity"] == "info"
    assert report["summary"]["total"] == 0
    assert report["findings"] == []


def test_root_hash_deterministic_and_content_sensitive(usdy_pos):
    pin, _ = _pins()
    kw = dict(tier=1, chain_id=5000, source=usdy_pos, bytecode=b"",
              pin=pin, do_anchor=False)
    a = run_audit(_TARGET, now=lambda: _FIXED, **kw)
    b = run_audit(_TARGET, now=lambda: _FIXED, **kw)
    assert a["root_hash"] == b["root_hash"]  # deterministic given a fixed clock
    later = run_audit(
        _TARGET,
        now=lambda: datetime(2026, 5, 19, 12, 0, 1, tzinfo=UTC),
        **kw,
    )
    assert later["root_hash"] != a["root_hash"]  # timestamp is in the preimage


# --- tier 2 + hallucination guard -------------------------------------------


def test_run_audit_tier2_grounded_claim_not_masked(usdy_pos):
    # No $/%/hex/address literal → nothing for the guard to mask.
    raw = (
        '[{"check_id":"tier2_reasoning_v1","severity":"medium",'
        '"label":"ESTIMATED","finding":"Integrator does not re-snapshot the '
        'USDY rebasing balance before transfer.","evidence":{},'
        '"suggested_fix":"Re-read balanceOf after the external call."}]'
    )
    pin, _ = _pins()
    anchor, abox = _anchors()
    report = run_audit(
        _TARGET, tier=2, chain_id=5000, source=usdy_pos, bytecode=b"",
        provider=_FakeProvider(raw), pin=pin, anchor=anchor, now=lambda: _FIXED,
    )
    assert report["tier"] == 2
    assert report["provider"] == "fake"
    g = report["hallucination_guard"]
    assert g["masked_count"] == 0 and g["label_drops"] == 0
    assert g["public_note"] == "Hallucination guard fired: 0 masked"
    t2 = [f for f in report["findings"] if f["check_id"] == "tier2_reasoning_v1"]
    assert len(t2) == 1
    assert t2[0]["label"] == "ESTIMATED"  # unchanged: nothing masked
    assert "[unsupported]" not in t2[0]["finding"]
    # anchor invoked with the on-chain-mapped severity + ipfs uri.
    assert abox["target"] == _TARGET
    assert abox["severity"] is Severity.HIGH  # rolled up from Tier-1
    assert len(abox["root_hash"]) == 32
    assert abox["cid"] == "ipfs://bafyfakecid"
    assert report["anchor_tx"] == "0xtxhash"


def test_run_audit_tier2_guard_masks_unsupported_and_drops_label(usdy_pos):
    # $ + bogus address absent from source/bytecode/Tier-1 → masked, label drops.
    raw = (
        '[{"check_id":"tier2_reasoning_v1","severity":"high",'
        '"label":"ESTIMATED","finding":"An attacker drains $5,000,000 via '
        '0xDEADdeadDEADdeadDEADdeadDEADdead00000000.","evidence":{},'
        '"suggested_fix":"Cap withdrawals."}]'
    )
    pin, _ = _pins()
    report = run_audit(
        _TARGET, tier=2, chain_id=5000, source=usdy_pos, bytecode=b"",
        provider=_FakeProvider(raw), pin=pin, do_anchor=False, now=lambda: _FIXED,
    )
    g = report["hallucination_guard"]
    assert g["masked_count"] >= 2  # the $ and the address
    assert g["label_drops"] == 1  # one finding downgraded, once
    assert g["public_note"] == f"Hallucination guard fired: {g['masked_count']} masked"
    t2 = next(f for f in report["findings"] if f["check_id"] == "tier2_reasoning_v1")
    assert "[unsupported]" in t2["finding"]
    assert "$5,000,000" not in t2["finding"]
    # ESTIMATED dropped exactly one tier by the guard.
    assert t2["label"] == HonestyLabel.ESTIMATED.dropped().value == "EMULATED"


def test_run_audit_tier2_malformed_llm_reply_adds_no_findings(usdy_neg):
    # A non-JSON Tier-2 reply must not crash and must add zero findings.
    pin, _ = _pins()
    report = run_audit(
        _TARGET, tier=2, chain_id=5000, source=usdy_neg, bytecode=b"",
        provider=_FakeProvider("the model rambled, no json here"),
        pin=pin, do_anchor=False, now=lambda: _FIXED,
    )
    assert report["findings"] == []
    assert report["severity"] == "info"
    assert report["hallucination_guard"]["masked_count"] == 0
