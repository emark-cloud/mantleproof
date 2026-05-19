"""Pure-function guard tests — MUST NOT need any LLM or network (T18).

This is the single most credibility-purchasing piece (CLAUDE.md): the tests
pin the invariant — unsupported $/%/hex/address claims are masked AND the
finding's honesty label drops exactly one tier — so it can never silently
regress.
"""

from mantleproof.checks.base import CheckResult, HonestyLabel, Severity
from mantleproof.tier2.hallucination_guard import (
    UNSUPPORTED_MASK,
    apply_guard,
    drop_label,
    extract_claims,
    parse_findings,
)


def _f(finding: str, *, label=HonestyLabel.VERIFIED, fix: str = "") -> CheckResult:
    return CheckResult("tier2_reasoning_v1", Severity.HIGH, label, finding, {}, fix)


# --- pure primitives --------------------------------------------------------

def test_drop_label_one_tier():
    assert drop_label(HonestyLabel.VERIFIED) is HonestyLabel.COMPUTED
    assert drop_label(HonestyLabel.LABELED) is HonestyLabel.LABELED  # floor


def test_extract_claims_finds_money_and_addresses():
    claims = extract_claims("loss of $1,000 (12%) at 0x" + "a" * 40)
    kinds = {k for k, _ in claims}
    assert {"dollar", "percent", "address"} <= kinds


# --- parse (provider-agnostic, no tool-use) ---------------------------------

def test_parse_findings_plain_and_fenced_json():
    body = '[{"check_id":"x","severity":"high","label":"COMPUTED",' \
           '"finding":"f","suggested_fix":"s","evidence":{"source_line":"L3"}}]'
    for raw in (body, f"```json\n{body}\n```"):
        out = parse_findings(raw)
        assert len(out) == 1
        assert out[0].severity is Severity.HIGH
        assert out[0].label is HonestyLabel.COMPUTED
        assert out[0].evidence == {"source_line": "L3"}


def test_parse_findings_malformed_yields_no_findings():
    # A broken Tier-2 reply must add ZERO findings, never raise.
    assert parse_findings("not json at all") == []
    assert parse_findings('{"not":"a list"}') == []
    assert parse_findings("[]") == []


def test_parse_findings_coerces_bad_enums_to_conservative_defaults():
    out = parse_findings('[{"finding":"f","severity":"BOGUS","label":"NOPE"}]')
    assert out[0].severity is Severity.INFO
    assert out[0].label is HonestyLabel.ESTIMATED  # conservative Tier-2 default


# --- the invariant: mask unsupported + drop label ---------------------------

def test_supported_claim_passes_through_label_unchanged():
    src = "uint256 public fee = 12;\n// router 0x" + "a" * 40
    out = apply_guard(
        [_f("fee is 12% via router 0x" + "a" * 40, label=HonestyLabel.COMPUTED)],
        source=src,
        bytecode=b"",
        tier1=[],
    )
    assert out.masked_count == 0
    assert out.findings[0].label is HonestyLabel.COMPUTED  # not dropped
    assert UNSUPPORTED_MASK not in out.findings[0].finding


def test_unsupported_dollar_and_address_are_masked_and_label_drops_one_tier():
    out = apply_guard(
        [_f("up to $5,000,000 drained to 0x" + "b" * 40, label=HonestyLabel.VERIFIED)],
        source="contract C { uint x; }",
        bytecode=b"",
        tier1=[],
    )
    assert out.masked_count == 2
    f = out.findings[0]
    assert "$5,000,000" not in f.finding and "0x" + "b" * 40 not in f.finding
    assert f.finding.count(UNSUPPORTED_MASK) == 2
    assert f.label is HonestyLabel.COMPUTED  # VERIFIED -> one tier down
    assert out.dropped_labels == 1


def test_label_drops_only_once_even_with_multiple_masked_claims():
    out = apply_guard(
        [_f("$1 and $2 and 99% all fake", label=HonestyLabel.VERIFIED)],
        source="nothing relevant",
        bytecode=b"",
        tier1=[],
    )
    assert out.masked_count == 3
    assert out.findings[0].label is HonestyLabel.COMPUTED  # exactly one tier
    assert out.per_finding_masked == [3]


def test_label_drop_respects_the_labeled_floor():
    out = apply_guard(
        [_f("fake $9,999", label=HonestyLabel.LABELED)],
        source="x",
        bytecode=b"",
        tier1=[],
    )
    assert out.findings[0].label is HonestyLabel.LABELED  # cannot go lower


def test_address_grounded_in_bytecode_is_supported():
    addr = "0x" + "cd" * 20
    bytecode = bytes.fromhex("60" + "cd" * 20 + "00")
    out = apply_guard(
        [_f(f"calls {addr}")],
        source="contract C {}",
        bytecode=bytecode,
        tier1=[],
    )
    assert out.masked_count == 0


def test_short_number_not_falsely_supported_by_bytecode_hex():
    # "$77" must NOT be considered grounded just because '77' appears in the
    # runtime hex blob — that would manufacture support. It must hit source/Tier-1.
    out = apply_guard(
        [_f("loss of $77")],
        source="contract C {}",
        bytecode=bytes.fromhex("60776077aa"),  # contains '77'
        tier1=[],
    )
    assert out.masked_count == 1


def test_claim_grounded_in_tier1_finding_is_supported():
    tier1 = [
        CheckResult(
            "usdy_check_v1", Severity.HIGH, HonestyLabel.ESTIMATED,
            "snapshot of 12% rebase", {}, "",
        )
    ]
    out = apply_guard(
        [_f("the 12% rebase is exploitable", label=HonestyLabel.ESTIMATED)],
        source="contract C {}",
        bytecode=b"",
        tier1=tier1,
    )
    assert out.masked_count == 0
    assert out.findings[0].label is HonestyLabel.ESTIMATED


def test_suggested_fix_field_is_also_guarded():
    out = apply_guard(
        [_f("ok finding", fix="cap loss at $250,000", label=HonestyLabel.ESTIMATED)],
        source="contract C {}",
        bytecode=b"",
        tier1=[],
    )
    assert out.masked_count == 1
    assert UNSUPPORTED_MASK in out.findings[0].suggested_fix
    assert out.findings[0].label is HonestyLabel.EMULATED  # dropped


def test_inputs_are_not_mutated_and_note_is_public():
    original = _f("fake $5,000,000", label=HonestyLabel.VERIFIED)
    out = apply_guard([original], source="x", bytecode=b"", tier1=[])
    assert original.finding == "fake $5,000,000"  # untouched
    assert original.label is HonestyLabel.VERIFIED
    assert out.public_note == "Hallucination guard fired: 1 masked"
