# MantleProof — Build Resources

A working bibliography organized by build phase. Each resource is verified to exist as of May 2026. Treat URL behavior as fragile — Mantle docs especially have moved around; if a link breaks, the search terms in each section will find the replacement.

URLs you already have (not repeated below): mantle.xyz, github.com/mantlenetworkio, docs.mantle.xyz/network, docs.byreal.io/realclaw.

---

## 1. Network & deployment fundamentals (Week 1)

**Mantle mainnet chain config**
- Chain ID: `5000` (hex `0x1388`)
- Native gas: MNT
- RPC: `https://rpc.mantle.xyz/` (official), `https://mantle.drpc.org`, `https://rpc.ankr.com/mantle`
- WebSocket: `wss://ws.mantle.xyz`
- Block explorer (Blockscout): https://explorer.mantle.xyz/
- Block explorer (Etherscan-style, what most devs use): https://mantlescan.xyz/
- Bridge: https://bridge.mantle.xyz/
- Testnet (Sepolia) — Chain ID `5003` via Routescan, faucet/explorer at https://5003.testnet.routescan.io/
- Block time ~2s; EVM-equivalent via OP Stack; EigenDA for data availability
- Withdrawals to L1 are ~7 days under the standard optimistic challenge period

**Contract verification**
- Mantle mainnet: https://mantlescan.xyz/ (Etherscan-compatible API; same Hardhat verify flow you used for zkFabric, just point `customChains` at the Mantle endpoint with chainId 5000)
- Mantle docs verification guide: https://www.mantle.xyz/blog/developers/how-to-verify-contracts-via-mantles-mainnet-explorer
- Alt path: Blockscout-style Sourcify verification at explorer.mantle.xyz

**Mantle SDK & tooling**
- Official SDK: `@mantleio/sdk` on npm — wraps deposit/withdrawal/bridge interactions
- Source: https://github.com/mantlenetworkio (parent org, multiple repos)
- Quicknode docs: https://www.quicknode.com/docs/mantle
- Standard tools (Hardhat, Foundry, viem, ethers, web3.py) all work without modification because Mantle is EVM-equivalent

**Note for Hardhat config** — add Mantle as a custom chain:
```js
networks: {
  mantle: {
    url: "https://rpc.mantle.xyz",
    chainId: 5000,
    accounts: [process.env.DEPLOYER_PRIVATE_KEY]
  }
},
etherscan: {
  apiKey: { mantle: process.env.MANTLESCAN_API_KEY },
  customChains: [{
    network: "mantle",
    chainId: 5000,
    urls: {
      apiURL: "https://api.mantlescan.xyz/api",
      browserURL: "https://mantlescan.xyz"
    }
  }]
}
```

---

## 2. Ecosystem protocol docs (Week 2 — the audit checks)

These are the protocol-specific references that the five audit-check modules read against. Each `skills/<protocol>.md` brief in the audit engine's skills directory should cite the relevant doc.

### 2.1 Ondo USDY / mUSD (USDY check module)
- Integration guidelines for protocols supporting USDY on Mantle: https://docs.ondo.finance/developer-guides/mantle-integration-guidelines
- Key contracts referenced: `USDY.sol`, `rUSDY.sol` (= mUSD, the rebasing variant), `RWADynamicRateOracle.sol`, `IRWADynamicOracle.sol`
- Transfer hook: `beforeTransfer(address,address,uint256)` — enforces blocklist
- Price formula in oracle: `currentPrice = (Range.dailyInterestRate ** (Days Elapsed + 1)) * Range.lastSetPrice`
- Critical bug pattern to detect: balance-snapshot accounting on mUSD (it rebases — snapshots break)
- Critical bug pattern: treating USDY and mUSD as 1:1 fungible (they're not; mUSD is wrapped USDY at $1 peg via rebase)

### 2.2 mETH (mETH check module)
- mETH Protocol docs: https://docs.mantle.xyz/meth
- Exchange-rate doc: https://docs.mantle.xyz/meth/concepts/risk-management/exchange-rate
- Source contracts: https://github.com/mantle-lsp/contracts
- **Critical note for the spec**: mETH's canonical deployment is on **Ethereum L1** at `0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa`, not Mantle L2. On Mantle, it's a bridged wrapped representation — verify the Mantle L2 address at build time (token tracker pages and Mantle's official ecosystem page should list it). Both the Staking contract and Oracle contract live on L1.
- cmETH = restaked mETH variant (different risk profile, different oracle)
- Liquidity Buffer (Oct 2025+) routes redemption through Aave — adds another integration surface to audit
- Bug pattern: balance-based proportional accounting (`mETH.balanceOf(x) / totalSupply * X` — wrong, mETH accrues via exchange rate, not balance changes)

### 2.3 Ethena USDe / sUSDe (USDe check module)
- USDe is a synthetic dollar on Ethereum; bridged to Mantle as a wrapped token
- sUSDe is staked USDe with a 7-day cooldown on redemption
- Mantle ecosystem reference: ~20% of Mantle's treasury earnings are in $ENA
- Verify the Mantle L2 USDe and sUSDe addresses at build time via Mantle's official token list or Mantlescan
- Bug pattern: vault contracts assuming instant sUSDe redemption (the 7-day cooldown will brick them during volatility)
- Official Ethena docs: https://docs.ethena.fi/

### 2.4 Merchant Moe (DEX check module — REWRITE NEEDED)
- Docs: https://docs.merchantmoe.com/
- **Critical**: Merchant Moe uses **Liquidity Book v2.2** (forked from Trader Joe / LFJ Dex), **NOT** Uniswap V3-style tick math. Different semantics:
  - Discrete **bins** instead of ticks
  - Constant-sum (x + y = k) within a bin, NOT constant-product
  - LP tokens are **ERC-1155** (with ERC-721 functionality removed), not ERC-721
  - First-ever LB hook: "Concentrated Incentives" — purpose-built for Mantle
- Source repos: https://github.com/merchant-moe (moe-core, autopools, joe-v2 fork)
- Differences-from-V3 doc: https://docs.merchantmoe.com/liquidity-book/introduction-to-liquidity-book/differences-to-uniswap-v3
- Contract addresses: MOE token at `0x4515A45337F461A11Ff0FE8aBF3c606AE5dC00c9` (Mantle mainnet); full address list in their docs under Resources > Contracts
- Bug patterns to detect: bin-architecture LP positions minted without bin-id validation, ERC-1155 transfer hooks that don't account for LB semantics, fee tier misreads (LB has variable fees driven by a volatility accumulator)

### 2.5 Agni Finance (DEX check module — secondary)
- Native Mantle DEX, surfaced as a Phase 1 ClawHack venue alongside Merchant Moe and Fluxion
- Likely Uniswap V3-style (based on Phase 1 hackathon framing) but verify at build time before writing checks
- Lookup: search Mantlescan for verified Agni router/factory contracts; check their docs site

### 2.6 Uniswap V3 on Mantle (bonus surface)
- Uniswap V3 IS officially deployed on Mantle (Uniswap DAO funded with $250K UNI)
- Standard V3 tick math applies for Uniswap pools specifically — good fallback for the DEX check
- RFC: https://gov.uniswap.org/t/rfc-deploy-uniswap-v3-on-mantle-network/24193
- Standard V3 contract addresses on Mantle: pull from the Uniswap deployment receipt in the RFC

### 2.7 EIP-712 chain-ID & cross-chain replay (replay check module)
- Mantle chain ID is `5000` — any contract with a hardcoded `chainId = 1` in its domain separator is broken
- EIP-712 spec: https://eips.ethereum.org/EIPS/eip-712
- The most common bug in forked code is leaving Ethereum's `chainId = 1` in EIP-712 typed data — detect via storage slot inspection for known domain-separator layouts
- Also flag hardcoded `2300` gas constant for ETH transfer (OP Stack handles this differently than mainnet in some paths)

---

## 3. Agent identity & reputation (ERC-8004)

**EIP-8004 canonical spec**
- https://eips.ethereum.org/EIPS/eip-8004
- Status: Draft as of Aug 13, 2025; formally unveiled by Ethereum Foundation dAI team + Consensys Oct 9, 2025
- Authors: Marco De Rossi (MetaMask), Davide Crapis (Ethereum Foundation), Jordan Ellis (Google), Erik Reppel (Coinbase)

**Three registries — important architectural detail for the spec**
- **Identity Registry**: ERC-721 with URIStorage extension. Each agent's tokenURI points to an agent registration file (JSON) describing capabilities, service endpoints (MCP, A2A, web), payment address.
- **Reputation Registry**: standardized interface for posting/fetching feedback signals
- **Validation Registry**: cryptographic and economic verification of agent work
- All three are per-chain singletons — deploy once, register many agents against them

**Implications for MantleProof's contract design**: my original spec had a single `MantleProofAgent.sol` doing identity + reputation. The cleaner pattern is to **deploy our own Identity + Reputation + Validation registries on Mantle** (since none exist there yet — Base Sepolia has the reference impl, Mantle does not), then register MantleProof itself as agent #1 in those registries. That makes us not just a participant in the agent economy but the **infrastructure provider for it on Mantle** — much stronger judge framing.

**Reference implementations**
- Ava Labs ERC-8004 boilerplate: search "Ava Labs ERC-8004 boilerplate" — testnet reference only, but useful for cribbing the registry interfaces
- Base Sepolia reference deployment: live at the time of writing — useful to clone the ABI
- Developer guide: https://blog.quicknode.com/erc-8004-a-developers-guide-to-trustless-ai-agent-identity/
- Practical walkthrough with Filecoin Pin: https://dev.to/hammertoe/making-services-discoverable-with-erc-8004-trustless-agent-registration-with-filecoin-pin-1al3

**Companion standards** worth knowing exist:
- **ERC-6551 token-bound accounts** — let an ERC-721 (the agent NFT) own a smart contract wallet. ERC-8004 explicitly anticipates this. Optional for MantleProof v1.
- **ERC-7857** intelligent NFT with sealed-weights re-encryption (used by Slopstock + LPLens). Out of scope for MantleProof.

---

## 4. Payment rails (Week 4 — x402)

**x402 protocol**
- Official site: https://www.x402.org/
- Foundation/spec: https://github.com/x402-foundation/x402 (formerly coinbase/x402)
- Coinbase Developer Platform docs: https://docs.cdp.coinbase.com/x402/welcome
- Awesome list (curated implementations): https://github.com/xpaysh/awesome-x402

**Critical decision point for Mantle**
- Coinbase's hosted x402 facilitator supports Base, Polygon, Arbitrum, World, Solana — **NOT Mantle**
- Two options at build time:
  - **(A) Use Base USDC for the x402 paywall layer**, keep Mantle for the audit registry. Simplest. Pays go to a Base address; audits live on Mantle. Cross-chain provenance is fine because the audit findings reference contract addresses, not payment chains.
  - **(B) Run our own facilitator on Mantle**. The protocol allows this. Real-but-tedious — we'd need to deploy verifier/settlement infra ourselves. Skip for hackathon unless we want a sponsor-worthy moat.
- Recommendation: ship (A), document (B) as roadmap.

**Token mechanics**
- Default token: USDC (EIP-3009 `transferWithAuthorization` for gasless flow)
- Alternative: any ERC-20 via Permit2
- Settlement: ~2 seconds on Base, fees under $0.001
- CAIP-2 network identifiers: `eip155:8453` for Base, `eip155:5000` for Mantle

**SDK packages**
- TypeScript: `@x402/core`, `@x402/evm`, `@x402/express`, `@x402/fastify`, `@x402/next`, `@x402/fetch`
- Python: x402 facilitator/server in Python (search the awesome-x402 list)
- One-line middleware example (Express): see the x402.org landing page

---

## 5. MCP server (Week 4)

**Official spec & SDK**
- Spec: https://modelcontextprotocol.io/
- TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
  - `npm install @modelcontextprotocol/sdk zod`
  - `McpServer` + `StdioServerTransport` is the minimal pattern
- Build pattern: `tsc && chmod 755 build/index.js` then publish to npm with a bin entry so users can run `npx mantleproof-mcp`

**Three tools to expose**
- `auditContract(address)` — pull cached audit, or trigger paid audit if not cached
- `getAudit(address)` — read-only lookup from `MantleProofRegistry`
- `requestAudit(address, tier)` — paid Tier 2 audit via x402

**Reference implementations to crib from**
- Slopstock's MCP server: github.com/forever8896/slopstock under `apps/operator/`
- LPLens's six-tool MCP server: github.com/JeanBaptisteDurand/Open_Agent_2026 under `apps/mcp-server/`
- Cards402 SDK + MCP: github.com/CTX-com/Cards402 under `sdk/`

**Distribution pattern**
- Publish to npm as `mantleproof-mcp` with a `bin` field in package.json
- README documents the Claude Desktop config snippet users paste:
  ```json
  {
    "mcpServers": {
      "mantleproof": {
        "command": "npx",
        "args": ["-y", "mantleproof-mcp"]
      }
    }
  }
  ```

---

## 6. LLM provider adapters (Week 3)

**Claude (primary)**
- Anthropic SDK: `pip install anthropic` (Python), `npm install @anthropic-ai/sdk` (TypeScript)
- Docs: https://docs.claude.com/
- Models: `claude-opus-4-7` (most capable), `claude-sonnet-4-6` (balanced), `claude-haiku-4-5-20251001` (cheapest, fastest)
- For audit reasoning: default to Sonnet for cost-quality balance, escalate to Opus on high-severity findings
- Anthropic API key + tool use: https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview

**Z.ai (sponsor adapter)**
- Z.ai is the rebrand of Zhipu AI (GLM models)
- API docs: search "Z.ai API" or "GLM-4.5 API" — endpoints are OpenAI-compatible, so the adapter is small
- Sponsor signal: Z.ai is on the Turing Test judging panel. Real adapter, env-var swap, README credits — that's the move.

**OpenAI (optional, roadmap)**
- Standard OpenAI Python/Node SDK
- Useful as a third adapter to prove the abstraction is real

---

## 7. The hackathon-specific surfaces (already in your possession)

For completeness, links you have but should re-skim regularly:

- DoraHacks hackathon page: https://dorahacks.io/hackathon/mantleturingtesthackathon2026/detail
- Mantle DevHub (Phase 2 tracks, prizes, sponsor map): https://devhub.mantle.xyz/
- Phase 1 ClawHack announcement (attached to your earlier message)
- Compute credits application — apply early; budget is $110K worth of inference + on-chain data across all teams. Linked from devhub.mantle.xyz.

---

## 8. Hackathon judge / panelist reference

When writing the README's sponsor capture section, you want to reference the right thing for each panelist. Quick map:

- **Allora Network** — decentralized AI inference network; mentioning "Allora-style inference" or "verifiable AI" earns a nod. https://allora.network/
- **Nansen** — on-chain analytics, smart-money tagging. https://www.nansen.ai/
- **Z.ai** — see section 6 above
- **Animoca Brands** — Web3 gaming/IP investor; consumer narrative matters to them
- **Hashed**, **Caladan**, **Four Pillar** — crypto-native VCs; revenue mechanism, market hypothesis, defensibility
- **DoraHacks** — hackathon platform itself; clean repo + judge-quick-eval section is direct submission hygiene
- **Elfa AI** — agent-focused tools; MCP integration earns nods
- **Virtuals Protocol** — agent identity / agent commerce; ERC-8004 integration is the headline
- **BGA (Blockchain for Good Alliance)** — public-good framing; "audit oracle as public safety infra for Mantle" is the right pitch
- **UHK academic** — academic rigor; the AT-style acceptance tests, the hallucination guard, and the honesty labels are the right signals

---

## 9. Code references (winning submissions to crib from)

Open these in tabs and keep them open through the build:

- **Slopstock** — agent-to-agent x402, MCP server, ERC-7857 iNFT memory advancement, Bloomberg dashboard. The "agents paying agents" pattern is the most direct precedent. https://github.com/forever8896/slopstock
- **LPLens** — honesty labels (VERIFIED/COMPUTED/ESTIMATED/EMULATED/LABELED), AT-4 hallucination guard, ERC-7857-style royalty licensing with 80/20 split, six-tool MCP server, on-chain proof tables. The single biggest source of patterns. https://github.com/JeanBaptisteDurand/Open_Agent_2026
- **Genesis Protocol** — multi-module composable audit architecture with on-chain anchoring, Engineering Debug Log section, on-chain proof receipts at scale (157+ txs). The structure of a heavy single-track submission. https://github.com/0xCaptain888/genesis-protocol
- **SynthLaunch** — ERC-8004 agent identity with signature-bound treasury, judge-quick-evaluation section, multi-chain config patterns. https://github.com/V-SK/synthlaunch
- **Cards402** — clean npm-published SDK + MCP server + CLI, x402 paywall pattern. Smallest in scope but cleanest packaging. https://github.com/CTX-com/Cards402

---

## 10. Infra & ops (Week 6 — deployment)

**Hosting (engine + Postgres + Redis)**
- Railway (https://railway.app/) — easiest Python+Postgres+Redis deploy; ~$20/month
- Fly.io (https://fly.io/) — slightly more control; ~$20/month
- Render (https://render.com/) — comparable

**Hosting (frontend)**
- Vercel — Next.js / Vite frontends, free tier handles hackathon traffic

**IPFS pinning** (for full audit reports)
- Pinata — easiest, free tier: https://www.pinata.cloud/
- Web3.Storage — Filecoin-backed, free: https://web3.storage/
- Filecoin Pin (used by ERC-8004 reference walkthrough above)

**Indexers (for the top-200 cache warmer)**
- Allium — paid, B2B
- Dune via API — pay-per-query, free tier
- Goldsky — subgraph-as-a-service, has Mantle support
- For hackathon scope, simplest: write a Web3.py script that walks recent Mantle blocks for `CREATE`/`CREATE2` events and ranks contracts by interaction count. Slower but free.

**RPC providers (production)**
- dRPC: https://drpc.org/ — used by Mantle's own docs as recommended provider
- Ankr: https://www.ankr.com/rpc/mantle/ — solid paid tier
- Quicknode: https://www.quicknode.com/docs/mantle — premium

---

## 11. Likely build-time questions worth flagging now

Things I expect you'll need to research during the build that don't have clean answers yet:

1. **Mantle L2 addresses for USDY/mUSD/USDe/sUSDe** — these aren't always one-click findable. Plan to spend 20 mins on Mantlescan + each protocol's official site verifying current canonical addresses. Pin them in `engine/config/mantle_tokens.py`.

2. **Agni Finance source verification** — confirm it's Uniswap V3-style before writing checks. If it has its own quirks (forks often do), document them.

3. **Top-200 ranking source** — pick one (Dune query, Goldsky subgraph, custom Web3.py walker). Build-time decision in Week 2.

4. **Whether Mantle has a contract verification API key requirement** — Mantlescan likely needs one for high-rate API access. Apply early (free) on mantlescan.xyz.

5. **x402 facilitator on Mantle** — decision: Base USDC for paywall vs. self-hosted facilitator on Mantle. Default to Base, revisit if there's time.

6. **Whether the hackathon's ERC-8004 issuance is automatic** — the announcement says "every participating AI agent is issued a unique identity NFT via ERC-8004." Is that done by Mantle's central infrastructure, or do we deploy our own Identity Registry? Critical question — ask on the DoraHacks discussion board early.

---

## 12. What you don't need (resist the urge)

To keep scope honest, things I'd recommend explicitly *not* researching unless time is a surplus:

- **ERC-7857 iNFT sealed-weights spec** — Slopstock and LPLens both use it. Tempting, but it's overkill for an audit oracle and adds 2+ weeks. Stick to ERC-8004.
- **Mantle DA / EigenDA internals** — fun to read, irrelevant to building MantleProof
- **The Liquidity Book v3 spec if it exists** — Merchant Moe is on LB v2.2; build against that
- **Cross-chain expansion to Arbitrum / Base** — roadmap, not hackathon
- **A custom auditing LLM fine-tune** — Claude + good skills directory + hallucination guard beats fine-tuning at hackathon scale

---

That's the working bibliography. As you hit each build phase, walk the relevant section first. Anything that doesn't have a verified link is flagged as a build-time research item. If a link breaks during the build, the search terms in each section will recover it.
