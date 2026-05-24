#!/usr/bin/env python3
"""T47 — live dispute resolver for Mantle mainnet.

Wires `mantleproof.dispute.resolver.resolve_one` to real RPC + IPFS + source
resolver + live Gemini. Reads ONE disputeId from argv, runs the re-audit
through the same hallucination guard as a fresh Tier 2 audit, posts the
verdict via `MantleProofRegistry.resolveDispute` (oracle-signed), and writes
a per-dispute receipt to `agents/validation/dispute_resolutions.<network>.md`.

CLAUDE.md invariants honored:
  * Same hallucination guard — no relaxation (`tier2.prompt.build_prompt`
    system prompt unchanged; `tier2.hallucination_guard.apply_guard` would
    apply at this layer if the verdict carried claim-strings, but for the
    object-shaped verdict (outcome/rationale/amended_finding) we rely on the
    grounded-JSON contract enforced by the extended prompt block).
  * Oracle-signer is the only writer to `resolveDispute` — the engine
    reads `ORACLE_SIGNER_PRIVATE_KEY` from .env, never echoes it.
  * RETRACTED transfers the audit's 2 MNT stake to the disputer publicly
    (StakingPool.slashByDispute via the registry). The engine does not
    have a "soften" mode — verdict is authoritative.

Usage:
    cd engine && python -u scripts/resolve_dispute_mainnet.py <disputeId>
"""

from __future__ import annotations

import json
import os
import pathlib
import sys
from datetime import UTC, datetime

# Pin mainnet BEFORE imports.
os.environ["MANTLE_NETWORK"] = "mantle"

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402

from mantleproof.dispute.fetch import fetch_counter_claim  # noqa: E402
from mantleproof.dispute.reaudit import run_dispute_reaudit  # noqa: E402
from mantleproof.dispute.resolver import resolve_one  # noqa: E402
from mantleproof.llm.retrying import RetryingGemini  # noqa: E402
from mantleproof.settings import get_settings  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEPLOYMENTS = ROOT / "contracts" / "deployments" / "mantle.addresses.json"
CONTRACTS_DIR = ROOT / "contracts" / "contracts"
LEDGER = (
    pathlib.Path(__file__).resolve().parents[2]
    / "agents"
    / "validation"
    / "dispute_resolutions.mantle.md"
)


def _local_source(contract_name: str) -> str | None:
    """Local-file fallback for our own contracts (mirrors run_pipeline_mantle)."""
    for f in CONTRACTS_DIR.rglob(f"{contract_name}.sol"):
        return f"// === {f.name} (local fallback) ===\n{f.read_text()}"
    return None


def _audit_json_loader(ipfs_cid: str) -> dict:
    """Fetch the audit's IPFS body via the configured gateway."""
    s = get_settings()
    gw = s.ipfs_gateway.rstrip("/")
    cid = ipfs_cid.removeprefix("ipfs://")
    r = httpx.get(f"{gw}/{cid}", timeout=30)
    r.raise_for_status()
    return r.json()


def _source_loader(target: str) -> tuple[str, bytes, str]:
    """Resolve verified source + bytecode for `target`. Falls back to local
    contracts/ for self-deployed bait, picked by the KNOWN per-target map
    (NOT the first local match — the previous "iterate guesses" fallback
    silently misloaded BuggyYieldVault source when LBRouter was the target,
    which corrupted the dispute re-audit context).
    """
    from mantleproof.source.mantlescan import MantlescanClient
    from mantleproof.source.rpc import get_code

    s = get_settings()
    try:
        src_obj = MantlescanClient(s.chain_id, timeout=30.0).get_source(target)
        if src_obj and src_obj.verified:
            return src_obj.flat(), get_code(target, s.active_rpc_url), src_obj.name
    except Exception as exc:  # noqa: BLE001 — degrade to local fallback
        print(f"[source] live resolve failed ({type(exc).__name__}: {exc})")

    # Local fallback: per-target deterministic map (not a guess loop).
    # Add entries here when new audit targets become disputable.
    KNOWN_TARGETS = {
        "0x1892f77e335c133ce4a7b28555f13ba74cbb76fa": "BuggyYieldVault",  # Demo 1
        "0x8f6679eb031799fc9c5e149dfb75b4543808912f": "BackdooredMemeToken",  # Demo 2
        # Demo 3 (target is canonical Merchant Moe; verified source on
        # Etherscan V2 — fallback only fires on RPC flake)
        "0x013e138ef6008ae5fdfde29700e3f2bc61d21e3a": "LBRouter",
    }
    name = KNOWN_TARGETS.get(target.lower())
    if name:
        s_text = _local_source(name)
        if s_text:
            print(f"[source] FALLBACK to local contracts/ source ({name})")
            try:
                code = get_code(target, get_settings().active_rpc_url)
            except Exception:  # noqa: BLE001
                code = b""
            return s_text, code, name
    raise RuntimeError(
        f"no verified source for {target} + no known local fallback "
        "(add to KNOWN_TARGETS in resolve_dispute_mainnet.py if disputable)"
    )


def _run_reaudit_with_live_provider(**kw):
    """Bind the live Gemini provider into run_dispute_reaudit."""
    return run_dispute_reaudit(provider=RetryingGemini(), **kw)


def _append_ledger(dispute_id: int, summary: dict) -> None:
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    header = (
        f"\n## Dispute #{dispute_id} — {summary.get('outcome', '?')}  "
        f"({datetime.now(UTC).isoformat()})\n"
    )
    body = (
        f"- status: `{summary.get('status')}`\n"
        f"- outcome: **{summary.get('outcome')}** (uint8 {summary.get('outcome_uint8')})\n"
        f"- reAuditRootHash: `{summary.get('re_audit_root_hash')}`\n"
        f"- anchor tx: `{summary.get('anchor_tx')}`\n"
        f"- rationale: {summary.get('rationale', '')}\n"
    )
    with LEDGER.open("a") as f:
        f.write(header + body + "\n")


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: resolve_dispute_mainnet.py <disputeId>")
        return 2
    dispute_id = int(sys.argv[1])

    s = get_settings()
    if s.chain_id != 5000:
        print(f"ERROR: settings.chain_id={s.chain_id}, not mainnet 5000")
        return 2
    if not s.oracle_signer_private_key:
        print("ERROR: ORACLE_SIGNER_PRIVATE_KEY not set — only the oracle can resolveDispute")
        return 2
    if not s.gemini_api_key:
        print("ERROR: GEMINI_API_KEY not set — Tier 2 re-audit needs the LLM")
        return 2

    dep = json.loads(DEPLOYMENTS.read_text())
    print(f"[chain]    {s.chain_id} ({s.active_rpc_url})")
    print(f"[registry] {dep['contracts']['MantleProofRegistry']}")
    print(f"[dispute]  resolving id={dispute_id}")

    summary = resolve_one(
        dispute_id,
        run_reaudit=_run_reaudit_with_live_provider,
        audit_json_loader=_audit_json_loader,
        counter_claim_fetcher=fetch_counter_claim,
        source_loader=_source_loader,
    )
    print("\n[verdict]", json.dumps(summary, indent=2, default=str))
    _append_ledger(dispute_id, summary)
    print(f"\n[ledger] appended to {LEDGER}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
