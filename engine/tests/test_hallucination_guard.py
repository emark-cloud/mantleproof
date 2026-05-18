"""Pure-function guard tests — must NOT need any LLM. Implement in T18."""

import pytest

from mantleproof.checks.base import HonestyLabel
from mantleproof.tier2.hallucination_guard import drop_label, extract_claims


def test_drop_label_one_tier():
    assert drop_label(HonestyLabel.VERIFIED) is HonestyLabel.COMPUTED
    assert drop_label(HonestyLabel.LABELED) is HonestyLabel.LABELED  # floor


def test_extract_claims_finds_money_and_addresses():
    claims = extract_claims("loss of $1,000 (12%) at 0x" + "a" * 40)
    kinds = {k for k, _ in claims}
    assert {"dollar", "percent", "address"} <= kinds


@pytest.mark.skip(reason="SCAFFOLD: apply_guard verification not implemented (T18)")
def test_apply_guard_masks_unsupported_and_drops_label():
    ...
