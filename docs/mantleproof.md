# MantleProof — Build Plan (Implementation State)

**One-sentence thesis:** MantleProof is the on-chain audit oracle for Mantle's agentic economy — other agents query it before touching a contract, get back a structured safety signal in under a second, and route their behavior accordingly.

**Track:** AI DevTools (Phase 2, AI Awakening)

**Builder:** Emark, solo

**Submission window:** May 1 → June 15, 2026. Demo Day July 2–3.

**Status as of 2026-05-21:** Critical Path complete — DELIVERABLE D achieved (all three
agent-to-agent demos green on Mantle mainnet, independently re-verified). Remaining
work is README polish, demo video, and DoraHacks submission (T31). All open build-time
questions in §13 are resolved; this file reflects what shipped, not what was planned.

---

## 1. The mental model

Three layers, each a defensible piece of the submission:

**Layer 1 — The audit engine.** Five Mantle-specific audit dimensions (USDY/mUSD, mETH-bridged-L2, Ethena USDe/sUSDe, Liquidity Book DEX bugs, EIP-712 chain-ID replay), each implemented as a discrete check module. Tier 1 = heuristic + bytecode pattern matching (cheap, runs everywhere). Tier 2 = full Claude reasoning pass with the skills directory loaded (paid, posted on-chain with provenance). Note: the DEX check is purpose-built for Merchant Moe's **Liquidity Book v2.2** (bin architecture, ERC-1155 LP tokens, constant-sum within bins) — *not* Uniswap V3 tick math. A secondary Uniswap V3 check applies to Uniswap's official Mantle deployment.

**Layer 2 — The oracle interface.** Three query surfaces, same backend: on-chain `MantleProofRegistry.getAudit(address)` for agents that live on Mantle (T24), MCP server (`mcp-server/`, T23) with three tools (`getAudit`, `auditContract`, `requestAudit`), and an x402 paywall endpoint (`POST /x402/audit/{address}`, T22) implementing the Coinbase v1 dance (`/verify` then `/settle`). All three return the same JSON envelope with the same honesty labels. The x402 paywall settles in USDC on **Base** (because Coinbase's hosted x402 facilitator doesn't support Mantle yet — Base/Polygon/Arbitrum/World/Solana only); audit registry, iNFT identity, and license contracts live on Mantle. Cross-chain provenance is fine: the audit record on Mantle references the contract address being audited, not the payment chain. Both txHashes (Base payment, Mantle anchor) appear in every JSON response. Self-hosted Mantle facilitator is roadmap.

**Layer 3 — The agent-to-agent demo (DELIVERED).** Three agents with their own funded wallets, real x402 / on-chain flows on **Mantle mainnet (chainId 5000)**: a deployer agent that pays for a pre-deploy audit and declines based on a HIGH finding, a trading agent that declines a swap based on a `pause()`/`mint()` backdoor finding, a yield agent that approves a real Merchant Moe LB v2.2 single-sided WMNT deposit. Each flow leaves on-chain receipts the judges can verify on Mantlescan. See §7 for receipt hashes.

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

**Tech stack (as built):**

- Smart contracts: Solidity 0.8.28, Hardhat, OpenZeppelin v5, deployed to Mantle mainnet (Chain ID 5000) and Mantle Sepolia (5003). Verified on Mantlescan via **Etherscan API V2** (the old per-explorer V1 endpoints were retired in early 2026 — one `etherscan.io` key, chainId-routed, covers both networks).
- Backend: Python 3.11, FastAPI, Web3.py, `pydantic-settings`. **Persistence is JSON-file stores in `engine/data/`** (atomic temp-then-rename writes) — Postgres + Redis from the original plan were dropped after the triage layer (T29) shipped as cron-driven Web3 walkers whose file mtime *is* the freshness signal. Documented spec divergence #1.
- Frontend: React + Vite, wagmi v2, viem, Tailwind, Bloomberg-terminal aesthetic. **Spec override:** `/` is a landing page, `/app` is the dashboard (the original §12 of `docs/design.md` mandated dashboard-as-home; overridden for the submission window because the demo-day video / Twitter / DoraHacks click needs a "what is this" pitch before the dense terminal). Documented spec divergence #5.
- LLM: `LLMProvider` runtime-checkable `Protocol` (`engine/mantleproof/llm/provider.py`), env-selected. **`GeminiProvider` is the DEFAULT** (the user holds only a Gemini key) — `ClaudeProvider` and `ZaiProvider` are interface-complete + key-gated + shape-tested with mocked transport only, marked "untested vs live API". `reason()` returns RAW TEXT — parser + hallucination guard are provider-agnostic (never relies on Anthropic tool-use structured output). Documented spec divergence #2.
- MCP server: TypeScript, `@modelcontextprotocol/sdk`, three tools (`getAudit`, `auditContract`, `requestAudit`). Build + stdio smoke green against the live engine; `npm publish --access public` is a builder-run step (CI does not publish).
- x402: HTTP 402 middleware (T22) — full v1 dance with the Coinbase hosted facilitator. **POST `/x402/audit/{address}`** parses `X-PAYMENT` base64-JSON, calls `/verify` before running the audit, `/settle` after, returns 200 with **both Base payment txHash and Mantle anchor txHash in the JSON body**. 0.50 USDC on Base, asset `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Synchronous execution (no Redis queue) — documented spec divergence #3.
- Infra: single VPS (engine + JSON stores), static frontend deploy. No Postgres, no Redis.

---

## 3. Contracts (Path A — RESOLVED 2026-05-18, DEPLOYED 2026-05-19)

**Path A locked.** Mantle ships canonical ERC-8004 Identity + Reputation registries (no Validation registry — not needed); MantleProof self-registers (`register()` is permissionless) and wraps the official identity. We deploy **5** contracts; Path B (own registries) was abandoned.

**Canonical ERC-8004 registries (consumed, not deployed):**

| | Mantle mainnet 5000 | Mantle Sepolia 5003 |
|---|---|---|
| Identity Registry (ERC-1967 proxy → `IdentityRegistryUpgradeable`) | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Reputation Registry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

Verified live via `eth_getCode` (T1b, 2026-05-18). Canonical from `github.com/erc-8004/erc-8004-contracts`. `contracts/contracts/interfaces/IEIP8004.sol` holds the *external* interfaces we consume. MantleProof's own ERC-8004 identity self-registered on mainnet 2026-05-19: **`tokenId=96`** owned by `0x2a30…605B6A` (mint tx `0x3d810ca4…ea2a` block 95547770; Sepolia rehearsal `tokenId=48`). `MANTLEPROOF_AGENT_TOKEN_ID=96` in `.env`.

**MantleProof contracts deployed on Mantle mainnet 5000 (T25, 2026-05-19, all Mantlescan-verified):**

| Contract | Mainnet address | Purpose |
|---|---|---|
| `MantleProofRegistry.sol` | `0x60E97c83Dd184D3B0812Ce25430e9D6930eD63aE` | Append-only audit registry. `submitAudit(target, severity, rootHash, ipfsCID)` callable only by the immutable `oracleSigner`. `getAudit(target)` view. Public read, signed write — the credibility-purchasing invariant. |
| `MantleProofAgent.sol` | `0x966A385A7C56794E1Bb40C9F0f73cCDaA0724503` | Thin wrapper over the official ERC-8004 identity (`agentTokenId=96`, immutable). Tracks per-audit `memoryRoot` (compounded via `keccak256(prev, newRoot)`), `auditsPerformed`, `reputation`. Calls into the official Reputation Registry. |
| `MantleProofLicense.sol` | `0x906390B3594384bE83F3465cFeDf8661f4d1a410` | Pay-per-audit + subscription. **Settles native MNT on Mantle on-chain** with auto 80/20 split to `identity.ownerOf(96)` / `TreasurySplit` — documented spec divergence #4 (the original "USDC on Base" plan now lives in T22's x402 surface as a parallel HTTP path, not the on-chain license itself). |
| `TreasurySplit.sol` | `0x53459fb149CB1772ea389ACE325501DA2B28E437` | Receives the 20% treasury share. Minimal timelock. |
| `DecisionLog.sol` | `0x1823359f0a5bB8b2af71a55200B08ECcCedFec6f` | Demo-agent on-chain decision log. Emits `Decision(address indexed agent, address indexed target, bytes32 indexed auditRootHash, string action, string reason)`. Powers the §7 receipts. |

Mantle Sepolia (5003) carries an earlier deploy of the same five for the smoke + pipeline rehearsal (T4 + T6 + T20). `MockUSDC.sol` exists for tests only.

**Pre-deploy SPOF caught + fixed (T25 pre-flight):** `DEPLOYER_PRIVATE_KEY == ORACLE_SIGNER_PRIVATE_KEY` in `.env` while `MantleProofRegistry.oracleSigner` is `immutable`. Generated a fresh oracle key in-process (`0x9f17…638a`, never printed) before the mainnet deploy. The deployer key remains `0x2a30…605B6A` (= identity owner = License 80/20 recipient). Post-deploy on-chain readback: 16/16 wiring checks pass.

The deployer-agent, trading-agent, and yield-agent for the demos are TypeScript scripts (`agents/src/`) with their own dedicated funded wallets — five distinct keys total (deployer, oracle, deployer-agent, trading-agent, yield-agent).

**Why 80/20:** Mirrors LPLens, mirrors the OpenAI marketplace cut, signals VC judges that we've thought about the long-term cap-table of an agent-owned protocol.

---

## 4. The five audit dimensions (as built — T10)

Each one is a Python module under `engine/mantleproof/checks/`. Each ships with positive + negative fixtures. All five run in Tier 1; Tier 2 adds LLM reasoning on top of the union of their outputs. Shared Tier-1 primitives live in `checks/_common.py` (relevance gate via symbols / pinned addresses / bytecode constants, idempotent T8 pattern registration). All Tier-1 vulnerability findings ship `ESTIMATED` (heuristic inference); directly-observed bytecode-address facts are evidence-only / `VERIFIED`-grade so negative fixtures stay genuinely clean.

**Tier-1 precision (T12, hardened against live mainnet protocol contracts):** the first live run surfaced real false positives — the engine flagged each protocol's *own* token contracts because the heuristics were ERC20-shape-matching. Three fixes locked in: (1) **integration-handle gate** — a misuse finding requires the contract to *call into* the protocol, not merely be ERC20-shaped or share a name; (2) **self-target guard** — `run_tier1(address=…)` suppresses a protocol's checks when the audited address IS that protocol's token or known proxy impl; (3) **replay_check restructured** to the spec's canonical bugs (genuine `EIP712Domain` typehash modelling `chainId` but not reading `block.chainid` → HIGH; typehash omitting `chainId` → MED; bare `permit`/`DOMAIN_SEPARATOR` no longer qualifies). Result: 10/10 real verified protocol contracts → 0 findings; FP classes locked by `test_tier1_precision.py`.

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

## 5. Tier 2 reasoning pass (T13–T20, as built)

Tier 2 is what makes the project win the "AI" half of "AI DevTools." Pipeline (`engine/mantleproof/pipeline.py`, `run_audit`):

1. Resolve verified contract source from **Etherscan API V2** (T9, `source/etherscan.py` — unified endpoint, chainid-routed, proxy follow, double-brace standard-json parser; one `ETHERSCAN_API_KEY` covers 5000+5003). Resolve runtime bytecode via `eth_getCode`. Run the Tier-1 union (self-target-guarded). Load the `engine/mantleproof/skills/` directory (6 markdown briefs grounded in `docs/resources.md` §2: USDY/mUSD, mETH/cmETH, USDe/sUSDe, Merchant Moe LB, Uniswap V3, EIP-712 replay).
2. Build the prompt (`tier2/prompt.py`) — tightly scoped, source line-numbered, JSON-only output, only ADDITIONAL findings vs Tier-1, every `$`/`%`/hex/address claim must cite an `L<n>` line or a bytecode offset, conservative labels. Source is line-numbered so the guard can resolve a cited line. Send to provider — **default `gemini-2.5-pro`** with `gemini-2.5-flash` fallback on transient 503s (the `_RetryingGemini` wrapper from T19 made the live path resilient to upstream load). `unverified_source` short-circuits — Tier 2 needs source to ground claims.
3. **Hallucination guard** (`tier2/hallucination_guard.py`, T18, the credibility core): pure, provider-agnostic, no network. `parse_findings` parses the JSON array (defensively strips a stray ```json fence; **never uses tool-use structured output** per CLAUDE.md; malformed → 0 findings, never crashes the audit; bad severity/label coerce to conservative INFO / ESTIMATED). `apply_guard` regex-extracts every `$` / `%` / hex / address claim from `finding` + `suggested_fix`, verifies each against the source / bytecode / Tier-1 corpus (lowercase substring after stripping `$ % , 0x` + whitespace — auditable, no fuzzy matching), replaces unverifiable claims with `[unsupported]`, and **drops that finding's honesty label exactly one tier — once per finding** regardless of how many of its claims were masked (`VERIFIED → COMPUTED → ESTIMATED → EMULATED → LABELED` floor). **Corpus is scoped per claim kind:** long hex/addresses may be grounded in bytecode, but `$`/`%`/short-hex must hit source or Tier-1 (a 2–3 digit number trivially appears in any runtime hex blob and must never manufacture support). Inputs are not mutated. Masked count is surfaced publicly via `GuardOutcome.public_note` ("Hallucination guard fired: N masked"). 14 unit tests pin the invariant.
4. Assemble canonical report → `compute_root_hash` = `Web3.keccak` of sorted-key compact JSON (preimage excludes `root_hash`/`ipfs_cid`/`anchor_tx`, added after). Pin to IPFS via Pinata (`persistence/ipfs.py` — **refuses to pin/anchor without `PINATA_JWT`**: never anchor a rootHash whose JSON nobody can fetch). Oracle-signed `submitAudit` (`persistence/anchor.py` — embedded minimal ABI keeps the engine decoupled from `contracts/`). Registry advances `MantleProofAgent.memoryRoot` internally on each anchor.

**LLM provider layer (T13–T16):**

```python
# engine/mantleproof/llm/provider.py
@runtime_checkable
class LLMProvider(Protocol):
    def reason(self, prompt: str, system: str) -> str: ...  # RAW TEXT only

# engine/mantleproof/llm/{gemini,claude,zai}.py — env-selected via AUDIT_LLM_PROVIDER
# Default: gemini. require_key() raises ProviderError (value-safe — never echoes the key).
```

`GeminiProvider` is the only adapter exercised against a live API (`google-genai`, raw text, `system_instruction`, temperature=0). `ClaudeProvider` (`anthropic` SDK, flattens text blocks) and `ZaiProvider` (httpx against the OpenAI-compatible Z.ai endpoint) are interface-complete, key-gated, and shape-tested with mocked transport only — marked "untested vs live API". Z.ai stays in the README sponsor narrative honestly (it's on the judging panel). `reason()` returns RAW TEXT only; the parser + guard remain provider-agnostic.

**Tier-2 precision pass (T19, full live harness):** ran the full path (`run_tier2` → `parse_findings` → `apply_guard`, live Gemini with the retry+fallback wrapper) against the verified-protocol set — **9/9 resolved+verified, Tier-1 0/9 (self-target guard), Tier-2 18 conservative source-cited findings, guard masked 0 · label drops 0, no FP storm.** Set was 10 contracts (one transient Etherscan ReadTimeout on MOE survived gracefully) — documented spec divergence: original plan said ~20-contract set, the shipped harness validated against ~10 (smaller-than-planned, decision is documented). `masked=0` is the *designed* outcome — the tight T17 prompt drove the model to cite `L<n>` lines + named constants instead of `$`/`%` literals (CLAUDE.md: tighter prompt → less to mask). The guard *is* wired into the live path; its mask + one-tier-drop behaviour is independently proven by the 14 T18 unit tests on fabricated input.

---

## 6. Triage and targeting (T29, as built)

Three modes, all sharing the same audit engine — implemented as `engine/mantleproof/triage/` (cache_warmer, deploy_feed, store, refresh CLI) and three FastAPI routes. **JSON-file persistence**, not Postgres/Redis (spec divergence #1).

**Mode A — Cache warmer:** Pure `walk_audits(get_logs=…, get_audit=…)` reads `MantleProofRegistry.AuditSubmitted(address indexed target, bytes32 indexed rootHash, uint8 severity, string ipfsCID)` events over a recent window (default 50 000 blocks ≈ 24h on Mantle's 2 s blocks). For each `topic[1]` target it re-reads `getAudit(target)` so the cache row is the *current head*, not a stale per-event snapshot; `n_dropped` counts targets whose head returned `None` mid-walk (race between log scan + head fetch). The cache stays a strict subset of "currently anchored AND readable".

**Mode B — On-demand:** `requestAudit` (MCP, T23) and `POST /x402/audit/{address}` (REST, T22) are synchronous — engine runs Tier 2 + anchors + returns; no Redis queue (divergence #3). Result is cached for everyone else after.

**Mode C — Deploy feed:** Pure `walk_deploys(get_block=…, get_receipt=…, get_code=…)` scans `eth_getBlock(num, full_transactions=True)` for `tx.to == None`, pulls `receipt.contractAddress`, reads runtime bytecode, classifies as `"audited"` (already in CacheStore) | `"queued"` (real-looking unique contract) | `"skipped:template"` (EIP-1167 minimal-proxy prefix `0x363d3d373d3d3d363d73…`) | `"unknown"` (bytecode unreadable). Walker is **bounded by design** — `window_blocks=1500` ≈ 50 min, ~1500 RPCs/refresh; the Goldsky-fallback slot is documented in the module docstring but not implemented (out of hackathon scope; the Web3 walker is enough for cron-every-5-min).

**Store + CLI:** `store.py` — atomic temp-then-rename JSON persistence, typed frozen dataclasses, `freshness_s()` from file mtime (`None` when file absent = honest "unknown"); a truncated/corrupt file is treated as "no cache" rather than crashing the API. `python -m mantleproof.triage.refresh [--cache | --feed | --both]` — idempotent, cron-friendly.

**Routes** (`routes_feed.py`, `routes_cache.py`, `routes_queries.py`, `routes_health.py`): `GET /api/feed` and `GET /api/cache` read the JSON stores with **honest cold-state** (`items: []`, `freshness_s: null`) when the file doesn't exist — NOT a 501, because the indexer is just cold not broken. Cache rows sort by `severity desc, audit_count desc, block desc` so the dashboard panel always sees the worst+most-anchored head first. `GET /api/queries` reads `DecisionLog.Decision` events directly off chain (events ARE the source of truth; re-deriving is cheap, no persistence layer). `/api/health.cache_freshness_s` surfaces the youngest store mtime; "cache: pending" when both files absent — honest, not a green light.

**Dashboard mirrors the freshness honestly:** `DeployFeedPanel` and `PriorityCachePanel` poll `/api/feed` and `/api/cache` every 30s; cold-state shows a curated fallback set and the header swaps between `● refreshed 47s ago` and `◐ indexer cold`. Skipped rows are visible-but-greyed (`◌`) per design rule "we don't pretend".

---

## 7. The three agent demos — DELIVERABLE D ACHIEVED 3/3 (T26–T28, 2026-05-20)

Three flows, **all green on Mantle mainnet (chainId 5000), all independently re-verified by a separate off-pipeline reader, all with on-chain receipts the judges can verify on Mantlescan.** Five distinct keys: deployer · oracle · deployer-agent · trading-agent · yield-agent.

**Demo 1 — Pre-deploy audit (T26).** Deployer-agent `0x4354…fc1f3` wants to deploy a buggy yield vault. Before broadcasting, it calls `MantleProofLicense.payForAudit(target)` against `BuggyYieldVault` (naive sUSDe integration, trips `usde_check` H1) deployed at `0x1892f77e335c133ce4a7b28555f13ba74cbb76fa` (Mantlescan-verified). Engine runs the live pipeline (Gemini Tier-2, 2 findings, severity **HIGH**, guard masked 0). Deployer-agent reads the finding and **declines to deploy production** (severity HIGH ≥ MEDIUM threshold).
- `payForAudit` tx **`0xde00a2f3…f00a`** (0.5 MNT, `AuditPaid` event asserts `payer == agent`)
- `submitAudit` tx **`0x7cfbb72b…e4ca`** (block 95566491; `submitter == oracleSigner` — only-writer invariant)
- rootHash `0x6a69e7d4…ca46`, IPFS `bafkreibjhg…ewce`, keccak(canonical IPFS JSON) == on-chain rootHash → audit independently verifiable end-to-end
- `agent.auditsPerformed: 0 → 1`, `agent.memoryRoot: 0 → 0xd1ce…e716`

**Demo 2 — Pre-swap safety check (T27).** Trading-agent `0xB74a08a5aD469758F1a0fAc2cF6059de3cc4A148` is about to swap into a fresh "yield-bearing meme token". Audits `BackdooredMemeToken` (`pause()` + `mint()` admin backdoors + broken sUSDe yield path) deployed at `0x8f6679eb031799fc9c5e149dfb75b4543808912f` (same CREATE address on 5000 & 5003 via the nonce-0 trick; Mantlescan-verified). Engine runs the live pipeline (Gemini Tier-2, 4 findings, severity **HIGH**, guard masked 0; 2 transient Gemini 503s recovered via `_RetryingGemini`). Trading-agent **DECLINES** and writes the refusal to `DecisionLog`.
- `payForAudit` tx **`0xa41f70cc…bb58`** (0.5 MNT)
- `submitAudit` tx **`0xc2a54ffa…0e4e`** (block 95567441)
- **HEADLINE receipt:** `DecisionLog.logDecision` tx **`0x146a38eb…584f`** (block 95567445) — `action="DECLINED"`, reason references the audit
- rootHash `0x7443ab83…3849`, IPFS `bafkreiatwd…ujg4`
- `agent.auditsPerformed: 1 → 2`, `agent.memoryRoot: 0xd1ce…e716 → 0x7a3f…31a6` (= `keccak256(prev, newRoot)`)

**Demo 3 — Pre-deposit yield approval (T28).** Yield-agent `0x9979A4e0465b0F6E14e40309Fe4C6aEe8A1f66c3` audits the **canonical Merchant Moe LBRouter v2.2** `0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a` (resolved live via Etherscan V2). Engine: Gemini Pro 6× 503 → Flash fallback succeeded, **0 findings, severity INFO**, guard masked 0 (recorded honestly — no manufactured finding). Yield-agent **eth_call-simulates** `addLiquidityNATIVE` *before* spending gas (the safety net that justified skipping Sepolia rehearsal — Merchant Moe is not deployed on 5003), then executes a real single-sided WMNT deposit into the WMNT/USDT0 binStep=25 pair at bin `activeId+1` (X-only side, no slippage on the deposited token).
- `payForAudit` tx **`0xda3f5e9b…3555`** (0.5 MNT)
- `submitAudit` tx **`0xd529d8cf…5271`** (severity INFO, rootHash `0xd984d08c…8dc1`, IPFS `bafkreiasm4…b5te`)
- **HEADLINE receipts:** `addLiquidityNATIVE` tx **`0xbb1bb066…78f9`** (block 95569090, gasUsed 142657, 0.05 WMNT, real ERC-1155 LB LP receipt minted) + `DecisionLog.logDecision` tx **`0x2375ad00…e9c0`** (block 95569094, `action="APPROVED"`)
- `agent.auditsPerformed: 2 → 3`, `agent.memoryRoot: 0x7a3f…31a6 → 0xb1ff90eb…6711`
- `DecisionLog.count: 0 → 1 → 2` (the agent-network's first two on-chain decisions ever — DECLINED then APPROVED, opposite verdicts both grounded in MantleProof audits)

**Independent verification:** Each demo ships its own off-pipeline reader script in `engine/scripts/verify_demo{1,2,3}_receipt.py`. Demo 3's check list is 16 items (8 from Demo 1 — anchor status, submitter == oracleSigner, severity, keccak(canonical IPFS) == rootHash, agent counters compound — plus 4 from Demo 2 around DecisionLog, plus 4 specific to Demo 3 around the addLiquidity tx and APPROVED verdict). All passed.

This is the Slopstock AUDIT→ORCL moment, replicated three times. **Three agent-to-agent interactions, none of them human-in-the-loop.** That's Four.meme rule #2 (multi-agent dynamics) executed concretely.

---

## 8. Sponsor / track capture map

The track is AI DevTools, so prize-bucket-wise we're going for one bucket. But we want soft positive signals for as many panelists as possible without diluting the build. Map:

| Panelist / sponsor | What lights them up | Where it appears |
|---|---|---|
| Mantle (Mantle Labs, Mantle ecosystem leads) | Mantle-specific audit dimensions (USDY, mETH, USDe, MerchantMoe/Agni) | Five-dimension audit engine, README "why Mantle" section |
| ERC-8004 / Virtuals Protocol | Agent identity NFT with compounding memoryRoot | `MantleProofAgent.sol`, every audit advances `memoryRoot` |
| Z.ai | Interface-complete LLM provider adapter (key-gated, mock-tested) | `engine/mantleproof/llm/zai.py`, README notes single-env swap — Gemini is the default-shipped provider |
| Allora Network / Nansen | On-chain analytics depth, deployer-reputation triage | Triage layer, on-chain audit history as a queryable dataset |
| Animoca / Hashed / Caladan (VC) | Revenue mechanism (licensing, 80/20 split), market hypothesis written honestly | `MantleProofLicense.sol`, README "honest market" section |
| BGA (Blockchain for Good) | "Public safety oracle for Mantle's agentic economy" framing — protective infra | Headline thesis |
| DoraHacks / HackQuest | Clean repo, judge-quick-eval, on-chain receipts | README scaffolding (section 11) |
| Elfa AI | MCP server for agent integration | `mcp-server/`, demoed in DevTools track |

We do not claim multi-sponsor capture — this is a single-track submission. But the README highlights each of these without overclaiming, and the demo touches each.

---

## 9. Build sequence (executed)

The original seven-week plan is preserved in `TODO.md` (live task list). Summary of what shipped:

**Week 1 — Foundation & contracts ✅.** Monorepo scaffolded (pnpm workspaces for the 4 TS packages — contracts/frontend/mcp-server/agents — plus standalone `engine/` Python). T1 resolved Path A (Mantle auto-issues ERC-8004 identity; no own Identity Registry). T1b resolved canonical ERC-8004 registry addresses + verified live. T2: 8 Mantle-mainnet token addresses pinned in `engine/mantleproof/config/mantle_tokens.py` (official docs + on-chain symbol/name/decimals + EIP-1967 impl verification). T3: Path A contracts + 14 Hardhat tests green. T4: 5 contracts deployed + Mantlescan-verified on Sepolia via Etherscan API V2 (V1 retired). T5: MantleProof self-registered against canonical Identity Registry — mainnet `tokenId=96`. T6: smoke-roundtrip green on Sepolia.

**Week 2 — Audit engine, Tier 1 ✅.** T8 bytecode utilities (pyevmasm-based disasm + pattern registry). T9 source resolver (Etherscan API V2 client, chainid-routed, proxy follow). T10 five check modules + fixtures (usdy, meth, usde, dex, replay) with shared Tier-1 primitives in `_common.py`. T11 Postgres+alembic was planned but ultimately replaced by JSON-file stores in T29 (divergence #1). T12 live validation against 10 real verified protocol contracts: 0 findings, FP storm avoided; precision hardening locked by `test_tier1_precision.py`.

**Week 3 — Tier 2 + hallucination guard ✅.** T13–T16 `LLMProvider` Protocol + `GeminiProvider` (default, live-tested) + `ClaudeProvider` + `ZaiProvider` (key-gated, mock-only). T17 prompt + runner with 6 real skills briefs. T18 hallucination guard — pure, provider-agnostic, per-finding one-tier label-drop, 14 tests pin the invariant. T19 live full-path precision pass against the verified-protocol set — no FP storm. T20 `pipeline.py` end-to-end on Sepolia — independently verified Sepolia receipt (cutover-gate (b) ✅).

**Week 4 — Query surfaces ✅.** T21 REST: `/api/audit/{addr}`, `/api/health`, `/api/feed`, `/api/cache`, `/api/queries`. T22 x402 middleware — full Coinbase v1 dance (`/verify` + `/settle`), `POST /x402/audit/{address}`, 0.50 USDC on Base, both Base + Mantle txHashes in every response. T23 MCP server — 3 tools (`getAudit`, `auditContract`, `requestAudit`), `requestAudit` invokes the live x402 endpoint and surfaces 402 payment requirements (no fabricated tx hash); npm publish pending. T24 on-chain `getAudit` read path wired (engine `registry_reader.py` with IPFS gateway fetch + keccak recompute = on-chain rootHash verification on every read).

**Week 5 — Demo agents + cache-warmer ✅.** T25 mainnet cutover — 5 Path A contracts deployed + Mantlescan-verified on chainId 5000; oracle-signer rotated to a fresh distinct key pre-deploy after pre-flight caught a `deployer==oracle` SPOF (the `oracleSigner` is `immutable`). T26/T27/T28 — three demos green on mainnet (see §7). T29 cache-warmer + deploy-feed walker live; five public read endpoints all real.

**Week 6 — Frontend / dashboard ✅.** T30 — 7 primitives (StatusDot, Address, SeverityBadge, HonestyLabel, Sparkline, TxLink, Timestamp), 4 panels (DeployFeedPanel, PriorityCachePanel, AgentQueryPanel, FindingCard/AuditHistoryRow), 4 composites (HeroStrip, EngineStatusFooter, AgentIdentityHeader, JudgeStepCard), 5 pages (`/app` dashboard, `/contract/:address`, `/agent/:tokenId`, `/audit/:rootHash`, `/judge`), plus the `/` landing page (spec override #5). All panels read live data or honestly label cold-state. No spinners. No light mode. No emoji in product UI. No fake data — every panel reads via REST/on-chain or shows `KNOWN_TARGETS` (hand-curated, every entry has a verifiable on-chain rootHash).

**Week 7 — Distribution / submit (in progress).** T31 README polish + demo video + DoraHacks submission. The MCP server's `npm publish --access public` is a builder-run step (CI never publishes).

**Engine gate state:** 167/167 tests passing, ruff + mypy clean (94 src files). Contract suite: 14/14 Hardhat tests green, CI runs them. Frontend: TypeScript strict + `noUncheckedIndexedAccess` clean, production build 535–561 KB / 165–173 KB gzip.

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
> 02:30 — "Five Mantle-specific check dimensions. ERC-8004 identity that compounds with each audit. 80/20 royalty split funds the protocol. MCP server lets any Claude or Cursor user query MantleProof from their dev environment. Default LLM is Gemini; Claude and Z.ai adapters ship interface-complete behind one env-var. Configurable, honest, on-chain."
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

## 13. Build-time questions — all resolved

All questions opened during the resource research pass are resolved. Status snapshot:

### 13.1 Does Mantle ship official ERC-8004 registries? (RESOLVED 2026-05-18 → Path A)

Mantle ships canonical Identity + Reputation registries (no Validation registry — not needed). MantleProof self-registers via permissionless `register()` — **mainnet `tokenId=96`** owned by `0x2a30…605B6A` (mint tx `0x3d810ca4…ea2a` block 95547770; Sepolia rehearsal `tokenId=48`). `MantleProofAgent` wraps that identity (`agentTokenId` immutable). Five contracts shipped (see §3); Path B is abandoned. Addresses: identity `0x8004A169…a432` (mainnet) / `0x8004A818…BD9e` (Sepolia), reputation `0x8004BAa1…9b63` / `0x8004B663…8713`.

### 13.2 mETH lives on Ethereum L1, not Mantle L2 (RESOLVED)

mETH's canonical contracts — Staking, UnstakeRequestsManager, Oracle — are deployed on Ethereum L1. The Mantle L2 mETH is a bridged wrapped representation. The audit check needs to handle this — both the bridge lag (state on L1 may differ from L2 reads) and the fact that any audit-worthy "mETH integration" on Mantle is technically a wrapped-mETH integration. Verify the Mantle L2 mETH address at build time; pin in config.

### 13.3 Merchant Moe is Liquidity Book, not Uniswap V3 (RESOLVED)

Merchant Moe runs Liquidity Book v2.2 (Trader Joe / LFJ fork) — bins not ticks, constant-sum within bins, ERC-1155 LP tokens, variable fees driven by a volatility accumulator. Original spec called for V3-style tick math checks; rewritten in Section 4.4. Uniswap V3 IS separately deployed on Mantle ($250K UNI grant) and gets its own secondary check.

### 13.4 x402 facilitator doesn't support Mantle (RESOLVED)

Coinbase's hosted x402 facilitator supports Base, Polygon, Arbitrum, World, and Solana — Mantle is not on that list. Decision: x402 paywall settles in USDC on Base via the public facilitator, audit registry and identity contracts stay on Mantle. Cross-chain reference is fine because audit findings reference contract addresses, not payment chains. The README documents this honestly: "payment receipt on Base, audit anchor on Mantle, both txHashes in the JSON response." Running our own Mantle facilitator is a roadmap item, not hackathon scope.

### 13.5 Agni Finance source structure (RESOLVED — deferred to Tier 2)

Agni source remained unverified at Week 2; deferred to Tier-2 reasoning only rather than writing a third DEX sub-check. The Uniswap V3 secondary check covers V3-equivalent surfaces; Agni-specific quirks (if any) surface as Tier-2 grounded findings on a per-audit basis.

### 13.6 Top-200 ranking data source (RESOLVED — Web3.py walker shipped)

Web3.py walker over Mantle blocks. Bounded `window_blocks=1500` (~50 min) per refresh, idempotent, cron-friendly. Goldsky fallback documented in the module docstring but not wired (out of hackathon scope).

### 13.7 Etherscan API key (RESOLVED — V2 migration)

The original `MANTLESCAN_API_KEY` (Etherscan V1) was retired in early 2026 — V1 endpoints are shut down. Migrated to **Etherscan API V2**: a single `ETHERSCAN_API_KEY` against `https://api.etherscan.io/v2/api`, chainId-routed, covers Mantle 5000 + Sepolia 5003 + powers both hardhat verify and the T9 source resolver. `MANTLESCAN_API_KEY` is legacy/unused.

### 13.8 Things explicitly out of scope

- ERC-7857 sealed-weights iNFT (LPLens / Slopstock use this; overkill for an audit oracle, adds 2+ weeks)
- Custom auditing LLM fine-tune (Gemini + good skills directory + hallucination guard beats fine-tuning at hackathon scale)
- Self-hosted x402 facilitator on Mantle (roadmap, not hackathon)
- Cross-chain expansion to Arbitrum / Base / Optimism (roadmap)
- Reputation-staked auditing where auditors stake MNT against their reputation (genuinely interesting, 6-month build, README mentions as future direction)

---

## 14. Spec divergences (documented, intentional, do not weaken the credibility loop)

Five intentional divergences from the original plan. Each is documented here and in `TODO.md` decisions log; none weaken the hallucination guard, the honesty labels, the oracle-signer-only-writer invariant, or the public read / signed write property.

1. **Persistence: JSON-file stores in `engine/data/`, not Postgres + Redis** (T29). Triage layer cron-runs Web3 walkers; file mtime *is* the freshness signal; corrupt/truncated files degrade to "cold cache" rather than crashing the API. Removes two infra dependencies for a solo build.
2. **Default LLM: Gemini, not Claude** (T13–T14). The user holds only a Gemini key. `GeminiProvider` is the only adapter exercised in CI; `ClaudeProvider` and `ZaiProvider` are interface-complete + key-gated + marked "untested vs live API". Z.ai stays in the README sponsor narrative honestly.
3. **x402 endpoint: synchronous, not Redis-queued** (T22). `POST /x402/audit/{address}` runs the audit inline between facilitator `/verify` and `/settle`. Cross-chain rule preserved — both Base payment + Mantle anchor txHashes in every JSON response.
4. **License settles native MNT on Mantle on-chain** (T3) — the original spec said USDC on Base via x402 for the License itself. The USDC-on-Base settlement still exists, as the parallel x402 *paywall* surface (T22), but the on-chain License contract uses native MNT for its 80/20 split. Two payment surfaces, both implemented, neither bridged to the other.
5. **Frontend: `/` is the landing page, `/app` is the dashboard** (T30). The original `docs/design.md` §12 mandated dashboard-as-home; overridden for the submission window because the demo-day video / Twitter click / DoraHacks click needs a "what is this" pitch before the dense Bloomberg terminal. Dashboard semantics + content + density-over-decoration framing unchanged — same component, one URL over.

Tier-2 validation set was ~10 contracts rather than the planned ~20 — smaller-than-planned, documented honestly in `engine/validation/README.md`. No FP storm, masked=0 by design.
