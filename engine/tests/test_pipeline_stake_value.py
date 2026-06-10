"""Regression: pipeline.run_audit forwards `tier` (no stake `value`) to anchor.

Staking deactivated (roadmap, 2026-06-10): submitAudit is nonpayable, so the
pipeline must NOT forward any value for either tier — audits anchor for gas only.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from mantleproof.pipeline import run_audit

_FIXED = datetime(2026, 5, 23, 12, 0, 0, tzinfo=UTC)
_TARGET = "0x" + "11" * 20


@pytest.fixture
def usdy_pos():
    """Minimal source string — not exercised by Tier 1 here (we focus on anchor)."""
    return "// SPDX-License-Identifier: MIT\ncontract Foo {}\n"


def _pin():
    def pin(_r):
        return "bafyfakecid"

    return pin


def _anchor():
    box: dict = {}

    def anchor(target, severity, root_hash, cid, **kw):  # noqa: ANN001, ANN003
        box.update(
            target=target,
            severity=severity,
            cid=cid,
            tier=kw.get("tier"),
            # Captured to assert it is NEVER forwarded post-staking-removal.
            value=kw.get("value", "<<absent>>"),
        )
        return "0xtxhash"

    return anchor, box


def test_tier1_anchor_called_with_tier_1_and_no_value(usdy_pos):
    anchor, box = _anchor()
    run_audit(
        _TARGET,
        tier=1,
        chain_id=5000,
        source=usdy_pos,
        bytecode=b"",
        pin=_pin(),
        anchor=anchor,
        now=lambda: _FIXED,
    )
    assert box["tier"] == 1
    assert box["value"] == "<<absent>>"  # no stake forwarded


def test_tier2_anchor_called_with_tier_2_and_no_value(usdy_pos):
    anchor, box = _anchor()

    class _Provider:
        name = "fake"

        def reason(self, user, system):  # noqa: ANN001
            return "[]"  # no extra findings

    run_audit(
        _TARGET,
        tier=2,
        chain_id=5000,
        source=usdy_pos,
        bytecode=b"",
        provider=_Provider(),
        pin=_pin(),
        anchor=anchor,
        now=lambda: _FIXED,
    )
    assert box["tier"] == 2
    assert box["value"] == "<<absent>>"  # Tier 2 no longer stakes 2 MNT


def test_tier1_anchor_does_NOT_run_for_dry_run(usdy_pos):
    """do_anchor=False: anchor never called; honest no-op."""
    pin = _pin()
    rep = run_audit(
        _TARGET,
        tier=1,
        chain_id=5000,
        source=usdy_pos,
        bytecode=b"",
        pin=pin,
        do_anchor=False,
        now=lambda: _FIXED,
    )
    # No anchor_tx field when do_anchor=False.
    assert "anchor_tx" not in rep
    assert rep["timing_ms"]["anchor_ms"] is None
