#!/usr/bin/env python3
"""T12 — Tier-1 validation harness over real Mantle mainnet targets.

For every address in tests/fixtures/real_targets.json:
  1. resolve verified source via the T9 Etherscan-V2 client (re-confirms the
     address is a real, verified mainnet contract at run time),
  2. best-effort fetch deployed bytecode via JSON-RPC (eth_getCode) — Tier 1
     is source-first, so RPC failure degrades gracefully to b"",
  3. run the Tier-1 union (all five checks) and roll up findings.

Writes a human-readable report to validation/tier1_report.md and exits non-zero
only on harness failure (not on findings — findings are the point).

    cd engine && python scripts/validate_tier1.py        # needs ETHERSCAN_API_KEY

This is a dev/validation script, not part of the importable package.
"""

from __future__ import annotations

import json
import pathlib
import sys

# Allow `python scripts/validate_tier1.py` from the engine dir.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from mantleproof.settings import get_settings  # noqa: E402
from mantleproof.source.mantlescan import MantlescanClient  # noqa: E402
from mantleproof.source.rpc import get_code  # noqa: E402
from mantleproof.tier1 import run_tier1, summarize  # noqa: E402

FIXTURES = pathlib.Path(__file__).resolve().parents[1] / "tests" / "fixtures"
REPORT = pathlib.Path(__file__).resolve().parents[1] / "validation" / "tier1_report.md"


def main() -> int:
    doc = json.loads((FIXTURES / "real_targets.json").read_text())
    chain_id = doc["chain_id"]
    targets = doc["targets"]
    settings = get_settings()
    if not settings.etherscan_api_key:
        print("ERROR: ETHERSCAN_API_KEY not set — cannot resolve live source.")
        return 2

    client = MantlescanClient(chain_id, timeout=30.0)
    rpc_url = settings.mantle_rpc_url
    rows: list[dict] = []

    for t in targets:
        addr = t["address"]
        row: dict = {"address": addr, "label": t.get("label", t.get("symbol", ""))}
        try:
            src = client.get_source(addr)
        except Exception as e:  # noqa: BLE001 — harness must survive one bad target
            row.update(error=f"resolve: {type(e).__name__}: {e}")
            rows.append(row)
            continue
        if not src or not src.verified:
            row.update(error="source not verified on Etherscan V2")
            rows.append(row)
            continue
        row["name"] = src.name
        row["proxy"] = src.is_proxy
        try:
            code = get_code(addr, rpc_url, timeout=20.0)
        except Exception:  # noqa: BLE001 — Tier 1 is source-first; bytecode optional
            code = b""
        row["bytecode"] = len(code) > 0
        findings = run_tier1(src.flat(), code, chain_id, address=addr)
        row["summary"] = summarize(findings)
        row["findings"] = [
            {
                "check": f.check_id,
                "severity": f.severity.value,
                "label": f.label.value,
                "pattern": f.evidence.get("matched_pattern", ""),
                "finding": f.finding,
            }
            for f in findings
        ]
        rows.append(row)

    _write_report(rows, chain_id)
    _print_table(rows)
    return 0


def _print_table(rows: list[dict]) -> None:
    print(f"\n{'address':<44} {'name':<22} {'max':<7} findings")
    print("-" * 90)
    for r in rows:
        if r.get("error"):
            print(f"{r['address']:<44} {'(' + r['error'] + ')':<22}")
            continue
        s = r["summary"]
        print(
            f"{r['address']:<44} {r.get('name', ''):<22} "
            f"{str(s['max_severity']):<7} {s['total']}  {s['by_check']}"
        )


def _write_report(rows: list[dict], chain_id: int) -> None:
    ok = [r for r in rows if not r.get("error")]
    with_find = [r for r in ok if r["summary"]["total"] > 0]
    lines = [
        "# Tier-1 validation report (T12)",
        "",
        f"- Chain: Mantle mainnet ({chain_id})",
        f"- Targets: {len(rows)} · resolved+verified: {len(ok)} · "
        f"with ≥1 finding: {len(with_find)}",
        "- Engine: Tier 1 union of usdy/meth/usde/dex/replay checks "
        "(heuristic, offline). All findings ship `ESTIMATED`.",
        "",
        "| Address | Contract | Verified | Bytecode | Max sev | Findings |",
        "|---|---|---|---|---|---|",
    ]
    for r in rows:
        if r.get("error"):
            lines.append(
                f"| `{r['address']}` | — | ❌ {r['error']} | — | — | — |"
            )
            continue
        s = r["summary"]
        lines.append(
            f"| `{r['address']}` | {r.get('name','')} | ✅ | "
            f"{'✅' if r['bytecode'] else '—'} | {s['max_severity'] or '—'} | "
            f"{s['total']} {s['by_check'] or ''} |"
        )
    detail = [r for r in ok if r["findings"]]
    if detail:
        lines += ["", "## Findings detail", ""]
        for r in detail:
            lines.append(f"### {r.get('name','')} `{r['address']}`")
            for f in r["findings"]:
                lines.append(
                    f"- **{f['severity'].upper()}** [{f['label']}] "
                    f"`{f['check']}` ({f['pattern']}): {f['finding']}"
                )
            lines.append("")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n")
    print(f"\n[report] {REPORT}")


if __name__ == "__main__":
    raise SystemExit(main())
