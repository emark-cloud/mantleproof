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
- **Sepolia explorer is Routescan** (`5003.testnet.routescan.io`), NOT Mantlescan.
  Mainnet verify uses Mantlescan (`api.mantlescan.xyz`). Confirm the exact Sepolia
  verify apiURL in Week 1 — do not assume a `mantlescan.xyz` Sepolia endpoint exists.

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
only **4** contracts and register/call into Mantle's official registries:

- `MantleProofRegistry.sol` — append-only audit registry (our own).
- `MantleProofAgent.sol` — **thin wrapper** around Mantle's official ERC-8004 identity:
  tracks per-audit `memoryRoot`, `auditsPerformed`, reputation; calls Mantle's official
  Reputation Registry on each audit.
- `MantleProofLicense.sol` — pay-per-audit / subscription, 80/20 split.
- `TreasurySplit.sol` — 20% treasury share.
- plus `DecisionLog.sol` (demos) and `MockUSDC.sol` (tests).

The official registry addresses (Identity confirmed Mantle-provided; Reputation/
Validation + per-network addresses still to be obtained) come from env
(`MANTLE_IDENTITY_REGISTRY`, `MANTLE_REPUTATION_REGISTRY`) and are passed to
`MantleProofAgent` at deploy. `contracts/contracts/interfaces/IEIP8004.sol` holds the
**external** interfaces we *consume* — not contracts we deploy. Path B (own registries)
is abandoned; the planning-doc default is superseded by this.

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
docker-compose up -d                       # postgres + redis

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
