# MantleProof

> **MantleProof is an audit oracle that agents call before they transact — and it
> tells them when it isn't sure.**

### How it works



- **What does it check?** Five Mantle-specific risk dimensions — USDY/mUSD rebase,
  mETH bridge lag, USDe/sUSDe cooldown, Merchant Moe Liquidity Book bins, EIP-712
  replay.
- **How does it price audits?** Tier 1 free heuristic + bytecode matching; Tier 2
  paid Gemini reasoning pass. 
- **Why trust an AI's findings?** The five honesty labels and the hallucination
  guard tell you exactly which claims are grounded — plus every audit is published
  with its full report on IPFS, so anyone independently recomputes the on-chain
  `rootHash` from the bytes without trusting our backend. Credibility rests on that
  integrity check, not on us.
- **How do agents reach it?** On-chain `getAudit`, MCP server, x402 REST endpoint —
  the same JSON with the same labels. 

## Why MantleProof needs to exist

A human developer interacting with a new contract has time — read the source, run
Slither, check the deployer's history, ask in a Telegram group. The agentic economy
Mantle is explicitly building has no such time: trading agents, yield agents, and
deployer agents make on-chain decisions in sub-second windows with no human in the
loop. That creates a structural gap — high-frequency autonomous on-chain decisions
with no time for human due diligence and no human present to do it. The gap is
created by the exact trend the Turing Test Hackathon is built around, and nothing
currently fills it.

It's also a *format* gap. Slither is text. A professional audit is a PDF. A bug
bounty is a human process. None of these is a structured, machine-parseable,
sub-second response an agent can consume and act on. There is no `getAudit(address)`
an agent can call — so MantleProof is built oracle-first: JSON responses, on-chain
`getAudit`, MCP tools, structured findings with machine-readable severity and
evidence. 

## Judge Quick Eval (3 minutes)

| # | Check | How to verify |
|---|---|---|
| 1 | **The audit registry is live on Mantle mainnet.** | Open the [MantleProofRegistry](https://mantlescan.xyz/address/0xcF3703BD76C64DA8a13461e820456d0576662aaf) — recent `AuditSubmitted` events show real targets with severity codes. The signer matches the immutable `oracleSigner` view. |
| 2 | **The three demo audits are anchored on-chain.** | Three `submitAudit` txs from the oracle signer: Demo 1 [`0xcb471577…`](https://mantlescan.xyz/tx/0xcb471577eac210723213df4829a25dc8ceec32b894664fc0adc504c83c55daee), Demo 2 [`0xb26c83f5…`](https://mantlescan.xyz/tx/0xb26c83f52011438a10d4ad3b3aac7f447a855e7f3846c5fa26cd2981d18bc77c), Demo 3 [`0x53072067…`](https://mantlescan.xyz/tx/0x53072067116ccf88d68306368d19dce4205d8e7c09cd70dadb7729a1b8b5f229). Each is anchored for gas only on the staking-free registry. |
| 3 | **Agents acted on those audits.** | `DecisionLog` records Demo 2's trading agent **DECLINING** the backdoored token ([`0x385eaded…`](https://mantlescan.xyz/tx/0x385eaded6f7eba0191ed00972e60077ea4041667c4329a19d400a33efd351119)) and Demo 3's yield agent **APPROVING** the canonical LBRouter ([`0x82760ff2…`](https://mantlescan.xyz/tx/0x82760ff271172d2ce6209a25e880072ffc67781a181ff536c933f6c5416e1725)) — opposite verdicts, both grounded in MantleProof audits. Demo 3's APPROVED is paired with a real Merchant Moe LB v2.2 [`addLiquidityNATIVE`](https://mantlescan.xyz/tx/0x52904eb2c3b9882c35610dc187c75cbf54ae8eff7a4223e691bd8a1ff37f439e) deposit. |
| 4 | **A paying agent left ERC-8004 reputation about MantleProof.** | [`giveFeedback` tx `0x579fe213…`](https://mantlescan.xyz/tx/0x579fe213972b056d9d1bd83023d179052cf5084e5e4417f20302b314af4b26f5) on Mantle's canonical Reputation Registry (`0x8004BAa1…`). `getSummary(96, [payer], "", "")` returns `count=1, value=4`. |
| 5 | **Independent verification, no trust.** | `cast call 0xcF3703BD76C64DA8a13461e820456d0576662aaf "getAudit(address)((bytes32,uint8,string,uint64,address,uint8))" 0x1892f77e335c133ce4a7b28555f13ba74cbb76fa --rpc-url https://rpc.mantle.xyz` returns the same Demo 1 `rootHash` (`0x88e98d22…`) shown above — or run `npx mantleproof check 0x1892f77e335c133ce4a7b28555f13ba74cbb76fa`. Fetch the IPFS body (`bafkreibnyidf…`); its embedded `root_hash` equals the on-chain anchor, fetched from the content-addressed CID. 

## Architecture

Three layers, one signed write path:

```
  agents          ─query─►  MantleProof oracle  ─publish─►  Mantle registry (immutable)
  (Mantle / any chain)        (engine, off-chain)            5 contracts on chainId 5000
       ▲                                                            │
       └────── read getAudit() / MCP getAudit / REST /api/audit ◄───┘
```

1. **Audit engine** (`engine/`, Python). Two tiers:
   - **Tier 1** — heuristic + bytecode pattern matching across the five Mantle
     dimensions (USDY/mUSD, mETH, USDe/sUSDe, Merchant Moe LB v2.2, EIP-712 replay).
     ~1 ms p50 on the validation set.
   - **Tier 2** — Gemini reasoning pass + protocol-brief skills, then the
     **hallucination guard**, then canonical JSON → keccak256 `rootHash` → IPFS
     pin → oracle-signed `submitAudit` on Mantle. Audits anchor for gas only
     (economic staking is roadmap).
2. **Three query surfaces, one backend.** On-chain
   `MantleProofRegistry.getAudit(target)`, MCP server (`npx -y mantleproof-mcp`,
   stdio, 3 tools), REST + x402 paywall (USDC on Base settles, audit anchors on
   Mantle). All three return the same JSON with the same five honesty labels.
3. **Three agent-to-agent demos** (`agents/`) — `deployer-agent`, `trading-agent`,
   `yield-agent` — each with its own funded wallet (no key wears two hats).

## The five honesty labels

Every finding ships with exactly one. If the engine can't assign one, the finding
does not ship.

| Label | Meaning |
|---|---|
| **VERIFIED** | Strongest provenance — claim grounded in verified source line + bytecode offset, both confirm. |
| **COMPUTED** | Mathematically derived from on-chain or source-line state. |
| **ESTIMATED** | Heuristic — pattern-matched but not formally proven. |
| **EMULATED** | Simulated via off-chain execution. |
| **LABELED** | Manual tag (floor — used when the guard drops a label too many tiers). |

The **hallucination guard** is the credibility core. Before any Tier 2 report is
signed and anchored, every `$`, `%`, hex literal, and address claim in the LLM
output is regex-extracted and verified against the contract source line,
bytecode offset, or Tier 1 findings. Unverifiable claims are masked
`[unsupported]` AND the finding's label drops one tier (VERIFIED → COMPUTED → …).
The masked-claim count is shown publicly on every audit (`Hallucination guard
fired: N masked`). Label-drop is a pure, unit-tested function, independent of any
LLM provider — see [`engine/mantleproof/tier2/hallucination_guard.py`](engine/mantleproof/tier2/hallucination_guard.py).

## Smart contracts (Mantle mainnet 5000)

Five contracts deployed (Etherscan V2 verified). MantleProof
is also registered as agent **#96** on Mantle's canonical ERC-8004 registries —
we are a tenant of that infrastructure, not its operator. (`StakingPool` is not
in the deployed MVP stack — economic staking is roadmap; see below.)

| Contract | Address | Role |
|---|---|---|
| `MantleProofRegistry` | [`0xcF3703BD76C64DA8a13461e820456d0576662aaf`](https://mantlescan.xyz/address/0xcF3703BD76C64DA8a13461e820456d0576662aaf) | Append-only audit registry + disputes layer. `submitAudit(target, tier, severity, rootHash, ipfsCID)` nonpayable — audits anchor for gas only (economic staking is roadmap); `submitDispute` permissionless; `resolveDispute` oracle-only. |
| `MantleProofAgent` | [`0x6661Fb91CfA5F5691E3F80cA319b665824CB02e9`](https://mantlescan.xyz/address/0x6661Fb91CfA5F5691E3F80cA319b665824CB02e9) | Thin wrapper around our ERC-8004 identity (tokenId 96). Tracks `memoryRoot` (compounding keccak chain over all audits) + `auditsPerformed`. |
| `MantleProofLicense` | [`0x51fA686747ea148f6BeC7e30390C8B929DC45447`](https://mantlescan.xyz/address/0x51fA686747ea148f6BeC7e30390C8B929DC45447) | `payForAudit(target)` (0.5 MNT) and `subscribe()`. 80/20 split to iNFT owner / treasury. |
| `TreasurySplit` | [`0xEaea8a20288528ea6E55B619DB3F7442890c9600`](https://mantlescan.xyz/address/0xEaea8a20288528ea6E55B619DB3F7442890c9600) | 20% treasury share. Withdrawals are 2-day timelocked. |
| `DecisionLog` | [`0x11B395452e2bF8Ab20F21cd4deA8f9a7650CCf65`](https://mantlescan.xyz/address/0x11B395452e2bF8Ab20F21cd4deA8f9a7650CCf65) | Agent-to-agent on-chain receipts. Demos 2 and 3 log `APPROVED` / `DECLINED` here referencing the audit hash they read. |

## On-chain receipts

### Demo 1 — deployer-agent rejects a buggy yield vault

The deployer agent built a contract (`BuggyYieldVault`, [`0x1892f77e…`](https://mantlescan.xyz/address/0x1892f77e335c133ce4a7b28555f13ba74cbb76fa)) with
broken sUSDe redemption semantics (no cooldown awareness). It paid for an audit,
the engine returned `severity = HIGH` (2 findings), and the agent DECLINED to
expose funds.

| Step | Tx | Detail |
|---|---|---|
| payForAudit | [`0xe04cb2b7…`](https://mantlescan.xyz/tx/0xe04cb2b750443273823c497893ceba50818451c311d04e112c87f77cfc780ce0) | 0.5 MNT paid by deployer-agent `0x4354d518…` |
| submitAudit | [`0xcb471577…`](https://mantlescan.xyz/tx/0xcb471577eac210723213df4829a25dc8ceec32b894664fc0adc504c83c55daee) | Oracle-signed, gas only, rootHash `0x88e98d22…dfbf3b`, IPFS `bafkreibnyidf…` |

### Demo 2 — trading-agent declines a backdoored meme token

The trading agent considered a "yield-bearing meme token" (`BackdooredMemeToken`,
[`0x8f6679eb…`](https://mantlescan.xyz/address/0x8f6679eb031799fc9c5e149dfb75b4543808912f)) with an admin `pause()` + `mint()` backdoor. Engine returned 4 HIGH
findings; agent DECLINED.

| Step | Tx | Detail |
|---|---|---|
| payForAudit | [`0x8a558b05…`](https://mantlescan.xyz/tx/0x8a558b05f31d7240fb4e93840f828394f2189187524c97b2b0dfc09cb125f70f) | 0.5 MNT by trading-agent `0xB74a08a5…` |
| submitAudit | [`0xb26c83f5…`](https://mantlescan.xyz/tx/0xb26c83f52011438a10d4ad3b3aac7f447a855e7f3846c5fa26cd2981d18bc77c) | Oracle-signed, gas only (economic staking is roadmap), rootHash `0x121ba360…a6d3bc` |
| DecisionLog (DECLINED) | [`0x385eaded…`](https://mantlescan.xyz/tx/0x385eaded6f7eba0191ed00972e60077ea4041667c4329a19d400a33efd351119) | **Headline Demo 2 receipt** — agent decision recorded on-chain referencing the audit hash. |

### Demo 3 — yield-agent approves Merchant Moe LBRouter + deposits real liquidity

The yield agent audited the canonical Merchant Moe LBRouter v2.2 ([`0x013e138E…`](https://mantlescan.xyz/address/0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a)),
got `severity = MEDIUM` (2 findings, both pair-dependent and N/A for WMNT/USDT0).
The agent APPROVED and then made a real single-sided WMNT deposit through the
router.

| Step | Tx | Detail |
|---|---|---|
| payForAudit | [`0x34879dd4…`](https://mantlescan.xyz/tx/0x34879dd428b21bf632cca78965ce590c758ec5ae07b01c641a4fdd1df5b35842) | 0.5 MNT by yield-agent `0x9979A4e0…` |
| submitAudit | [`0x53072067…`](https://mantlescan.xyz/tx/0x53072067116ccf88d68306368d19dce4205d8e7c09cd70dadb7729a1b8b5f229) | Oracle-signed, gas only (economic staking is roadmap), rootHash `0xf9cd79fb…002a20` |
| addLiquidityNATIVE | [`0x52904eb2…`](https://mantlescan.xyz/tx/0x52904eb2c3b9882c35610dc187c75cbf54ae8eff7a4223e691bd8a1ff37f439e) | **Real Merchant Moe LB v2.2 deposit** — 0.05 WMNT into bin `activeId+1` (single-sided X). gasUsed 142677. |
| DecisionLog (APPROVED) | [`0x82760ff2…`](https://mantlescan.xyz/tx/0x82760ff271172d2ce6209a25e880072ffc67781a181ff536c933f6c5416e1725) | **Headline Demo 3 receipt** — opposite verdict from Demo 2, same logging contract. |

### ERC-8004 reputation — first paying customer rates MantleProof

After Demo 1 landed, the deployer-agent came back and left on-chain feedback
about MantleProof through Mantle's canonical Reputation Registry. **This is the
spec-correct direction** — MantleProof itself never signs feedback or holds a
feedback-signer key (T37 discovered v2 `giveFeedback` has no signed-auth
requirement, so the engine never needs that key).

| | Detail |
|---|---|
| giveFeedback tx | [`0x579fe213…`](https://mantlescan.xyz/tx/0x579fe213972b056d9d1bd83023d179052cf5084e5e4417f20302b314af4b26f5) (block 95716520) |
| Posted by | deployer-agent `0x4354d518eD2060b315995E68268f019C074fc1f3` (Demo 1's payer) |
| About agent | `96` (MantleProof) |
| Rating | `value = 4`, tags `audit-quality` / `deployer-agent` |
| Sybil gate | `isAuthorizedOrOwner(payer, 96) = false` — payer is NOT MantleProof's owner / operator / approved. Real customer, not self-promotion. |
| Independent verify | `getSummary(96, [payer], "", "")` returns `(count=1, value=4)`. **10/10 checks pass** via `verify_reputation_receipt.py`. |

Negative feedback is possible and **correct** — a real paying customer can rate
MantleProof poorly. We don't suppress.

## The five risk checks

Each is a small Python module (`engine/mantleproof/checks/*.py`) running in
Tier 1 + a protocol brief (`engine/mantleproof/skills/*.md`) loaded into Tier 2.

| Check | Catches |
|---|---|
| `usdy_check` | USDY/mUSD rebase snapshot drift, non-RWA oracle, USDY≠mUSD 1:1, unguarded blocklist transfer |
| `meth_check` | mETH balanceOf/totalSupply proportion (instead of exchange-rate), L1/L2 staking conflation, cmETH/mETH conflation |
| `usde_check` | sUSDe redeem with no cooldown awareness, USDe/sUSDe 1:1 assumption, USDe collateral without oracle |
| `dex_check` | Merchant Moe LB v2.2: missing bin-id validation, static fee assumption, V3-style `feeGrowth` on LB (wrong primitive); Uniswap V3: mint without slippage/deadline |
| `replay_check` | EIP-712 domain separator without `block.chainid`, `chainId` omitted from `EIP712Domain` typehash, hardcoded `2300` gas |

**Findings are disputable.** Tier 2 findings can be challenged via
`MantleProofRegistry.submitDispute(rootHash, findingIndex, counterClaimIpfs)` —
permissionless, optional MNT counter-stake. The oracle re-runs Tier 2 against the
counter-claim and posts DISMISSED / AMENDED / RETRACTED on chain. See
[`docs/update.md`](docs/update.md) §2 for the full mechanism.

## Status / MVP scope

| Capability | Status | Evidence |
|---|---|---|
| Audit engine — five Mantle dimensions, Tier 1 | **Live on mainnet** | `getAudit` returns findings; `mantleproof verify` (Quick Eval #6) |
| Audit engine — Tier 2 Gemini reasoning + hallucination guard | **Live on mainnet** | Recent Tier 2 `rootHash` anchored on-chain (Quick Eval #2) |
| On-chain audit registry | **Live on mainnet** | Contract verified on Mantlescan (Quick Eval #1) |
| ERC-8004 identity — MantleProof = agent #96 | **Live on mainnet** | Reputation entry references `tokenId 96` (Quick Eval #4) |
| `getAudit` / MCP / x402 query surfaces | **Live** | Three surfaces, one backend, same JSON (Query surfaces §) |
| Inter-agent licensing — `payForAudit`, 80/20 split | **Live on mainnet** | 3 `payForAudit` txs, 0.5 MNT each (On-chain receipts §) |
| Reputation staking — 2 MNT per Tier 2 | **Roadmap** | Audits anchor for gas only today; `StakingPool.sol` is in-tree and deploys post-hackathon (Roadmap §). |
| Dispute layer — submit / re-audit / resolve | **Live** | `submitDispute` / `resolveDispute` file and resolve on-chain on the live registry |
| Slash-by-exploit (`claimExploit`) | **Reserved post-hackathon** | Documented comment block, no body. Economic slashing is roadmap; the dispute layer files/resolves on-chain today without slashing a stake |
| Multi-auditor staking marketplace | **Planned** | Post-hackathon; primitive shipped, market untested |
| CI / GitHub Action integration | **Planned** | Roadmap; engine API ready |

## One-command CLI (`cli/`)

Two zero-config commands over the live oracle. Both are **pure public reads** —
no wallet, no gas, no private key. Source: [`cli/`](cli/).

**`mantleproof verify`** — collapse "is this real?" into ~30 seconds of green
checks. Every line is a real read against Mantle mainnet (no hardcoded results):

```
$ npx mantleproof verify

MantleProof — live verification against Mantle mainnet (chainId 5000)

  [✓] Registry deployed, oracleSigner matches   0xcF3703BD…662aaf (mantlescan ↗)
  [✓] Agent registered in ERC-8004 Identity     tokenId #96 → owner 0x2a3080AA…605B6A
  [✓] Demo audits anchored (staking-free, gas only) 3/3 demo targets anchored on 0xcF3703BD…662aaf
  [✓] Most recent audit anchored on-chain       rootHash 0xf9cd79fb…002a20
  [✓] getAudit() returns structured finding     target 0x013e138E…d21E3a → MEDIUM, Tier 2
  [✓] Disputes layer exercised on mainnet       disputeId #5 → RETRACTED on prev. registry 0x5CEafE0F…CA65A5 (slashing now roadmap)
  [✓] ERC-8004 reputation recorded              1 feedback entry about agent #96

  7/7 checks passed. MantleProof is live on Mantle mainnet.
```

**`mantleproof check <address>`** — audit any Mantle contract, no wallet. Reads
the anchored audit, fetches the report from IPFS, re-derives integrity from the
bytes, and prints the findings with their honesty labels:

```
$ npx mantleproof check 0x1892f77e335c133ce4a7b28555f13ba74cbb76fa

Auditing 0x1892f77e…BB76fA on Mantle mainnet…
  BuggyYieldVault  ·  Tier 2  ·  overall HIGH

  HIGH   [ESTIMATED]  sUSDe redemption path with no cooldown awareness …
  MEDIUM [VERIFIED]   balanceOfUnderlying returns raw shares, not underlying value …

  ✓ anchor verified — report's root_hash == on-chain rootHash, from the content-addressed CID
```

Run from a clone with `pnpm --filter mantleproof build && node cli/build/index.js verify`.
Full docs: [`cli/README.md`](cli/README.md).

## Roadmap

The MVP ships live on mainnet today: audits, the **dispute layer** (anyone can
`submitDispute`; the oracle re-audits and posts `DISMISSED`/`AMENDED`/`RETRACTED`
on-chain), the five honesty labels, and the hallucination guard. Credibility today
rests on the independently recomputable IPFS↔on-chain `rootHash` (`integrity.match`).
The items below are the next bets.

**Economic staking — skin in the game behind every Tier 2 audit.** Put **2 MNT for
30 days** into `StakingPool` behind each Tier 2 audit, slashed to the disputer on an
upheld (`RETRACTED`) dispute, so trust rests on a bond and not reputation alone. The
primitive (`StakingPool.sol`) and its tests are in-tree; bringing it to the live
registry is config, not new code.

**Exploit-claim slashing (`claimExploit`).** Slash a stake when an audited contract
is later exploited in a way the audit missed — a reserved comment block in
`MantleProofRegistry.sol` / `StakingPool.sol`.

**Multi-auditor staking marketplace.** Open the primitive to third-party auditors
who stake behind their own findings; the released-vs-slashed ratio becomes a public
track record. Primitive shipped, market untested.

**CI / GitHub Action integration.** Wrap the engine API as an Action so a repo can
gate merges on a MantleProof audit. Engine API is ready.

## Coverage & latency (engine validation)

Measured offline against a labeled validation set (8 positive + 6 negative
fixtures + bait, N=14 samples, dataset sha256 `93ee833ca33d…`). Re-runnable
via `cd engine && python scripts/measure_metrics.py`.

| Metric | Overall |
|---|---|
| Precision | **1.00** (8 TP / 0 FP) |
| Recall | **1.00** (0 FN) |
| F1 | **1.00** |

Per-check breakdown (all five check modules score 1.00 / 1.00 / 1.00 on the
validation set): `dex_check`, `meth_check`, `replay_check`, `usde_check`,
`usdy_check`.

Tier-1 latency over the same set (Python `time.perf_counter`, no LLM in the
loop): **p50 = 0.4 ms · p95 = 4.5 ms · p99 = 8.6 ms**. Tier 2 latency depends on
Gemini round-trip (seconds, not milliseconds); we don't publish a Tier-2 SLA
because we can't promise upstream provider behavior.

These numbers are embedded as a compact `metrics_ref` block in every audit
JSON, so every published audit references the same coverage baseline. Honest
caveat: validation set size is small; precision will degrade as N grows. We
publish methodology + dataset hash so the number is reproducible.

## Query surfaces

Three ways to read an audit, all returning the same JSON + same honesty labels.

### 1. On-chain (trustless, free)

```solidity
// Solidity
(bytes32 rootHash, uint8 severity, string memory ipfsCID,
 uint64 timestamp, address submitter, uint8 tier) =
    IMantleProofRegistry(0xcF3703BD76C64DA8a13461e820456d0576662aaf)
        .getAudit(0x1892f77e335c133ce4a7b28555f13ba74cbb76fa);
```

```bash
# cast (foundry)
cast call 0xcF3703BD76C64DA8a13461e820456d0576662aaf \
  "getAudit(address)((bytes32,uint8,string,uint64,address,uint8))" \
  0x1892f77e335c133ce4a7b28555f13ba74cbb76fa \
  --rpc-url https://rpc.mantle.xyz
```

Read the IPFS body from the returned `ipfsCID`, drop the
`{root_hash, ipfs_cid, ipfs_uri, anchor_tx, timing_ms}` fields, canonicalize
(`sort_keys=True, separators=(",",":"), ensure_ascii=False`), and `keccak256`
the bytes — you get the same `rootHash`. No backend trust required.

### 2. MCP server (agent-native, stdio)

Drop MantleProof into Claude Desktop or any MCP-aware agent as a tool.

```bash
npx -y mantleproof-mcp
```

Three tools exposed: `getAudit(address)` (free read), `auditContract(address, tier)`
(Tier 1 free, Tier 2 paid via x402), `requestAudit(address, tier)` (x402 payment
flow surfaced inline).

### 3. REST + x402 (paid create, free read)

| Route | Pay | Returns |
|---|---|---|
| `GET /api/audit/{address}` | free | Latest published audit + IPFS body + integrity check |
| `GET /api/health` | free | Engine status, last cache refresh, block height |
| `GET /api/feed` | free | Recent Mantle deployments classified by triage |
| `GET /api/cache` | free | Index of priority-cached anchored audits |
| `GET /api/queries` | free | Recent DecisionLog events (agent decisions) |
| `POST /x402/audit/{address}` | **0.50 USDC on Base** | Trigger fresh Tier 2 audit. Both txHashes in response. |

## Quickstart (dev)

```bash
git clone https://github.com/emark-cloud/mantleproof.git
cd mantleproof

# Install JS workspaces
pnpm install

# Bootstrap the Python engine
cd engine && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"

# Configure secrets — see docs/setup-checklist.md for the full list
cp .env.example .env
# fill in: ETHERSCAN_API_KEY, GEMINI_API_KEY, PINATA_JWT,
#         ORACLE_SIGNER_PRIVATE_KEY (for write), demo agent keys, etc.

# Run the test suite
cd engine && pytest && ruff check . && mypy .   # 261/261, ruff clean, mypy clean
pnpm --filter @mantleproof/contracts exec hardhat test   # 34/34

# Run the dev API
cd engine && uvicorn mantleproof.main:app --reload

# Run the dashboard
cd frontend && pnpm dev

# Run the MCP server (after pnpm build in mcp-server/)
cd mcp-server && pnpm build && node build/index.js
```

Sepolia (5003) and Mantle mainnet (5000) deploy via
`pnpm --filter @mantleproof/contracts exec hardhat run scripts/deploy.ts
--network <mantleSepolia|mantle>`. Mainnet deploy is gated behind the
[cutover gate](CLAUDE.md) — Sepolia smoke + Tier 2 e2e + verified token
addresses must all pass first.



## Related work — how MantleProof differs

| Tool | Difference |
|---|---|
| **Aderyn-MCP** | Static analyzer designed for editor-time review (human-in-the-loop, off-chain). MantleProof is a runtime audit oracle (agent-in-the-loop, on-chain anchor). |
| **GoPlus** | Centralized API returning generic risk categories. MantleProof is decentralized read + Mantle-specific risk checks with five honesty labels per finding. |
| **Forta** | Watches in-flight transactions to detect ongoing exploits. MantleProof audits before contact — the agent reads the audit before signing a tx. |
| **Blockaid** | Simulates individual transactions at the wallet boundary. MantleProof audits at the contract boundary and publishes a signed on-chain verdict that survives across all wallets and agents. |

MantleProof is to autonomous agents on Mantle what a credit bureau is to a
lender — a signed, on-chain, dimension-scored report on a counterparty
contract that an agent can query, cite in its on-chain decision, and stake a
position behind. 

## Defensibility 

The audit engine is **not** the moat. The five checks, the Tier 2 prompt, the
hallucination guard pattern, the MCP server, the x402 paywall — a competent
competitor reads the Ondo and Merchant Moe docs and replicates these in a weekend.

1. **The accumulating audit graph.** Every audit, every dispute, every stake
   outcome is on-chain, permanent, and attributed to MantleProof's ERC-8004
   identity. After months of continuous operation, MantleProof *is* the audit
   record of Mantle. This is the Etherscan moat — data network effect, compounds
   with time, cannot be bought. **Caveat:** days of history at Demo Day, not years.
   The primitive (`MantleProofRegistry`) is shipped; the accumulation is the bet.
2. **Skin-in-the-game track record (roadmap).** A public released-vs-slashed ratio
   from staking MNT behind every Tier 2 audit. The staking *mechanism* is copyable —
   a competitor writes the same contract. A clean track record on the ratio is not,
   the way an insurer's loss history is not. **Status:** economic staking is roadmap
   — audits anchor for gas only today. The mechanism that *begins* this moat is built
   (`StakingPool.sol`, in-tree); deploying it to the live registry is the bet.
3. **Position in the agentic transaction path.** Once an audit oracle is wired
   into *how agents transact*, switching costs appear that have nothing to do
   with audit quality — integrated MCP tools and `getAudit` interfaces, historical
   `DecisionLog` references to specific rootHashes, ERC-8004 reputation accrued
   to one identity. Plaid is defensible despite bank APIs being unglamorous;
   Chainlink is defensible despite "an oracle" being conceptually simple. The
   moat is being the thing everything routes through. **Caveat:** four built-in
   demo agents today. The interface exists; the third-party integrations don't.

The flywheel: stake makes the oracle trustworthy → trust gets it wired into
transaction paths → being in the path generates audits → audits accumulate into
a graph → the graph makes the oracle more worth routing through. A fast-follower
enters from a standing start; MantleProof is already spinning.


## Honest market

What we demonstrate at hackathon scale:
- The engine catches Mantle-ecosystem bugs static analyzers miss (the five
  protocol-specific check modules, validated 1.00/1.00 precision/recall on the
  labeled validation set).
- Inter-agent licensing settles on chain (3 live demos, real payments).
- The iNFT reputation compounds in the canonical Reputation Registry (T40, live).
- Findings are disputable (T47): the dispute layer files and resolves on-chain.
  Economic staking behind findings is roadmap.
- Audit integrity is independently recomputable — the published IPFS report's
  keccak `rootHash` equals the on-chain anchor (`integrity.match`), so no backend
  trust is required. (Putting an economic stake behind findings is roadmap.)

What we don't claim:
- Real revenue from CI integration or third-party auditor adoption — those are
  post-hackathon roadmap items. The dispute mechanism is in production but the
  multi-auditor marketplace is not.
- Production-grade exploit-classifier — `claimExploit` is reserved
  post-hackathon. Economic slashing is roadmap (the dispute layer resolves
  on-chain, but no audit stake is slashed today).
- Sub-second Tier 2 — Gemini round-trip dominates. Sub-second is a Tier 1 claim
  only.
- Zero false positives at scale — validation set is N=14 with perfect score;
  precision will degrade as N grows. We publish methodology + dataset hash so
  the number is reproducible.

## Repository layout

```
contracts/      pnpm workspace, Hardhat — 6 deployed contracts + mocks + 34 tests
engine/         standalone Python — 5 checks, Tier 2 runner, hallucination guard,
                pipeline, IPFS pin, anchor, dispute resolver, ERC-8004 reputation
                helpers, 261 pytest tests
mcp-server/     pnpm workspace, TypeScript — 3 MCP tools, stdio
cli/            pnpm workspace, TypeScript — `mantleproof verify` + `check`,
                pure mainnet reads (no wallet), trustless IPFS integrity
frontend/       pnpm workspace, Vite + React + wagmi — 5 pages, dark only,
                ASCII charts, no emoji
agents/         pnpm workspace, TypeScript — 5 demo wallets (deployer, oracle,
                deployer-agent, trading-agent, yield-agent, disputer-agent),
                receipts ledgers
docs/           locked spec docs (mantleproof.md, design.md, resources.md,
                update.md) + scope docs (tier2-erc8004-reputation-scope.md,
                erc8004-abi-notes.md, plan-high-leverage-improvements.md,
                setup-checklist.md)
CLAUDE.md       operational guide (mainnet addresses, invariants, do-not-touch list)

```

## License

MIT — see [LICENSE](LICENSE). Mantle's official ERC-8004 registries are
external (not part of this repo); we read + write to them as a tenant.
