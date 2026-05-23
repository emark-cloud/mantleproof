#!/usr/bin/env python3
"""T32 — Tier-1 precision/recall measurement against the labeled validation set.

Iterates a fixed, hand-labeled dataset of Solidity samples; runs the Tier-1
union (`run_tier1`) on each; computes per-check TP / FP / TN / FN and rolls
them up to a single `precision`, `recall`, `f1` for each dimension and overall.

Dataset (offline-deterministic, CI-reproducible):
  * 12 unit fixtures from `engine/tests/fixtures/contracts/` — six
    `{usdy,meth,usde,dex_lb,dex_v3,replay}_pos.sol` (each labeled with the
    check_id it MUST trigger) and six `*_neg.sol` (must NOT trigger anything).
  * 2 mainnet bait contracts whose source lives in `contracts/contracts/demo/`
    (`ChainIdReplayPermit` → replay_check_v1, `MisaccountedMethVault` →
    meth_check_v1). They are also deployed on Mantle mainnet (see
    `contracts/deployments/mantle.bait.json`) but here we just evaluate their
    source — keeps the harness offline + deterministic.

Output: `engine/validation/metrics.json` (the publishable artifact — Forta-style
reproducibility anchor). Schema `mantleproof/metrics/v1` with:

    { "schema": "mantleproof/metrics/v1",
      "computed_at": "<ISO8601 UTC>",
      "dataset": {"positives": N, "negatives": M, "samples": N+M, "sha256": "…"},
      "overall":  {"precision": …, "recall": …, "f1": …,
                   "tp": …, "fp": …, "tn": …, "fn": …},
      "by_check": {"<check_id>": {"precision": …, "recall": …,
                                  "tp": …, "fp": …, "tn": …, "fn": …,
                                  "n_pos": …, "n_neg": …}} }

Per-check accounting: a sample is *positive for check X* iff X is in its
labeled `expected_checks` set; the check is *predicted positive* iff any
finding in the run has `check_id == X`. This gives a 2×2 per check.

The harness is a dev script (not packaged); ruff + mypy still cover it via the
engine's project-wide config.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys
from dataclasses import dataclass
from datetime import UTC, datetime

# Allow `python scripts/measure_metrics.py` from the engine dir.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from mantleproof.tier1 import CHECK_IDS, run_tier1  # noqa: E402

ENGINE = pathlib.Path(__file__).resolve().parents[1]
REPO = ENGINE.parent
FIXTURES = ENGINE / "tests" / "fixtures" / "contracts"
BAITS = REPO / "contracts" / "contracts" / "demo"
# Canonical artifact (engine reads it back via pipeline._load_metrics_ref);
# also mirrored into the frontend's static assets so `/metrics.json` (the URL
# that `metrics_ref.url` advertises in every audit) actually serves it.
OUT = ENGINE / "validation" / "metrics.json"
FRONTEND_OUT = REPO / "frontend" / "public" / "metrics.json"

# Mantle mainnet — every sample is evaluated as if targeting chainId 5000.
# (The fixtures are synthetic; the chain_id only matters for token-address
# bytecode constants, which the fixtures don't carry.)
CHAIN_ID = 5000


@dataclass(frozen=True, slots=True)
class Sample:
    name: str
    path: pathlib.Path
    expected_checks: frozenset[str]  # empty = negative (no check should fire)
    kind: str  # "fixture_pos" | "fixture_neg" | "bait"


SAMPLES: tuple[Sample, ...] = (
    # Positives — each labeled with the check_id it MUST trigger.
    Sample("usdy_pos", FIXTURES / "usdy_pos.sol", frozenset({"usdy_check_v1"}), "fixture_pos"),
    Sample("meth_pos", FIXTURES / "meth_pos.sol", frozenset({"meth_check_v1"}), "fixture_pos"),
    Sample("usde_pos", FIXTURES / "usde_pos.sol", frozenset({"usde_check_v1"}), "fixture_pos"),
    Sample("dex_lb_pos", FIXTURES / "dex_lb_pos.sol", frozenset({"dex_check_v1"}), "fixture_pos"),
    Sample("dex_v3_pos", FIXTURES / "dex_v3_pos.sol", frozenset({"dex_check_v1"}), "fixture_pos"),
    Sample(
        "replay_pos", FIXTURES / "replay_pos.sol",
        frozenset({"replay_check_v1"}), "fixture_pos",
    ),
    # Negatives — must trigger NO check at all.
    Sample("usdy_neg", FIXTURES / "usdy_neg.sol", frozenset(), "fixture_neg"),
    Sample("meth_neg", FIXTURES / "meth_neg.sol", frozenset(), "fixture_neg"),
    Sample("usde_neg", FIXTURES / "usde_neg.sol", frozenset(), "fixture_neg"),
    Sample("dex_lb_neg", FIXTURES / "dex_lb_neg.sol", frozenset(), "fixture_neg"),
    Sample("dex_v3_neg", FIXTURES / "dex_v3_neg.sol", frozenset(), "fixture_neg"),
    Sample("replay_neg", FIXTURES / "replay_neg.sol", frozenset(), "fixture_neg"),
    # Mainnet baits (offline source eval — same deployed contracts that
    # CHAIN_ID=5000 anchors via contracts/deployments/mantle.bait.json).
    Sample(
        "bait_ChainIdReplayPermit",
        BAITS / "ChainIdReplayPermit.sol",
        frozenset({"replay_check_v1"}),
        "bait",
    ),
    Sample(
        "bait_MisaccountedMethVault",
        BAITS / "MisaccountedMethVault.sol",
        frozenset({"meth_check_v1"}),
        "bait",
    ),
)


def _safe_div(num: float, den: float) -> float:
    return round(num / den, 4) if den else 0.0


def _dataset_sha256(samples: tuple[Sample, ...]) -> str:
    """Stable fingerprint = sha256 of sorted name|sha256(source)."""
    h = hashlib.sha256()
    for s in sorted(samples, key=lambda x: x.name):
        h.update(s.name.encode())
        h.update(b"\x00")
        h.update(hashlib.sha256(s.path.read_bytes()).digest())
        h.update(b"\n")
    return h.hexdigest()


def main() -> int:
    # Per-check confusion-matrix counters.
    tp: dict[str, int] = dict.fromkeys(CHECK_IDS, 0)
    fp: dict[str, int] = dict.fromkeys(CHECK_IDS, 0)
    tn: dict[str, int] = dict.fromkeys(CHECK_IDS, 0)
    fn: dict[str, int] = dict.fromkeys(CHECK_IDS, 0)

    n_pos = sum(1 for s in SAMPLES if s.expected_checks)
    n_neg = sum(1 for s in SAMPLES if not s.expected_checks)

    for sample in SAMPLES:
        if not sample.path.exists():
            print(f"ERROR: missing sample source: {sample.path}", file=sys.stderr)
            return 2
        source = sample.path.read_text()
        findings = run_tier1(source, b"", CHAIN_ID, address=None)
        fired = {f.check_id for f in findings}
        for cid in CHECK_IDS:
            expected = cid in sample.expected_checks
            predicted = cid in fired
            if expected and predicted:
                tp[cid] += 1
            elif expected and not predicted:
                fn[cid] += 1
            elif not expected and predicted:
                fp[cid] += 1
            else:
                tn[cid] += 1

    by_check: dict[str, dict[str, object]] = {}
    for cid in CHECK_IDS:
        prec = _safe_div(tp[cid], tp[cid] + fp[cid])
        rec = _safe_div(tp[cid], tp[cid] + fn[cid])
        by_check[cid] = {
            "precision": prec,
            "recall": rec,
            "f1": _safe_div(2 * prec * rec, prec + rec),
            "tp": tp[cid],
            "fp": fp[cid],
            "tn": tn[cid],
            "fn": fn[cid],
            "n_pos": tp[cid] + fn[cid],
            "n_neg": tn[cid] + fp[cid],
        }

    tot_tp = sum(tp.values())
    tot_fp = sum(fp.values())
    tot_tn = sum(tn.values())
    tot_fn = sum(fn.values())
    overall_prec = _safe_div(tot_tp, tot_tp + tot_fp)
    overall_rec = _safe_div(tot_tp, tot_tp + tot_fn)

    metrics = {
        "schema": "mantleproof/metrics/v1",
        "computed_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "dataset": {
            "positives": n_pos,
            "negatives": n_neg,
            "samples": len(SAMPLES),
            "sha256": _dataset_sha256(SAMPLES),
            "by_kind": {
                "fixture_pos": sum(1 for s in SAMPLES if s.kind == "fixture_pos"),
                "fixture_neg": sum(1 for s in SAMPLES if s.kind == "fixture_neg"),
                "bait": sum(1 for s in SAMPLES if s.kind == "bait"),
            },
        },
        "overall": {
            "precision": overall_prec,
            "recall": overall_rec,
            "f1": _safe_div(2 * overall_prec * overall_rec, overall_prec + overall_rec),
            "tp": tot_tp,
            "fp": tot_fp,
            "tn": tot_tn,
            "fn": tot_fn,
        },
        "by_check": by_check,
    }

    payload = json.dumps(metrics, indent=2, sort_keys=True) + "\n"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(payload)
    if FRONTEND_OUT.parent.exists():
        # Mirror only when the frontend tree is present (skipped in an engine-
        # only checkout). The frontend serves this file at /metrics.json.
        FRONTEND_OUT.write_text(payload)

    # Console summary — useful when run in CI / from a Makefile.
    sha = _dataset_sha256(SAMPLES)
    f1 = _safe_div(2 * overall_prec * overall_rec, overall_prec + overall_rec)
    print(
        f"\n[metrics] dataset N={len(SAMPLES)} "
        f"(pos={n_pos}, neg={n_neg}) sha256={sha[:12]}…"
    )
    print(
        f"[metrics] overall  precision={overall_prec}  recall={overall_rec}  "
        f"f1={f1}  (tp={tot_tp} fp={tot_fp} tn={tot_tn} fn={tot_fn})"
    )
    print(f"\n{'check':<22} {'P':>6} {'R':>6} {'F1':>6} {'TP':>4} {'FP':>4} {'TN':>4} {'FN':>4}")
    print("-" * 64)
    for cid, m in by_check.items():
        print(
            f"{cid:<22} {m['precision']:>6} {m['recall']:>6} {m['f1']:>6} "
            f"{m['tp']:>4} {m['fp']:>4} {m['tn']:>4} {m['fn']:>4}"
        )
    print(f"\n[wrote] {OUT.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
