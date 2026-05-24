# CLAUDE.md — MantleProof

> The on-chain **audit oracle** for Mantle's agentic economy. Other agents query it
> before touching a contract and get back a structured safety signal in under a second.
> Mantle Turing Test Hackathon 2026, AI DevTools track, solo (Emark).

**Spec authority — do not re-derive product decisions.** `docs/mantleproof.md` (build
plan), `docs/resources.md` (bibliography), `docs/design.md` (UI/UX) are **locked**. They
already resolve the architectural forks. When in doubt, the spec wins; this file is the
operational guide on top of it.

---

## Architecture (three layers)

1. **Audit engine** (`engine/`, Python) — 5 Mantle-specific check dimensions, two tiers.
   - Tier 1: heuristic + bytecode pattern matching (cheap, runs everywhere).
   - Tier 2: LLM reasoning pass + `engine/mantleproof/skills/` briefs, then the
     **hallucination guard**, then sign + pin to IPFS + anchor on-chain.
2. **Three query surfaces, one backend** — on-chain `MantleProofRegistry.getAudit()`
   (Mantle), MCP server (`mcp-server/`, stdio), x402 REST paywall (USDC on **Base**).
   All three return the same JSON with the same honesty labels.
3. **Three agent-to-agent demos** (`agents/`) — deployer / trading / yield TS scripts
   with their own funded wallets; each flow = verifiable on-chain receipt(s) on
   **Mantle mainnet**. This is the headline deliverable.

Full ASCII diagram: `docs/mantleproof.md` §2.

### Repo layout & workspace rules

- **pnpm workspaces** for the 4 TypeScript packages: `contracts/`, `frontend/`,
  `mcp-server/`, `agents/`. Listed in `pnpm-workspace.yaml`.
- **`engine/` is standalone Python** — own `pyproject.toml`, NOT a pnpm workspace
  member, run/containerized separately.
- **Never hoist** Hardwat's ethers/OZ tree into the frontend's wagmi/viem tree — keep
  packages isolated (pnpm strict node_modules; `workspace:*` protocol).
- One `.env` at repo root. Engine reads it via pydantic-settings; TS packages via
  dotenv pointed at `../.env`. **Do not scatter `.env` files.**

### Key file index

| Concern | Path |
|---|---|
| Hallucination guard (credibility core) | `engine/mantleproof/tier2/hallucination_guard.py` |
| LLM provider Protocol + default | `engine/mantleproof/llm/provider.py`, `llm/gemini.py` |
| Per-network token addresses | `engine/mantleproof/config/mantle_tokens.py` |
| Pipeline orchestration | `engine/mantleproof/pipeline.py` |
| The 5 checks | `engine/mantleproof/checks/{usdy,meth,usde,dex,replay}_check.py` |
| Tier 2 prompt + runner | `engine/mantleproof/tier2/{prompt,runner}.py` |
| Hardhat dual-network config | `contracts/hardhat.config.ts` |
| Contracts (Path A: 4 + DecisionLog + MockUSDC) | `contracts/contracts/` |
| MCP tools | `mcp-server/src/tools/` |
| Frontend design tokens | `frontend/src/styles/globals.css`, `frontend/tailwind.config.ts` |
| Demo agents | `agents/src/{deployer,trading,yield}-agent.ts` |

---

## The five honesty labels (non-negotiable)

Every finding **must** carry exactly one. If the engine cannot assign one, the finding
does not ship.

`VERIFIED` (strongest provenance) · `COMPUTED` (mathematically derived) ·
`ESTIMATED` (heuristic) · `EMULATED` (simulated) · `LABELED` (manual).

## The hallucination-guard invariant (never weaken this)

Before any Tier 2 report is signed/anchored: every `$`, `%`, hex literal, and address
claim in the LLM output is regex-extracted and verified against the contract source
line / bytecode offset / Tier 1 findings. Unverifiable claims are masked
`[unsupported]` **and the finding's label drops one tier** (VERIFIED→COMPUTED→…). The
count of masked claims is shown publicly ("Hallucination guard fired: N masked").
Label-drop is a **pure, unit-tested function** independent of any LLM provider. This
is the single most credibility-purchasing piece of the project — do not relax it,
do not hide it.

---

## LLM provider

- Selected by env `AUDIT_LLM_PROVIDER` — **default `gemini`**.
- `GeminiProvider` is the only provider exercised in CI (user has only a Gemini key).
- `ClaudeProvider` / `ZaiProvider` are interface-complete, **key-gated**, shape-tested
  with mocked transport only. Mark them clearly "untested vs live API". Z.ai stays in
  the README sponsor narrative (it is on the judging panel) — keep that honest.
- `LLMProvider.reason()` returns **raw text**. Parsing + the hallucination guard must be
  **provider-agnostic** — never rely on Anthropic tool-use structured output.

## Network: testnet-first + mainnet cutover gate

- Develop/iterate on **Mantle Sepolia (chainId 5003)**. Set `MANTLE_NETWORK=mantleSepolia`.
- Final contract deploy + **all demo receipts on Mantle mainnet (chainId 5000)**.
- **Mainnet cutover gate** — do NOT deploy to mainnet until ALL hold:
  1. `smoke-roundtrip` green on Sepolia (post audit → `getAudit` → advance `memoryRoot`).
  2. Full `pipeline.py` run end-to-end on Sepolia against a Sepolia-deployed test target.
  3. Tier 2 precision acceptable on the ~20-contract validation set.
  4. Path A/B resolved ✅ (Path A — see Contract path).
  5. `mantle_tokens.py` mainnet column human-verified.
  Cutover is a config flip (`MANTLE_NETWORK=mantle`) + fresh deploy — **not new code**.
- **Contract verification uses Etherscan API V2** (mandatory since 2026 — the old
  per-explorer V1 endpoints are shut down). One free `etherscan.io` key
  (`ETHERSCAN_API_KEY`), chainId-routed via `https://api.etherscan.io/v2/api`,
  covers Mantle 5000 + Sepolia 5003. Same key + endpoint powers the T9 source
  resolver. The legacy `MANTLESCAN_API_KEY` is unused.

## Per-network token addresses

`engine/mantleproof/config/mantle_tokens.py` is **network-keyed**:
`{5000: {real mainnet addresses}, 5003: {mostly None / our test deploys}}`. The five
checks target **real mainnet** protocol contracts (USDY/mUSD, bridged mETH, USDe/sUSDe,
Merchant Moe LB, Uniswap V3) even while the engine and our contracts run on Sepolia —
the source resolver reads mainnet target source via Mantlescan independent of the
anchor chain. The mainnet column is a build-time, human-verified artifact (Week 1,
~20–30 min on Mantlescan + each protocol's site). Do not defer it.

## Contract path — **Path A** (decided 2026-05-18, T1 resolved)

Mantle issues every participating agent's ERC-8004 identity NFT automatically as an
integrated hackathon feature. **We do NOT deploy our own Identity Registry.** We deploy
**6** contracts (post-T43, 2026-05-24 — was 5 pre-T43) and register/call into Mantle's
official registries:

- `MantleProofRegistry.sol` — append-only audit registry **+ disputes layer (T43)**.
  `submitAudit(target, tier, severity, rootHash, ipfsCID)` is payable; Tier 2 calls
  MUST forward `TIER2_STAKE = 2 MNT` which is forwarded into `StakingPool.lockStake`
  in the same tx. `submitDispute(rootHash, findingIndex, ipfsCID)` is permissionless;
  `resolveDispute(disputeId, outcome, reAuditRootHash)` is oracle-only. Tier 1 audits
  are NOT disputable (`Tier1NotDisputable`). `claimExploit` is RESERVED post-hackathon.
- `MantleProofAgent.sol` — **thin wrapper** around Mantle's official ERC-8004 identity:
  tracks per-audit `memoryRoot` + `auditsPerformed`. Reputation lives on the **official
  Reputation Registry** (read directly — `MantleProofAgent.reputation()` / `agentURI()`
  in the deployed bytecode were compiled against a fictional pre-T38 interface and
  revert on-chain; T38 marked them defunct in source). Paying agents leave on-chain
  ERC-8004 feedback about MantleProof through the official registry's
  `giveFeedback(96, …)` — first live mainnet receipt 2026-05-23 (T40). MantleProof
  itself never signs feedback or holds a feedback-signer key.
- `StakingPool.sol` (NEW — T43) — holds 2 MNT for each Tier 2 audit for a 30-day
  window. `slashByDispute` (registry-only) transfers to the disputer on RETRACTED.
  `unlock(rootHash)` is permissionless after `unlocksAt`; 99% → treasury, 1% retained.
  `claimExploit` reserved comment block.
- `MantleProofLicense.sol` — pay-per-audit / subscription, 80/20 split.
- `TreasurySplit.sol` — 20% treasury share.
- plus `DecisionLog.sol` (demos) and `MockUSDC.sol` (tests).

Official registry addresses are **resolved and verified live** (T1b, 2026-05-18) —
canonical per-chain values in `contracts/config/registries.ts`, env
(`MANTLE_IDENTITY_REGISTRY`/`MANTLE_REPUTATION_REGISTRY`) overrides only:

| | Mantle mainnet 5000 | Mantle Sepolia 5003 |
|---|---|---|
| Identity Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Reputation Registry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

(Canonical deterministic deployments from `github.com/erc-8004/erc-8004-contracts`,
confirmed via `eth_getCode` on each RPC. No Validation Registry — not needed.)
`contracts/contracts/interfaces/IEIP8004.sol` holds the **external** interfaces we
*consume* — not contracts we deploy. MantleProof's own ERC-8004 tokenId is assigned
on hackathon registration (`MANTLEPROOF_AGENT_TOKEN_ID`, pending — T5). Path B (own
registries) is abandoned; the planning-doc default is superseded by this.

## x402 cross-chain rule

Payment settles **USDC on Base** (`eip155:8453`); audit anchors on **Mantle**
(`eip155:5000`). **Both txHashes appear in every JSON response.** Always label the
payment chain in UI ("0.50 USDC paid on base eip155:8453"). Cross-chain is fine —
audit findings reference contract addresses, not payment chains.

---

## Commands

```bash
# Setup
pnpm install
cd engine && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"

# Typecheck / lint / test
pnpm -r typecheck
pnpm --filter @mantleproof/contracts exec hardhat compile
cd engine && pytest && ruff check . && mypy .

# Contracts (testnet-first!)
cd contracts
pnpm exec hardhat run scripts/deploy.ts --network mantleSepolia
pnpm exec hardhat run scripts/smoke-roundtrip.ts --network mantleSepolia
# mainnet ONLY after the cutover gate:
pnpm exec hardhat run scripts/deploy.ts --network mantle

# Engine API
cd engine && uvicorn mantleproof.main:app --reload

# MCP server
cd mcp-server && pnpm build && node build/index.js

# Frontend
cd frontend && pnpm dev
```

## Do-not-touch list

- **Never commit** `.env` or any private key. `.env.example` is the only env file in git.
- **Never deploy to Mantle mainnet** outside the cutover gate.
- **Never weaken / hide** the hallucination guard or the honesty labels.
- **Out of scope** (`docs/mantleproof.md` §13.8) — do NOT build: ERC-7857 sealed-weights
  iNFT, self-hosted x402 facilitator on Mantle, cross-chain expansion, custom LLM
  fine-tune.
- The **oracle-signer key is the only writer** to `submitAudit`. Public read, signed write.
- Frontend: no light mode, no spinners (use `pulse-running` dot), ASCII charts only,
  no emoji in product UI. `docs/design.md` is authoritative.
- The three `docs/*.md` specs are locked — do not re-derive product decisions from them.

## Project tracking

`TODO.md` is the live task list — pinned Critical Path block at top, then setup
checklist, then week sections, Blocked/waiting, and an append-only Decisions log.
Work the Critical Path block first.
