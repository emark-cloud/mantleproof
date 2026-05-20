#!/usr/bin/env python3
"""T26 — live end-to-end pipeline run on Mantle MAINNET (chainId 5000).

Direct sibling of `run_pipeline_sepolia.py`. Same orchestration, different
chain. Spawned by the deployer-agent (and later trading/yield agents) when
the audit step needs to land on mainnet.

  resolve verified source (Etherscan V2, chainid 5000)
    -> live Mantle mainnet bytecode (eth_getCode via MANTLE_RPC_URL)
    -> Tier-1 union
    -> Tier-2 (live Gemini) -> hallucination guard -> canonical rootHash
    -> pin report JSON to IPFS (Pinata)
    -> submitAudit on the MAINNET MantleProofRegistry (compounds memoryRoot)

The pipeline still **refuses to anchor a rootHash whose JSON nobody can
fetch** (CLAUDE.md) -- a missing PINATA_JWT fails the run loudly. The pin
wrapper captures the assembled report (with `root_hash` already set) before
the network pin, so a credential gap leaves a verifiable rootHash artifact
without writing a half-formed audit on mainnet.

Target + registry come from contracts/deployments/mantle.addresses.json;
argv overrides the target.

    cd engine && python -u scripts/run_pipeline_mantle.py 0x<demoTarget>

Independent verification of the receipt: fetch the IPFS JSON, drop the
root_hash/ipfs_*/anchor_tx keys, keccak256 the canonical form, and confirm
it equals `MantleProofRegistry.getAudit(target).rootHash`. Same property as
T20's Sepolia run -- but for real mainnet.
"""

from __future__ import annotations

import json
import os
import pathlib
import sys
import traceback

# Force the settings layer onto mainnet BEFORE first import — Settings reads
# this at construction time and caches via lru_cache; mutating later would not
# rewire `active_rpc_url`. This makes the mainnet harness chain-explicit even
# when the repo-root .env still defaults `MANTLE_NETWORK=mantleSepolia`.
os.environ["MANTLE_NETWORK"] = "mantle"

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from mantleproof.llm.retrying import RetryingGemini  # noqa: E402
from mantleproof.persistence.anchor import anchor_audit  # noqa: E402
from mantleproof.pipeline import run_audit  # noqa: E402
from mantleproof.settings import get_settings  # noqa: E402
from mantleproof.source.mantlescan import MantlescanClient  # noqa: E402

CHAIN_ID = 5000
ROOT = pathlib.Path(__file__).resolve().parents[2]
DEPLOYMENTS = ROOT / "contracts" / "deployments" / "mantle.addresses.json"
CONTRACTS_DIR = ROOT / "contracts" / "contracts"
REPORT = pathlib.Path(__file__).resolve().parents[1] / "validation" / "pipeline_mantle_report.md"


def _local_source(target_name: str) -> str | None:
    """Fallback: read source from contracts/contracts/ when the target is one
    of our own demo / system contracts and isn't yet verified on Etherscan V2.
    Searches recursively so demo/ subdirs (BuggyYieldVault.sol) match too."""
    for f in CONTRACTS_DIR.rglob(f"{target_name}.sol"):
        return f"// === {f.name} (local fallback) ===\n{f.read_text()}"
    return None


def main() -> int:
    if not DEPLOYMENTS.exists():
        print(f"ERROR: no mainnet deployment at {DEPLOYMENTS} — T25 not run.")
        return 2
    dep = json.loads(DEPLOYMENTS.read_text())
    registry_addr = dep["contracts"]["MantleProofRegistry"]
    if len(sys.argv) <= 1:
        print("ERROR: mainnet harness requires an explicit target address argv.")
        print("       no implicit DecisionLog default -- mainnet is real money.")
        return 2
    target = sys.argv[1]

    s = get_settings()
    # Belt-and-braces: confirm Settings actually wired itself to mainnet.
    if s.chain_id != CHAIN_ID:
        print(f"ERROR: settings.chain_id={s.chain_id} != mainnet {CHAIN_ID} — "
              "MANTLE_NETWORK env-pin failed (caller likely mutated env).")
        return 2
    if not s.etherscan_api_key:
        print("ERROR: ETHERSCAN_API_KEY not set — cannot resolve live source.")
        return 2
    if not s.gemini_api_key:
        print("ERROR: GEMINI_API_KEY not set — Tier 2 needs the live LLM.")
        return 2
    if not s.pinata_jwt:
        print("ERROR: PINATA_JWT not set — pipeline refuses to anchor an "
              "unfetchable rootHash. CLAUDE.md invariant.")
        return 2
    if not s.oracle_signer_private_key:
        print("ERROR: ORACLE_SIGNER_PRIVATE_KEY not set — only the oracle "
              "signer can call submitAudit.")
        return 2

    print(f"[target]   {target}  (Mantle mainnet {CHAIN_ID})", flush=True)
    print(f"[registry] {registry_addr}", flush=True)
    print(f"[rpc]      {s.mantle_rpc_url}", flush=True)

    # --- resolve verified source (live) with local fallback for our demo code ---
    contract_name = ""
    source: str | None = None
    try:
        src = MantlescanClient(CHAIN_ID, timeout=30.0).get_source(target)
        if src and src.verified:
            source, contract_name = src.flat(), src.name
            print(f"[source]   verified on Etherscan V2 ({src.name})", flush=True)
    except Exception as e:  # noqa: BLE001
        print(f"[source]   live resolve failed ({type(e).__name__}: {e})", flush=True)
    if source is None:
        # Targets the deployer-agent deploys (BuggyYieldVault) -- local fallback.
        for guess in ("BuggyYieldVault", "DecisionLog"):
            source = _local_source(guess)
            if source:
                contract_name = guess
                print(f"[source]   FALLBACK to local contracts/ source ({guess})", flush=True)
                break
    if source is None:
        print("ERROR: no source for target (live unverified + no local file).")
        return 2

    # --- single live pipeline run --------------------------------------------
    captured: dict = {}

    def _pin(report: dict) -> str:
        captured["report"] = report  # has root_hash; pre-network
        from mantleproof.persistence.ipfs import pin_json

        return pin_json(report)

    def _anchor(t, sev, root_hash, cid):  # noqa: ANN001
        return anchor_audit(t, sev, root_hash, cid, registry_address=registry_addr)

    print("\n[run] live source/bytecode/Tier-1/Gemini-Tier-2/guard/rootHash"
          " -> IPFS pin -> MAINNET anchor …", flush=True)
    blocked: str | None = None
    final = None
    try:
        final = run_audit(
            target, tier=2, chain_id=CHAIN_ID, source=source,
            contract_name=contract_name, provider=RetryingGemini(),
            pin=_pin, anchor=_anchor, do_anchor=True,
        )
    except RuntimeError as e:
        blocked = str(e)
    except Exception as e:  # noqa: BLE001
        blocked = f"{type(e).__name__}: {e}"
        traceback.print_exc()

    rep = final or captured.get("report")
    if rep is None:
        print(f"[run] FAILED before rootHash: {blocked}", flush=True)
        _write_report(target, registry_addr, None, blocked or "unknown")
        return 1

    g = rep.get("hallucination_guard", {})
    print(
        f"[run] tier={rep['tier']} provider={rep.get('provider','')} "
        f"findings={rep['summary']['total']} severity={rep['severity']} "
        f"masked={g.get('masked_count',0)} label_drops={g.get('label_drops',0)}\n"
        f"      rootHash={rep['root_hash']}",
        flush=True,
    )
    if final is not None:
        print(
            f"[run] ANCHORED  ipfs={final.get('ipfs_uri')}\n"
            f"      anchor_tx={final.get('anchor_tx')}",
            flush=True,
        )
    else:
        print(f"[run] BLOCKED (credential, not a code gap): {blocked}", flush=True)

    _write_report(target, registry_addr, rep, blocked)
    return 0 if final is not None else 3


def _write_report(target, registry, rep, blocked) -> None:  # noqa: ANN001
    lines = [
        "# Pipeline end-to-end on Mantle MAINNET (T26 — demo audit anchors)",
        "",
        f"- Target: `{target}` · Registry: `{registry}` · Chain: Mantle {CHAIN_ID}",
        "- Single live pipeline run (one Gemini call): resolve source ->",
        "  bytecode -> Tier-1 -> live Gemini Tier-2 -> hallucination guard ->",
        "  canonical rootHash -> IPFS pin -> on-chain anchor.",
        "",
    ]
    if rep is None:
        lines += ["## Result", "", f"- **FAILED before rootHash:** `{blocked}`", ""]
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text("\n".join(lines) + "\n")
        print(f"\n[report] {REPORT}", flush=True)
        return

    g = rep.get("hallucination_guard", {})
    lines += [
        "## Live engine result",
        "",
        f"- tier={rep['tier']} · provider=`{rep.get('provider','')}` · "
        f"findings={rep['summary']['total']} · severity=`{rep['severity']}`",
        f"- Hallucination guard: masked={g.get('masked_count',0)} "
        f"label_drops={g.get('label_drops',0)} — \"{g.get('public_note','')}\"",
        f"- Canonical rootHash: `{rep['root_hash']}`",
        "",
        "## Terminal steps — IPFS pin + on-chain anchor",
        "",
    ]
    if blocked is None:
        lines += [
            "- **OK — full end-to-end mainnet receipt.**",
            f"- IPFS: `{rep.get('ipfs_uri')}`",
            f"- Mainnet `submitAudit` tx: `0x{rep.get('anchor_tx')}`",
            "- Verify: fetch IPFS JSON, drop root_hash/ipfs_*/anchor_tx keys,",
            "  keccak256 the canonical form → equals on-chain rootHash above.",
        ]
    else:
        lines += [f"- **BLOCKED:** `{blocked}` (rootHash recorded; nothing anchored)"]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n")
    print(f"\n[report] {REPORT}", flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
