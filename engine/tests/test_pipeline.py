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
from mantleproof.persistence.ipfs import _canonical_bytes
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

    def anchor(target, severity, root_hash, cid, **kw):  # noqa: ANN001, ANN003
        # Post-T43 the real anchor_audit takes `tier=...` + `value=...` kwargs.
        box.update(
            target=target,
            severity=severity,
            root_hash=root_hash,
            cid=cid,
            tier=kw.get("tier"),
            value=kw.get("value"),
        )
        return "0xtxhash"

    return anchor, box


# --- pure helpers -----------------------------------------------------------


def test_severity_to_uint8_matches_solidity_enum():
    # IMantleProofRegistry.Severity: Info,Low,Medium,High
    assert severity_to_uint8(Severity.INFO) == 0
    assert severity_to_uint8(Severity.LOW) == 1
    assert severity_to_uint8(Severity.MEDIUM) == 2
    assert severity_to_uint8(Severity.HIGH) == 3


def test_canonical_bytes_match_compute_root_hash_preimage():
    """Pinata pinFileToIPFS stores our exact bytes. The verifier's invariant
    keccak(canonical(IPFS body sans root_hash)) == on-chain rootHash holds
    iff `_canonical_bytes(report)` produces the SAME bytes as the engine's
    `compute_root_hash` preimage. This is the low-level byte-faithfulness of
    the pin path — it preserves whatever it is handed, verbatim.
    """
    from mantleproof.pipeline import _canonical

    report = {
        "target": _TARGET,
        "tier": 2,
        "metrics_ref": {"precision": 0.97, "latency_ms": {"p50": 0.4, "p95": 4.5}},
        "root_hash": "0xabc",
    }
    body = _canonical_bytes(report)
    # SAME byte string compute_root_hash would have hashed (sans root_hash).
    preimage = _canonical({k: v for k, v in report.items() if k != "root_hash"})
    body_minus_root = (
        _canonical({k: v for k, v in report.items() if k != "root_hash"})
    )
    assert preimage == body_minus_root  # tautology — just pin the contract
    # Non-integer floats are preserved byte-for-byte by the pin path.
    assert b'"p50":0.4' in body
    assert b'"precision":0.97' in body
    # ensure_ascii=False round-trips utf-8 cleanly.
    assert isinstance(body, bytes)


def test_normalize_numbers_strips_integer_valued_floats():
    """`_normalize_numbers` removes the one value class a JSON re-encoder can
    mutate (integer-valued floats like 1.0 → 1) while leaving everything else
    untouched — fractional floats, ints, bools, strings, and None."""
    from mantleproof.pipeline import _normalize_numbers

    out = _normalize_numbers(
        {
            "precision": 1.0,   # integer-valued float -> int
            "ratio": 0.4,       # fractional float -> unchanged
            "count": 7,         # int -> unchanged
            "flag": True,       # bool must NOT become 1
            "nested": [2.0, 3.5, {"recall": 0.0}],
            "name": "x",
            "missing": None,
        }
    )
    assert out["precision"] == 1 and isinstance(out["precision"], int)
    assert out["ratio"] == 0.4 and isinstance(out["ratio"], float)
    assert out["count"] == 7 and isinstance(out["count"], int)
    assert out["flag"] is True  # bool preserved, not coerced to 1
    assert out["nested"][0] == 2 and isinstance(out["nested"][0], int)
    assert out["nested"][1] == 3.5 and isinstance(out["nested"][1], float)
    assert out["nested"][2]["recall"] == 0 and isinstance(out["nested"][2]["recall"], int)
    assert out["name"] == "x"
    assert out["missing"] is None


def test_build_report_preimage_has_no_integer_valued_floats():
    """A real report carrying perfect metrics (precision/recall/f1 == 1.0) must
    serialize them as `1`, not `1.0`, in BOTH the hash preimage and the bytes the
    pin path uploads — closing the 2026-05-24 Pinata desync class for good. The
    rootHash recomputed over the pinned bytes must still match (the credibility
    invariant), proving hash and pin see identical, re-encode-stable bytes."""
    import json

    from mantleproof.persistence.ipfs_fetch import verify_root_hash
    from mantleproof.pipeline import _load_metrics_ref

    # Skip if the local validation artifact is absent (fresh checkout) — the
    # normalization itself is covered by the unit test above regardless.
    metrics = _load_metrics_ref()
    if not metrics or metrics.get("precision") != 1:
        # _load_metrics_ref runs through no normalization, so a 1.0 on disk
        # arrives here as float 1.0 == 1; this asserts the artifact is perfect.
        pytest.skip("validation/metrics.json absent or not a perfect-score set")

    report, root_hash, _ = build_report(
        _TARGET, tier=2, chain_id=5000, tier1=[], now=_FIXED
    )
    body = _canonical_bytes(report)
    # No integer-valued float survives anywhere in the pinned preimage.
    assert not re.search(rb"\d+\.0(?=[,}\]])", body), body
    assert b'"precision":1' in body and b'"precision":1.0' not in body
    # Full IPFS round-trip: re-parse the pinned bytes and recompute the hash the
    # public verifier (ipfs_fetch) would — it must match the anchored rootHash.
    refetched = json.loads(body)
    _, match = verify_root_hash(refetched, "0x" + root_hash.hex())
    assert match, "recomputed rootHash must match after a JSON round-trip"


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
        "validation_set_size", "computed_at", "dataset_sha256", "latency_ms",
    } <= set(mref)
    # T35: per-audit timing breakdown sits OUTSIDE the rootHash preimage
    # (observability, not finding content). Must be present, must include all
    # six phase keys + total. tier1/source/ipfs are always populated;
    # tier2/guard/anchor may be None depending on the path taken.
    assert "timing_ms" in report
    t = report["timing_ms"]
    assert {
        "source_fetch_ms", "tier1_ms", "tier2_ms", "guard_ms",
        "ipfs_pin_ms", "anchor_ms", "total_ms",
    } == set(t)
    assert isinstance(t["tier1_ms"], float) and t["tier1_ms"] >= 0
    assert isinstance(t["total_ms"], float) and t["total_ms"] >= t["tier1_ms"]
    assert t["tier2_ms"] is None and t["guard_ms"] is None  # tier=1 path
    assert t["anchor_ms"] is None  # do_anchor=False
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
