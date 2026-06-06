# MantleProof

> **MantleProof is an audit oracle that agents call before they transact — and it
> stakes MNT on being right.**

One mechanic in the foreground (an oracle in the transaction path), one
differentiator that makes it credible (skin in the game). Everything else is *how*.

Mantle Turing Test Hackathon 2026 · AI DevTools track · solo (Emark).
**Live on Mantle mainnet (chainId 5000)** with 3 agent-to-agent demos, 1 ERC-8004
reputation entry, 7 disputes (1 RETRACTED — 2 MNT slashed publicly on-chain), and
a 6-contract inventory.

### How it works

Every other capability is the answer to a *how* question hanging off that one
sentence — not a co-equal feature:

- **What does it check?** Five Mantle-specific risk dimensions — USDY/mUSD rebase,
  mETH bridge lag, USDe/sUSDe cooldown, Merchant Moe Liquidity Book bins, EIP-712
  replay. *(How it audits — not five features.)*
- **How does it price audits?** Tier 1 free heuristic + bytecode matching; Tier 2
  paid Gemini reasoning pass. *(How it charges.)*
- **Why trust an AI's findings?** The hallucination guard, the five honesty labels,
  and the 2 MNT stake — plus every audit is published with its full report on IPFS,
  so anyone re-derives the on-chain `rootHash` from the bytes without trusting our
  backend. *(How it earns trust.)*
- **What if it's wrong?** The dispute layer re-runs Tier 2; an upheld dispute takes
  the stake (1 RETRACTED to date — 2 MNT slashed publicly on-chain). *(How staking
  stays fair — a supporting actor, not a second headline.)*
- **How do agents reach it?** On-chain `getAudit`, MCP server, x402 REST endpoint —
  the same JSON with the same labels. *(How it's accessed — not three features.)*
- **Who uses it?** Four demo agents — deployer, trading, yield, disputer — each a
  verifiable on-chain receipt. *(Evidence for the headline, not scope.)*

## Not a Slither wrapper — how MantleProof differs from a report generator

MantleProof *is* an AI audit tool: it uses AI, it audits, it is a tool. What it is
**not** is the lazy instance of that category — the GPT-wraps-Slither report
generator every judge has seen ten times this hackathon. Three honest distinctions
draw the line where it actually is.

First, what the alternatives are genuinely good at: **Slither** is excellent at
structural and pattern-level bugs (reentrancy, integer issues, shadowed state);
a **professional audit** has depth, manual review, and pre-launch rigor MantleProof
does not attempt. MantleProof does not replace either. It does something they
structurally cannot.

**1. Output shape: oracle, not report.** A Slither wrapper emits a human-readable
report for a person to read after the fact. MantleProof emits a structured,
on-chain, sub-second signal for an agent to consume *inside a transaction
decision*. The product is `getAudit(address) → {severity, findings, rootHash}`,
not a PDF. A report generator cannot be called by a contract; MantleProof can. A
difference in kind, not quality.

**2. Consumer: agents, not humans.** A report generator assumes a human developer
reads the output and decides. MantleProof assumes the consumer is another
autonomous agent deciding at machine speed with no human present. That assumption
drives every choice — JSON-first responses, the on-chain read path, the MCP tools,
and honesty labels that are machine-parseable confidence signals rather than prose
hedges.

**3. Accountability: stake, not disclaimer.** A report generator — and every
professional audit — ends with "no warranties, use at your own risk." MantleProof
stakes **2 MNT** on every Tier 2 audit and pays out when a dispute proves it wrong
(1 RETRACTED to date, 2 MNT slashed on-chain). No report generator puts money
behind being right, because its incentive is to flag everything and let the human
sort it out. MantleProof's incentive is calibrated by the stake — over-flagging
gets disputed, under-flagging gets exploited, both cost money.

Each distinction is verifiable and true, and none claims MantleProof isn't an audit
tool. The point is to stop the reflexive mis-file — "oh, another Slither-plus-LLM
project" — by drawing the line at the *shape, consumer, and accountability* of the
thing, not at the category.

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
evidence. The format is the product as much as the content is.

Full strategic case + objection handling: [`docs/positioning.md`](docs/positioning.md).

## Judge Quick Eval (3 minutes, no setup)

Six paste-able checks. Each is independently verifiable on Mantlescan — nothing
relies on the project's own UI or API.

| # | Check | How to verify |
|---|---|---|
| 1 | **The audit registry is live on Mantle mainnet.** | Open the [MantleProofRegistry](https://mantlescan.xyz/address/0x5CEafE0FD8b2A9BD2eC6aCdf3f5e024c21CA65A5) — recent `AuditSubmitted` events show real targets with severity codes. The signer matches the immutable `oracleSigner` view. |
| 2 | **The three demo audits are anchored on-chain.** | Three `submitAudit` txs from the oracle signer: Demo 1 [`0x4c6bbed9…`](https://mantlescan.xyz/tx/0x4c6bbed93dc678075d8489e2ce89732d067837f9a28e7a6336f91ca00fcacf08), Demo 2 [`0xfedd0b7d…`](https://mantlescan.xyz/tx/0xfedd0b7db78f500dc96b638e1e5c55b47f78fe0986a25e355a6f8bb3d6427e6b), Demo 3 [`0xdce37de2…`](https://mantlescan.xyz/tx/0xdce37de275d561d8aa9bf3836fb7eec4d120d4a968f5a2315232435a1dca2349). Each carries `value = 2 MNT` forwarded into `StakingPool.lockStake`. |
| 3 | **Agents acted on those audits.** | `DecisionLog` records Demo 2's trading agent **DECLINING** the backdoored token ([`0x385eaded…`](https://mantlescan.xyz/tx/0x385eaded6f7eba0191ed00972e60077ea4041667c4329a19d400a33efd351119)) and Demo 3's yield agent **APPROVING** the canonical LBRouter ([`0x82760ff2…`](https://mantlescan.xyz/tx/0x82760ff271172d2ce6209a25e880072ffc67781a181ff536c933f6c5416e1725)) — opposite verdicts, both grounded in MantleProof audits. Demo 3's APPROVED is paired with a real Merchant Moe LB v2.2 [`addLiquidityNATIVE`](https://mantlescan.xyz/tx/0x52904eb2c3b9882c35610dc187c75cbf54ae8eff7a4223e691bd8a1ff37f439e) deposit. |
| 4 | **A paying agent left ERC-8004 reputation about MantleProof.** | [`giveFeedback` tx `0x579fe213…`](https://mantlescan.xyz/tx/0x579fe213972b056d9d1bd83023d179052cf5084e5e4417f20302b314af4b26f5) on Mantle's canonical Reputation Registry (`0x8004BAa1…`). `getSummary(96, [payer], "", "")` returns `count=1, value=4`. |
| 5 | **A dispute was RETRACTED and 2 MNT moved on-chain.** | Dispute #5 [`resolveDispute` tx `0xed264780…`](https://mantlescan.xyz/tx/0xed264780037e07a404f5ce5b37c056523d27d1e88296d29ee1fa6f8bac8a2374) — `StakingPool.StakeSlashedByDispute` log shows 2 MNT transferred from pool (`0x2E279f4c…`) to disputer (`0x7805e826…`). Pool balance went 6 → 4 MNT. |
| 6 | **Independent verification, no trust.** | `cast call 0x5CEafE0FD8b2A9BD2eC6aCdf3f5e024c21CA65A5 "getAudit(address)((bytes32,uint8,string,uint64,address,uint8))" 0x1892f77e335c133ce4a7b28555f13ba74cbb76fa --rpc-url https://rpc.mantle.xyz` returns the same Demo 1 `rootHash` shown above — or run `npx mantleproof check 0x1892f77e335c133ce4a7b28555f13ba74cbb76fa`. Fetch the IPFS body (`bafkreieaexay…`); its embedded `root_hash` equals the on-chain anchor, fetched from the content-addressed CID. Independent `keccak256(canonical JSON minus root_hash)` re-derivation reproduces the hash for audits pinned on/after the 2026-05-24 canonicalization fix; the three demo anchors predate it ([Known issues](#known-issues) #1). The dashboard is just a renderer. |

For full verification scripts (Python, read-only, no keys required) see
[Independent verification](#independent-verification) below.

## Status / MVP scope

The core is live on mainnet; the extensions are fenced as extensions. "Live,
seeded" is honest that the activity was bootstrapped by the project's own demo
agents during the hackathon — the truthful maturity level. "Planned" rows are
stated proudly: shipped primitives that credibly support the roadmap.

| Capability | Status | Evidence |
|---|---|---|
| Audit engine — five Mantle dimensions, Tier 1 | **Live on mainnet** | `getAudit` returns findings; `mantleproof verify` (Quick Eval #6) |
| Audit engine — Tier 2 Gemini reasoning + hallucination guard | **Live on mainnet** | Recent Tier 2 `rootHash` anchored on-chain (Quick Eval #2) |
| On-chain audit registry | **Live on mainnet** | Contract verified on Mantlescan (Quick Eval #1) |
| ERC-8004 identity — MantleProof = agent #96 | **Live on mainnet** | Reputation entry references `tokenId 96` (Quick Eval #4) |
| `getAudit` / MCP / x402 query surfaces | **Live** | Three surfaces, one backend, same JSON (Query surfaces §) |
| Inter-agent licensing — `payForAudit`, 80/20 split | **Live on mainnet** | 3 `payForAudit` txs, 0.5 MNT each (On-chain receipts §) |
| Reputation staking — 2 MNT per Tier 2 | **Live, seeded** | StakingPool holds live stake; 3 audits staked |
| Dispute layer — submit / re-audit / resolve | **Live, seeded** | 7 disputes resolved on-chain (6 DISMISSED, 1 RETRACTED) |
| Slash-by-exploit (`claimExploit`) | **Reserved post-hackathon** | Documented comment block, no body; only dispute-slashing ships live |
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

  [✓] Registry deployed, oracleSigner matches   0x5CEafE0F…CA65A5 (mantlescan ↗)
  [✓] Agent registered in ERC-8004 Identity     tokenId #96 → owner 0x2a3080AA…605B6A
  [✓] StakingPool holds live stake              4 MNT locked in pool
  [✓] Most recent audit anchored on-chain       rootHash 0x37ff62a0…d3b373 (13d ago)
  [✓] getAudit() returns structured finding     target 0x013e138E…d21E3a → MEDIUM, Tier 2
  [✓] Dispute resolved on-chain                 disputeId #5 → RETRACTED, stake slashed (7/7 resolved)
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

**Integrity honesty note.** `check` re-derives the on-chain `rootHash` by hashing
the raw IPFS bytes (minus `root_hash`). For audits pinned **on/after** the
2026-05-24 canonicalization fix this reproduces the hash exactly (`✓ integrity
verified`). The three demo audits were pinned **before** that fix, when Pinata's
JSON endpoint silently stripped `.0` from integer-valued floats in `metrics_ref`
— so independent keccak re-derivation isn't reproducible for them. `check`
reports those honestly as `✓ anchor verified` (the embedded `root_hash` matches
the on-chain anchor, fetched from the content-addressed CID) rather than faking
a recompute. See [`engine/mantleproof/persistence/ipfs.py`](engine/mantleproof/persistence/ipfs.py).

## Architecture

Three layers, one signed write path:

```
  agents          ─query─►  MantleProof oracle  ─publish─►  Mantle registry (immutable)
  (Mantle / any chain)        (engine, off-chain)            6 contracts on chainId 5000
       ▲                                                            │
       └────── read getAudit() / MCP getAudit / REST /api/audit ◄───┘
```

1. **Audit engine** (`engine/`, Python). Two tiers:
   - **Tier 1** — heuristic + bytecode pattern matching across the five Mantle
     dimensions (USDY/mUSD, mETH, USDe/sUSDe, Merchant Moe LB v2.2, EIP-712 replay).
     ~1 ms p50 on the validation set.
   - **Tier 2** — Gemini reasoning pass + protocol-brief skills, then the
     **hallucination guard**, then canonical JSON → keccak256 `rootHash` → IPFS
     pin → oracle-signed `submitAudit` on Mantle. Tier 2 anchors lock 2 MNT into
     `StakingPool` for a 30-day dispute window.
2. **Three query surfaces, one backend.** On-chain
   `MantleProofRegistry.getAudit(target)`, MCP server (`npx -y mantleproof-mcp`,
   stdio, 3 tools), REST + x402 paywall (USDC on Base settles, audit anchors on
   Mantle). All three return the same JSON with the same five honesty labels.
3. **Three agent-to-agent demos** (`agents/`) — `deployer-agent`, `trading-agent`,
   `yield-agent` — each with its own funded wallet (no key wears two hats). Plus
   a 4th `disputer-agent` that filed 7 real disputes (T47).

Full spec — locked: [`docs/mantleproof.md`](docs/mantleproof.md) ·
[`docs/resources.md`](docs/resources.md) · [`docs/design.md`](docs/design.md) ·
[`docs/update.md`](docs/update.md) (Disputes + Staking extensions).

## The five honesty labels (non-negotiable)

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

Six contracts deployed 2026-05-24 (post-T43, Etherscan V2 verified). MantleProof
is also registered as agent **#96** on Mantle's canonical ERC-8004 registries —
we are a tenant of that infrastructure, not its operator.

| Contract | Address | Role |
|---|---|---|
| `MantleProofRegistry` | [`0x5CEafE0FD8b2A9BD2eC6aCdf3f5e024c21CA65A5`](https://mantlescan.xyz/address/0x5CEafE0FD8b2A9BD2eC6aCdf3f5e024c21CA65A5) | Append-only audit registry + disputes layer. `submitAudit(target, tier, severity, rootHash, ipfsCID)` payable (Tier 2 forwards 2 MNT); `submitDispute` permissionless; `resolveDispute` oracle-only. |
| `MantleProofAgent` | [`0x6661Fb91CfA5F5691E3F80cA319b665824CB02e9`](https://mantlescan.xyz/address/0x6661Fb91CfA5F5691E3F80cA319b665824CB02e9) | Thin wrapper around our ERC-8004 identity (tokenId 96). Tracks `memoryRoot` (compounding keccak chain over all audits) + `auditsPerformed`. |
| `StakingPool` (NEW T43) | [`0x2E279f4cAE39B5d0Fa57e08D0d455Ec9f6080ee9`](https://mantlescan.xyz/address/0x2E279f4cAE39B5d0Fa57e08D0d455Ec9f6080ee9) | Holds 2 MNT per Tier 2 audit for 30 days. Slashes to the disputer on RETRACTED; 99% releases to treasury after the window, 1% retained for pool capitalization. |
| `MantleProofLicense` | [`0x51fA686747ea148f6BeC7e30390C8B929DC45447`](https://mantlescan.xyz/address/0x51fA686747ea148f6BeC7e30390C8B929DC45447) | `payForAudit(target)` (0.5 MNT) and `subscribe()`. 80/20 split to iNFT owner / treasury. |
| `TreasurySplit` | [`0xEaea8a20288528ea6E55B619DB3F7442890c9600`](https://mantlescan.xyz/address/0xEaea8a20288528ea6E55B619DB3F7442890c9600) | 20% treasury share. Withdrawals are 2-day timelocked. |
| `DecisionLog` | [`0x11B395452e2bF8Ab20F21cd4deA8f9a7650CCf65`](https://mantlescan.xyz/address/0x11B395452e2bF8Ab20F21cd4deA8f9a7650CCf65) | Agent-to-agent on-chain receipts. Demos 2 and 3 log `APPROVED` / `DECLINED` here referencing the audit hash they read. |

Plus references (not deployed by us — Mantle ships them):
- **ERC-8004 Identity Registry** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` — MantleProof = tokenId 96, owned by `0x2a3080AA52DE07702dd30b81cC97C3527e605B6A`.
- **ERC-8004 Reputation Registry (v2.0.0)** `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` — read MantleProof's reputation directly via `getSummary(96, getClients(96), "", "")`.

The previous T25 deploy (2026-05-19, 5-contract stack at `0x60E97c83…` etc.) is
**superseded** by the T43 redeploy and kept only for receipt history.

## On-chain receipts

### Demo 1 — deployer-agent rejects a buggy yield vault

The deployer agent built a contract (`BuggyYieldVault`, [`0x1892f77e…`](https://mantlescan.xyz/address/0x1892f77e335c133ce4a7b28555f13ba74cbb76fa)) with
broken sUSDe redemption semantics (no cooldown awareness). It paid for an audit,
the engine returned `severity = HIGH` (2 findings), and the agent DECLINED to
expose funds.

| Step | Tx | Detail |
|---|---|---|
| payForAudit | [`0xe04cb2b7…`](https://mantlescan.xyz/tx/0xe04cb2b750443273823c497893ceba50818451c311d04e112c87f77cfc780ce0) | 0.5 MNT paid by deployer-agent `0x4354d518…` |
| submitAudit | [`0x4c6bbed9…`](https://mantlescan.xyz/tx/0x4c6bbed93dc678075d8489e2ce89732d067837f9a28e7a6336f91ca00fcacf08) | Oracle-signed, **2 MNT staked in pool**, rootHash `0x3f4799f5…04168e9`, IPFS `bafkreieaexay…6guay` |

### Demo 2 — trading-agent declines a backdoored meme token

The trading agent considered a "yield-bearing meme token" (`BackdooredMemeToken`,
[`0x8f6679eb…`](https://mantlescan.xyz/address/0x8f6679eb031799fc9c5e149dfb75b4543808912f)) with an admin `pause()` + `mint()` backdoor. Engine returned 4 HIGH
findings; agent DECLINED.

| Step | Tx | Detail |
|---|---|---|
| payForAudit | [`0x8a558b05…`](https://mantlescan.xyz/tx/0x8a558b05f31d7240fb4e93840f828394f2189187524c97b2b0dfc09cb125f70f) | 0.5 MNT by trading-agent `0xB74a08a5…` |
| submitAudit | [`0xfedd0b7d…`](https://mantlescan.xyz/tx/0xfedd0b7db78f500dc96b638e1e5c55b47f78fe0986a25e355a6f8bb3d6427e6b) | Oracle-signed, 2 MNT staked, rootHash `0x0947f93b…5c7087f` |
| DecisionLog (DECLINED) | [`0x385eaded…`](https://mantlescan.xyz/tx/0x385eaded6f7eba0191ed00972e60077ea4041667c4329a19d400a33efd351119) | **Headline Demo 2 receipt** — agent decision recorded on-chain referencing the audit hash. |

### Demo 3 — yield-agent approves Merchant Moe LBRouter + deposits real liquidity

The yield agent audited the canonical Merchant Moe LBRouter v2.2 ([`0x013e138E…`](https://mantlescan.xyz/address/0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a)),
got `severity = MEDIUM` (2 findings, both pair-dependent and N/A for WMNT/USDT0).
The agent APPROVED and then made a real single-sided WMNT deposit through the
router.

| Step | Tx | Detail |
|---|---|---|
| payForAudit | [`0x34879dd4…`](https://mantlescan.xyz/tx/0x34879dd428b21bf632cca78965ce590c758ec5ae07b01c641a4fdd1df5b35842) | 0.5 MNT by yield-agent `0x9979A4e0…` |
| submitAudit | [`0xdce37de2…`](https://mantlescan.xyz/tx/0xdce37de275d561d8aa9bf3836fb7eec4d120d4a968f5a2315232435a1dca2349) | Oracle-signed, 2 MNT staked, rootHash `0x37ff62a0…07d3b373` |
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

### Disputes — 7 filed, 1 RETRACTED, 2 MNT slashed publicly

The disputer-agent (`0x7805e826…`, 5th demo wallet, fresh-generated key) filed
7 disputes across 4 rounds of progressively-tighter counter-claims. The engine
re-ran Tier 2 against each counter-claim and posted the verdict on-chain.

| Outcome | Count | What it means |
|---|---|---|
| DISMISSED | 6 | Counter-claim doesn't invalidate the finding. Counter-stake forfeited to registry. Original honesty label upgrades one tier engine-side. |
| AMENDED | 0 | (Supported in contract + engine, not produced in this seed batch — 3 severity-downgrade attempts were each dismissed with specific source-line counter-evidence.) |
| RETRACTED | 1 | Counter-claim invalidates the finding. **2 MNT audit stake transfers from pool to disputer.** |

**Dispute #5 RETRACTED ✓** — the counter-claim noted Demo 3's `swapTokensForExactTokens`
finding misclassified standard exact-output AMM semantics as a bug (the function
consumes only the path-required input, not `amountInMax` — no "overpay" possible).
The engine agreed: [`resolveDispute` tx `0xed264780…`](https://mantlescan.xyz/tx/0xed264780037e07a404f5ce5b37c056523d27d1e88296d29ee1fa6f8bac8a2374),
`StakingPool.StakeSlashedByDispute` log shows **2 MNT moved from pool to disputer**.
Independent verify: `python engine/scripts/verify_dispute_receipt.py --dispute-id 5
--network mantle --expect-outcome RETRACTED --tx 0xed264780…` returns **9/9 ✓**
including `StakingPool.status == SLASHED_DISPUTE`.

Full ledger of all 7 disputes (with counter-claim IPFS CIDs, rationale per
outcome): [`agents/validation/dispute_receipts.md`](agents/validation/dispute_receipts.md).

What this seed batch demonstrates: the engine does not capitulate on weak
challenges (6 dismissals with specific source-line counter-evidence) but WILL
retract when a counter-claim is genuinely correct. **2 MNT moved publicly on
chain for the one upheld dispute** — visible on Mantlescan, verifiable by
anyone with `cast call` or the included Python verifier scripts.

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

## Skin in the game — stake and slashing

> MantleProof is the only audit primitive on Mantle that puts money behind its
> findings. Every Tier 2 audit stakes **2 MNT for 30 days** in `StakingPool`.
> Upheld disputes (`RETRACTED`) transfer the stake to the disputer. If neither
> dispute nor exploit-claim slashes the stake within the window, 99% returns to
> the treasury and 1% retains in the pool.

Current state (Mantle mainnet, post-T43):
- **3 Tier 2 audits staked** (Demo 1 + Demo 2 + Demo 3, each 2 MNT)
- **1 stake slashed** (Demo 3 finding 1 via dispute #5 RETRACTED, 2 MNT to disputer)
- **Pool balance live**: 4 MNT (was 6, -2 from the slash)

Stake amount note: the original scope doc (`docs/update.md` §3.1) defaulted to
50 MNT per stake. We ship **2 MNT** as a hackathon-window MNT-exposure cap; the
amount lives in `MantleProofRegistry.TIER2_STAKE` as a constant (would require
a redeploy to change). Exploit-claim slashing is **reserved post-hackathon** —
`claimExploit` is a documented comment block in both `MantleProofRegistry.sol`
and `StakingPool.sol` but has no body. Dispute-slashing is the only live
slashing path today.

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
    IMantleProofRegistry(0x5CEafE0FD8b2A9BD2eC6aCdf3f5e024c21CA65A5)
        .getAudit(0x1892f77e335c133ce4a7b28555f13ba74cbb76fa);
```

```bash
# cast (foundry)
cast call 0x5CEafE0FD8b2A9BD2eC6aCdf3f5e024c21CA65A5 \
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

Why USDC on Base for payment but Mantle for the audit anchor? Cross-chain by
design — payment settles where stablecoins are deepest (Base via Coinbase's CDP
facilitator), the audit anchors where Mantle's agents live. Both tx hashes ship
in every paid-audit response. UI labels the payment chain explicitly
("0.50 USDC paid on base eip155:8453").

## Independent verification

Every receipt is verifiable without trusting the project's backend. Read-only
Python scripts (no keys needed beyond `ETHERSCAN_API_KEY` for source resolution
and an RPC URL):

```bash
cd engine && . .venv/bin/activate

# Demo 1 — deployer-agent + BuggyYieldVault
python scripts/verify_demo1_receipt.py \
  0x1892f77e335c133ce4a7b28555f13ba74cbb76fa \
  0x3f4799f5863dbb38994c319254e539e53d47e4f63c3e9254b0994db8e04168e9 \
  0x4c6bbed93dc678075d8489e2ce89732d067837f9a28e7a6336f91ca00fcacf08

# Demo 2 — trading-agent + BackdooredMemeToken + DecisionLog DECLINED
python scripts/verify_demo2_receipt.py \
  0x8f6679eb031799fc9c5e149dfb75b4543808912f \
  0x0947f93b6cc6c4e167722a17eddb1684d5113cce0318b5717e8f702595c7087f \
  0xfedd0b7db78f500dc96b638e1e5c55b47f78fe0986a25e355a6f8bb3d6427e6b \
  0x385eaded6f7eba0191ed00972e60077ea4041667c4329a19d400a33efd351119 \
  0xB74a08a5aD469758F1a0fAc2cF6059de3cc4A148

# Demo 3 — yield-agent + LBRouter + addLiquidity + DecisionLog APPROVED
python scripts/verify_demo3_receipt.py \
  0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a \
  0x37ff62a05f9e66151b36846e28a77494ccc9733a298200d3aa62b1a607d3b373 \
  0xdce37de275d561d8aa9bf3836fb7eec4d120d4a968f5a2315232435a1dca2349 \
  0x52904eb2c3b9882c35610dc187c75cbf54ae8eff7a4223e691bd8a1ff37f439e \
  0x82760ff271172d2ce6209a25e880072ffc67781a181ff536c933f6c5416e1725 \
  0x9979A4e0465b0F6E14e40309Fe4C6aEe8A1f66c3

# T40 — first ERC-8004 reputation entry about MantleProof
python scripts/verify_reputation_receipt.py \
  --payer 0x4354d518eD2060b315995E68268f019C074fc1f3 \
  --agent-id 96 --network mantle \
  --expect-tag1 audit-quality --expect-value 4

# T47 — dispute #5 RETRACTED (2 MNT slashed)
python scripts/verify_dispute_receipt.py \
  --dispute-id 5 --network mantle \
  --expect-outcome RETRACTED \
  --expect-disputer 0x7805e8261E8508d70554211dA54FB3c33A6ebfd3 \
  --tx 0xed264780037e07a404f5ce5b37c056523d27d1e88296d29ee1fa6f8bac8a2374
```

Each script: separate web3 client (does not trust the engine's print output),
read-only, prints an `N/N checks passed` summary. Latest pass counts: Demo 1
7/8, Demo 2 12/13, Demo 3 15/16, T40 reputation 10/10, T47 dispute #5 9/9. The
single failed check on each demo (`keccak256(canonical IPFS JSON) ==
on-chain rootHash`) is a pre-existing Pinata quirk affecting only Demo 1/2/3's
IPFS bodies anchored 2026-05-24 — see [Known issues](#known-issues) below.

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

## Known issues

1. **IPFS keccak invariant fails on the three current Demo 1/2/3 receipts.** Root
   caused 2026-05-24: Pinata's old `pinJSONToIPFS` endpoint strips `.0` from
   integer-valued floats (`1.0` → `1`) before pinning, mutating six bytes per
   audit (the `precision`/`recall`/`f1` perfect-score fields in `metrics_ref`).
   The on-chain `rootHash` is computed over our exact bytes (`1.0` preserved),
   but Pinata stores normalized bytes (`1` written). Fixed forward in
   `engine/mantleproof/persistence/ipfs.py` (now uses `pinFileToIPFS` with our
   exact canonical bytes); every audit anchored after this fix verifies cleanly.
   The three historical Demo 1/2/3 anchors are immutable on chain and would
   require re-anchoring (~7 MNT) to refresh. Trust path is intact (`rootHash` on
   chain matches the IPFS-pinned `root_hash` field; oracle is the only writer;
   agent advanced cleanly) — only "anyone can re-derive `rootHash` from the IPFS
   bytes via canonical recompute" is the broken property for these three.
2. **`AMENDED` dispute outcome not yet produced live.** The mechanism is
   supported end-to-end in contract + engine, but the 3 severity-downgrade
   attempts in T47 (#4, #6, #7) were each dismissed with specific
   counter-evidence. A more surgical severity-amendment counter-claim would
   produce a live AMENDED receipt — open polish for post-submission.
3. **`MantleProofAgent.reputation()` and `agentURI()` revert on-chain.** The
   deployed bytecode was compiled against a fictional pre-T38 interface; T38
   marked both views defunct in source. The frontend reads reputation directly
   from Mantle's canonical Reputation Registry (`getSummary(96, getClients(96),
   "", "")`) instead. See [`docs/erc8004-abi-notes.md`](docs/erc8004-abi-notes.md)
   for the full T37 ABI verification log.

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
position behind. Long-form: [`docs/mantleproof.md`](docs/mantleproof.md)
*Related work* section.

## Defensibility — three moats, each with its honest caveat

The audit engine is **not** the moat. The five checks, the Tier 2 prompt, the
hallucination guard pattern, the MCP server, the x402 paywall — a competent
competitor reads the Ondo and Merchant Moe docs and replicates these in a weekend.
Stated openly because pretending otherwise convinces no one. Defensibility, where
it genuinely exists, is time-denominated.

1. **The accumulating audit graph.** Every audit, every dispute, every stake
   outcome is on-chain, permanent, and attributed to MantleProof's ERC-8004
   identity. After months of continuous operation, MantleProof *is* the audit
   record of Mantle. This is the Etherscan moat — data network effect, compounds
   with time, cannot be bought. **Caveat:** days of history at Demo Day, not years.
   The primitive (`MantleProofRegistry`) is shipped; the accumulation is the bet.
2. **Skin-in-the-game track record.** 2 MNT staked per Tier 2 audit for 30 days;
   public released-vs-slashed ratio. The staking *mechanism* is copyable — a
   competitor writes the same contract. A clean track record on the ratio is not,
   the way an insurer's loss history is not. **Caveat:** one slash + zero released
   audits today (3 staked, 1 RETRACTED). The mechanism that *begins* the moat is
   live; the moat itself accumulates from here.
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

If the defensibility argument collapses to one line: **the audit engine is not
the moat — it is copyable, and we say so. The moat is being first to accumulate
the on-chain audit graph, the staking track record, and the integrated-agent base
that a fast-follower cannot copy because all three are denominated in time.**

## Go-to-market (one page)

A concrete first-customer story, skimmable in 60 seconds. The honest market caveats
follow in the next section — both are true at once.

- **First customer segment (now):** Mantle-native autonomous agents and the teams
  building them — concretely, the other agent projects in this very hackathon. They
  exist today and have the exact need MantleProof serves: a safety signal before
  transacting. Demand is adjacent and real, not hypothetical.
- **Wedge:** the free Tier 1 read. Zero friction, no wallet, one CLI command
  (`npx mantleproof check 0x…`) or one MCP call. Developers and agents adopt the
  read path at no cost; this seeds the audit graph and the integration base.
- **Revenue (now):** Tier 2 paid audits via `payForAudit` (0.5 MNT) and the x402
  endpoint, with the 80/20 split — already live on mainnet (3 receipts). Per-audit
  micropayments, not a subscription, matched to how agents actually consume.
- **Expansion (next):** CI integration — a GitHub Action that pre-audits on every
  PR (a real category, Snyk / GitGuardian-shaped) — and the multi-auditor staking
  marketplace, where other auditors stake against their own findings and MantleProof
  becomes the protocol, not just the first auditor.
- **Why now:** the agentic economy Mantle is building *is* the demand driver.
  MantleProof is a leveraged bet on the same thesis the judges are already
  underwriting by running this hackathon. If autonomous on-chain agents are real,
  they need this; if they are not, most of the hackathon's premise fails too.

The honest edge (for Q&A): the moats are time-denominated and near-zero today — the
audit graph, the staking track record, and the integrated-agent base all accumulate
from day one and cannot be bought. Defensibility is being first into that flywheel.
See [Defensibility](#defensibility--three-moats-each-with-its-honest-caveat) above.

## Honest market

What we demonstrate at hackathon scale:
- The engine catches Mantle-ecosystem bugs static analyzers miss (the five
  protocol-specific check modules, validated 1.00/1.00 precision/recall on the
  labeled validation set).
- Inter-agent licensing settles on chain (3 live demos, real payments).
- The iNFT reputation compounds in the canonical Reputation Registry (T40, live).
- Findings are disputable (T47, 7 live disputes with one publicly-slashed stake).
- The auditor (MantleProof itself) has 2 MNT at stake on every Tier 2 audit.
  We pay out when we're wrong.

What we don't claim:
- Real revenue from CI integration or third-party auditor adoption — those are
  post-hackathon roadmap items. The dispute mechanism is in production but the
  multi-auditor marketplace is not.
- Production-grade exploit-classifier — `claimExploit` is reserved
  post-hackathon; only dispute-slashing ships live.
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
TODO.md         live task list + decisions log
```

## License

MIT — see [LICENSE](LICENSE). Mantle's official ERC-8004 registries are
external (not part of this repo); we read + write to them as a tenant.
