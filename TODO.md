# MantleProof — TODO

Work the **★ Critical Path** block top-to-bottom. Week sections mirror
`docs/mantleproof.md` §9 and `docs/design.md` §13 (reference cadence — build at own
pace). `[CP]` = on the critical path to **D = three demos green on Mantle mainnet**.

---

## ★ Critical Path (do these first, in order)

- [ ] **T0**  Scaffold monorepo `[CP]`
- [x] **T3**  Path A contracts implemented + 14 Hardhat tests passing (CI runs them) `[CP]`
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
(c) T19 precision acceptable · (d) Path A/B resolved ✅ (Path A) · (e) `mantle_tokens.py` mainnet
column human-verified. Cutover = `MANTLE_NETWORK=mantle` + fresh deploy, not new code.

---

## Setup checklist (early Week 1) → see `docs/setup-checklist.md`

- [ ] Mantlescan API key applied (gates T2 / T9 / T4-verify)
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
- [ ] **T4**  Deploy + verify on Mantle Sepolia (verify endpoint confirmed: api-sepolia.mantlescan.xyz) `[CP]`
- [ ] **T5**  Obtain MantleProof's Mantle-issued ERC-8004 identity tokenId; wire it into `MantleProofAgent` (no self-mint under Path A)
- [ ] **T6**  smoke-roundtrip green on Sepolia `[CP]`
- [ ] **T7**  Frontend wagmi reads registry (after T3 ABIs)

## Week 2 — Audit engine, Tier 1

- [x] **T8**  Bytecode disasm (pyevmasm) + pattern registry — disasm/iter_pushes/find_address_constants/find_selectors/pushes_value/has_opcode + registry + chainId heuristic; 7 tests
- [x] **T9**  Source resolver — Etherscan-compatible client (per-chain base URLs, proxy follow, double-brace standard-json parser); pure parser unit-tested (5 tests); live call gated on MANTLESCAN_API_KEY
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
- 2026-05-19 — **T2/T8/T9 done.** 8 Mantle-mainnet token addresses pinned (official docs + on-chain symbol/name/decimals verification; USDe/sUSDe are 18-dec ERC-20 despite OFT sharedDecimals=6; USDT0=6). Bytecode utils + pattern registry and Etherscan-compatible source resolver implemented; engine suite 17 pass / 12 skip, ruff clean. Sepolia explorer API base for T9 still to be confirmed Week 1 (same open item as hardhat verify).
- 2026-05-18 — **T3 done.** Path A contracts + 14 Hardhat tests. License split settles native MNT on Mantle on-chain (x402/USDC-on-Base stays the separate Week-4 surface). Tooling: hardhat-toolbox transitive deps (ethers/chai/hardhat-ethers/network-helpers) added as direct contracts devDeps (pnpm strict isolation); contracts tsconfig includes typechain-types + relaxes `noUncheckedIndexedAccess` (this pkg only); CI compiles before typecheck and runs contract tests.
