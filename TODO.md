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
- [x] **T17** Tier 2 prompt + runner ✅ — tightly-scoped grounded-JSON prompt, 6 real skills briefs, runner resolves source+bytecode+Tier1→provider raw text; 7 tests; live path proven (Gemini 503s are transient upstream, surfaced cleanly) `[CP]`
- [x] **T18** Hallucination guard ✅ — pure/provider-agnostic verify+mask+one-tier label-drop; per-kind corpus scoping (bytecode trusted only for long hex/addr); JSON→findings parser (no tool-use); 14 tests pin the invariant `[CP]`
- [x] **T19** Tier 2 precision pass ✅ — live full-path harness (run_tier2→parse→guard) vs verified-protocol set: 9/9 resolved, T1 0/9, T2 18 conservative source-cited findings, **no FP storm**, guard correctly wired into live path; gate cond (c) met `[CP]`
- [x] **T20** pipeline.py end-to-end ✅ — `run_audit` Tier1→Tier2→guard→assemble→keccak rootHash→IPFS→anchor; pure core + injectable seams, 10 tests (88-gate). **Live Sepolia run independently verified**: `DecisionLog` audit, rootHash `0x28415e30…f574`, IPFS `bafkrei…zov4`, tx `0xeca296b3…01bdc`, keccak(IPFS)==on-chain, oracle-signed, memoryRoot compounded (auditsPerformed→3). **Gate (b) SATISFIED ✅** `[CP]`
- [x] **T25** MAINNET cutover ✅ — 5 Path A contracts deployed + Etherscan V2 verified on Mantle mainnet 5000 (2026-05-19); post-deploy state-readback (16/16 wiring checks) independently confirms `oracleSigner=0x9f17…638a` (fresh, distinct from deployer — pre-flight caught identical-key SPOF), `agent.agentTokenId=96`, `identity.ownerOf(96)==deployer`, `agent.agentOwner()==deployer` (License 80/20 recipient resolves), bidirectional `registry↔agent` wiring; deployer 3.94→3.16 MNT spent (0.78 MNT) `[CP]`
- [ ] **T26/T27/T28** three demo agents on mainnet  →  **DELIVERABLE D** `[CP]`

**Mainnet cutover gate (T25) — all must hold before any mainnet deploy:**
(a) T6 green on Sepolia ✅ · (b) T20 end-to-end on Sepolia ✅ (real receipt, independently verified —
tx `0xeca296b3…01bdc`, keccak(IPFS)==on-chain rootHash, oracle-signed) ·
(c) T19 precision acceptable ✅ · (d) Path A/B resolved ✅ (Path A) · (e) `mantle_tokens.py` mainnet
column human-verified ✅ (T(e) 2026-05-19 — 8 addrs + 2 proxy impls re-verified on-chain @chainId 5000
+ official docs; 1 naming defect found & fixed: `METH_L1_STAKING`→`METH_L1_TOKEN`).
**ALL FIVE GATE CONDITIONS MET ✅** and both 2026-05-19 pre-flight operational blockers
now **RESOLVED**: (B1) deployer `0x2a30…605B6A` funded — **3.95 MNT on Mantle mainnet 5000**
(verified 2026-05-19); (B2) **T5 RESOLVED** — `MANTLEPROOF_AGENT_TOKEN_ID=96` (mainnet
ERC-8004 identity self-registered to `0x2a30…605B6A`, tx `0x3d810ca4…ea2a` block 95547770,
independently verified `ownerOf(96)==signer`, `balanceOf=1`, no duplicate) and set in `.env`.
**T25 COMPLETE 2026-05-19** ✅ — config-flip + fresh mainnet deploy executed.
Pre-flight surfaced an SPOF (`DEPLOYER_PRIVATE_KEY == ORACLE_SIGNER_PRIVATE_KEY` in `.env`
while `oracleSigner` is `immutable` on `MantleProofRegistry.sol:16`); generated a fresh
oracle key in-process (address `0x9f17…638a`, key never printed; `.env` chmod 600 and
gitignored) before signing. Post-deploy on-chain readback: 16/16 wiring checks pass.
Mainnet contracts (chainId 5000, all verified on Mantlescan via Etherscan V2):
  Registry  0x60E97c83Dd184D3B0812Ce25430e9D6930eD63aE
  Agent     0x966A385A7C56794E1Bb40C9F0f73cCDaA0724503
  Treasury  0x53459fb149CB1772ea389ACE325501DA2B28E437
  License   0x906390B3594384bE83F3465cFeDf8661f4d1a410
  Decision  0x1823359f0a5bB8b2af71a55200B08ECcCedFec6f

---

## Setup checklist (early Week 1) → see `docs/setup-checklist.md`

- [ ] **Etherscan API V2 key** (etherscan.io/myapikey) → `.env` `ETHERSCAN_API_KEY` — gates T9-live + T4-verify (V1 mantlescan key is dead)
- [x] **Pinata JWT** → `.env` `PINATA_JWT` ✅ — set; T20 live Sepolia pin+anchor succeeded & independently verified (cutover-gate (b) ✅)
- [x] Confirm wallets funded: MNT on Mantle mainnet ✅ **3.95 MNT** (verified 2026-05-19 post-funding), MNT on Mantle Sepolia ✅ (1946 MNT), USDC on Base ☐ (Week 4)
- [ ] Railway project created · Vercel project created  *(accounts already held)*
- [ ] (optional) `ANTHROPIC_API_KEY` / `ZAI_API_KEY` — gate only key-gated provider smoke tests
- [x] **T1** RESOLVED 2026-05-18 — Mantle auto-issues each agent's ERC-8004 identity NFT (integrated hackathon feature). **Path A**: do NOT deploy own Identity Registry.
- [x] **T1b** RESOLVED 2026-05-18 — official ERC-8004 registry addresses found + verified live (`eth_getCode`); in `contracts/config/registries.ts`. Identity+Reputation on 5000 & 5003 (no Validation needed).
- [x] **T5 RESOLVED 2026-05-19** — self-registered MantleProof's ERC-8004 identity on Mantle mainnet via canonical `IdentityRegistryUpgradeable`: **tokenId=96** owned by `0x2a30…605B6A` (tx `0x3d810ca4…ea2a` block 95547770, independently verified); `MANTLEPROOF_AGENT_TOKEN_ID=96` set in `.env`. (Sepolia rehearsal: tokenId=48, tx `0x9e9e214f…0ca92`.)

---

## Week 1 — Foundation & contracts

- [ ] **T0**  Scaffold monorepo (root, contracts, engine, mcp-server, frontend, agents) `[CP]`
- [x] **T1**  Path resolved → **Path A** (Mantle auto-issues ERC-8004 identity; no own registry)
- [x] **T1b** Official ERC-8004 registry addresses resolved + verified → `contracts/config/registries.ts`
- [x] **T2**  `mantle_tokens.py` pinned — 8 mainnet addrs from official docs, all verified on-chain (symbol/name/decimals + bytecode) 2026-05-19; 5003 None by design; +TOKEN_DECIMALS/IMPL, 3 tests
- [x] **T3**  Path A contracts implemented (MantleProofRegistry, MantleProofAgent wrapper, MantleProofLicense 80/20, TreasurySplit timelock, DecisionLog) + mocks + 14 tests green `[CP]`
- [x] **T4**  Sepolia deploy + verify ✅ (Registry 0x261a74…, Agent 0x60E97c…, Treasury 0xdE3698…, License 0x53459f…, DecisionLog 0x906390… — all source-verified, Etherscan V2) `[CP]`
- [x] **T5** ✅ Self-registered against Mantle's canonical ERC-8004 Identity Registry (permissionless `register()`): **mainnet tokenId=96** (tx `0x3d810ca4…ea2a`, block 95547770; `MANTLEPROOF_AGENT_TOKEN_ID=96` in `.env`). Wires into `MantleProofAgent` at T25 deploy. Sepolia rehearsal: tokenId=48.
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
- [x] **T17** Tier 2 prompt (skills/ loaded) + runner — `tier2/prompt.py` (numbered-source, grounded-claim JSON-only contract that feeds the T18 guard), 6 real skill briefs, `tier2/runner.py` (resolve→Tier1→prompt→provider raw text, offline-injectable); 7 tests `[CP]`
- [x] **T18** Hallucination guard: regex extract + claim verify + pure label-drop fn — `tier2/hallucination_guard.py` (`apply_guard` mask+drop, `parse_findings`); 14 tests `[CP]`
- [x] **T19** Tier 2 precision iteration vs verified-protocol set — `scripts/validate_tier2.py` live full-path harness + `validation/tier2_report.md`; verdict in `validation/README.md` `[CP]`
- [x] **T20** pipeline.py ✅ — `mantleproof/pipeline.py` (`run_audit` + pure `build_report`/`compute_root_hash`), `persistence/ipfs.py` (Pinata), `persistence/anchor.py` (web3 oracle-signed `submitAudit`); `scripts/run_pipeline_sepolia.py` single-run live harness + `validation/pipeline_sepolia_report.md`. Live Sepolia receipt independently verified (gate (b) ✅) `[CP]`

## Week 4 — Query surfaces

- [ ] **T21** REST API: `/api/audit/{addr}`, `/api/feed`, `/api/cache`, `/api/queries`, `/api/health`
- [ ] **T22** x402 middleware — USDC on Base, EIP-3009 transferWithAuthorization, replay protection
- [ ] **T23** MCP server 3 tools (`auditContract`, `getAudit`, `requestAudit`) → publish npm
- [ ] **T24** On-chain `getAudit` read path wired FE + BE

## Week 5 — Demo agents + cache warmer

- [x] **T25** MAINNET cutover ✅ (2026-05-19) — 5 Path A contracts deployed + Etherscan V2 verified on chainId 5000; oracle-signer rotated to fresh distinct key `0x9f17…638a` pre-deploy (caught + fixed an SPOF where deployer key == oracle key while `oracleSigner` is immutable); post-deploy state-readback 16/16 — `agent.agentTokenId=96`, `identity.ownerOf(96)==deployer`, `agent.agentOwner()==deployer`, `registry.agent↔agent.auditor` bidirectional; gas spent 0.78 MNT, 3.16 MNT remaining. Addrs in `contracts/deployments/mantle.addresses.json`. `[CP]`
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

- ~~T5 — BLOCKS T25~~ **RESOLVED 2026-05-19**: MantleProof's ERC-8004 identity
  self-registered against Mantle's canonical `IdentityRegistryUpgradeable` (tx
  `0x3d810ca4…ea2a` block 95547770; **tokenId=96** owned by `0x2a30…605B6A`; independently
  verified `ownerOf(96)==signer`, `balanceOf=1`, no duplicate; `MANTLEPROOF_AGENT_TOKEN_ID=96`
  set in `.env`). Sepolia rehearsal: tokenId=48 (tx `0x9e9e214f…0ca92`).
- ~~T25 — deployer not funded on mainnet~~ **RESOLVED 2026-05-19**: `0x2a30…605B6A` funded
  to **3.95 MNT on Mantle 5000** (covers register + cutover deploy comfortably).
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
- 2026-05-19 — **T17 done (Tier 2 prompt + runner).** `tier2/prompt.py`: a deliberately tight system prompt — JSON-only output, every `$`/`%`/hex/address claim must cite a numbered source line `L<n>` or a bytecode offset, only ADDITIONAL findings vs Tier-1, conservative labels — which is what makes the T18 guard cheap (CLAUDE.md risk note). Source is line-numbered so the guard can resolve a cited line. Filled the six `skills/` briefs with real, citable content (USDY/mUSD, mETH/cmETH, USDe/sUSDe, Merchant Moe LB, Uniswap V3, EIP-712 replay) grounded in docs/resources.md §2. `tier2/runner.py`: resolves verified source (T9) + bytecode (RPC, best-effort) + Tier-1 union (self-target guarded) + skills → builds prompt → provider RAW TEXT; returns the pre-guard artifact (raw_text + the inputs T18 verifies against). `unverified_source` short-circuits (Tier 2 needs source to ground claims). Offline-injectable (source/bytecode/provider params) → 7 tests, suite 65 pass / 2 skip. Live path proven end-to-end (resolve→Tier1→prompt→Gemini); intermittent `gemini-2.5-pro` 503s are transient upstream load and are surfaced cleanly as `ProviderError`, not a code fault.
- 2026-05-19 — **T13–T16 done (LLM provider layer).** Hardened the scaffold factory: `LLMProvider` is now `@runtime_checkable`; added `ProviderError` + `require_key` (clear, never echoes the key value). GeminiProvider implemented on `google-genai` (raw text, `system_instruction`, temperature=0 for determinism) — **live `gemini-2.5-pro` smoke test passed (~18s real round-trip)**; it skips automatically when `GEMINI_API_KEY` is absent so CI stays green without the secret. ClaudeProvider on the `anthropic` SDK (flattens text blocks → raw text); ZaiProvider via plain httpx against the OpenAI-compatible Z.ai endpoint (no extra dependency). Claude/Zai are interface-complete, key-gated, and shape-tested with mocked transport only — explicitly marked untested vs the live API (README sponsor narrative stays honest). All three satisfy the Protocol; every adapter raises `ProviderError` (not a generic crash) when its key is unset. Suite 58 pass / 2 skip offline; +1 live (network-gated). `reason()` returns raw text only — parser/guard remain provider-agnostic per CLAUDE.md.
- 2026-05-19 — **T12 done + Tier-1 precision hardened.** Built the Tier-1 union runner (`tier1.py`), an `eth_getCode` helper (`source/rpc.py`), and a live validation harness (`scripts/validate_tier1.py`); seeded `real_targets.json` from the T2-verified token map (provenance inherited). The first live run did its job — it exposed real false positives: the engine flagged the protocols' **own** token contracts (meth/usdy heuristics fired on any ERC20; replay fired on any ERC2612 `permit`; an empty-`EIP712Domain()` regex match on a correct OZ contract). Fixes: (1) **integration-handle gate** — a misuse finding now requires the contract to call *into* the protocol, not merely be ERC20-shaped/name it; (2) **self-target guard** — `run_tier1(address=…)` suppresses a protocol's checks when the audited address IS that protocol's token or known proxy impl; (3) **replay_check restructured** to the spec's canonical bugs (genuine EIP712Domain typehash modelling chainId but not reading block.chainid → HIGH; typehash omitting chainId → MED; bare permit/DOMAIN_SEPARATOR no longer qualifies). Result: 10/10 real verified protocol contracts → 0 findings (no FP storm) while 45 unit tests prove integrator misuse still fires; FP classes locked by `test_tier1_precision.py`. Also clears the deferred **T9-live** item — Etherscan API V2 source resolution confirmed working against Mantle mainnet. Open (non-blocking): extend `real_targets.json` with integrator/known-buggy targets (hand-curation, harness re-verifies each).
- 2026-05-19 — **T10 done.** Five Tier-1 check modules implemented as offline heuristics on comment-stripped source + bytecode address constants, sharing `checks/_common.py` (relevance gate via symbols/pinned-addrs/bytecode, idempotent T8 pattern registration). Per spec §4: usdy (rebase snapshot/oracle/1:1/blocklist), meth (balance-proportional/exchange-rate/cmETH/Validator-Queue), usde (sUSDe cooldown/1:1/depeg), dex (Merchant Moe LB **primary** bins/variable-fee + Uniswap V3 **secondary** slippage; **Agni deferred to Tier 2** — source unverified per §13.4), replay (block.chainid/typehash chainId/2300 gas). All Tier-1 vulnerability findings ship `ESTIMATED` (heuristic inference); directly-observed bytecode-address facts are evidence-only/`VERIFIED`-grade so negative fixtures stay genuinely clean. 12 fixtures + 17 tests; engine suite 35 pass / 2 skip (remaining = T18/T20 scaffolds); ruff + mypy clean.
- 2026-05-18 — **T3 done.** Path A contracts + 14 Hardhat tests. License split settles native MNT on Mantle on-chain (x402/USDC-on-Base stays the separate Week-4 surface). Tooling: hardhat-toolbox transitive deps (ethers/chai/hardhat-ethers/network-helpers) added as direct contracts devDeps (pnpm strict isolation); contracts tsconfig includes typechain-types + relaxes `noUncheckedIndexedAccess` (this pkg only); CI compiles before typecheck and runs contract tests.
- 2026-05-19 — **T18 done (hallucination guard — the credibility core).** `tier2/hallucination_guard.py`, pure and provider-agnostic (no LLM, no network). `apply_guard`: for each Tier-2 finding, regex-extract every `$`/`%`/hex/address claim from the free-text `finding` + `suggested_fix`, verify each against the contract source / bytecode / Tier-1 corpus, replace unverifiable claims with `[unsupported]`, and drop that finding's honesty label **exactly one tier — once per finding** regardless of how many of its claims were masked (VERIFIED→COMPUTED→…, LABELED floor). Inputs are not mutated; masked count surfaced publicly via `GuardOutcome.public_note` ("Hallucination guard fired: N masked"). **Verification is a plain normalised substring test** (lowercase; strip `$ % , 0x` + whitespace) — auditable, no fuzzy matching — and **corpus is scoped per claim kind**: long hex/addresses may be grounded in bytecode, but `$`/`%`/short-hex must hit source or Tier-1 (a 2–3 digit number trivially appears in any runtime hex blob and must never manufacture support). Added `parse_findings`: pure, provider-agnostic JSON-array→`CheckResult` parse that defensively strips a stray ```json fence and **never uses tool-use structured output** (CLAUDE.md); a malformed Tier-2 reply yields ZERO findings and never crashes the audit, bad severity/label coerce to conservative defaults (INFO / ESTIMATED). Replaced the skipped scaffold with **14 pure tests** pinning the invariant (supported passes label unchanged; unsupported masked + one-tier drop; one drop per finding even with N masked; LABELED floor; bytecode-grounded address supported; short number NOT falsely supported by bytecode; Tier-1-grounded supported; `suggested_fix` also guarded; inputs immutable). Engine gate: **78 passed / 1 skipped** (remaining skip = T20 pipeline scaffold), ruff + mypy clean. Did NOT relax or hide the guard. Next CP: T19 Tier-2 precision pass vs the ~20-contract set.
- 2026-05-19 — **T19 done (Tier-2 precision pass — mainnet-cutover-gate cond. c ✅).** Built `scripts/validate_tier2.py`, the live full-path harness (mirrors the T12 pattern): resolve verified source (T9) + bytecode (RPC) → `run_tier2` (Tier-1 union + skills + tightly-scoped prompt → **live Gemini**) → `parse_findings` → `apply_guard` — i.e. exactly the path the T20 pipeline will run. `_RetryingGemini` wraps the provider with exponential backoff then `gemini-2.5-flash` fallback so transient `gemini-2.5-pro` 503s (seen T14/T17) can't sink the run. Ran vs the verified-protocol set: **10 targets → 9 resolved+verified** (MOE `0x4515…` hit a transient Etherscan `ReadTimeout` — resolved fine in T12; harness survived and continued, which is itself the validated resilience property), **Tier-1 0/9** (self-target guard), **Tier-2 18 raw findings (1–3/contract)**, **guard masked 0 · label drops 0**. Verdict: **precision acceptable**. Reasoning (full analysis in `validation/README.md`, data in `validation/tier2_report.md`): (1) **no false-positive storm** — 1–3 conservative, source-line-cited, domain-relevant findings/contract (USDY blocklist-freezes-integrators + privileged arbitrary `burn`; L2cmETH/StakedUSDe vanilla-OFT forfeits/traps yield on a yield-bearing token; rUSDYW oracle-zero DoS + unwrap dust-lock — true, decision-relevant signals, not noise); (2) **masked=0 is the designed outcome, not a guard miss** — none of the 18 findings contains a `$`/`%`/hex/address literal because the tight T17 prompt drove the model to cite `L<n>` lines + named constants instead (CLAUDE.md: tighter prompt → less to mask); the guard *is* wired into the live path and its mask+one-tier-drop behaviour is independently proven by the 14 T18 unit tests on fabricated input. **Honest scope stated, not hidden:** the locked guard invariant covers `$`/`%`/hex/address only — `L<n>` citation accuracy and model-assigned labels are not yet machine-verified (a Tier-2 `[VERIFIED]` = "model asserted + emitted no maskable quantitative claim", not independently verified); deeper line/label verification is a documented non-blocking follow-up and the locked invariant is **not** silently expanded. Engine gate unchanged: 78 passed / 1 skipped, ruff + mypy clean (66 src files; harness is a dev script, not packaged — mirrors `validate_tier1.py`). Mainnet-cutover gate now: (a) T6 ✅ · (c) T19 ✅ · (d) Path A ✅ — remaining: (b) T20 end-to-end on Sepolia, (e) `mantle_tokens.py` mainnet column human-verified. Next CP: **T20** pipeline.py end-to-end.
- 2026-05-19 — **T20 done (engineering; cutover-gate (b) live-proven to rootHash, terminal step blocked on `PINATA_JWT`).** Implemented the orchestration: `mantleproof/pipeline.py` — pure network-free core `build_report` (assemble canonical report → `compute_root_hash` = `Web3.keccak` of sorted-key compact JSON; preimage excludes `root_hash`/`ipfs_cid`/`anchor_tx`, added after) + `_overall_severity` rollup, and `run_audit` wiring resolve→Tier-1→(Tier-2→`parse_findings`→`apply_guard`)→assemble→IPFS→anchor with **every network seam injectable** (`source`/`bytecode`/`provider`/`pin`/`anchor`/`do_anchor`/`now`) so the full path is offline-testable — same pure-test + live-harness split as T12/T19. `persistence/ipfs.py` Pinata `pinJSONToIPFS` (pure `_pin_payload`; **refuses to pin/anchor without `PINATA_JWT`** — never anchor a rootHash whose JSON nobody can fetch, CLAUDE.md). `persistence/anchor.py` web3 oracle-signed `submitAudit` (embedded minimal ABI — engine stays decoupled from `contracts/`; pure `severity_to_uint8` = Solidity Info/Low/Med/High 0–3; registry advances agent memoryRoot internally; oracle-signer is the only writer). Added `MANTLEPROOF_REGISTRY_ADDRESS` setting. Replaced the skipped scaffold test with **10 pure tests** (tier-1 offline, clean contract, deterministic+content-sensitive rootHash, keccak-of-preimage, tier-2 grounded no-mask, **tier-2 guard masks `$`+addr and drops ESTIMATED→EMULATED once**, malformed-LLM→0 findings, unverified-source degrade, severity-uint8, pin payload). **Engine gate: 88 passed (last skip gone), ruff + mypy clean (67 files).** Built `scripts/run_pipeline_sepolia.py` (2-phase live harness so a missing terminal cred can't mask the rest) + `validation/pipeline_sepolia_report.md`. **Live Sepolia run (2026-05-19):** target = our deployed `DecisionLog` `0x9063…a410` (source **verified on Etherscan V2 chainid 5003**) → **phase 1 OK fully live**: Tier-1 + **live Gemini Tier-2** (provider=gemini, 2 findings, severity medium) + guard (masked 0 / drops 0) + canonical rootHash `0xb77da68dcfbecd1214344bb54a19861d2fa79041039d47fa3e841ddbb4ed8f5c`. **Phase 2 BLOCKED**: `PINATA_JWT` unset → pipeline correctly fails loudly rather than anchoring an unfetchable rootHash. **Honest status: cutover-gate (b) is live-proven up to rootHash; the terminal IPFS-pin + on-chain anchor are blocked on `PINATA_JWT`** (an external setup credential the builder must supply — already an open setup-checklist item), **NOT marked ✅** until a real Sepolia receipt exists. Rerunning the harness once `PINATA_JWT` is set (and the Sepolia oracle is funded) completes (b) with **no code change**. Did NOT relax the IPFS/guard invariants, did NOT fake a receipt. Cutover gate: (a)✅ (c)✅ (d)✅ · (b) blocked-on-creds · (e) `mantle_tokens.py` mainnet column ☐. **Action required from builder: obtain `PINATA_JWT` (Pinata) → `.env`, then rerun `engine/scripts/run_pipeline_sepolia.py`.**
- 2026-05-19 — **T20 COMPLETE — cutover-gate (b) SATISFIED ✅ (real, independently-verified Sepolia receipt).** Builder supplied `PINATA_JWT`; reran the live harness. First run exposed a harness reporting defect (not a pipeline bug): the original **two-phase** design ran `run_audit` *twice* (a do_anchor=False proof run, then the real anchored run), so a fresh Gemini call + timestamp made phase-1's printed rootHash/severity diverge from what actually anchored — unacceptable for a trust artifact whose report must headline the on-chain rootHash. **Fixed:** rewrote `scripts/run_pipeline_sepolia.py` to a **single** `run_audit` call (one Gemini call); a `pin` wrapper captures the assembled report — which already carries its `root_hash` — *before* the network pin, so a missing terminal cred still records the live rootHash and the pipeline still fails loudly (never anchors an unfetchable rootHash). ruff/mypy/88-test gate unchanged. **Live Sepolia run (DecisionLog `0x9063…a410`, source verified on Etherscan V2 5003):** single run → tier=2, provider=gemini, 1 finding, severity `low`, guard masked 0; rootHash `0x28415e3069d563a42f68ea1f631602364e23ea742900ea4d11c5c72389c0f574`, IPFS `ipfs://bafkreiaccoixvbxfwjjpqvrlcwtd5bkkcjasyrvjnt7ryrgr5heu75zov4`, Sepolia `submitAudit` tx `0xeca296b3605c321ecbbec7250d0ce29a8c9b7486e563dbfb639cc19cafd01bdc`. **Independently re-verified by a separate off-pipeline web3/httpx reader** (not trusting the harness print): tx status 1 (block 38837152); `registry.getAudit(target)` rootHash + severity (1=Low) + ipfsCID all == the run; **submitter == the oracle signer** `0x2a30…605B6A` (only-writer invariant upheld); `MantleProofAgent.auditsPerformed` advanced 2→**3** (T6 smoke + 2 T20 runs); `memoryRoot` `0xab90…0e40` = compounded `keccak256(prev, rootHash)` (correctly ≠ rootHash — confirmed against `MantleProofAgent.updateMemoryRoot`, compounding-chain by design, not a bug); and **keccak256 of the pinned IPFS-JSON canonical preimage == pinned `root_hash` == on-chain rootHash** → the audit is independently verifiable end-to-end. Did NOT relax the IPFS/guard invariants, did NOT fake a receipt. **Cutover gate: (a)✅ (b)✅ (c)✅ (d)✅ — only (e) `mantle_tokens.py` mainnet column human-verification remains before T25 mainnet cutover.**
- 2026-05-19 — **T(e) done — cutover-gate (e) SATISFIED ✅; ALL FIVE gate conditions now met.** Independently re-verified the `mantle_tokens.py` chainId-5000 column two ways. **(1) On-chain (Mantle mainnet RPC, chainId 5000 confirmed):** all 8 tokens — USDY/mUSD/mETH_L2/cmETH/USDe/sUSDe/USDT0/MOE — return the expected `symbol()`/`name()`/`decimals()` with contract bytecode (USDT0=6 dec, rest 18; USDe/sUSDe `decimals()`=18 despite OFT sharedDecimals=6, confirming the docstring note); USDY & mUSD **EIP-1967 implementation storage slots == the pinned `TOKEN_IMPL`** addresses (`0x3b35…Ef66`, `0x907D…6271`). **(2) Official docs:** Ethena key-addresses page lists Mantle USDe `0x5d3a…ef34` / sUSDe `0x211C…e5d2` — **exact match** (resolves the search-engine red herring that surfaced the *Ethereum-canonical* `0x4c9e…`/`0x9d39…`, which are a different chain and correctly NOT used in the 5000 column); Ondo/Mantlescan confirm USDY + impl; Mantle + Merchant Moe + USDT0 docs confirm the rest. **All 8 addresses + both proxy impls correct — zero address changes.** Found & fixed **one real naming defect** (exactly what this gate exists to catch): `METH_L1_STAKING = 0xd5F7…ADfa` is the **Ethereum-L1 mETH ERC-20 token** (Etherscan "Mantle: mETH Token", symbol mETH; Mantle docs/Uniswap concur), NOT a staking contract — the address is correct for its real purpose (flagging L1↔L2 mETH conflation against the L2 token) but the name/comment were misleading and a latent trap. Renamed `METH_L1_STAKING`→`METH_L1_TOKEN` + pattern id `meth_l1_staking_v1`→`meth_l1_token_v1` in `mantle_tokens.py` + `meth_check.py` (the only refs; no test/fixture/serialized dependency), corrected the comment, and rewrote the module docstring to record this T(e) re-verification. Engine gate green: ruff + mypy (67 files) + **88 passed**. No address/data change to the verified column; pure clarity/correctness fix. **Cutover gate now (a)✅ (b)✅ (c)✅ (d)✅ (e)✅ — T25 mainnet cutover is fully unblocked (config flip `MANTLE_NETWORK=mantle` + fresh deploy, no new code).**
- 2026-05-19 — **T25 pre-flight — DEPLOY HELD, NO mainnet tx performed.** All five
  cutover-gate conditions are met, but the pre-flight surfaced two independent hard
  operational blockers (neither code-fixable): **(B1)** the deployer
  `0x2a3080AA52DE07702dd30b81cC97C3527e605B6A` (= the oracle signer; single shared key)
  holds **0.0 MNT on Mantle mainnet chainId 5000** — verified live against `rpc.mantle.xyz`;
  the deploy cannot broadcast (~0.4 MNT execution gas @ the current 50 gwei for ~8M gas,
  **plus** Mantle's L1 data fee for ~6 contract deploys — fund ~1–2 MNT). **(B2)**
  `MANTLEPROOF_AGENT_TOKEN_ID` (T5) is unset; `contracts/scripts/deploy.ts` silently
  defaults it to `0` (warn-only, then proceeds) but `MantleProofAgent.sol` declares
  `uint256 public immutable agentTokenId` — **set once in the constructor, no setter**. A
  wrong tokenId on the canonical mainnet record is correctable only by re-deploying
  `MantleProofAgent` → re-wiring `registry.setAgent`/`agent.setAuditor` → re-deploying
  `MantleProofLicense` (its constructor binds the agent address); and
  `identityRegistry.ownerOf(0)`/`reputationOf(0)`/`agentURI(0)` will revert (ERC-721
  nonexistent token) → the **License 80/20 split + identity reads are bricked**. So a
  `tokenId=0` mainnet deploy is a known-broken canonical stack, not "provisional".
  **Decision (user): pause T25 until T5 resolves** — obtain MantleProof's real
  Mantle-issued ERC-8004 tokenId (hackathon registration), set
  `MANTLEPROOF_AGENT_TOKEN_ID`, fund the deployer on mainnet, then do ONE clean canonical
  cutover deploy (still config-flip + fresh deploy, no new code). The five gate
  *conditions* remain ✅; T25 is operationally blocked on T5 + deployer mainnet funding.
  Per CLAUDE.md ("never deploy to Mantle mainnet outside the cutover gate") and the
  irreversibility of a canonical mainnet deploy, **no mainnet transaction was performed**.
- 2026-05-19 — **T5 unblock mechanism resolved + `register-identity.ts` added (no tx run).**
  Inspected the canonical ERC-8004 Identity Registry on Mantle via Etherscan V2: it's an
  ERC-1967 proxy (`0x8004A169…a432` mainnet / `0x8004A818…BD9e` Sepolia) → verified impl
  `IdentityRegistryUpgradeable` `0x7274e874ca62410a93bd8bf61c69d8045e399c02` (NFT
  "AgentIdentity/AGENT"). The "hackathon issues every agent an ERC-8004 identity" =
  Mantle deployed the canonical registry; identities are **self-minted, not pre-issued** —
  it has permissionless `register()` / `register(string agentURI)` / `register(string,tuple[])`
  → `uint256 agentId`, emits `Registered(agentId,agentURI,owner)`; no allowlist. Confirmed
  read-only that `0x2a30…605B6A` owns **0** identities on both 5000 & 5003 (nothing
  pre-minted). Whoever calls `register()` becomes `ownerOf(tokenId)` and thus the
  MantleProofLicense 80/20 recipient. Added `contracts/scripts/register-identity.ts`
  (Hardhat, typecheck-clean): idempotent (recovers an existing tokenId from the mint
  `Transfer(0x0→owner)` log instead of double-minting), signer = identity owner, captures
  the tokenId from the `Registered`/`Transfer` event + verifies `ownerOf`, prints the exact
  `.env` line, per-chain warning, and **refuses chainId 5000 without
  `CONFIRM_MAINNET_REGISTER=1`** (the tokenId binds immutably into `MantleProofAgent`).
  agentURI optional (mutable later via `setAgentURI`; bare `register()` fine). No tx was
  broadcast — the script is builder-run (Sepolia rehearsal → mainnet), same script + human
  trigger pattern as the live harnesses.
- 2026-05-19 — **T5 RESOLVED ✅ — MantleProof's mainnet ERC-8004 identity minted; both T25
  operational blockers cleared; T25 READY for cutover.** Builder funded `0x2a30…605B6A`
  to **3.95 MNT on Mantle mainnet 5000** (verified live; clears Blocker B1). Ran
  `register-identity.ts` Sepolia-first per the approved flow:
  **(rehearsal)** `--network mantleSepolia` → bare `register()`, tx
  `0x9e9e214f541a453ce76b6e6c2ecae52c6911cbdb8bbd6733003f5859d830ca92` (block 38840487),
  tokenId=**48** (throwaway, chainId 5003); the script's event parsing, `ownerOf`
  sanity-check, per-chain warning, and bare-register path all behaved correctly.
  **(mainnet)** with explicit user "GO" + `CONFIRM_MAINNET_REGISTER=1` (the script's
  hard-coded mainnet opt-in gate fired then accepted) + bare `register()` (URI deferred —
  mutable via `setAgentURI` post-T25/W4 once MCP+x402 endpoints exist) →
  `--network mantle`, tx `0x3d810ca493ab9fcb35a3b39196df28a2991af3d49b73c7eda811417e96f1ea2a`
  (block 95547770), **tokenId=96** on chainId 5000. **Independently verified** by a
  separate off-script web3 reader (not the harness): tx status **1**, `tx.from == signer`,
  `registry.ownerOf(96) == 0x2a30…605B6A`, `balanceOf(signer) == 1` (no duplicate),
  `tokenURI(96) = ""` (as expected, bare register), NFT `AgentIdentity/AGENT` — the
  identity exists on Mantle mainnet, owned by MantleProof's canonical signer, with no
  collisions. Set `MANTLEPROOF_AGENT_TOKEN_ID=96` in repo-root `.env` (gitignored, not
  committed). Clears Blocker B2. **Cutover state: all 5 gate conditions ✅ + both pre-flight
  operational blockers ✅ — T25 is now operationally READY** (single config-flip
  `MANTLE_NETWORK=mantle` + fresh deploy of 4 Path A contracts + DecisionLog, no new
  code). Per the established pattern, T25 will NOT be initiated without explicit user
  "start T25" — the next mainnet write is the deploy itself.
- 2026-05-19 — **T25 DONE — MantleProof is live on Mantle mainnet.** User authorized
  "start T25"; pre-flight (`scripts/_preflight-t25.ts`, read-only) caught a real SPOF
  before any tx: `DEPLOYER_PRIVATE_KEY` and `ORACLE_SIGNER_PRIVATE_KEY` in `.env` were
  byte-identical, while `MantleProofRegistry.sol:16` declares `address public immutable
  oracleSigner;` (no setter — same shape as `agentTokenId`). Baking that in would mean
  compromising the deployer hot wallet = compromising the audit-attestation key with no
  on-chain rotation, contradicting CLAUDE.md's "oracle-signer is the only writer to
  `submitAudit`. Public read, signed write." credibility property. Surfaced the choice
  to the user; user opted to fix pre-deploy. Generated a fresh secp256k1 key in-process
  via `eth_account.Account.create()`, wrote it directly to `.env` (regex-replace), printed
  ONLY the public address `0x9f17b625902B0d35a02fd790aF45cf95e9F4638a` — the private key
  never appeared in any tool output (one earlier disclosed key was burned and discarded).
  `.env` permissions tightened to `0600` and gitignored confirmed. Re-ran pre-flight:
  `oracleDistinct: true`, deployer 3.94 MNT, `identity.ownerOf(96)==deployer`, no prior
  `deployments/mantle.addresses.json` — clean. **Deploy** (`scripts/deploy.ts --network
  mantle`): 5 contracts mined on chainId 5000:
    `MantleProofRegistry` `0x60E97c83Dd184D3B0812Ce25430e9D6930eD63aE`
    `MantleProofAgent`    `0x966A385A7C56794E1Bb40C9F0f73cCDaA0724503` (identity, reputation, tokenId=96, owner)
    `TreasurySplit`       `0x53459fb149CB1772ea389ACE325501DA2B28E437`
    `MantleProofLicense`  `0x906390B3594384bE83F3465cFeDf8661f4d1a410` (auditPrice 0.5 MNT, subPrice 5 MNT)
    `DecisionLog`         `0x1823359f0a5bB8b2af71a55200B08ECcCedFec6f`
  with bidirectional `registry.setAgent(agent)` + `agent.setAuditor(registry)`. **Post-deploy
  state-readback** (`scripts/_postdeploy-t25.ts`, independent of the deploy script's
  console.table — same T20-style discipline): 16/16 wiring checks pass on-chain —
  `registry.oracleSigner==0x9f17…638a` (fresh, distinct), `registry.agent==Agent`,
  `agent.auditor==Registry` (bidirectional), `agent.identityRegistry==0x8004A169…a432`,
  `agent.reputationRegistry==0x8004BAa1…9b63` (both = official 5000 canonical),
  `agent.agentTokenId==96`, `identity.ownerOf(96)==deployer`, **`agent.agentOwner()==
  deployer`** (the License's 80/20 recipient resolves — proves the immutability concern
  from B2 truly cleared), `license.{agent,treasury,auditPrice,subscriptionPrice}` correct,
  all four contract owners == deployer. (Surfaced one ABI guess defect in the postdeploy
  reader during execution — `subPrice()`/`ownerOf()` → real names `subscriptionPrice()`/
  `agentOwner()` — fixed and reverified; the underlying on-chain state was always right.)
  **Etherscan API V2 verification** (chainid 5000, single `ETHERSCAN_API_KEY`): all 5
  contracts publicly verified on `mantlescan.xyz/address/<addr>#code`. Gas: 3.94 → 3.16
  MNT (**0.78 MNT spent**) — healthy buffer for T26/T27/T28. Did NOT run mainnet
  smoke-roundtrip (avoid polluting the canonical registry with a non-real first attestation
  — first mainnet `submitAudit` will come from a real demo target in T26). Did NOT weaken
  the hallucination guard / honesty labels; did NOT broadcast a smoke audit pre-T26.
  **MantleProof is now operationally live on Mantle mainnet 5000.** Critical path
  remaining: T26/T27/T28 demo agents → DELIVERABLE D.
