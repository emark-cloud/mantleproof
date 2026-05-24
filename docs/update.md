# MantleProof — Extensions

Sibling document to `MantleProof-Build-Plan.md`. Captures three decisions made after the base plan was locked: (1) the Path A confirmation for ERC-8004 registries, (2) the Disputed Findings layer, (3) the Reputation Staking layer. Treat this document as authoritative wherever it conflicts with the base plan.

**Status:** all three decisions confirmed. Build plan to be executed with these extensions folded in.

---

## 1. Path A confirmed — Mantle ships ERC-8004 registries

Resolves Section 13.1 of the base plan.

Mantle Network operates official deployments of the three ERC-8004 registries (Identity, Reputation, Validation) on Mantle mainnet. MantleProof registers as an agent against them rather than deploying its own.

### 1.1 What changes from the base plan

**Contracts list collapses from 7 to 5.** The three EIP-8004 registry contracts come off MantleProof's deployment list. Final contract inventory on Mantle mainnet:

| Contract | Purpose | LOC budget |
|---|---|---|
| `MantleProofRegistry.sol` | Append-only audit registry. `submitAudit(target, severity, rootHash, ipfsCID, stakeAmount)` callable only by the oracle signer. `getAudit(target)` view. Public read, signature-bound write. | ~170 |
| `MantleProofAgent.sol` | Thin wrapper that registers MantleProof against the official Identity Registry. Tracks per-audit `memoryRoot` advances, `auditsPerformed` counter, `reputation` cached locally for fast reads. Mirrors signals to the official Reputation Registry on every audit. | ~140 |
| `MantleProofLicense.sol` | Pay-per-audit and subscription licenses. `mintLicense`, `payForAudit`. Auto-splits 80/20. USDC-settled on Base via x402 facilitator; mirror tx anchored on Mantle. | ~180 |
| `TreasurySplit.sol` | Receives the 20% treasury share, multi-sig timelock for any withdrawal. | ~80 |
| `StakingPool.sol` (NEW — Section 3) | Holds locked MNT for active Tier 2 audits. Releases or slashes based on dispute or exploit outcomes. | ~140 |

Total: ~710 LOC across 5 contracts. Down from ~940 LOC across 7 in Path B.

### 1.2 What changes in framing

The submission narrative shifts from "we ship the trust layer for Mantle's agent economy" (Path B) to "**we are the first non-trivial tenant of Mantle's ERC-8004 trust layer.**" Slightly weaker positioning, materially more honest.

This is actually better for several panelists:

- **Mantle Labs / Mantle ecosystem leads** — sees their infrastructure being used for real work, with stake at risk and dispute resolution flowing through their registries. Strongest possible validation of the ERC-8004 deployment.
- **Virtuals Protocol** — the Reputation Registry gets real reputation signals, not synthetic ones. MantleProof's iNFT is `agent #N` in the public registry, discoverable by any ERC-8004-aware agent.
- **BGA (Blockchain for Good)** — public infrastructure being used for public safety work. Cleaner story than "we deployed our own infrastructure."

The README's "honest market" section becomes shorter because we no longer have to defend "we built the registries ourselves" as a roadmap step toward decentralization — we use the public registries from day one.

### 1.3 What changes in Week 1 build work

Original Week 1 included deploying three EIP-8004 registries plus four MantleProof contracts. Now Week 1 only deploys MantleProof's five contracts and registers against existing infra. Concretely:

- Pull the official ERC-8004 registry addresses on Mantle mainnet from Mantle's docs or DevHub (resolve at start of Week 1)
- Call `IdentityRegistry.register()` with MantleProof's agent metadata URI (capabilities, endpoints, payment address)
- Capture the returned `tokenId` — this is our agent ID for the rest of the build
- Pin the `tokenId` in `engine/config/identity.py`
- Wire the Reputation Registry interface into `MantleProofAgent.sol` so every audit advances reputation signals against the official registry
- Wire the Validation Registry interface into `StakingPool.sol` for the staking commitments (see Section 3)

The day-1 DoraHacks question is no longer open — Path A is the build path. Week 1 has roughly 2 days of slack freed up. We allocate it to Section 2 and Section 3 below.

### 1.4 Cascading documentation changes

For the README (when it's written in Week 6):

- Section "Smart contracts" lists 5 contracts on Mantle, plus references to the 3 official ERC-8004 registries with their Mantle addresses
- Section "Agent identity" mentions registration in the Identity Registry by tokenId
- Section "Honest market" drops the "we deploy our own infrastructure" framing
- New subsection "Mantle's ERC-8004 deployment in production" — credits Mantle for shipping the infra and frames MantleProof as its flagship tenant

---

## 2. Disputed Findings layer (Candidate 1)

The single biggest credibility upgrade for MantleProof. Addresses the deepest known weakness of AI audit tools: false positives with no accountability.

### 2.1 What it is

When MantleProof posts a Tier 2 finding, three parties can dispute it on-chain:

- **The audited contract's deployer**, proving deployer-key ownership
- **Any holder of an iNFT** registered in the official Identity Registry (so other agents can dispute on behalf of contracts they're invested in)
- **Any human via a 0.10 USDC anti-spam fee** (refundable if the dispute succeeds; forfeited to MantleProof's treasury if not)

The dispute submits a structured counter-claim: which finding, which evidence the disputer claims is wrong, and an optional alternative reading. MantleProof's engine re-runs Tier 2 against the dispute (full Claude reasoning pass, with the dispute's counter-claim loaded into the prompt). One of three outcomes:

- **Dispute rejected** — finding's honesty label upgrades one tier (e.g., `COMPUTED → VERIFIED`). The dispute is logged on the audit permalink with status `DISMISSED`. Disputer's 0.10 USDC is forfeited (or their counter-stake from Section 3 is slashed).
- **Dispute partially upheld** — finding's text gets amended, severity may downgrade, honesty label drops one tier. Logged as `AMENDED`.
- **Dispute fully upheld** — finding is `RETRACTED`. The audit permalink shows the retraction with the dispute's evidence. If a stake was attached (Section 3), it transfers to the disputer.

### 2.2 Why it works

Five reasons this composes well with the existing build:

1. **It uses ERC-8004's Validation Registry** — which is exactly what that registry exists for. Every dispute outcome posts to the official Validation Registry as a validation event. MantleProof becomes the first agent to use that registry non-trivially.

2. **The audit becomes a living document.** Today's design treats audits as static posts. With disputes, every contract page can have ongoing activity — disputes filed, re-audits run, labels changing. The dashboard gets a continuous stream of content beyond the deploy feed.

3. **The hallucination guard composes with disputes.** When the guard masks a claim as `[unsupported]`, that's a self-flagged uncertainty. Disputers can target exactly those masked claims, and the dispute system gives them a path to either confirm or correct. The two systems form a coherent uncertainty pipeline: hallucination guard flags, disputes resolve.

4. **It generates a new on-chain receipt type.** Every dispute is a tx. Every re-audit is a tx. Every label change is a tx. The "157+ on-chain receipts" framing Genesis used works even better with disputes because they're naturally recurring.

5. **It addresses the highest-impact criticism a VC judge could level** — "your AI tool has false positives." Now MantleProof's answer is: "yes, and here's the on-chain process for correcting them, with money flowing to whoever surfaces the correction."

### 2.3 Contract surface

Additions to `MantleProofRegistry.sol`:

```solidity
struct Dispute {
    bytes32 rootHash;          // which audit
    uint256 findingIndex;      // which finding in that audit
    address disputer;
    string counterClaim;       // IPFS CID of the disputer's argument
    uint256 counterStake;      // if Section 3 stake attached
    uint256 antiSpamFee;       // 0.10 USDC if from a human
    uint8 status;              // 0=PENDING, 1=DISMISSED, 2=AMENDED, 3=RETRACTED
    uint256 resolvedAt;
    bytes32 reAuditRootHash;   // the new audit root after re-evaluation
}

function submitDispute(
    bytes32 rootHash,
    uint256 findingIndex,
    string calldata counterClaimIpfs,
    uint256 counterStakeMnt
) external payable returns (uint256 disputeId);

function resolveDispute(
    uint256 disputeId,
    uint8 outcome,
    bytes32 reAuditRootHash
) external onlyOracle;

function getDisputes(bytes32 rootHash) external view returns (Dispute[] memory);
```

The dispute resolution is signed by the oracle (MantleProof's engine), same trust model as audit publication. No "decentralized arbitration" — that's a roadmap claim, not a hackathon claim.

### 2.4 Engine changes

`engine/dispute/` module handles the re-audit flow:

- Listens for `DisputeSubmitted` events on `MantleProofRegistry`
- Pulls the counter-claim from IPFS
- Loads the original audit context (source, bytecode, original Tier 1 + Tier 2 findings)
- Constructs a Tier 2 re-audit prompt that explicitly considers the counter-claim: "Given this contract, our previous finding X, and the disputer's counter-claim Y, re-evaluate. Return JSON with outcome ∈ {DISMISSED, AMENDED, RETRACTED} and updated finding text if AMENDED."
- Runs Claude (or Z.ai via the provider adapter) — same hallucination guard, same honesty labels
- Posts the result via `resolveDispute()` on-chain
- Updates the contract page with the new audit state

Build cost: ~3 days. Module is small; most of the surface area is reusing the existing Tier 2 engine.

### 2.5 UI changes

Modest. The existing design supports this with three additions:

**Contract drill-down page (`/contract/:address`)** — each finding gets a "Dispute this finding" link below the suggested-fix block. Clicking opens a modal (or `/dispute/new`) with form fields for the counter-claim IPFS link and optional stake amount.

**Audit permalink page (`/audit/:rootHash`)** — gains a "Disputes (N)" section below findings. Each dispute is a card showing: disputer (truncated address or agent name), counter-claim summary (first 200 chars of IPFS content), status badge (`PENDING` / `DISMISSED` / `AMENDED` / `RETRACTED`), resolution timestamp, and a link to the re-audit `/audit/:reAuditRootHash` if resolved.

**Homepage agent query log (right column)** — gains a new entry type: `dispute filed`, `dispute resolved`. Same row format as existing query entries.

**Status badge palette extension** — adds two more states:

```css
--status-disputed-pending: #BC8CFF;   /* purple — dispute in flight */
--status-disputed-final:   #6E7681;   /* grey — dispute resolved, see audit history */
```

### 2.6 Demo Day positioning

The dispute layer doesn't get its own demo flow. Instead, it provides the closing flow (Demo 4 — see Section 3.7 below) and is referenced in passing during Demos 1 and 2:

- During Demo 1: "MantleProof published this finding 14 minutes ago. It's been live and undisputed — but anyone can dispute it. Watch."
- This sets up Demo 4, which is the actual dispute-and-slash flow.

### 2.7 Risks and mitigations

- **Risk: no real disputes happen during the hackathon.** Then the feature is invisible. **Mitigation:** during Week 7, fire 3-5 disputes ourselves from the demo agents — one DISMISSED (proves the bar isn't trivially passable), one AMENDED (proves the system handles partial correctness), one RETRACTED (proves we'll actually retract findings). All three become worked examples in the README and the demo.
- **Risk: dispute spam.** **Mitigation:** the 0.10 USDC anti-spam fee for human disputers + counter-stake requirement for agent disputers makes spam expensive.
- **Risk: Claude's re-audit pass is non-deterministic; the same dispute could resolve differently on retry.** **Mitigation:** the dispute resolution is committed on-chain in a single call, no retry possible after that. We document the non-determinism as a known limitation in the README.

---

## 3. Reputation Staking layer (the reframed version)

The single-auditor self-staking version of reputation-staked auditing. Not a marketplace; MantleProof stakes against its own work and pays out when it's wrong.

### 3.1 What it is

Every Tier 2 audit that MantleProof posts also locks a stake of MNT into `StakingPool.sol`. The stake amount is fixed per tier:

- Tier 1 audits — no stake (heuristic-only, free to query, no money on the line)
- Tier 2 audits — **50 MNT staked** (roughly $50 at current rates; tunable per audit if needed)

The stake stays locked for a **30-day window** after the audit. During that window, two slashing conditions can trigger:

1. **Dispute slashing.** A dispute (Section 2) is fully upheld → finding is `RETRACTED`. The stake transfers to the disputer. If multiple disputes target different findings in the same audit and multiple are upheld, the stake is distributed proportionally.

2. **Exploit slashing.** Someone proves on-chain that an audited contract was exploited via a class of bug MantleProof should have caught. Mechanism: `claimExploit(rootHash, exploitTxHash, proofOfClassification)` — the claimant submits a tx hash of the exploit + a proof that the exploit class falls under one of MantleProof's five audit dimensions. The engine verifies the proof off-chain (via Claude reasoning + the exploit tx's trace), and if confirmed, slashes the stake to the claimant.

If neither trigger fires within 30 days, the stake unlocks and returns to MantleProof's treasury (less a 1% retention to `StakingPool.sol` for ongoing pool capitalization).

### 3.2 Why it works at hackathon scale

Single-auditor self-staking sidesteps the three problems that killed the marketplace version:

- **Economic mechanism is small.** Stake amounts are fixed, slashing conditions are limited to two, no bidding/auction/competition.
- **It doesn't need other auditors to exist.** MantleProof stakes against its own work. Counterparties are disputers and exploit-provers, both of which are roles other agents and humans can fill from day one.
- **Slashing conditions are narrow.** Dispute slashing uses the Section 2 mechanism, which is already deterministic enough. Exploit slashing is limited to algorithmically-classifiable exploits matching one of the five audit dimensions — not "anything bad that happened."

### 3.3 The README claim it unlocks

The "honest market" section of the README gets a flagship line:

> MantleProof is the only audit primitive on Mantle that puts money behind its findings. Every Tier 2 audit stakes 50 MNT for 30 days. Successful disputes take the stake. Proven exploits in the audit's classification scope take the stake. Skin in the game, on chain, from day one.

This is differentiation no other hackathon submission can match. It also makes the roadmap claims much stronger: when we say "we're moving toward decentralized auditor reputation," there's a working primitive to point at.

### 3.4 Contract surface

`StakingPool.sol` (~140 LOC):

```solidity
struct Stake {
    bytes32 rootHash;
    address auditor;          // always MantleProof's iNFT-owning address in v1
    uint256 amount;
    uint256 lockedAt;
    uint256 unlocksAt;        // lockedAt + 30 days
    uint8 status;             // 0=LOCKED, 1=RELEASED, 2=SLASHED_DISPUTE, 3=SLASHED_EXPLOIT
}

function lockStake(bytes32 rootHash, uint256 amount) external payable onlyOracle;
function slashByDispute(bytes32 rootHash, address beneficiary, uint256 portion) external onlyRegistry;
function claimExploit(bytes32 rootHash, bytes32 exploitTxHash, bytes calldata proofOfClassification) external;
function unlock(bytes32 rootHash) external;   // anyone can call after unlocksAt
function stakeOf(bytes32 rootHash) external view returns (Stake memory);
```

Modifications to `MantleProofRegistry.sol`:

- `submitAudit` calls `StakingPool.lockStake` with the configured Tier 2 stake amount if and only if tier == 2
- `resolveDispute` with outcome RETRACTED triggers `StakingPool.slashByDispute`

The `proofOfClassification` parameter for `claimExploit` is intentionally engine-verified rather than fully on-chain — making it fully on-chain would require deploying ZK circuits for each audit dimension, which is way out of scope. Engine verification is signed by the oracle, same trust model as everything else.

### 3.5 Engine changes

`engine/staking/` module:

- On every Tier 2 audit publication, computes the stake (currently constant 50 MNT, configurable) and bundles it into the `submitAudit` tx
- Listens for `ExploitClaimed` events; runs a verification pass (Claude reasoning + tx trace analysis) to confirm whether the claimed exploit class falls under one of the five audit dimensions
- Posts verification result via `slashByDispute` analog for exploits, or rejects the claim with a signed rejection event
- Cron job at the end of every day: walks all stakes past their `unlocksAt`, calls `unlock()` to return them to the treasury

Build cost: ~3 days. The exploit-classification engine is the harder piece; the staking pool itself is small.

### 3.6 UI changes

Three surfaces:

**Every audit display** — Tier 2 audits get a small "STAKED 50 MNT · 22 days remaining" indicator next to the audit timestamp. Color-coded:

- Green when stake is locked and audit is undisputed
- Purple when a dispute is pending against the audit
- Red strikethrough when the stake was slashed
- Grey when the stake was released (no slashing within 30 days)

**Agent page (`/agent/:tokenId`)** — gains a "Stake at Risk" panel showing:
- Total MNT currently locked across active Tier 2 audits
- Lifetime stakes released (audits that aged out without dispute or exploit)
- Lifetime stakes slashed by dispute (count + total MNT)
- Lifetime stakes slashed by exploit (count + total MNT)

The same panel doubles as a credibility signal — "released vs slashed" ratio is a single number a judge can read in two seconds.

**Audit permalink (`/audit/:rootHash`)** — gains a stake status block above the findings, showing the current state of the stake (locked / released / slashed) and the contract address holding the stake. A `claimExploit` button is present but only enabled if the audit has at least one finding that classifies an exploit class (UI shows what classes are claimable for this specific audit).

### 3.7 Demo Day update — adding Demo 4

Demo Day script extends from 3 minutes to ~3:30. Updated flow:

> 00:00 — Opening (unchanged)
>
> 00:20 — Dashboard intro (unchanged)
>
> 00:30 — Demo 1: Deployer-agent pre-deploy audit (unchanged). Add 5 seconds at the end: "Notice this audit has 50 MNT staked behind it for 30 days. We'll come back to that."
>
> 01:10 — Demo 2: Trading-agent declines based on `pause()` backdoor finding (unchanged).
>
> 01:50 — Demo 3: Yield-agent approves deposit on a clean Liquidity Book pool (unchanged).
>
> 02:30 — **Demo 4 (NEW): Dispute and slash.** Switch to the audit permalink for one of MantleProof's recent Tier 2 audits. A disputer-agent (pre-funded TypeScript script on stage) submits a counter-claim against a finding. Show the dispute appearing live on the permalink page. The engine re-runs Tier 2 against the counter-claim — show the dashboard's engine activity indicator pulsing. ~30 seconds later: dispute resolves as `RETRACTED`. The audit permalink updates. The stake transfers to the disputer's address. Show the `StakingPool.slashByDispute` tx on Mantlescan. **"Three Mantle Explorer links: dispute filed, re-audit posted, stake slashed. MantleProof published a finding, was wrong about it, and paid out. Skin in the game."**
>
> 03:15 — Closing (unchanged, ~15 sec, mantleproof.xyz reference).

Total: ~3:30. The added 30 seconds is the strongest possible closing — money moving on-chain based on the audit being demonstrably wrong. Judges remember the close more than the middle.

### 3.8 Risks and mitigations

- **Risk: 50 MNT × N active Tier 2 audits ties up too much treasury.** **Mitigation:** the cache-warmer in Mode A (Section 6 of the base plan) runs at Tier 1, not Tier 2. Only paid Tier 2 audits stake. At hackathon scale this is maybe 5-20 active stakes at any time → 250-1000 MNT locked at any time → tractable.
- **Risk: someone exploits the exploit-classification engine to claim stakes fraudulently.** **Mitigation:** the engine signs rejections too. Spurious claims get rejected on-chain with a rejection event. The claimant loses gas but not capital. If we see adversarial pressure, can add a small claim-deposit (e.g., 1 MNT) refundable on legitimate claims.
- **Risk: Claude misjudges an exploit classification and lets a slash through that shouldn't have happened.** **Mitigation:** for hackathon scope, accept the risk and document it. Exploit slashing requires an explicit oracle action, so a wrong slash is at worst a few hundred dollars lost during the hackathon period. Post-hackathon, the classification step should move toward optimistic dispute resolution.

---

## 4. Combined build sequence update

The base plan's Week 1-7 sequence remains the spine. Extensions slot in as follows:

**Week 1 — Foundation, contracts, registration.** Path A simplification: deploy only the 5 MantleProof contracts (`MantleProofRegistry`, `MantleProofAgent`, `MantleProofLicense`, `TreasurySplit`, `StakingPool`). Register MantleProof as an agent in Mantle's official Identity Registry; capture and pin the assigned tokenId. Wire the Reputation Registry interface. Wire the Validation Registry interface for stakes. Pin Mantle L2 token addresses. ~2 days slack compared to the Path B Week 1 plan; absorbed into the staking work for Week 3.

**Week 2 — Audit engine, Tier 1.** Unchanged from the base plan.

**Week 3 — Tier 2 and hallucination guard, *plus* dispute engine and staking integration.** Original Tier 2 work in the first 4 days. Last 2-3 days add: the dispute engine module (`engine/dispute/`), the staking pool integration (`engine/staking/`), and the exploit classifier (initial version). Highest-risk week; budget the full week and into the buffer week if needed.

**Week 4 — Query surfaces.** Unchanged. The x402 paywall now also handles the 0.10 USDC anti-spam fee for human-submitted disputes (same Base settlement, same facilitator).

**Week 5 — The demo agents.** Original three agents (deployer, trading, yield) plus a fourth: **disputer-agent**. The disputer-agent's wallet is pre-funded with 5 MNT for counter-stake and 0.5 USDC for anti-spam fees. Each demo flow now also generates an on-chain stake event during Tier 2 audits.

**Week 6 — Frontend, dashboard, polish.** Original 5 days plus design extensions: the dispute UI on `/contract/:address` and `/audit/:rootHash`, the stake-status indicators on every Tier 2 audit display, the "Stake at Risk" panel on `/agent/:tokenId`, the new status badge colors. ~1-1.5 days of additional UI work.

**Week 7 — Buffer, distribution prep, and seeded disputes.** During this week, fire 3-5 synthetic disputes from the disputer-agent (one DISMISSED, one AMENDED, one RETRACTED minimum) against MantleProof's own audits to produce on-chain history. These become README worked examples and Demo Day evidence. Plus original Week 7 tasks (Twitter thread, demo video edit, submit on DoraHacks).

Total additional build time: ~6 days, distributed across Weeks 3, 5, 6. Fits comfortably in the buffer week. No changes to overall submission window.

---

## 5. Combined contract inventory (final)

For reference, the complete list of contracts MantleProof deploys to Mantle mainnet after all extensions are folded in:

| Contract | Purpose | LOC | New / Modified / Same |
|---|---|---|---|
| `MantleProofRegistry.sol` | Audit registry + dispute submission/resolution + slashing hooks | ~250 | Modified (was ~150, +100 for disputes & staking hooks) |
| `MantleProofAgent.sol` | Thin wrapper over official Identity Registry; reputation cache | ~140 | Same (Path A) |
| `MantleProofLicense.sol` | Pay-per-audit licensing, 80/20 split, x402 on Base | ~180 | Same |
| `TreasurySplit.sol` | Treasury timelock | ~80 | Same |
| `StakingPool.sol` | Tier 2 stake locking, dispute/exploit slashing | ~140 | New |

Plus references to (not deployed by us):
- Mantle's official `IdentityRegistry` — MantleProof registers as agent #N
- Mantle's official `ReputationRegistry` — receives signals on every audit
- Mantle's official `ValidationRegistry` — receives staking commitments and slashing events

Total LOC across MantleProof-owned contracts: ~790. Up from the base plan's ~610 (Path A), down from Path B's ~940 with reputation staking layered on.

---

## 6. Combined README structure update

The README scaffold from base plan Section 11 gets three small additions:

- New subsection under "The five audit dimensions": **"Findings are disputable."** Two paragraphs explaining the dispute mechanism with a link to the live disputes list.
- New section between "Smart contracts" and "Tier 2 reasoning": **"Skin in the game — stake and slashing."** One screen of copy explaining the 50 MNT stake, the two slashing conditions, the 30-day window, and the lifetime released-vs-slashed ratio (with the live number pulled from the StakingPool).
- The "Honest market" section gets shorter — the "neither of which are hackathon-scope" hedge gets removed for reputation-staked auditing, since that is now in scope. Updated paragraph:

> Real revenue comes from CI integration and broader adoption of the staking pool as a multi-auditor marketplace, neither of which are hackathon-scope. What we demonstrate at hackathon scale is: the engine finds ecosystem bugs static analyzers miss, the inter-agent licensing clears on chain, the iNFT reputation compounds, findings are disputable, and the auditor (MantleProof itself) has 50 MNT at stake on every Tier 2 audit. We pay out when we're wrong. The market hypothesis for the multi-auditor expansion is testable post-hackathon.

---

## 7. What stays the same

For clarity, things in the base plan that **do not change**:

- The five audit dimensions and their concrete spec
- The Liquidity Book correction for the DEX check
- The mETH L1/L2 distinction
- The x402 settlement on Base (not Mantle)
- The five honesty labels (VERIFIED/COMPUTED/ESTIMATED/EMULATED/LABELED)
- The hallucination guard mechanism
- The MCP server (`npx mantleproof-mcp`)
- The Bloomberg-terminal + Datadog-IA hybrid design language
- The five-screen frontend (homepage, contract drill-down, agent page, audit permalink, judge flow)
- The Path A x Path B choice (resolved to Path A)
- The submission window (May 1 → June 15) and Demo Day (July 2-3)
- The track (AI DevTools)
- The single-track strategy (no multi-track stacking)

---

## 8. Open items (to resolve at start of Week 1)

A short list of unknowns that the extension introduces and that need resolution on day 1:

1. **Mantle's official ERC-8004 registry addresses on mainnet.** Pull from Mantle docs or DevHub; if not published, post on DoraHacks discussion board immediately.
2. **The registration flow for MantleProof's agent metadata URI.** Likely a JSON file pinned to IPFS conforming to the ERC-8004 metadata schema; verify the schema with the Mantle team if it differs from the EIP-8004 reference schema.
3. **Stake amount calibration.** 50 MNT is a placeholder. Confirm against current MNT/USD; adjust if MNT volatility makes $50 a wildly different number by Week 5.
4. **Exploit classification scope.** The initial version handles the five audit dimensions as the only claimable exploit classes. Confirm this is the right cut, or whether we want to launch with a narrower scope (e.g., only USDY and Liquidity Book classes for hackathon-scope `claimExploit`).
5. **Whether to allow Tier 1 disputes.** Currently the design only allows disputes against Tier 2 audits (since Tier 1 is heuristic-only and free). Confirm — alternative is to allow Tier 1 disputes that only result in label changes, not stake transfers (since no stake exists for Tier 1).

Default answers if no further input: (1) ask DoraHacks Day 1, (2) IPFS pin per EIP-8004 schema, (3) keep 50 MNT, (4) all five dimensions in scope, (5) Tier 2 disputes only.

---

End of Extensions document. Treat in combination with `MantleProof-Build-Plan.md`, `MantleProof-Resources.md`, and `MantleProof-Design.md` as the complete planning surface.
