# MantleProof — TODO

Work the **★ Critical Path** block top-to-bottom. Week sections mirror
`docs/mantleproof.md` §9 and `docs/design.md` §13 (reference cadence — build at own
pace). `[CP]` = on the critical path to **D = three demos green on Mantle mainnet**.

---

## ★ Critical Path (do these first, in order)

- [ ] **T0**  Scaffold monorepo `[CP]`
- [ ] **T3**  Implement 7 contracts, Path B `[CP]`
- [ ] **T4**  Deploy + verify on Mantle Sepolia `[CP]`
- [ ] **T6**  smoke-roundtrip green on Sepolia (post → getAudit → advance memoryRoot) `[CP]`
- [ ] **T14** GeminiProvider working `[CP]`
- [ ] **T17** Tier 2 prompt + runner `[CP]`
- [ ] **T18** Hallucination guard  ⚠ HIGHEST RISK `[CP]`
- [ ] **T19** Tier 2 precision pass vs ~20-contract set `[CP]`
- [ ] **T20** pipeline.py end-to-end (Tier1→Tier2→guard→IPFS→anchor) `[CP]`
- [ ] **T25** MAINNET cutover (gate must pass — see below) `[CP]`
- [ ] **T26/T27/T28** three demo agents on mainnet  →  **DELIVERABLE D** `[CP]`

**Mainnet cutover gate (T25) — all must hold before any mainnet deploy:**
(a) T6 green on Sepolia · (b) T20 run end-to-end on Sepolia vs a Sepolia test target ·
(c) T19 precision acceptable · (d) Path A/B resolved · (e) `mantle_tokens.py` mainnet
column human-verified. Cutover = `MANTLE_NETWORK=mantle` + fresh deploy, not new code.

---

## Setup checklist (early Week 1) → see `docs/setup-checklist.md`

- [ ] Mantlescan API key applied (gates T2 / T9 / T4-verify)
- [ ] Pinata JWT obtained (gates T20 IPFS pin)
- [ ] Confirm wallets funded: MNT on Mantle mainnet, MNT on Mantle Sepolia, USDC on Base
- [ ] Railway project created · Vercel project created  *(accounts already held)*
- [ ] (optional) `ANTHROPIC_API_KEY` / `ZAI_API_KEY` — gate only key-gated provider smoke tests
- [ ] **T1** DoraHacks board post: does Mantle ship official ERC-8004 registries? (Path A vs B)

---

## Week 1 — Foundation & contracts

- [ ] **T0**  Scaffold monorepo (root, contracts, engine, mcp-server, frontend, agents) `[CP]`
- [ ] **T1**  Resolve Path A/B (DoraHacks) — async, default B
- [ ] **T2**  Pin `mantle_tokens.py` per-network maps (5000 real addrs verified, 5003 mostly None)
- [ ] **T3**  Implement 7 contracts + DecisionLog (Path B) `[CP]`
- [ ] **T4**  Deploy + verify on Mantle Sepolia (confirm Routescan verify endpoint) `[CP]`
- [ ] **T5**  Mint MantleProof agent iNFT (tokenId 1) on Sepolia
- [ ] **T6**  smoke-roundtrip green on Sepolia `[CP]`
- [ ] **T7**  Frontend wagmi reads registry (after T3 ABIs)

## Week 2 — Audit engine, Tier 1

- [ ] **T8**  Bytecode disasm (pyevmasm) + named pattern registry
- [ ] **T9**  Mantlescan source resolver (verification API client)
- [ ] **T10** 5 check modules + 2 fixtures each:
  - [ ] `usdy_check` (rebase snapshot, blocklist hook, oracle, USDY≠mUSD 1:1)
  - [ ] `meth_check` (L1/L2 distinction, exchange-rate not balance, cmETH conflation, Liquidity Buffer)
  - [ ] `usde_check` (sUSDe cooldown, 1:1 assumption, depeg)
  - [ ] `dex_check` — **Merchant Moe Liquidity Book v2.2 primary** (bins, ERC-1155, variable fee) + **Uniswap V3 secondary**; Agni verify-or-defer
  - [ ] `replay_check` (hardcoded chainId=1, missing chainId in domain sep, 2300 gas)
- [ ] **T11** Postgres models + alembic migrations (Audit, Contract, AgentQuery, DeployEvent)
- [ ] **T12** Tier 1 validation vs ~20 real mainnet targets (`fixtures/real_targets.json`)

## Week 3 — Tier 2 + hallucination guard  ⚠ highest-risk week, budget buffer

- [ ] **T13** `LLMProvider` Protocol + env factory
- [ ] **T14** GeminiProvider (DEFAULT, live-tested) `[CP]`
- [ ] **T15** ClaudeProvider (interface-complete, key-gated, mocked-shape test)
- [ ] **T16** ZaiProvider (interface-complete, key-gated, mocked-shape test)
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

- [ ] **T25** MAINNET cutover (gate passes) — deploy 7 + DecisionLog to mainnet, mint iNFT `[CP]`
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

- T1 — awaiting DoraHacks reply on Path A vs B (default B; T3 soft-blocked)
- Agni Finance source structure unverified (resources.md §13.5 — verify Week 2 or defer to Tier 2)
- Mantle Sepolia verify apiURL (Routescan vs Mantlescan) — confirm Week 1

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
- 2026-05-18 — **GeminiProvider is the default LLM** (user holds Gemini key only). Claude/Zai interface-complete + key-gated.
- 2026-05-18 — Testnet-first: develop on Mantle Sepolia (5003); mainnet (5000) for final deploy + all demo receipts.
- 2026-05-18 — x402 settles USDC on Base (Coinbase facilitator doesn't support Mantle).
- 2026-05-18 — Keep spec's 7-week cadence as reference; build at own pace, no up-front scope cuts.
- 2026-05-18 — pnpm workspaces for TS pkgs; `engine/` standalone Python.
