# MantleProof — Full Build Plan

**One-sentence thesis:** MantleProof is the on-chain audit oracle for Mantle's agentic economy — other agents query it before touching a contract, get back a structured safety signal in under a second, and route their behavior accordingly.

**Track:** AI DevTools (Phase 2, AI Awakening)

**Builder:** Emark, solo

**Submission window:** May 1 → June 15, 2026. Demo Day July 2–3.

---

## 1. The mental model

Three layers, each a defensible piece of the submission:

**Layer 1 — The audit engine.** Five Mantle-specific audit dimensions (USDY/mUSD, mETH-bridged-L2, Ethena USDe/sUSDe, Liquidity Book DEX bugs, EIP-712 chain-ID replay), each implemented as a discrete check module. Tier 1 = heuristic + bytecode pattern matching (cheap, runs everywhere). Tier 2 = full Claude reasoning pass with the skills directory loaded (paid, posted on-chain with provenance). Note: the DEX check is purpose-built for Merchant Moe's **Liquidity Book v2.2** (bin architecture, ERC-1155 LP tokens, constant-sum within bins) — *not* Uniswap V3 tick math. A secondary Uniswap V3 check applies to Uniswap's official Mantle deployment.

**Layer 2 — The oracle interface.** Three query surfaces, same backend: on-chain `MantleProofRegistry.getAudit(address)` for agents that live on Mantle, MCP server for off-chain agents (Claude/Cursor users, autonomous TypeScript agents), and an x402 paywall endpoint for any HTTP caller. All three return the same JSON structure with the same honesty labels. The x402 paywall settles in USDC on **Base** (because Coinbase's hosted x402 facilitator doesn't support Mantle yet — Base/Polygon/Arbitrum/World/Solana only); audit registry, iNFT identity, and license contracts live on Mantle. Cross-chain provenance is fine: the audit record on Mantle references the contract address being audited, not the payment chain. Self-hosted Mantle facilitator is roadmap.

**Layer 3 — The agent-to-agent demo.** Three live agents on stage running real x402 / on-chain flows: a deployer agent that pays for a pre-deploy audit, a trading agent that declines a swap based on a MantleProof finding, a yield agent that approves a deposit based on a MantleProof finding. Each flow is one on-chain transaction the judges can verify.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       OTHER AGENTS (on-chain)                       │
│  TradingAgent     YieldAgent     DeployerAgent     Wallet integrations
│       │               │                │                  │          │
└───────┼───────────────┼────────────────┼──────────────────┼──────────┘
        │ getAudit()    │ getAudit()     │ requestAudit()   │ getAudit()
        ▼               ▼                ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    MantleProofRegistry (Mantle mainnet)             │
│         reports[address] → { rootHash, severity, timestamp, ... }   │
└───────┬─────────────────────────────────────────────────────────────┘
        │                                       ▲
        │ read-only                             │ writes audit results
        │                                       │ (only oracle signer)
        ▼                                       │
┌─────────────────────────────────────────────────────────────────────┐
│                    MantleProof Off-chain Engine                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Triage Layer                                               │    │
│  │   • Top-200 cache refresher (cron, daily)                   │    │
│  │   • On-demand audit queue (paid)                            │    │
│  │   • Deploy-feed listener (visual only, not audited)         │    │
│  └────────────┬────────────────────────────────────────────────┘    │
│               │                                                      │
│               ▼                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Audit Engine                                                │    │
│  │   Tier 1: heuristic checks (5 dimensions, bytecode + source)│    │
│  │   Tier 2: Claude reasoning pass + skills directory          │    │
│  │   Hallucination guard (every $/% claim must trace to data)  │    │
│  └────────────┬────────────────────────────────────────────────┘    │
│               │                                                      │
│               ▼                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Persistence Layer                                           │    │
│  │   • Postgres (audit cache, contract index, agent queries)   │    │
│  │   • IPFS (full report JSON pinned)                          │    │
│  │   • On-chain anchor (rootHash + severity to Registry)       │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                       ▲
                                       │
┌──────────────────────────────────────┴──────────────────────────────┐
│                          Query Surfaces                              │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│   │ REST + x402  │    │  MCP server  │    │  On-chain getAudit() │  │
│   │ (Base USDC)  │    │   (stdio)    │    │  on Mantle mainnet   │  │
│   └──────────────┘    └──────────────┘    └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

**Tech stack:**

- Smart contracts: Solidity 0.8.28, Hardhat, OpenZeppelin v5, deployed to Mantle mainnet (Chain ID 5000)
- Backend: Python 3.11, FastAPI, Web3.py, SQLAlchemy + Postgres, Redis for the audit queue
- Frontend: React + Vite, wagmi v2, viem (Mantle config), Tailwind, Bloomberg-terminal aesthetic
- LLM: `LLMProvider` interface, `ClaudeProvider` as default, `ZaiProvider` as a configurable alternative (real adapter, env-var swap)
- MCP server: TypeScript, `@modelcontextprotocol/sdk`, packaged as `npx mantleproof-mcp`
- x402: HTTP 402 middleware, USDC settlement on **Base** via Coinbase's hosted facilitator (Mantle not yet supported by public facilitator), signature-verified receipts mirrored to Mantle
- Infra: single $20/month VPS for the engine + Postgres + Redis, Vercel for frontend, Railway/Fly for the engine if scaling matters

**Why this stack matches you:** Same shape as MemeGuard and zkFabric. Python backend + React frontend + Solidity contracts is your fluent stack. The new pieces (MCP server, x402 middleware) are small TypeScript additions.

---

## 3. Contracts to deploy

Contract structure depends on an open question (see Section 13.1): does Mantle ship official ERC-8004 registries that hackathon agents register against, or do we deploy our own? Two paths.

**Path A — Mantle ships official ERC-8004 registries.** We register MantleProof as an agent against them. Four MantleProof-specific contracts to deploy on Mantle mainnet:

| Contract | Purpose | LOC budget |
|---|---|---|
| `MantleProofRegistry.sol` | Append-only audit registry. `submitAudit(target, severity, rootHash, ipfsCID)` callable only by the oracle signer. `getAudit(target)` view function. Public read, signature-bound write. | ~150 |
| `MantleProofAgent.sol` | Thin wrapper around the official ERC-8004 Identity NFT. Tracks per-audit `memoryRoot` advances, `auditsPerformed` counter, `reputation` score. Calls into official Reputation Registry on every audit. | ~120 |
| `MantleProofLicense.sol` | Pay-per-audit and subscription licenses. `mintLicense(licensee, expiresAt)`, `payForAudit(target)`. Auto-splits 80/20 to iNFT owner / treasury. **USDC-settled on Base** via x402 facilitator; mirror tx anchored on Mantle. | ~180 |
| `TreasurySplit.sol` | Receives the 20% treasury share, multi-sig timelock for any withdrawal. Minimal. | ~80 |

**Path B — No official ERC-8004 on Mantle, we deploy the registries ourselves.** This is *stronger* for the submission narrative because we become not just a participant in Mantle's agent economy but the **infrastructure provider for it** — MantleProof ships the trust layer everyone else builds on. Seven contracts total:

| Contract | Purpose | LOC budget |
|---|---|---|
| `IdentityRegistry.sol` | EIP-8004 Identity Registry — ERC-721 with URIStorage, one tokenId per agent on Mantle. Open for anyone to register their agent. | ~180 |
| `ReputationRegistry.sol` | EIP-8004 Reputation Registry — standardized feedback signals between agents. | ~150 |
| `ValidationRegistry.sol` | EIP-8004 Validation Registry — cryptographic/economic verification of agent work. Minimal v1; designed for extensibility. | ~120 |
| `MantleProofRegistry.sol` | (as Path A) | ~150 |
| `MantleProofAgent.sol` | MantleProof's own entry in IdentityRegistry as tokenId 1, with reputation hooks. | ~80 |
| `MantleProofLicense.sol` | (as Path A) | ~180 |
| `TreasurySplit.sol` | (as Path A) | ~80 |

The Path B registries are deliberately written to match the EIP-8004 spec exactly so other hackathon teams can register their agents against them. We open the contracts MIT-licensed with a "deploy your own agent here" guide in the README. That's the BGA/public-good framing in concrete form.

Defaults assumption: **Path B**. We'll confirm with DoraHacks early in Week 1; if Mantle provides registries, we collapse to Path A.

The deployer-agent, trading-agent, and yield-agent for the demos are TypeScript scripts with their own wallets, not contracts. They call `payForAudit`, `submitAudit`, `getAudit` from outside.

**Why ERC-8004 (either path):** The hackathon explicitly issues ERC-8004 identity NFTs to participating agents. Building on the standard is table stakes. Path B raises the ceiling by making us the standard's first concrete deployment on Mantle.

**Why 80/20:** Mirrors LPLens, mirrors the OpenAI marketplace cut, signals to VC judges that we've thought about the long-term cap-table of an agent-owned protocol.

---

## 4. The five audit dimensions (concrete spec)

Each one is a Python module under `engine/checks/`. Each ships with at least one synthetic positive fixture and one negative fixture (test contracts that should/shouldn't trigger the check). All five run in Tier 1; Tier 2 adds Claude reasoning on top of the union of their outputs.

### 4.1 `usdy_check.py` — USDY/mUSD integration correctness

- Detects USDY/mUSD address constants in bytecode (their Mantle deployment addresses, verified at build time)
- Flags: balance-snapshot accounting (`balanceOf(x)` cached then reused after a state transition, missing the rebase), missing blocklist awareness (no path that handles `beforeTransfer` revert), use of a non-`RWADynamicRateOracle` price feed, treating USDY and mUSD as 1:1 fungible

### 4.2 `meth_check.py` — mETH staking & bridge accounting

- **Critical L1/L2 distinction:** mETH's canonical staking contracts (`Staking`, `UnstakeRequestsManager`, `Oracle`) live on Ethereum L1 at `0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa` and surrounding addresses. On Mantle L2, mETH exists as a bridged wrapped representation. The Mantle L2 mETH address must be pinned in `engine/config/mantle_tokens.py` at build time (verified against Mantle's official token list and Mantlescan).
- Detects bridged-mETH address constants in bytecode
- Flags: balance-based proportional accounting (`mETH.balanceOf(x) / totalSupply * X` — wrong because mETH accrues via exchange rate, not balance changes), missing exchange-rate read (must call the L1 Oracle bridged read or accept a recent exchange-rate snapshot), assumption that bridged mETH on Mantle L2 has the same liveness as L1 mETH (it doesn't — bridge lag matters), missing handling for the post-2025-10 Liquidity Buffer (redemption routes through Aave; vault contracts assuming Validator Queue exit timing are wrong)
- Also flags conflation of mETH with **cmETH** (restaked variant, different oracle, different risk profile)

### 4.3 `usde_check.py` — Ethena USDe/sUSDe quirks

- Detects USDe and sUSDe address constants
- Flags: vault contracts that integrate sUSDe without cooldown-aware redemption logic, assumptions of 1:1 USDe/sUSDe convertibility, missing depeg-event handling

### 4.4 `dex_check.py` — Merchant Moe Liquidity Book LP bugs (primary) + Uniswap V3 (secondary)

**Critical correction from the original spec:** Merchant Moe is *not* Uniswap V3. It runs **Liquidity Book v2.2** (forked from Trader Joe / LFJ), with completely different semantics. Different bug surface, different check logic.

**Liquidity Book primary checks:**
- Detects Merchant Moe LB router, factory, and pair interface signatures in bytecode
- LB uses discrete **bins** (not ticks) with **constant-sum** (x + y = k) within a bin; LP positions are **ERC-1155** tokens, not ERC-721
- Flags: bin-id validation missing on mint/burn (positions can be misassigned to wrong bins), incorrect handling of LB's variable fee tier (driven by a volatility accumulator — naive code reads a static fee and gets the math wrong), ERC-1155 transfer hooks that don't account for LB position semantics, fee-collection paths that assume Uniswap V3-style accumulation (LB pays fees out per-swap, not per-tick-crossing), JIT-frontrun-mintable LP without bin-range bounds checks
- Also flags the "Concentrated Incentives" hook (first-ever LB hook, Mantle-native): incentive-range misconfiguration that pays liquidity providers at price ranges the active bin can't reach

**Uniswap V3 secondary checks (also on Mantle, ~$250K UNI grant deployment):**
- Detects Uniswap V3 factory, router, NPM interface signatures
- Flags: standard V3 issues — frontrun-mintable LP positions (mint without slippage check), tick-spacing validation missing, fee-tier misreads, range-rebalancing logic that doesn't account for in-range vs out-of-range fees correctly
- Standard tick math applies here (unlike LB)

**Agni Finance (secondary, verify at build time):** Agni's source needs verification before writing checks — likely Uniswap V3-style but unconfirmed. If V3-equivalent, the V3 checks above cover it. If forked with quirks, document them as a third sub-check.

### 4.5 `replay_check.py` — EIP-712 chain-ID and cross-chain replay

- Parses EIP-712 domain separators from bytecode and storage
- Flags: hardcoded `chainId = 1` (Ethereum mainnet copy-paste, the most common bug in forked code), missing chain-ID in domain separator, signature reuse across chains
- Also flags suspicious gas constants (e.g., hardcoded `2300` gas for ETH transfer that breaks on certain L2 transfer paths)

Each check returns:

```json
{
  "check_id": "usdy_check_v1",
  "severity": "high|medium|low|info",
  "label": "VERIFIED|COMPUTED|ESTIMATED|EMULATED|LABELED",
  "finding": "Human-readable finding",
  "evidence": { "bytecode_offset": "...", "matched_pattern": "..." },
  "suggested_fix": "..."
}
```

The five honesty labels are LPLens's idea, and we steal it directly because it is the single best move for VC-judge trust.

---

## 5. Tier 2 reasoning pass

Tier 2 is what makes the project win the "AI" half of "AI DevTools." Spec:

1. Load the contract source (from Mantle Explorer's verification API), the contract bytecode, the deployer's history (last 50 deployments), the Tier 1 union of findings, and a `skills/` directory containing markdown briefs on each Mantle ecosystem protocol (USDY beforeTransfer hook, mETH exchange-rate accounting, sUSDe cooldown, etc.)
2. Send to Claude (or Z.ai) with a tightly scoped prompt: "Given this contract and the Tier 1 findings, identify any *additional* ecosystem-integration bugs that the Tier 1 checks missed. Return JSON only. Every `$` and `%` claim must reference a specific line of the source or a specific bytecode offset."
3. **Hallucination guard:** Before posting on-chain, every `$` / `%` / hex / address claim in the Claude output is regex-extracted and verified against the source / bytecode / Tier 1 findings. Unverifiable claims get masked `[unsupported]` and the finding's label drops one tier (`VERIFIED → COMPUTED`, etc.) before the report is signed and anchored. This is LPLens's AT-4 pattern and it is the single most credibility-purchasing piece of the engineering.
4. Final report: JSON, pinned to IPFS, rootHash + severity anchored to `MantleProofRegistry`, iNFT `memoryRoot` advanced via `updateMemoryRoot(rootHash)`.

LLM provider abstraction sketch:

```python
# engine/llm/provider.py
class LLMProvider(Protocol):
    def reason(self, prompt: str, system: str) -> str: ...

class ClaudeProvider(LLMProvider): ...
class ZaiProvider(LLMProvider): ...
class OpenAIProvider(LLMProvider): ...   # roadmap, not built

# Selected by env: AUDIT_LLM_PROVIDER=claude (default)
```

Both Claude and Z.ai adapters are real and tested. The README notes Z.ai support with a single-env-var swap and credits the sponsor.

---

## 6. Triage and targeting

Three modes, all sharing the same audit engine:

**Mode A — Top-200 cache warmer (daily cron):** Pull the top-200 Mantle contracts ranked by 30-day interaction volume. Build-time decision on data source: Dune via API (pay-per-query, free tier), Goldsky subgraph (has Mantle support), or a custom Web3.py walker over recent blocks (slowest, free, fewest dependencies). Default for hackathon: Web3.py walker — no external dependency, works offline, fits a solo build. Switch to Goldsky in Week 5 if the walker's too slow. Audit each at Tier 1 if not already audited or if last audit is >7 days old. Anchor on-chain. Cost is bounded: ~200 audits × ~$0.05 in MNT gas per anchor ≈ $10 one-time, refresh-only on changes.

**Mode B — On-demand audit queue:** When an agent calls `requestAudit(target)` (paid via `payForAudit` in USDC) or hits the x402 endpoint, the engine processes the request, runs Tier 2 if the payment is sufficient, and anchors the result. Cached for everyone else after.

**Mode C — Deploy feed visualizer:** Subscribe to Mantle's pending-block stream, log every `CREATE` / `CREATE2`, show it in the dashboard's side panel. **Not audited** unless promoted into the cache (volume spike) or paid for. Honest UI: most rows are greyed out with a "not in priority cache" tag. This keeps the dashboard moving for screenshots without lying about what we're doing.

The triage layer is just a Python module with three entrypoints (`refresh_cache`, `process_paid_request`, `log_deploy`). Redis holds the queue.

---

## 7. The three agent demos (the actual headline)

This is what the demo video and the live Demo Day stream show. Three flows, three on-chain receipts.

**Demo 1 — Pre-deploy audit.** Deployer-agent (a TypeScript script with its own wallet) wants to deploy a new yield vault. Before broadcasting, it calls `payForAudit(targetCode)` against the to-be-deployed bytecode. MantleProof returns a Tier 2 finding flagging a sUSDe cooldown issue. Deployer-agent reads the finding, decides to fix and redeploy. On-chain receipt: the `payForAudit` tx and the `submitAudit` tx.

**Demo 2 — Pre-swap safety check.** Trading-agent (a separate TypeScript script with its own wallet) is about to swap into a fresh meme token. Before swapping, it calls `getAudit(tokenAddress)`. MantleProof returns a high-severity finding: the token has a `pause()` backdoor. Trading-agent logs the refusal, posts a tx to a "decisions" log contract proving the decision was made on MantleProof's data. On-chain receipt: the `getAudit` read (free, but logged) and the decision-log tx.

**Demo 3 — Pre-deposit yield approval.** Yield-agent is about to deposit mETH into a Merchant Moe Liquidity Book position (specifically into a bin range, since LB uses bins not ticks — and an ERC-1155 LP receipt, not ERC-721). Calls `getAudit(poolAddress)`. MantleProof returns a clean Tier 1 + Tier 2 report. Yield-agent deposits. On-chain receipt: the `getAudit` read, the LB `addLiquidity` tx, the decision-log tx referencing the audit rootHash.

All three agent wallets and decision logs are pre-built and live on Mantle mainnet by Demo Day. The Demo Day video walks through all three flows, showing the dashboard's audit tape updating in real time, the agents on-stage transacting against MantleProof, and the Mantle Explorer receipts.

This is the Slopstock AUDIT→ORCL moment, replicated three times, all involving MantleProof as the audit oracle. **Three agent-to-agent interactions, none of them human-in-the-loop.** That's Four.meme rule #2 (multi-agent dynamics) executed concretely.

---

## 8. Sponsor / track capture map

The track is AI DevTools, so prize-bucket-wise we're going for one bucket. But we want soft positive signals for as many panelists as possible without diluting the build. Map:

| Panelist / sponsor | What lights them up | Where it appears |
|---|---|---|
| Mantle (Mantle Labs, Mantle ecosystem leads) | Mantle-specific audit dimensions (USDY, mETH, USDe, MerchantMoe/Agni) | Five-dimension audit engine, README "why Mantle" section |
| ERC-8004 / Virtuals Protocol | Agent identity NFT with compounding memoryRoot | `MantleProofAgent.sol`, every audit advances `memoryRoot` |
| Z.ai | Real LLM provider adapter | `engine/llm/zai.py`, README notes single-env swap |
| Allora Network / Nansen | On-chain analytics depth, deployer-reputation triage | Triage layer, on-chain audit history as a queryable dataset |
| Animoca / Hashed / Caladan (VC) | Revenue mechanism (licensing, 80/20 split), market hypothesis written honestly | `MantleProofLicense.sol`, README "honest market" section |
| BGA (Blockchain for Good) | "Public safety oracle for Mantle's agentic economy" framing — protective infra | Headline thesis |
| DoraHacks / HackQuest | Clean repo, judge-quick-eval, on-chain receipts | README scaffolding (section 11) |
| Elfa AI | MCP server for agent integration | `mcp-server/`, demoed in DevTools track |

We do not claim multi-sponsor capture — this is a single-track submission. But the README highlights each of these without overclaiming, and the demo touches each.

---

## 9. Build sequence

You said time isn't a constraint. I'll structure this in seven weeks (May 1 - June 15), with a buffer week. If you go faster, the buffer absorbs.

**Week 1 — Foundation, contracts, and the open question.** Set up the monorepo (Hardhat + FastAPI + Vite + MCP server). **Day 1 priority: post on the DoraHacks discussion board asking whether Mantle ships official ERC-8004 registries or whether participants deploy their own** (see Section 13.1). Answer determines Path A vs Path B in Section 3. While waiting, deploy whatever path is most likely (default Path B): the three EIP-8004 registries (or thin wrappers if Path A), then `MantleProofRegistry`, `MantleProofAgent`, `MantleProofLicense`, `TreasurySplit` to Mantle mainnet. Verify on Mantlescan. Mint the agent's iNFT. Wire wagmi + viem on the frontend to read the registry. Smoke test: post a fake audit, read it back, advance memoryRoot. Also pin the Mantle L2 addresses for USDY/mUSD/mETH/USDe/sUSDe/USDT0 in `engine/config/mantle_tokens.py` — these aren't always one-click findable, plan to spend 20-30 minutes verifying on Mantlescan + each protocol's official site.

**Week 2 — Audit engine, Tier 1.** Implement the five check modules. Build the bytecode pattern matcher (a small Python utility — pyevmasm + custom rules). Build the source-code resolver (Mantlescan verification API client). Wire Postgres caching. Each check has at least two test fixtures. Two checks need particular care this week: (1) `meth_check.py` handles the L1/L2 distinction explicitly — the staking contracts are on L1, the bridged token is on L2, and the bug surface differs; (2) `dex_check.py` is purpose-built for Merchant Moe's Liquidity Book v2.2 bin architecture (NOT Uniswap V3 tick math) with a secondary Uniswap V3 sub-check for the official UNI deployment. Verify Agni's source structure before writing checks against it; defer if it's not V3-equivalent. Run Tier 1 against a hand-picked list of 20 real Mantle contracts to validate the engine produces meaningful findings.

**Week 3 — Tier 2 and hallucination guard.** Wire the `LLMProvider` abstraction. Implement `ClaudeProvider` and `ZaiProvider`. Write the Tier 2 prompt with the skills directory loaded. Build the hallucination guard (regex extraction + claim verification). Test against the 20-contract validation set; iterate the prompt until precision is good. This is the highest-risk week — budget extra time.

**Week 4 — Query surfaces.** Wire the on-chain `getAudit` read path (frontend + backend). Build the x402 paywall middleware — **settles in USDC on Base** via Coinbase's hosted facilitator (Mantle isn't supported by the public facilitator yet; running our own is deferred to roadmap). The cross-chain split is: payment receipt on Base, audit anchor on Mantle, both txHashes referenced in the JSON response. Signature verification, replay protection, EIP-3009 transferWithAuthorization flow for gasless payments. Build the MCP server (`mantleproof-mcp` with `auditContract`, `getAudit`, `requestAudit` tools). Publish to npm with a `bin` field so users can run `npx -y mantleproof-mcp`.

**Week 5 — The three demo agents.** Build the deployer-agent, trading-agent, yield-agent as standalone TypeScript scripts with their own wallets, funded with real MNT and USDC on Mantle. Each script orchestrates its demo flow end-to-end against MantleProof on mainnet. Capture transaction hashes for the README. This is also the week the cache-warmer cron runs against the top-200 list and starts building public history.

**Week 6 — Frontend, dashboard, polish.** Build the Bloomberg-terminal dashboard: live deploy feed (greyed-out side panel), top-200 cache view, recent audits feed, agent-query log, iNFT reputation panel. The "judge quick eval" walks a visitor through everything in three clicks. Record the demo video. Write the README. Write the post-mortem section.

**Week 7 — Buffer, distribution prep.** Twitter thread, demo video editing, README polish, deployment of any final fixes from real-world testing. Tweet the agent-to-agent receipts. Submit on DoraHacks.

---

## 10. Demo Day script (July 2–3)

Three minutes max. Hard-rehearsed.

> 00:00 — "Mantle's agentic economy has agents trading every block. None of them know if the contracts they're touching are safe. This is MantleProof — the audit oracle for that demand. Three flows, three on-chain receipts, all live on Mantle mainnet, all happening now."
>
> 00:20 — Switch to dashboard. Live deploy feed scrolls in the side panel. Top-200 cache panel shows recent audits.
>
> 00:30 — Demo 1. Deployer-agent pays MantleProof to pre-audit a yield vault. Show the audit appearing in real time, show the finding, show the deployer-agent declining to deploy. Mantle Explorer link.
>
> 01:10 — Demo 2. Trading-agent queries MantleProof before swapping into a fresh token. MantleProof returns a `pause()` backdoor finding. Trading-agent refuses, logs the refusal on-chain. Mantle Explorer link.
>
> 01:50 — Demo 3. Yield-agent queries MantleProof before depositing into a Merchant Moe pool. Clean. Deposits. Mantle Explorer link.
>
> 02:30 — "Five Mantle-specific check dimensions. ERC-8004 identity that compounds with each audit. 80/20 royalty split funds the protocol. MCP server lets any Claude or Cursor user query MantleProof from their dev environment. Z.ai adapter ships in addition to Claude. Configurable, honest, on-chain."
>
> 02:55 — "Code, contracts, audit receipts: github.com/emark-cloud/mantleproof. Live: mantleproof.xyz."

---

## 11. README scaffolding

Open with the one-sentence thesis. Then in order:

1. **Live links table** — site, repo, demo video, key contract addresses with Mantle Explorer links
2. **Judge Quick Evaluation (3 minutes)** — six numbered steps, each ending in a verifiable artifact. Mirrors Genesis and SynthLaunch.
3. **The agent-economy thesis (1 paragraph)** — why an oracle, not a tool
4. **The five audit dimensions** — table with concrete examples
5. **Architecture diagram** — the ASCII block in section 2
6. **The three agent demos** — each with txHash and Mantle Explorer link
7. **Smart contracts** — table with addresses, verified on Mantle Explorer
8. **Tier 2 reasoning and the hallucination guard** — explain the AT-style acceptance test
9. **Sponsor surfaces** — short table mapping panelists to features (without overclaiming)
10. **Honest market section** — "real revenue comes from CI integration and reputation-staked auditing, neither of which are hackathon-scope. What we demonstrate at hackathon scale is: the engine finds ecosystem bugs static analyzers miss, the inter-agent licensing clears on chain, the iNFT reputation compounds. Market hypothesis is testable post-hackathon."
11. **Engineering debug log** — five real bugs we hit and how we fixed them (Genesis pattern, signals seriousness)
12. **MCP server quickstart** — `npx mantleproof-mcp`, three tools, copy-paste config for Claude Desktop
13. **Roadmap** — CI integration, reputation-staked auditing, cross-chain expansion
14. **Team** — solo, Emark, links
15. **License** — MIT

---

## 12. The patterns we are explicitly stealing

For my own discipline and yours, the things in this plan that are deliberate copies from the five winners:

- **One-sentence thesis at the top of the README** — all five winners
- **Judge Quick Evaluation section** — SynthLaunch, Genesis, LPLens
- **On-chain receipts as the headline proof, not screenshots** — Genesis, Slopstock, LPLens
- **Five-label honesty system (VERIFIED/COMPUTED/ESTIMATED/EMULATED/LABELED)** — LPLens directly
- **AT-4 style hallucination guard** — LPLens directly
- **ERC-8004 / iNFT identity with compounding memoryRoot** — LPLens, Slopstock
- **80/20 royalty split via `mintLicense`** — LPLens directly
- **Agent-to-agent demo as the killer moment** — Slopstock (AUDIT→ORCL)
- **MCP server published to npm** — Cards402, LPLens, Slopstock
- **Engineering debug log section** — Genesis
- **Bloomberg-terminal-style dashboard aesthetic** — Slopstock
- **Sponsor capture map without overclaiming** — Slopstock, but applied to a single-track submission

---

## 13. Open build-time questions and key research findings

Resolved or partially-resolved during the resource research pass. These are the live unknowns and the decisions already locked in. Resolve the unknowns Week 1.

### 13.1 Does Mantle ship official ERC-8004 registries? (UNRESOLVED — Day 1 priority)

The hackathon announcement says "every participating AI agent is issued a unique identity NFT via ERC-8004." Unclear whether this is:
- **(A)** Mantle ships canonical Identity / Reputation / Validation registries that all hackathon agents register against, OR
- **(B)** Each team deploys their own and "ERC-8004" just means "follow the standard"

This is a Day 1 question for the DoraHacks discussion board. Path B is more ambitious (we ship the trust layer for the whole Mantle agent economy) and likely what the announcement implies. Default to Path B; collapse to Path A if Mantle confirms central deployment.

### 13.2 mETH lives on Ethereum L1, not Mantle L2 (RESOLVED)

mETH's canonical contracts — Staking, UnstakeRequestsManager, Oracle — are deployed on Ethereum L1. The Mantle L2 mETH is a bridged wrapped representation. The audit check needs to handle this — both the bridge lag (state on L1 may differ from L2 reads) and the fact that any audit-worthy "mETH integration" on Mantle is technically a wrapped-mETH integration. Verify the Mantle L2 mETH address at build time; pin in config.

### 13.3 Merchant Moe is Liquidity Book, not Uniswap V3 (RESOLVED)

Merchant Moe runs Liquidity Book v2.2 (Trader Joe / LFJ fork) — bins not ticks, constant-sum within bins, ERC-1155 LP tokens, variable fees driven by a volatility accumulator. Original spec called for V3-style tick math checks; rewritten in Section 4.4. Uniswap V3 IS separately deployed on Mantle ($250K UNI grant) and gets its own secondary check.

### 13.4 x402 facilitator doesn't support Mantle (RESOLVED)

Coinbase's hosted x402 facilitator supports Base, Polygon, Arbitrum, World, and Solana — Mantle is not on that list. Decision: x402 paywall settles in USDC on Base via the public facilitator, audit registry and identity contracts stay on Mantle. Cross-chain reference is fine because audit findings reference contract addresses, not payment chains. The README documents this honestly: "payment receipt on Base, audit anchor on Mantle, both txHashes in the JSON response." Running our own Mantle facilitator is a roadmap item, not hackathon scope.

### 13.5 Agni Finance source structure (UNRESOLVED — Week 2)

Agni's docs don't surface cleanly via search. Likely Uniswap V3-style based on Phase 1 ClawHack framing, but verify by pulling the verified router/factory source from Mantlescan at the start of Week 2 before writing checks against it. If V3-equivalent, the existing V3 secondary check covers it; if forked with quirks, document them as a third sub-check or defer to Tier 2 reasoning only.

### 13.6 Top-200 ranking data source (RESOLVED, default chosen)

Default: custom Web3.py walker over recent Mantle blocks. Free, no external dependencies, fits a solo build. Switch to Goldsky in Week 5 if the walker can't keep up with the live deploy feed. Dune via API is the backup if Goldsky doesn't have the right Mantle subgraph.

### 13.7 Mantlescan API key (RESOLVED, low-friction)

Mantlescan API access requires a free API key (Etherscan-compatible model). Apply early in Week 1. Free tier handles hackathon-scale rate limits.

### 13.8 Things explicitly out of scope

- ERC-7857 sealed-weights iNFT (LPLens / Slopstock use this; overkill for an audit oracle, adds 2+ weeks)
- Custom auditing LLM fine-tune (Claude + good skills directory + hallucination guard beats fine-tuning at hackathon scale)
- Self-hosted x402 facilitator on Mantle (roadmap, not hackathon)
- Cross-chain expansion to Arbitrum / Base / Optimism (roadmap)
- Reputation-staked auditing where auditors stake MNT against their reputation (genuinely interesting, 6-month build, README mentions as future direction)
