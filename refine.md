# MantleProof — High-Leverage Pre-Submission Actions

Four concrete actions derived from reviewing MantleProof against the official Mantle judging scorecard and Emark's accumulated hackathon strategy. These are framing and packaging moves, not architecture changes — the build is right; this sharpens how it's presented so it scores the way it should.

Excludes the fifth review item (finding the AI DevTools Part B sponsor rubric), which is a research task, not a writing task.

**Note on Action 2:** the original review suggested a "Why This Is Not An AI Audit Tool" section, modeled on PolicyPool's "Why This Is Not A Dynamic Fee Hook." On reflection that framing is wrong and is corrected below. MantleProof *is* an AI audit tool — denying the honest category would read as defensive and cost trust. The correct move rejects only the *lazy instance* of the category (the GPT-wraps-Slither report generator), which MantleProof genuinely is not. See Action 2.

---

## Action 1 — Collapse to one headline mechanic

### The problem

MantleProof currently presents as a flat list of mechanics: five audit dimensions, two tiers, hallucination guard, honesty labels, disputes, staking, slash-by-exploit, MCP server, x402, three query surfaces, four demo agents, ERC-8004 across three registries. That is a lot of surface area, and a flat list reads as *unfocused* rather than *deep* — the exact failure mode that placed Kickoff outside the top three despite real technical depth. Winners had one mechanic per sentence; the obvious thing made sharp.

The fix is not to cut features. It is to rank and subordinate them ruthlessly, so the project reads as **one headline with a supporting tree** rather than a dozen co-equal features.

### The headline

> **MantleProof is an audit oracle that agents call before they transact — and it stakes MNT on being right.**

One sentence. One mechanic in the foreground (an oracle in the transaction path), one differentiator that makes it credible (skin in the game). Everything else is "how."

### The subordination tree

Every other feature is reframed as the answer to a "how" question hanging off the headline. This is how to present the project everywhere — README, pitch, demo narration:

- **What does it check?** → the five Mantle-specific audit dimensions (USDY rebase, mETH bridge lag, sUSDe cooldown, Liquidity Book bins, EIP-712 replay). *These are "how it audits," not five separate features.*
- **How does it price audits?** → Tier 1 free heuristic, Tier 2 paid Claude reasoning. *This is "how it charges," not a feature.*
- **Why trust an AI's findings?** → hallucination guard + five honesty labels + the stake. *This is "how it earns trust."*
- **What if it's wrong?** → the dispute layer re-runs Tier 2; upheld disputes take the stake. *Disputes are "how staking stays fair" — a supporting actor, not a co-headline.*
- **How do agents reach it?** → on-chain `getAudit`, MCP server, x402 endpoint. *This is "how it's accessed," not three features.*
- **Who uses it?** → the four demo agents (deployer, trading, yield, disputer). *These demonstrate the headline; they are evidence, not scope.*

### The discipline

Anywhere MantleProof is described, the first sentence is the headline and nothing competes with it. The five dimensions never lead. Staking never appears as "and also we have staking" — it appears as the second half of the headline sentence. The dispute layer never appears before staking — it is always introduced as the thing that makes staking fair.

If a listener can repeat back one sentence after the pitch, it must be the headline. Test every piece of copy against that.

### Where this changes existing material

- **README hero:** opens with the headline sentence, then the subordination tree as a short "how it works" section. Not a feature list.
- **Demo Day open:** the headline is the first spoken line (the build plan's Demo Day script already moves toward this — tighten it so staking is in the opening sentence, not introduced at 00:30).
- **DoraHacks tagline / short description:** already close (the project descriptions written earlier). Make sure the stake clause is in the one-sentence version, because it is the differentiator.
- **Positioning doc:** already leads with the right thesis; no change needed, it is the source material this action compresses.

---

## Action 2 — "Not another report generator" differentiation section (corrected)

### The correction

The crowded category MantleProof sits near is "AI audit tooling." MantleProof belongs to that category — it uses AI, it audits, it is a tool. A section titled "Why This Is Not An AI Audit Tool" would be dishonest and would read as defensive cleverness, costing trust with exactly the technical judges who matter most.

What MantleProof is *not* is the lazy, crowded instance of that category: the **GPT-wraps-Slither report generator** that every judge has seen ten times this hackathon. That distinction is true, and naming it is honest. So the section accepts the category and rejects only the lazy instance.

### The section (drop into the README, after the "how it works" tree)

Working title: **"How MantleProof differs from a report generator"** or **"Not a Slither wrapper."**

The content makes three honest distinctions:

**1. Output shape: oracle, not report.**
A Slither wrapper produces a human-readable report for a person to read after the fact. MantleProof produces a structured, on-chain, sub-second signal for an agent to consume *inside a transaction decision*. The product is `getAudit(address) → {severity, findings, rootHash}`, not a PDF. This is a difference in kind, not quality — the report generator cannot be called by a contract; MantleProof can.

**2. Consumer: agents, not humans.**
A report generator assumes a human developer reads the output and decides what to do. MantleProof assumes the consumer is another autonomous agent making a decision at machine speed with no human present. That assumption drives every design choice — the JSON-first responses, the on-chain read path, the MCP tools, the honesty labels that are machine-parseable confidence signals rather than prose hedges.

**3. Accountability: stake, not disclaimer.**
A report generator (and every professional audit) ends with "no warranties, use at your own risk." MantleProof stakes 50 MNT on every Tier 2 audit and pays out when a dispute proves it wrong or an exploit in scope is proven. No report generator puts money behind being right, because a report generator's incentive is to flag everything and let the human sort it out. MantleProof's incentive is calibrated by the stake — over-flagging gets disputed, under-flagging gets exploited, both cost money.

### Why this is the honest version

Each distinction is verifiable and true. None claims MantleProof isn't an audit tool. The section's job is to stop the reflexive mis-file — "oh, another Slither-plus-LLM project" — by drawing the line where it actually is: not the category, but the *shape, consumer, and accountability* of the thing. A judge who reads this trusts the project more, not less, because the distinctions are real and stated plainly.

### What to avoid

- Do not claim MantleProof replaces Slither or professional audits. The Positioning doc already concedes they are better at structural bugs and pre-launch depth respectively. Keep that concession — it is what makes the differentiation credible.
- Do not use the word "just" about competitors ("Slither is just a static analyzer"). It reads as dismissive and invites the judge to defend the incumbent.
- Do not bury the concession. Lead the section with what the alternatives are genuinely good at, then draw the distinction. Conceding first earns the right to differentiate.

---

## Action 3 — The `mantleproof verify` one-command CLI

(Action numbering here is local to this document; this is the fourth review item, the verification-as-deliverable move. The Part B research item is excluded as noted in the header.)

### The problem

The build plan has a `/judge` web flow, which is good, but Emark's own verification-as-deliverable lesson is sharper than a web page: *don't just list tx hashes; give a command that prints green checks.* A judge running one command and watching it print PASS against live Mantle mainnet state is worth more than any amount of explanation, and it directly serves the Technical score's "feature completeness" and "runs end-to-end on Mantle" requirements.

There are two distinct CLI surfaces, and they serve different scorecard lines. Both are worth building.

### 3a — `mantleproof verify` (the judge's trust command)

A single command that connects to Mantle mainnet and prints a sequence of green checks proving MantleProof is real and live:

```
$ npx mantleproof verify

MantleProof — live verification against Mantle mainnet (chainId 5000)

  [✓] Registry contract deployed & verified      0x… (mantlescan ↗)
  [✓] Agent registered in ERC-8004 Identity      tokenId #N
  [✓] StakingPool holds live stake               N MNT locked across M audits
  [✓] Most recent audit anchored on-chain         rootHash 0x… (block …, 14m ago)
  [✓] getAudit() returns structured finding        target 0x… → HIGH, 2 findings
  [✓] Dispute resolved on-chain                    disputeId N → RETRACTED, stake slashed
  [✓] Tier 2 reasoning reachable                   engine healthy, provider=claude

  7/7 checks passed. MantleProof is live on Mantle mainnet.
  Full audit: https://mantleproof.xyz/audit/0x…
```

Each check is a real read against mainnet, not a hardcoded string. The command is the single highest-ROI artifact against the Technical score because it collapses "is this real?" into 30 seconds of green checks. It maps directly to the verification-as-deliverable lesson and to the scorecard's insistence that core functionality runs end-to-end on Mantle.

Build cost: ~1 day. It is a thin TypeScript script reading from contracts already deployed in Week 1 and reusing the MCP server's read paths. Slots into Week 6 or the buffer.

### 3b — `npx mantleproof check 0x…` (the UX-score onboarding command)

The originally-declined Candidate 5, reconsidered specifically as a User Experience scorecard play. The UX dimension (5 pts) explicitly rewards "onboarding friction" reduction. A one-command audit of any Mantle contract, no wallet required for the free Tier 1 read, is the lowest-friction onboarding possible:

```
$ npx mantleproof check 0x39e8…a807

Auditing 0x39e8…a807 on Mantle mainnet…
  Merchant Moe LB Pair: mETH-USDC

  HIGH    [VERIFIED]   Liquidity Book bin-id validation missing
  MEDIUM  [COMPUTED]   Variable fee read assumes static tier

  Tier 1 (free) complete. For deep Tier 2 analysis (0.50 USDC): mantleproof check 0x39e8…a807 --tier2
  Full report: https://mantleproof.xyz/contract/0x39e8…a807
```

This is the answer to "onboarding friction" on the scorecard, it is tweetable in a single screenshot (the one shareable artifact for the otherwise hard-to-share community-vote axis), and it pairs with the MCP server since both wrap the same engine.

Build cost: ~2 days, mostly reusing the engine API the MCP server already exposes. Reconsider purely as a UX-score and distribution play.

### Note on gasless / AA for the UX score

The scorecard names "AA / gasless integration" as a UX key metric. MantleProof's read path (`getAudit`, the CLI `check`, the dashboard reads) requires no wallet and no gas — document this explicitly as zero-friction onboarding. The x402 payment path already uses EIP-3009 gasless authorization on Base. Where a Mantle-side write is unavoidable (filing a dispute), note whether an AA path is feasible; if not, it is acceptable to leave as a documented limitation, since the primary onboarding path (reads) is already gasless.

---

## Action 4 — Status/MVP-scope table + one-page GTM

Two artifacts that convert MantleProof's honest-but-soft Business Potential into scorecard-tickable claims, and that foreground the core while fencing the extras (the narrow-flawless framing that beat ambitious-broad entries).

### 4a — The Status / MVP Scope table

Drop into the README near the top, right after the "how it works" tree. It does two jobs: proves the core is real and live, and proudly fences the extensions as extensions so breadth reads as *layered* rather than *unfocused*. This is the honesty-table lesson — disclose live-vs-unbuilt, state deliberate cuts proudly.

| Capability | Status | Evidence |
|---|---|---|
| Audit engine — five Mantle dimensions, Tier 1 | **Live on mainnet** | `getAudit` returns findings; verify via CLI |
| Audit engine — Tier 2 Claude reasoning + hallucination guard | **Live on mainnet** | Recent Tier 2 rootHash anchored on-chain |
| On-chain audit registry | **Live on mainnet** | Contract verified on Mantlescan |
| ERC-8004 identity registration | **Live on mainnet** | MantleProof = agent #N in official Identity Registry |
| `getAudit` / MCP / x402 query surfaces | **Live** | CLI `verify` exercises all three |
| Inter-agent licensing (80/20 split) | **Live on mainnet** | Demo 1 payment tx |
| Reputation staking — 50 MNT per Tier 2 | **Live, seeded** | StakingPool holds live stake; N audits staked |
| Dispute layer — submit / re-audit / resolve | **Live, seeded** | M disputes resolved on-chain (1 DISMISSED, 1 AMENDED, 1 RETRACTED) |
| Slash-by-exploit (`claimExploit`) | **Functional, narrow scope** | Limited to the five audit dimensions; documented |
| Multi-auditor staking marketplace | **Planned** | Post-hackathon; primitive shipped, market untested |
| CI / GitHub Action integration | **Planned** | Roadmap; engine API ready |

The "Planned" rows are stated proudly, not apologetically — they show a roadmap that the shipped primitives credibly support. The "Live, seeded" rows are honest that the activity was bootstrapped by the team's own demo agents during the hackathon, which is the truthful maturity level and reads as integrity rather than weakness.

### 4b — The one-page GTM

The scorecard's Business Potential dimension wants "credible post-hackathon go-to-market." The Positioning doc is honest that the market is nascent — correct for a VC conversation, but a scorecard judge scoring "genuine user demand" needs a confident, concrete first-customer story to tick the box. Both can be true: keep the honest version for live Q&A, give the scorecard a crisp GTM it can rate "credible."

The one-pager, structured for a judge to skim in 60 seconds:

**First customer segment (now):** Mantle-native autonomous agents and the teams building them — including, concretely, the other agent projects in this very hackathon. They are the first addressable users, they exist today, and they have the exact need MantleProof serves (a safety signal before transacting). Demand is adjacent and real, not hypothetical.

**Wedge:** the free Tier 1 read. Zero friction, no wallet, one CLI command or one MCP call. Agents and their developers adopt the read path at no cost; this seeds the audit graph and the integration base.

**Revenue (now):** Tier 2 paid audits (0.50 USDC) via x402, with the 80/20 split. Per-audit micropayments, not a subscription — matched to how agents actually consume.

**Expansion (next):** CI integration (the GitHub Action that pre-audits on every PR — a real category, Snyk/GitGuardian-shaped) and the multi-auditor staking marketplace (other auditors stake against their own findings; MantleProof becomes the protocol, not just the first auditor).

**Why now:** the agentic economy Mantle is building is the demand driver. MantleProof is a leveraged bet on the same thesis the judges are already underwriting by running this hackathon. If autonomous on-chain agents are real, they need this; if they are not, most of the hackathon's premise fails too.

**The honest edge (for Q&A, not the scorecard line):** the moats are time-denominated and near-zero today — the audit graph, the staking track record, the integrated-agent base all accumulate from day one and cannot be bought. MantleProof's defensibility is being first into that flywheel. (This sentence lives in the pitch and Q&A, per the Positioning doc; the scorecard one-pager leads with the confident segment-and-wedge story.)

---

## Summary — what to build and where it scores

| Action | Primary scorecard impact | Strategy lesson served | Build cost |
|---|---|---|---|
| 1 — One headline mechanic | Innovation (10), overall coherence | "One mechanic per sentence"; avoid the Kickoff flat-list failure | Framing only |
| 2 — "Not a report generator" section | Innovation (10), Technical credibility | PolicyPool category-rejection, *corrected* to reject only the lazy instance | Framing only |
| 3 — `verify` + `check` CLIs | Technical (15), User Experience (5) | Verification-as-deliverable; print green checks | ~3 days total |
| 4 — Status table + GTM one-pager | Business Potential (10), Technical (15) | Honesty table; narrow-flawless over ambitious-broad | ~0.5 day |

The through-line: the build is technically strong and ecosystem-aligned. The pre-submission risk is the Kickoff risk — too many mechanics, insufficiently subordinated, in a category judges will reflexively mis-file. These four actions are almost entirely framing and packaging, plus three days of CLI work that directly earns Technical and UX points. None of them touch the architecture. They make the project read as narrow, sharp, and live — which is how it scores the way its engineering deserves.
