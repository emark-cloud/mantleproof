# MantleProof — TODO

Work the **★ Critical Path** block top-to-bottom. Week sections mirror
`docs/mantleproof.md` §9 and `docs/design.md` §13 (reference cadence — build at own
pace). `[CP]` = on the critical path to **D = three demos green on Mantle mainnet**.

---

## ★ Critical Path (do these first, in order)

- [ ] **T0**  Scaffold monorepo `[CP]`
- [x] **T3**  Path A contracts implemented + 14 Hardhat tests passing (CI runs them) `[CP]`
- [x] **T4**  Sepolia ✅ — 5 contracts deployed + all verified on sepolia.mantlescan.xyz (Etherscan V2) `[CP]`
- [x] **T6**  smoke-roundtrip GREEN on Sepolia ✅ — submitAudit→getAudit→memoryRoot 0→1 (Week-1 gate passed) `[CP]`
- [x] **T14** GeminiProvider working ✅ — live `gemini-2.5-pro` call green (raw text, temp=0); factory + Claude/Zai key-gated adapters too `[CP]`
- [ ] **T17** Tier 2 prompt + runner `[CP]`
- [ ] **T18** Hallucination guard  ⚠ HIGHEST RISK `[CP]`
- [ ] **T19** Tier 2 precision pass vs ~20-contract set `[CP]`
- [ ] **T20** pipeline.py end-to-end (Tier1→Tier2→guard→IPFS→anchor) `[CP]`
- [ ] **T25** MAINNET cutover (gate must pass — see below) `[CP]`
- [ ] **T26/T27/T28** three demo agents on mainnet  →  **DELIVERABLE D** `[CP]`

**Mainnet cutover gate (T25) — all must hold before any mainnet deploy:**
(a) T6 green on Sepolia · (b) T20 run end-to-end on Sepolia vs a Sepolia test target ·
(c) T19 precision acceptable · (d) Path A/B resolved ✅ (Path A) · (e) `mantle_tokens.py` mainnet
column human-verified. Cutover = `MANTLE_NETWORK=mantle` + fresh deploy, not new code.

---

## Setup checklist (early Week 1) → see `docs/setup-checklist.md`

- [ ] **Etherscan API V2 key** (etherscan.io/myapikey) → `.env` `ETHERSCAN_API_KEY` — gates T9-live + T4-verify (V1 mantlescan key is dead)
- [ ] Pinata JWT obtained (gates T20 IPFS pin)
- [ ] Confirm wallets funded: MNT on Mantle mainnet, MNT on Mantle Sepolia, USDC on Base
- [ ] Railway project created · Vercel project created  *(accounts already held)*
- [ ] (optional) `ANTHROPIC_API_KEY` / `ZAI_API_KEY` — gate only key-gated provider smoke tests
- [x] **T1** RESOLVED 2026-05-18 — Mantle auto-issues each agent's ERC-8004 identity NFT (integrated hackathon feature). **Path A**: do NOT deploy own Identity Registry.
- [x] **T1b** RESOLVED 2026-05-18 — official ERC-8004 registry addresses found + verified live (`eth_getCode`); in `contracts/config/registries.ts`. Identity+Reputation on 5000 & 5003 (no Validation needed).
- [ ] **T5** still needs MantleProof's own Mantle-issued tokenId (assigned on hackathon registration) → `MANTLEPROOF_AGENT_TOKEN_ID`

---

## Week 1 — Foundation & contracts

- [ ] **T0**  Scaffold monorepo (root, contracts, engine, mcp-server, frontend, agents) `[CP]`
- [x] **T1**  Path resolved → **Path A** (Mantle auto-issues ERC-8004 identity; no own registry)
- [x] **T1b** Official ERC-8004 registry addresses resolved + verified → `contracts/config/registries.ts`
- [x] **T2**  `mantle_tokens.py` pinned — 8 mainnet addrs from official docs, all verified on-chain (symbol/name/decimals + bytecode) 2026-05-19; 5003 None by design; +TOKEN_DECIMALS/IMPL, 3 tests
- [x] **T3**  Path A contracts implemented (MantleProofRegistry, MantleProofAgent wrapper, MantleProofLicense 80/20, TreasurySplit timelock, DecisionLog) + mocks + 14 tests green `[CP]`
- [x] **T4**  Sepolia deploy + verify ✅ (Registry 0x261a74…, Agent 0x60E97c…, Treasury 0xdE3698…, License 0x53459f…, DecisionLog 0x906390… — all source-verified, Etherscan V2) `[CP]`
- [ ] **T5**  Obtain MantleProof's Mantle-issued ERC-8004 identity tokenId; wire it into `MantleProofAgent` (no self-mint under Path A)
- [x] **T6**  smoke-roundtrip GREEN ✅ (tx 0x449c394d… on Sepolia) — **Week-1 gate passed** `[CP]`
- [ ] **T7**  Frontend wagmi reads registry (after T3 ABIs)

## Week 2 — Audit engine, Tier 1

- [x] **T8**  Bytecode disasm (pyevmasm) + pattern registry — disasm/iter_pushes/find_address_constants/find_selectors/pushes_value/has_opcode + registry + chainId heuristic; 7 tests
- [x] **T9**  Source resolver — Etherscan **API V2** client (unified endpoint, chainid-routed, proxy follow, double-brace standard-json parser); pure parser unit-tested (5 tests); live call gated on `ETHERSCAN_API_KEY`
- [x] **T10** 5 check modules + fixtures each — `_common.py` shared Tier-1 primitives; 17 new tests; engine suite 35 pass / 2 skip; ruff+mypy clean:
  - [x] `usdy_check` (rebase snapshot→HIGH, non-RWA oracle→MED, USDY≠mUSD 1:1→MED, unguarded blocklist transfer→LOW) + pos/neg fixtures, 3 tests
  - [x] `meth_check` (balanceOf/totalSupply proportion→HIGH, no exchange-rate→MED, cmETH conflation→MED, Validator-Queue assumption→LOW) + pos/neg fixtures, 3 tests
  - [x] `usde_check` (sUSDe redeem w/o cooldown→HIGH, USDe/sUSDe 1:1→MED, USDe collateral w/o oracle→LOW) + pos/neg fixtures, 3 tests
  - [x] `dex_check` — LB: no bin-id validation→HIGH, static fee→MED, V3-style feeGrowth on LB→MED; V3: mint w/o slippage/deadline→MED. Agni deferred to Tier 2 (source unverified, §13.4). 4 fixtures (lb/v3 ±) + 5 tests
  - [x] `replay_check` (no block.chainid in domain sep→HIGH, chainId omitted from EIP712Domain typehash→MED, hardcoded 2300 gas→LOW) + pos/neg fixtures, 3 tests
- [ ] **T11** Postgres models + alembic migrations (Audit, Contract, AgentQuery, DeployEvent)
- [x] **T12** Tier 1 validation vs real mainnet targets — `tier1.py` union runner + `rpc.py` eth_getCode + `scripts/validate_tier1.py` live harness; `real_targets.json` seeded from T2-verified token map (10, provenance inherited); **live run surfaced + fixed real Tier-1 FPs** (integration-handle gate + self-target guard + replay restructure) → 10/10 verified protocol contracts now 0 findings (no FP storm); 45 tests / 2 skip; report in `engine/validation/`. Integrator-target breadth = open curation item (non-blocking, see validation/README.md)

## Week 3 — Tier 2 + hallucination guard  ⚠ highest-risk week, budget buffer

- [x] **T13** `LLMProvider` runtime-checkable Protocol + env factory + `ProviderError`/`require_key` (value-safe); 1 test file, all adapters isinstance-checked
- [x] **T14** GeminiProvider (DEFAULT) — `google-genai`, raw text, system_instruction, temp=0; mocked-shape test (CI) + **live smoke green** (skips when no key) `[CP]`
- [x] **T15** ClaudeProvider — `anthropic` SDK, flattens text blocks; key-gated, mocked-shape only (untested vs live API)
- [x] **T16** ZaiProvider — OpenAI-compatible httpx (no extra dep); key-gated, mocked-shape only; README sponsor swap honest
- [ ] **T17** Tier 2 prompt (skills/ loaded) + runner `[CP]`
- [ ] **T18** Hallucination guard: regex extract + claim verify + pure label-drop fn `[CP]`
- [ ] **T19** Tier 2 precision iteration vs 20-set; tune prompt `[CP]`
- [ ] **T20** pipeline.py: Tier1→Tier2→guard→sign→IPFS pin→on-chain anchor→advance memoryRoot `[CP]`

## Week 4 — Query surfaces

- [ ] **T21** REST API: `/api/audit/{addr}`, `/api/feed`, `/api/cache`, `/api/queries`, `/api/health`
- [ ] **T22** x402 middleware — USDC on Base, EIP-3009 transferWithAuthorization, replay protection
- [ ] **T23** MCP server 3 tools (`auditContract`, `getAudit`, `requestAudit`) → publish npm
- [ ] **T24** On-chain `getAudit` read path wired FE + BE

## Week 5 — Demo agents + cache warmer

- [ ] **T25** MAINNET cutover (gate passes) — deploy 4 Path A contracts + DecisionLog to mainnet, wire Mantle-issued iNFT `[CP]`
- [ ] **T26** Deployer-agent — Demo 1: payForAudit → finding → decline + redeploy `[CP]`
- [ ] **T27** Trading-agent — Demo 2: getAudit → pause() backdoor → decline → decision-log tx `[CP]`
- [ ] **T28** Yield-agent — Demo 3: getAudit → clean → LB addLiquidity → decision-log tx `[CP]`
- [ ] **T29** Cache-warmer cron vs top-200 (Web3.py walker; Goldsky fallback) — deferrable
- [ ] Rehearse all three flows on Sepolia BEFORE re-pointing wallets at mainnet

## Week 6 — Frontend / dashboard (`docs/design.md` §13, 5-day plan)

- [ ] Day 1 — 7 primitives (StatusDot, Address, SeverityBadge, HonestyLabel, Sparkline, TxLink, Timestamp); CSS vars, fonts
- [ ] Day 2 — DeployFeedPanel + PriorityCachePanel; three-column shell
- [ ] Day 3 — AgentQueryPanel + HeroStrip + Sparkline; homepage feature-complete
- [ ] Day 4 — `/contract/:address` (FindingCard, AuditHistoryRow, Queried-by)
- [ ] Day 5 — `/agent/:tokenId`, `/audit/:rootHash`, `/judge` (6-step flow, demo triggers)
- [ ] Demo video record · README (thesis, Judge Quick Eval, contracts table, debug log)

## Week 7 — Buffer / distribution / submit

- [ ] Real-world testing fixes · README polish · post-mortem section
- [ ] Twitter thread · demo video edit · tweet agent-to-agent receipts
- [ ] Submit on DoraHacks

---

## Blocked / waiting

- T5 — MantleProof's own Mantle-issued ERC-8004 tokenId not yet known (assigned on hackathon registration); registry addresses themselves are resolved (T1b done)
- Agni Finance source structure unverified (resources.md §13.5 — verify Week 2 or defer to Tier 2)
- ~~Mantle Sepolia verify apiURL~~ RESOLVED 2026-05-19: `https://api-sepolia.mantlescan.xyz/api` (one Mantlescan key covers mainnet + Sepolia)

---

## Maintenance / deadlines

- [x] **CI actions off Node 20** — done 2026-05-18. Bumped
  `.github/workflows/ci.yml` to `actions/checkout@v6`, `pnpm/action-setup@v6`,
  `actions/setup-node@v6`, `actions/setup-python@v6` (all Node-24 runtime),
  ahead of GitHub's 2026-06-02 forced migration. Re-verify after the runner
  default flips on 2026-06-02.

---

## Decisions log (append-only)

- 2026-05-18 — Path B chosen as default (deploy our own EIP-8004 registries). Confirm/flip on T1.
- 2026-05-18 — **T1 RESOLVED → Path A.** Mantle auto-issues each agent's ERC-8004 identity NFT as an integrated hackathon feature; we do NOT deploy our own Identity Registry. `MantleProofAgent` becomes a thin wrapper over the official identity + calls the official Reputation Registry. Contracts: 7 → 4 (+DecisionLog). Supersedes the Path B default and the plan-file default.
- 2026-05-18 — **T1b RESOLVED.** Official ERC-8004 registries (canonical from github.com/erc-8004/erc-8004-contracts, verified live via eth_getCode): mainnet 5000 identity `0x8004A169…a432` / reputation `0x8004BAa1…9b63`; Sepolia 5003 identity `0x8004A818…BD9e` / reputation `0x8004B663…8713`. In `contracts/config/registries.ts`. No Validation Registry deployed (not needed).
- 2026-05-18 — **GeminiProvider is the default LLM** (user holds Gemini key only). Claude/Zai interface-complete + key-gated.
- 2026-05-18 — Testnet-first: develop on Mantle Sepolia (5003); mainnet (5000) for final deploy + all demo receipts.
- 2026-05-18 — x402 settles USDC on Base (Coinbase facilitator doesn't support Mantle).
- 2026-05-18 — Keep spec's 7-week cadence as reference; build at own pace, no up-front scope cuts.
- 2026-05-18 — pnpm workspaces for TS pkgs; `engine/` standalone Python.
- 2026-05-19 — **T4 fully done** — all 5 Sepolia contracts source-verified on sepolia.mantlescan.xyz via Etherscan API V2 (ETHERSCAN_API_KEY).
- 2026-05-19 — **T4 deploy + T6 gate ✅ on Mantle Sepolia.** 5 Path A contracts live; smoke-roundtrip green (submitAudit→getAudit→memoryRoot advanced). Week-1 gate passed. Verify deferred → Etherscan V1 shut down; **migrated explorer integration (hardhat verify + T9 resolver) to Etherscan API V2** (single etherscan.io key `ETHERSCAN_API_KEY`, chainId-routed, covers 5000+5003). `MANTLESCAN_API_KEY` now legacy/unused. Re-run verify once the V2 key is in `.env`.
- 2026-05-19 — **T2/T8/T9 done.** 8 Mantle-mainnet token addresses pinned (official docs + on-chain symbol/name/decimals verification; USDe/sUSDe are 18-dec ERC-20 despite OFT sharedDecimals=6; USDT0=6). Bytecode utils + pattern registry and Etherscan-compatible source resolver implemented; engine suite 17 pass / 12 skip, ruff clean. Sepolia explorer API base for T9 still to be confirmed Week 1 (same open item as hardhat verify).
- 2026-05-19 — **T13–T16 done (LLM provider layer).** Hardened the scaffold factory: `LLMProvider` is now `@runtime_checkable`; added `ProviderError` + `require_key` (clear, never echoes the key value). GeminiProvider implemented on `google-genai` (raw text, `system_instruction`, temperature=0 for determinism) — **live `gemini-2.5-pro` smoke test passed (~18s real round-trip)**; it skips automatically when `GEMINI_API_KEY` is absent so CI stays green without the secret. ClaudeProvider on the `anthropic` SDK (flattens text blocks → raw text); ZaiProvider via plain httpx against the OpenAI-compatible Z.ai endpoint (no extra dependency). Claude/Zai are interface-complete, key-gated, and shape-tested with mocked transport only — explicitly marked untested vs the live API (README sponsor narrative stays honest). All three satisfy the Protocol; every adapter raises `ProviderError` (not a generic crash) when its key is unset. Suite 58 pass / 2 skip offline; +1 live (network-gated). `reason()` returns raw text only — parser/guard remain provider-agnostic per CLAUDE.md.
- 2026-05-19 — **T12 done + Tier-1 precision hardened.** Built the Tier-1 union runner (`tier1.py`), an `eth_getCode` helper (`source/rpc.py`), and a live validation harness (`scripts/validate_tier1.py`); seeded `real_targets.json` from the T2-verified token map (provenance inherited). The first live run did its job — it exposed real false positives: the engine flagged the protocols' **own** token contracts (meth/usdy heuristics fired on any ERC20; replay fired on any ERC2612 `permit`; an empty-`EIP712Domain()` regex match on a correct OZ contract). Fixes: (1) **integration-handle gate** — a misuse finding now requires the contract to call *into* the protocol, not merely be ERC20-shaped/name it; (2) **self-target guard** — `run_tier1(address=…)` suppresses a protocol's checks when the audited address IS that protocol's token or known proxy impl; (3) **replay_check restructured** to the spec's canonical bugs (genuine EIP712Domain typehash modelling chainId but not reading block.chainid → HIGH; typehash omitting chainId → MED; bare permit/DOMAIN_SEPARATOR no longer qualifies). Result: 10/10 real verified protocol contracts → 0 findings (no FP storm) while 45 unit tests prove integrator misuse still fires; FP classes locked by `test_tier1_precision.py`. Also clears the deferred **T9-live** item — Etherscan API V2 source resolution confirmed working against Mantle mainnet. Open (non-blocking): extend `real_targets.json` with integrator/known-buggy targets (hand-curation, harness re-verifies each).
- 2026-05-19 — **T10 done.** Five Tier-1 check modules implemented as offline heuristics on comment-stripped source + bytecode address constants, sharing `checks/_common.py` (relevance gate via symbols/pinned-addrs/bytecode, idempotent T8 pattern registration). Per spec §4: usdy (rebase snapshot/oracle/1:1/blocklist), meth (balance-proportional/exchange-rate/cmETH/Validator-Queue), usde (sUSDe cooldown/1:1/depeg), dex (Merchant Moe LB **primary** bins/variable-fee + Uniswap V3 **secondary** slippage; **Agni deferred to Tier 2** — source unverified per §13.4), replay (block.chainid/typehash chainId/2300 gas). All Tier-1 vulnerability findings ship `ESTIMATED` (heuristic inference); directly-observed bytecode-address facts are evidence-only/`VERIFIED`-grade so negative fixtures stay genuinely clean. 12 fixtures + 17 tests; engine suite 35 pass / 2 skip (remaining = T18/T20 scaffolds); ruff + mypy clean.
- 2026-05-18 — **T3 done.** Path A contracts + 14 Hardhat tests. License split settles native MNT on Mantle on-chain (x402/USDC-on-Base stays the separate Week-4 surface). Tooling: hardhat-toolbox transitive deps (ethers/chai/hardhat-ethers/network-helpers) added as direct contracts devDeps (pnpm strict isolation); contracts tsconfig includes typechain-types + relaxes `noUncheckedIndexedAccess` (this pkg only); CI compiles before typecheck and runs contract tests.
