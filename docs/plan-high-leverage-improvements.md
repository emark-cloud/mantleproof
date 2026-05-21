# High-Leverage Hackathon Improvements — MantleProof

## Context

Competitive research into GoPlus, Forta, Blockaid, and Aderyn-MCP surfaced five
concrete additions that meaningfully raise MantleProof's credibility for the
Mantle Turing Test judging round without expanding scope. Each item maps to a
production-validated pattern in one of the four reference projects:

| # | Item | Reference pattern |
|---|------|---|
| 1 | Precision/recall metrics per check | Forta Scam Detector (88%P / 54%R published headline) |
| 2 | Named sub-detectors per dimension | GoPlus TRC taxonomy (`is_honeypot`, `hidden_owner`, …) |
| 3 | Lifecycle stage tag per finding | Forta Attack Detector 2.0 stage fusion |
| 4 | Per-audit + aggregate latency in JSON | Blockaid sub-300ms public claim |
| 5 | "vs other tools" positioning copy | Aderyn-MCP confusion is the likely judge failure mode |

All five fit hackathon scope (≤ 2 days). They are mostly additive — no breaking
schema change, no contract redeploy required.

Conventions: each item ships behind the same audit-JSON schema bump
(`mantleproof/audit/v1` → `v1.1`) added once in pipeline.py to keep clients
sane. Validation against the cutover gate (CLAUDE.md L34) is unchanged.

---

## Item 1 — Precision/recall per check dimension

**Goal.** Publish `precision`, `recall`, and per-check breakdown in every audit
JSON + a coverage block on the landing.

**Data we already have.** Twelve labeled fixture pairs at
`engine/tests/fixtures/contracts/{usdy,meth,usde,dex_lb,dex_v3,replay}_{pos,neg}.sol`
(positives = should fire, negatives = should not). Plus two on-chain mainnet
bait contracts (`contracts/deployments/mantle.bait.json`:
`ChainIdReplayPermit`, `MisaccountedMethVault`) and the
`engine/tests/fixtures/real_targets.json` 10-token verified-protocol set
(clean → also negatives).

**Files to add.**
- `engine/scripts/measure_metrics.py` — iterates labeled set, runs `run_tier1`
  per fixture, computes per-dimension TP/FP/TN/FN, writes
  `engine/validation/metrics.json` with shape:
  ```json
  { "schema": "mantleproof/metrics/v1",
    "computed_at": "2026-05-21T…",
    "dataset": { "positives": 6, "negatives": 16, "sha256": "…" },
    "overall": { "precision": 0.94, "recall": 1.00, "f1": 0.97 },
    "by_check": {
      "usdy_check_v1":   { "precision": 1.0, "recall": 1.0, "n_pos": 1, "n_neg": 11 },
      "meth_check_v1":   { … }, "usde_check_v1": { … },
      "dex_check_v1":    { … }, "replay_check_v1": { … }
    } }
  ```
- `engine/validation/metrics.json` — generated artifact, committed (it's the
  publishable artifact, like Forta's blog post number).

**Files to modify.**
- `engine/mantleproof/pipeline.py` `build_report()` (around L98, before
  `findings`): add
  ```python
  "metrics_ref": {
      "url": "/metrics.json",
      "precision": …, "recall": …, "validation_set_size": …,
      "computed_at": …, "dataset_sha256": …,
  }
  ```
  Loaded lazily from `engine/validation/metrics.json` at engine startup; cached
  in-process. Absent file → field is `null` (honest, doesn't crash).
- `frontend/src/pages/Landing.tsx` — insert a new **Coverage** section
  between Hero (ends L194) and Dimensions (starts L241). Reuse the existing
  `<Stat>` component (L197) for headline numbers (P/R/N), and the
  `░▒▓█` stacked-bar ASCII pattern (per `docs/design.md` §7) for the
  per-check breakdown. Mono font for numbers, no new colors.
- Frontend reads `metrics.json` at build time via a small loader (whatever the
  existing pages use to read audit JSON — match that pattern).

**Reuse.** `engine/mantleproof/tier1.py::run_tier1` and the existing per-check
`run()` signatures already accept `(source, bytecode, chain_id, address=…)` —
no new engine surface needed.

**Cost.** ~150 LOC engine + ~80 LOC landing.

---

## Item 2 — Named sub-detectors per dimension

**Goal.** Each finding carries a stable, slug-form sub-detector name (e.g.
`usdy.balance_snapshot`) so consuming agents can branch on the *specific* issue,
not just "USDY check fired."

**Today.** Each check already emits one CheckResult per hazard with `check_id`
= dimension-level string (`"usdy_check_v1"`, `"meth_check_v1"`, …). The hazards
internally are named H1–H4 but not exposed.

**Files to modify.**
- `engine/mantleproof/checks/base.py` (L41 dataclass): add field
  ```python
  sub_detector: str = ""   # e.g. "usdy.balance_snapshot"
  ```
  Default empty for backward compat. Surfaced via `to_dict()`.
- Each check file at the five `CheckResult(...)` constructions
  (`engine/mantleproof/checks/{usdy,meth,usde,dex,replay}_check.py`) — pass the
  slug. Slug taxonomy:
  ```
  usdy.balance_snapshot, usdy.unguarded_transfer, usdy.wrong_oracle, usdy.par_assumption
  meth.balance_proportional, meth.no_rate_read, meth.cmeth_conflation, meth.stale_redemption
  usde.cooldown_unawareness, usde.par_assumption, usde.no_depeg_handling
  dex.lb_bin_bounds, dex.lb_static_fee, dex.lb_v3_fee_accounting, dex.v3_no_slippage
  replay.no_chainid, replay.eip712_missing_chainid, replay.hardcoded_2300_gas
  ```
- `engine/mantleproof/checks/taxonomy.py` (new, ~40 LOC) — single source of
  truth:
  ```python
  SUB_DETECTORS: dict[str, list[dict]] = {
      "usdy_check_v1": [
          {"slug": "usdy.balance_snapshot", "title": "…", "severity": "HIGH"},
          …
      ], … }
  ```
  Imported by metrics script (Item 1) and tests.
- `engine/mantleproof/pipeline.py` `build_report()` — add a
  `"sub_detectors_available": SUB_DETECTORS[check_id]` block alongside
  findings, so consumers can enumerate what *could have* fired (GoPlus exposes
  the full check list whether or not each fires).
- Landing **Dimensions** section (Landing.tsx L241–L262) — expand the table to
  show sub-detector slugs per dimension (already partly listed as "break
  conditions"; just promote to first-class slug column, mono font).

**Migration.** Existing `check_id` values stay (back-compat). Sub-detector
field is purely additive. Tests under `engine/tests/test_*_check.py` get a
single assertion added: `assert result.sub_detector.startswith("usdy.")` etc.

**Cost.** ~120 LOC engine + ~40 LOC landing.

---

## Item 3 — Lifecycle stage tag per finding

**Goal.** Each finding carries a `stage` ∈ {`configuration`, `economic`,
`exploitation`} tag — lets the deployer-demo agent prioritize ("block on
exploitation, warn on economic, log on configuration").

**Mapping (deterministic from sub-detector slug, no LLM call).**
```
configuration:  replay.no_chainid, replay.eip712_missing_chainid,
                replay.hardcoded_2300_gas, usdy.unguarded_transfer
economic:       usdy.balance_snapshot, usdy.par_assumption, usdy.wrong_oracle,
                meth.balance_proportional, meth.cmeth_conflation,
                meth.stale_redemption, usde.cooldown_unawareness,
                usde.par_assumption, usde.no_depeg_handling
exploitation:   meth.no_rate_read, dex.lb_bin_bounds, dex.lb_static_fee,
                dex.lb_v3_fee_accounting, dex.v3_no_slippage
```

**Files to modify.**
- `engine/mantleproof/checks/base.py` — add `stage: str = ""` to CheckResult.
- `engine/mantleproof/checks/taxonomy.py` (from Item 2) — add `"stage"` field
  to each sub-detector entry. Single dictionary, no logic duplication.
- Each check constructor passes the stage from the taxonomy lookup
  (`STAGE_OF[sub_detector_slug]`).

**No frontend change required** — the deployer demo agent
(`agents/src/deployer-agent.ts`) can already branch on the field once it
appears in the JSON. Optionally surface as a small `[stage]` badge in the
audit detail view, but not blocking.

**Cost.** ~30 LOC engine (mostly the taxonomy table, since Item 2 already adds
the field-passing scaffolding).

---

## Item 4 — Latency in audit JSON + landing benchmark

**Goal.** Every audit JSON carries `timing_ms`. Landing publishes p50/p95/p99
computed from the validation-set run.

**Files to modify.**
- `engine/mantleproof/pipeline.py` `run_audit()` (L116–L231) — wrap each phase
  in `time.perf_counter()`:
  ```python
  t = time.perf_counter()
  tier1_findings = run_tier1(…)
  timing["tier1_ms"] = round((time.perf_counter() - t) * 1000, 1)
  ```
  Phases: `source_fetch`, `tier1`, `tier2` (None if skipped), `guard`,
  `ipfs_pin`, `anchor` (None if not anchored), `total`. Existing pattern
  already used in `routes_health.py` — reuse the idiom.
- `build_report()` — add `"timing_ms": timing` near the top-level fields
  (after `tier`, before `findings`).
- `engine/scripts/measure_metrics.py` (Item 1) — additionally record per-run
  total latency, write `latency_percentiles` block into `metrics.json`:
  ```json
  "latency_ms": { "p50": 320, "p95": 540, "p99": 780, "samples": 22 }
  ```
- Landing **Coverage** section (Item 1's new section) — show the p50/p95/p99
  block alongside precision/recall, mono font. Explicitly label as
  "measured on validation set, N=22" — Blockaid-style honest disclosure.

**Cost.** ~50 LOC engine + ~20 LOC landing.

---

## Item 5 — Positioning vs other tools

**Goal.** Kill the most likely judge confusion ("is this just Aderyn-MCP?
Slither? GoPlus?") in 60 seconds.

**Files to modify.**
- `frontend/src/pages/Landing.tsx` **FAQ section** (L606–L647) — add a 7th
  expandable item: *"How does this differ from Aderyn-MCP, GoPlus, Forta,
  Blockaid?"* Body (~120 words, mono spans for names):
  > **Aderyn-MCP** is a Solidity static analyzer for developers at write time.
  > MantleProof is a runtime oracle for agents at execution time. Different
  > consumer, different surface (MCP + on-chain `getAudit()` + x402).
  >
  > **GoPlus** is a centralized token/address risk API. MantleProof is
  > Mantle-native (USDY/mUSD, mETH, USDe, Merchant Moe LB, EIP-712 replay),
  > on-chain anchored, and signs every verdict.
  >
  > **Forta** monitors live transactions; MantleProof audits contracts
  > before they are touched.
  >
  > **Blockaid** simulates transactions inside wallets. MantleProof audits
  > the contract source + bytecode and publishes a signed verdict an agent
  > can read on-chain.
- `docs/mantleproof.md` — add a `## Related work` section near the top
  (after the thesis paragraph, before §2 architecture) with the same content
  in long form, ~200 words. The spec is locked but additive
  documentation is fine; mark as "research note 2026-05-21" if needed.
- `README.md` stays untouched (46 lines, kept lean for submission).

**Cost.** ~60 LOC frontend + ~30 lines markdown.

---

## Critical files modified (summary)

| Path | Item(s) |
|---|---|
| `engine/mantleproof/pipeline.py` | 1, 2, 3, 4 (build_report + run_audit) |
| `engine/mantleproof/checks/base.py` | 2, 3 (CheckResult dataclass) |
| `engine/mantleproof/checks/{usdy,meth,usde,dex,replay}_check.py` | 2, 3 (pass slug + stage) |
| `engine/mantleproof/checks/taxonomy.py` | 2, 3 (new file, single source) |
| `engine/scripts/measure_metrics.py` | 1, 4 (new file) |
| `engine/validation/metrics.json` | 1, 4 (generated artifact) |
| `frontend/src/pages/Landing.tsx` | 1, 2, 4, 5 (Coverage section + Dimensions table + FAQ) |
| `docs/mantleproof.md` | 5 (Related work section) |

No contract changes, no MCP server changes, no x402 changes. All five items
are additive to the audit-JSON schema (`v1` → `v1.1`).

---

## Visibility plan — make the important stuff land

The five items only pay off if a judge skimming the landing for 60 seconds, a
developer reading an audit JSON, and an agent parsing fields all *see* them.
Below is where each surfaces, ranked by prominence.

### Where each item appears, by surface

| Surface | What appears | Item(s) |
|---|---|---|
| **Landing hero** (Landing.tsx L93–L194) — first paint, above the fold | Existing 4-stat grid gains a 5th tile: `precision · recall · p95 latency` as one compound stat with mono numbers + tiny `i` hover citing dataset size + computed_at. Lifts the headline from "5 risk checks" into "5 checks, 94% P, 100% R, 320ms p95". | 1, 4 |
| **Landing "Coverage" section** (new, between Hero L194 and Dimensions L241) — second screen | Three sub-blocks: (a) headline P/R/F1 in `--text-xxl` mono. (b) `░▒▓█` ASCII stacked bar showing per-check precision and per-check recall side by side. (c) latency histogram p50/p95/p99 as a single-line ASCII sparkline + numeric labels. Footer line: *"Measured against N=22 labeled contracts (12 fixtures + 2 mainnet baits + 8 verified protocols), SHA `…`, computed `…`. Re-run: `python scripts/measure_metrics.py`."* — Blockaid-/Forta-style honest disclosure. | 1, 4 |
| **Landing "Dimensions" section** (L241–L262) — third screen, existing | Existing table gains a *Sub-detectors* column listing slugs in mono (e.g. `usdy.balance_snapshot · usdy.par_assumption · …`). Each slug becomes a click target with a 1-sentence hover ("snapshot of USDY balance treated as par — breaks under rebase"). Lifts dimensions from "5 buckets" to "17 named, slug-addressable detectors." | 2 |
| **Landing "FAQ" section** (L606–L647) — bottom, expandable | New item #7 *"How is this different from Aderyn-MCP / GoPlus / Forta / Blockaid?"* (copy in Item 5). Placed as the first FAQ item, not last, since it's the most-asked judge question. | 5 |
| **Audit detail page** (existing detail view used by `/audit/<addr>`) | Each finding card gains two small badges next to the severity chip: a `stage` tag (`configuration` / `economic` / `exploitation`, color-coded — info / warn / sev-high) and the `sub_detector` slug in mono. Hover on the slug pops the taxonomy entry. | 2, 3 |
| **Audit JSON** (returned by all three query surfaces) | New top-level fields: `metrics_ref`, `timing_ms`, plus `sub_detector` + `stage` on every finding, plus `sub_detectors_available` per dimension. Schema bumps `v1` → `v1.1`. | 1, 2, 3, 4 |
| **MCP server response** (`mcp-server/src/tools/audit.ts`) | Same JSON shape — agents calling via Claude / Claude Code see the new fields immediately, no MCP code change. The new fields are discoverable via the tool's existing JSON schema. | 1, 2, 3, 4 |
| **x402 REST response** | Same JSON shape — paid-call consumers get the metrics + stage tags for free. Headline value-prop "you get a P/R-quantified audit signal" maps directly to USDC pricing. | 1, 2, 3, 4 |
| **Open-source artifact** `engine/validation/metrics.json` | Committed file, linkable from landing + README. Lets anyone reproduce the published number — same trick Forta used to make 88% / 54% credible. | 1, 4 |
| **`docs/mantleproof.md` "Related work" section** (new, after thesis) | ~200-word long-form of the FAQ #7 content. Reading-order: judges who go from landing → deeper docs land on the comparison before architecture. | 5 |

### Visibility ordering (most → least prominent)

1. **Hero stat tile** — single number, mono, above fold. Item 1+4 fused.
2. **Coverage section** — full P/R/latency breakdown, second screen.
3. **Sub-detector slugs in Dimensions table** — third screen, hoverable.
4. **FAQ #7 (positioning)** — first FAQ item, expandable.
5. **Per-finding `stage` + `sub_detector` badges in audit view** — discoverable
   when a judge clicks "see the audit."
6. **Audit JSON fields** — discoverable to anyone using MCP / x402 / `cast call`.
7. **`metrics.json` artifact** — reproducibility anchor, linked from Coverage
   section "re-run" line.

### What we deliberately do NOT do

- No light mode, no spinners, no emoji (per `docs/design.md`).
- No new chart library — the Coverage section uses the existing `Sparkline.tsx`
  + raw `░▒▓█` characters per design.md §7.
- No banner / modal / popup. Each addition slots into an existing section or
  extends one already in flow.
- No "v1.1" announcement copy — the schema bump is invisible to users; only
  the surfaced numbers and labels are.

## Verification

End-to-end checklist (run on Sepolia, gated by the existing cutover rules in
CLAUDE.md):

1. **Unit tests** — `cd engine && pytest`. Adds ~5 assertions across
   `test_{usdy,meth,usde,dex,replay}_check.py` for `sub_detector` + `stage`
   slugs. All pre-existing tests must still pass (no schema break).
2. **Type + lint** — `pnpm -r typecheck` (frontend), `cd engine && ruff check . && mypy .`.
3. **Metrics generation** — `cd engine && python scripts/measure_metrics.py`.
   Confirm `engine/validation/metrics.json` written, P/R/F1 sane (expected:
   ≥ 0.9 precision on the bait set since false positives are regression-tested
   in `test_tier1_precision.py`).
4. **Pipeline integration** — `cd engine && uvicorn mantleproof.main:app`,
   `curl /audit?target=<sepolia-bait-addr>`, confirm JSON contains
   `metrics_ref`, `timing_ms`, and every finding has `sub_detector` + `stage`.
5. **Frontend** — `cd frontend && pnpm dev`, visually verify Coverage section
   renders with mono numbers + ASCII bars, FAQ #7 expands cleanly, Dimensions
   table shows sub-detector slugs. No spinners, no emoji, no light-mode bugs.
6. **Smoke round-trip on Sepolia** — `pnpm exec hardhat run scripts/smoke-roundtrip.ts --network mantleSepolia`.
   Confirm the new fields survive serialize → IPFS pin → `getAudit()` round-trip.
   This is the existing gate; we just check we didn't bloat past any size cap.
7. **Validation harness re-run** — `python scripts/validate_tier2.py` against
   `real_targets.json`. Tier 2 precision must not regress; latency_ms now
   shows up in the per-target report.

Mainnet cutover gate (CLAUDE.md L34) is unchanged by this plan.
