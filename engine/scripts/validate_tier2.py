#!/usr/bin/env python3
"""T19 — Tier-2 precision validation over real Mantle mainnet targets.

Runs the FULL Tier-2 path the pipeline (T20) will run, end to end, against the
verified-protocol validation set in tests/fixtures/real_targets.json:

  resolve verified source (T9) + bytecode (RPC)
    -> run_tier2  (Tier-1 union + skills + tightly-scoped prompt -> live LLM)
    -> parse_findings   (provider-agnostic JSON parse, no tool-use)
    -> apply_guard      (T18: mask unsupported $/%/hex/addr, drop label)

Why these targets measure PRECISION: every address here is a correctly-built,
human+on-chain-verified protocol contract — NOT an integrator that misuses a
protocol. So the right answer is conservative: the self-target guard already
zeroes Tier-1, and Tier-2 should likewise emit few/zero additional findings.
"Precision acceptable" (mainnet-cutover-gate condition c) therefore means:
  (1) no false-positive storm of ungrounded findings on clean code, and
  (2) the hallucination guard demonstrably fires on LIVE LLM output — every
      quantitative claim it emits is either grounded in source/bytecode/Tier-1
      or masked `[unsupported]` with the finding's honesty label dropped.
Recall on real buggy code is exercised by the 45 Tier-1 unit tests + the 14
guard tests + the open curated-integrator-target item (validation/README.md).

Live LLM calls: `gemini-2.5-pro` 503s are transient upstream load (seen in
T14/T17). This harness retries with exponential backoff, then falls back to
`gemini-2.5-flash`, then records the target as errored and continues — one bad
target must not sink the run.

    cd engine && python -u scripts/validate_tier2.py    # needs ETHERSCAN + GEMINI keys

Dev/validation script, not part of the importable package.
"""

from __future__ import annotations

import json
import pathlib
import sys
import time

# Allow `python scripts/validate_tier2.py` from the engine dir.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from mantleproof.llm.gemini import GeminiProvider  # noqa: E402
from mantleproof.llm.provider import ProviderError  # noqa: E402
from mantleproof.settings import get_settings  # noqa: E402
from mantleproof.source.mantlescan import MantlescanClient  # noqa: E402
from mantleproof.source.rpc import get_code  # noqa: E402
from mantleproof.tier1 import run_tier1  # noqa: E402
from mantleproof.tier2.hallucination_guard import apply_guard, parse_findings  # noqa: E402
from mantleproof.tier2.runner import run_tier2  # noqa: E402

FIXTURES = pathlib.Path(__file__).resolve().parents[1] / "tests" / "fixtures"
REPORT = pathlib.Path(__file__).resolve().parents[1] / "validation" / "tier2_report.md"


class _RetryingGemini:
    """LLMProvider that survives transient Gemini 503s.

    Tries `gemini-2.5-pro` with exponential backoff, then falls back to
    `gemini-2.5-flash`. Satisfies the LLMProvider Protocol (name + reason).
    `model_used` records which model actually answered (for the report).
    """

    name = "gemini"

    def __init__(self) -> None:
        self._pro = GeminiProvider("gemini-2.5-pro")
        self._flash = GeminiProvider("gemini-2.5-flash")
        self.model_used = ""

    def reason(self, prompt: str, system: str) -> str:
        last: Exception | None = None
        for provider, model in ((self._pro, "gemini-2.5-pro"),
                                (self._flash, "gemini-2.5-flash")):
            for attempt in range(3):
                try:
                    out = provider.reason(prompt, system)
                    self.model_used = model
                    return out
                except ProviderError as e:  # transient upstream — back off
                    last = e
                    wait = 5 * (2 ** attempt)
                    print(f"    {model} attempt {attempt + 1} failed "
                          f"({e}); retry in {wait}s", flush=True)
                    time.sleep(wait)
        raise last or ProviderError("Gemini exhausted retries + flash fallback")


def main() -> int:
    doc = json.loads((FIXTURES / "real_targets.json").read_text())
    chain_id = doc["chain_id"]
    targets = doc["targets"]
    s = get_settings()
    if not s.etherscan_api_key:
        print("ERROR: ETHERSCAN_API_KEY not set — cannot resolve live source.")
        return 2
    if not s.gemini_api_key:
        print("ERROR: GEMINI_API_KEY not set — Tier 2 needs the live LLM.")
        return 2

    client = MantlescanClient(chain_id, timeout=30.0)
    rpc_url = s.mantle_rpc_url
    rows: list[dict] = []

    for t in targets:
        addr = t["address"]
        label = t.get("label", t.get("symbol", ""))
        print(f"[{addr}] {label} …", flush=True)
        row: dict = {"address": addr, "label": label}
        try:
            src = client.get_source(addr)
        except Exception as e:  # noqa: BLE001 — survive one bad target
            row["error"] = f"resolve: {type(e).__name__}: {e}"
            rows.append(row)
            continue
        if not src or not src.verified:
            row["error"] = "source not verified on Etherscan V2"
            rows.append(row)
            continue
        source = src.flat()
        row["name"] = src.name
        try:
            code = get_code(addr, rpc_url, timeout=20.0)
        except Exception:  # noqa: BLE001 — Tier 2 is source-first
            code = b""
        row["bytecode"] = len(code) > 0

        tier1 = run_tier1(source, code, chain_id, address=addr)
        prov = _RetryingGemini()
        try:
            out = run_tier2(
                addr, chain_id=chain_id, source=source,
                contract_name=src.name, bytecode=code, provider=prov,
            )
        except Exception as e:  # noqa: BLE001 — LLM exhausted; record + continue
            row["error"] = f"tier2: {type(e).__name__}: {e}"
            rows.append(row)
            continue

        parsed = parse_findings(out["raw_text"])
        guarded = apply_guard(parsed, source=source, bytecode=code, tier1=tier1)
        row.update(
            model=prov.model_used,
            tier1_count=len(tier1),
            tier2_raw=len(parsed),
            masked=guarded.masked_count,
            label_drops=guarded.dropped_labels,
            findings=[
                {
                    "severity": f.severity.value,
                    "label": f.label.value,
                    "finding": f.finding,
                }
                for f in guarded.findings
            ],
        )
        print(f"    {prov.model_used}: tier1={len(tier1)} "
              f"tier2_raw={len(parsed)} masked={guarded.masked_count} "
              f"label_drops={guarded.dropped_labels}", flush=True)
        rows.append(row)

    _write_report(rows, chain_id)
    return 0


def _write_report(rows: list[dict], chain_id: int) -> None:
    ok = [r for r in rows if not r.get("error")]
    tier2_total = sum(r.get("tier2_raw", 0) for r in ok)
    masked_total = sum(r.get("masked", 0) for r in ok)
    drops_total = sum(r.get("label_drops", 0) for r in ok)
    with_find = [r for r in ok if r.get("findings")]
    models = sorted({r["model"] for r in ok if r.get("model")})

    lines = [
        "# Tier-2 precision validation report (T19)",
        "",
        f"- Chain: Mantle mainnet ({chain_id}) · LLM: {', '.join(models) or '—'}",
        f"- Targets: {len(rows)} · resolved+verified: {len(ok)} · "
        f"with ≥1 surviving finding: {len(with_find)}",
        f"- Tier-2 raw findings: {tier2_total} · "
        f"hallucination-guard masked claims: {masked_total} · "
        f"label drops: {drops_total}",
        "- Set = verified protocol contracts (NOT integrators): the correct,",
        "  precise result is conservative — few/zero additional findings, and",
        "  every emitted quantitative claim grounded or guard-masked.",
        "- Pipeline path: run_tier2 → parse_findings → apply_guard (T18).",
        "",
        "| Address | Contract | Model | T1 | T2 raw | Masked | Drops | Surviving |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        if r.get("error"):
            lines.append(
                f"| `{r['address']}` | {r.get('name','—')} | — | — | — | — | — "
                f"| ❌ {r['error']} |"
            )
            continue
        lines.append(
            f"| `{r['address']}` | {r.get('name','')} | {r.get('model','')} | "
            f"{r['tier1_count']} | {r['tier2_raw']} | {r['masked']} | "
            f"{r['label_drops']} | {len(r['findings'])} |"
        )
    detail = [r for r in ok if r.get("findings")]
    if detail:
        lines += ["", "## Surviving Tier-2 findings (post-guard)", ""]
        for r in detail:
            lines.append(f"### {r.get('name','')} `{r['address']}`")
            for f in r["findings"]:
                lines.append(
                    f"- **{f['severity'].upper()}** [{f['label']}]: "
                    f"{f['finding']}"
                )
            lines.append("")
    else:
        lines += [
            "",
            "## Surviving Tier-2 findings (post-guard)",
            "",
            "_None._ On this verified-protocol set Tier-2 added no findings "
            "that survived the guard — the expected conservative result.",
            "",
        ]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n")
    print(f"\n[report] {REPORT}", flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
