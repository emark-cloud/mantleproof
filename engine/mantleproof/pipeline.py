"""Audit pipeline orchestration: Tier1 -> Tier2 -> guard -> sign -> IPFS -> anchor.

Order (CLAUDE.md / docs/mantleproof.md §5):
  1. resolve verified source (Etherscan V2) + bytecode (RPC) for the target
  2. Tier 1: run the five checks (union of findings)
  3. Tier 2 (tier=2): prompt + provider reasoning, skills/ loaded
  4. hallucination guard: mask unsupported claims, drop labels
  5. assemble the canonical report JSON; rootHash = keccak256(canonical JSON)
  6. pin the JSON to IPFS (Pinata), then anchor rootHash+severity+CID on-chain
     (the registry advances the agent memoryRoot internally)

`build_report` is the **pure, network-free core** (resolve done, callables not
yet invoked) — unit-tested exhaustively (test_pipeline.py). `run_audit` wires
the network seams; every seam is injectable so the full Tier1→guard→assemble
path is testable offline (same split as the T12/T19 harnesses). The live
end-to-end run on Sepolia (mainnet-cutover-gate condition b) is
`scripts/run_pipeline_sepolia.py`, not a CI test.
"""

from __future__ import annotations

import json
import pathlib
import time
from collections.abc import Callable
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any

from web3 import Web3

from mantleproof.checks.base import CheckResult, Severity
from mantleproof.checks.taxonomy import SUB_DETECTORS
from mantleproof.llm.provider import LLMProvider
from mantleproof.tier1 import run_tier1, summarize
from mantleproof.tier2.hallucination_guard import apply_guard, parse_findings
from mantleproof.tier2.runner import run_tier2

# T32/T33/T34/T35 schema bump: adds metrics_ref, timing_ms, sub_detector + stage
# on every finding, sub_detectors_available per dimension. Additive — v1 readers
# keep working since the new fields are ignorable.
SCHEMA = "mantleproof/audit/v1.1"

# Highest severity first; also used to roll the overall report severity up.
_SEV_ORDER = {Severity.HIGH: 0, Severity.MEDIUM: 1, Severity.LOW: 2, Severity.INFO: 3}

PinFn = Callable[[dict[str, Any]], str]
AnchorFn = Callable[..., str]

# T32: publishable P/R artifact (engine/validation/metrics.json). Loaded lazily,
# cached process-wide; absent file → null `metrics_ref` (honest, never crash).
_METRICS_PATH = pathlib.Path(__file__).resolve().parents[1] / "validation" / "metrics.json"


@lru_cache(maxsize=1)
def _load_metrics_ref() -> dict[str, Any] | None:
    """Compact ``metrics_ref`` block embedded in every audit JSON.

    Only the headline numbers + dataset fingerprint + computed_at are surfaced
    here — consumers fetch the full per-check breakdown via the artifact URL.
    """
    try:
        m = json.loads(_METRICS_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    overall = m.get("overall", {})
    dataset = m.get("dataset", {})
    return {
        "url": "/metrics.json",
        "precision": overall.get("precision"),
        "recall": overall.get("recall"),
        "f1": overall.get("f1"),
        "validation_set_size": dataset.get("samples"),
        "computed_at": m.get("computed_at"),
        "dataset_sha256": dataset.get("sha256"),
        # T35: Tier-1 latency over the validation set (offline, no LLM).
        "latency_ms": m.get("latency_ms"),
    }


def _overall_severity(findings: list[CheckResult]) -> Severity:
    """Report-level severity = the max across findings; INFO when clean."""
    if not findings:
        return Severity.INFO
    return min((f.severity for f in findings), key=lambda s: _SEV_ORDER[s])


def _canonical(report: dict[str, Any]) -> str:
    """Deterministic JSON preimage for the rootHash (stable key order)."""
    return json.dumps(report, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def compute_root_hash(report_without_hash: dict[str, Any]) -> bytes:
    """keccak256 of the canonical report JSON — matches on-chain bytes32."""
    return bytes(Web3.keccak(text=_canonical(report_without_hash)))


def build_report(
    target: str,
    *,
    tier: int,
    chain_id: int,
    tier1: list[CheckResult],
    guarded_findings: list[CheckResult] | None = None,
    masked_count: int = 0,
    label_drops: int = 0,
    per_finding_masked: list[int] | None = None,
    provider_name: str = "",
    contract_name: str = "",
    tier2_status: str = "",
    now: datetime,
) -> tuple[dict[str, Any], bytes, Severity]:
    """Pure: assemble the canonical report + its rootHash + overall severity.

    No network, no callables. `guarded_findings` (post-guard Tier-2) are unioned
    onto the Tier-1 findings; the `[unsupported]` masks and dropped labels are
    already baked in by the guard. Returns (report, root_hash, severity).
    """
    findings = list(tier1)
    if tier == 2 and guarded_findings:
        findings = findings + list(guarded_findings)
    findings.sort(key=lambda r: (_SEV_ORDER[r.severity], r.check_id))

    severity = _overall_severity(findings)
    report: dict[str, Any] = {
        "schema": SCHEMA,
        "target": target,
        "chain_id": chain_id,
        "tier": tier,
        "contract_name": contract_name,
        "severity": severity.value,
        "summary": summarize(findings),
        "findings": [f.to_dict() for f in findings],
        # T33: enumerate every check's full sub-detector taxonomy so consuming
        # agents can branch on what *could have* fired, not only what did
        # (GoPlus exposes the full check list whether or not each fires).
        # Sorted for deterministic preimage / rootHash stability.
        "sub_detectors_available": {
            cid: list(SUB_DETECTORS[cid]) for cid in sorted(SUB_DETECTORS)
        },
        # T32: pointer to the published precision/recall artifact. Null when the
        # artifact is absent (honest, e.g. fresh checkout before scripts/
        # measure_metrics.py has been run). Same shape on every audit.
        "metrics_ref": _load_metrics_ref(),
        "generated_at": now.astimezone(UTC).isoformat(),
    }
    if tier == 2:
        report["provider"] = provider_name
        # Surfaced publicly, never hidden (CLAUDE.md hallucination-guard invariant).
        report["hallucination_guard"] = {
            "masked_count": masked_count,
            "label_drops": label_drops,
            "per_finding_masked": per_finding_masked or [],
            "public_note": f"Hallucination guard fired: {masked_count} masked",
        }
        if tier2_status and tier2_status != "ok":
            # Tier 2 needs verified source to ground claims; degrade honestly.
            report["tier2_skipped"] = tier2_status
    root_hash = compute_root_hash(report)
    report["root_hash"] = "0x" + root_hash.hex()
    return report, root_hash, severity


def run_audit(
    target: str,
    *,
    tier: int = 1,
    chain_id: int = 5003,
    source: str | None = None,
    contract_name: str = "",
    bytecode: bytes | None = None,
    provider: LLMProvider | None = None,
    pin: PinFn | None = None,
    anchor: AnchorFn | None = None,
    do_anchor: bool = True,
    now: Callable[[], datetime] | None = None,
) -> dict[str, Any]:
    """Full audit for `target`. tier=2 adds the LLM reasoning + guard pass.

    Network seams are injectable for offline testing:
      - `source`/`bytecode`: skip live resolution when supplied
      - `provider`: the Tier-2 LLM (default = env-selected)
      - `pin`: report -> IPFS CID (default = Pinata)
      - `anchor`: (target,severity,root_hash,cid) -> txHash (default = web3)
      - `do_anchor=False`: assemble + pin only (dry run / Sepolia rehearsal)
      - `now`: clock injection for deterministic rootHash in tests

    Returns the final report dict (incl. `root_hash`, and `ipfs_cid`/`anchor_tx`
    when those steps ran). Top-level ``timing_ms`` block is added **after** the
    rootHash is computed — observability data must not perturb the canonical
    preimage (a re-run of the same audit must produce the same rootHash).
    """
    clock = now or (lambda: datetime.now(UTC))
    timing: dict[str, float | None] = {}
    t_total = time.perf_counter()

    # 1. resolve verified source + bytecode (live only when not supplied).
    t = time.perf_counter()
    if source is None:
        from mantleproof.source.mantlescan import MantlescanClient

        src = MantlescanClient(chain_id).get_source(target)
        if src is None or not src.verified:
            # No verified source: Tier-1 is bytecode-only; Tier-2 cannot ground
            # claims so it is skipped. Never crash the audit.
            source = None
            tier = 1
        else:
            source = src.flat()
            contract_name = contract_name or src.name
    if bytecode is None:
        from mantleproof.settings import get_settings
        from mantleproof.source.rpc import get_code

        try:
            bytecode = get_code(target, get_settings().active_rpc_url)
        except Exception:  # noqa: BLE001 — source-first; degrade to no bytecode
            bytecode = b""
    timing["source_fetch_ms"] = round((time.perf_counter() - t) * 1000, 1)

    # 2. Tier-1 union (self-target guard via address).
    t = time.perf_counter()
    tier1 = run_tier1(source, bytecode, chain_id, address=target)
    timing["tier1_ms"] = round((time.perf_counter() - t) * 1000, 1)

    # 3-4. Tier-2 reasoning + hallucination guard (tier=2 only).
    guarded_findings: list[CheckResult] | None = None
    masked = drops = 0
    per_finding: list[int] = []
    provider_name = ""
    tier2_status = ""
    timing["tier2_ms"] = None
    timing["guard_ms"] = None
    if tier == 2:
        if not source:
            tier2_status = "unverified_source"
        else:
            t = time.perf_counter()
            out = run_tier2(
                target,
                chain_id=chain_id,
                source=source,
                contract_name=contract_name,
                bytecode=bytecode,
                provider=provider,
            )
            timing["tier2_ms"] = round((time.perf_counter() - t) * 1000, 1)
            tier2_status = out.get("status", "")
            provider_name = out.get("provider", "")
            if tier2_status == "ok":
                t = time.perf_counter()
                parsed = parse_findings(out["raw_text"])
                g = apply_guard(parsed, source=source, bytecode=bytecode, tier1=tier1)
                guarded_findings = g.findings
                masked, drops = g.masked_count, g.dropped_labels
                per_finding = g.per_finding_masked
                timing["guard_ms"] = round((time.perf_counter() - t) * 1000, 1)

    # 5. assemble the canonical report + rootHash.
    report, root_hash, severity = build_report(
        target,
        tier=tier,
        chain_id=chain_id,
        tier1=tier1,
        guarded_findings=guarded_findings,
        masked_count=masked,
        label_drops=drops,
        per_finding_masked=per_finding,
        provider_name=provider_name,
        contract_name=contract_name,
        tier2_status=tier2_status,
        now=clock(),
    )

    # 6. pin to IPFS, then anchor on-chain (registry advances memoryRoot).
    pin_fn = pin
    if pin_fn is None:
        from mantleproof.persistence.ipfs import pin_json

        pin_fn = pin_json
    t = time.perf_counter()
    cid = pin_fn(report)
    timing["ipfs_pin_ms"] = round((time.perf_counter() - t) * 1000, 1)
    report["ipfs_cid"] = cid
    report["ipfs_uri"] = f"ipfs://{cid}"

    timing["anchor_ms"] = None
    if do_anchor:
        anchor_fn = anchor
        if anchor_fn is None:
            from mantleproof.persistence.anchor import anchor_audit

            anchor_fn = anchor_audit
        # T43: Tier 2 audits forward 2 MNT into StakingPool.lockStake via the
        # registry. Tier 1 audits MUST NOT forward value (the registry reverts
        # InvalidStakeValue otherwise). The oracle signer's wallet pays.
        from mantleproof.persistence.anchor import TIER2_STAKE_WEI

        stake_value = TIER2_STAKE_WEI if tier == 2 else 0
        t = time.perf_counter()
        report["anchor_tx"] = anchor_fn(
            target,
            severity,
            root_hash,
            f"ipfs://{cid}",
            tier=tier,
            value=stake_value,
        )
        timing["anchor_ms"] = round((time.perf_counter() - t) * 1000, 1)

    timing["total_ms"] = round((time.perf_counter() - t_total) * 1000, 1)
    # Added post-hash on purpose — timing varies per-run and must not change
    # the canonical rootHash for an otherwise-identical audit.
    report["timing_ms"] = timing

    return report
