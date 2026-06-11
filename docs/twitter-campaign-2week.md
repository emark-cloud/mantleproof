# MantleProof — 2-Week Twitter Campaign Plan

> Continuation of the launch thread (tweets 1–6, posted Jun 9, 2026). This is the
> "here's the proof" arc. Every post is grounded in a live mainnet receipt — a link,
> not a claim. Posting cadence: every ~3 days → 5 slots. Dates below are off the Jun 9
> start: ~Jun 12, 15, 18, 21, 24. Continue numbering from 7.
>
> **Before posting any receipt:** pull exact addresses / txHashes from the live frontend
> or `getAudit` — TODO.md (T25) and CLAUDE.md list different mainnet contract sets
> (registry redeployed `0xcF3703BD…`, staking-free, 2026-06-10). Don't ship a stale link.

## The arc

Explained the *idea* in 1–6. Now: **Proof → Honesty-under-fire → Mechanism → Adoption → Social proof.**
Each slot is a short thread (threads get screenshotted; singles disappear). Attach a
screenshot from the live frontend (three re-anchored audits) or an explorer link.

---

## Post 1 — ~Jun 12 · "It actually decided. On-chain."

**Angle:** Headline deliverable. Three autonomous agents, three real audits, three real
verdicts — including one that committed real funds.

> 7/ The whole pitch is "an agent reads the audit and acts on it." So I shipped three agents that do exactly that, live on @0xMantle mainnet:
>
> — deployer-agent → **DECLINED** a buggy yield vault
> — trading-agent → **DECLINED** a backdoored token
> — yield-agent → **APPROVED** Merchant Moe, then deposited real WMNT
>
> Every verdict is an on-chain receipt. ↓

> 8/ The yield-agent is the one I care about: it got a MEDIUM audit back, decided the findings were N/A for its pair, and committed 0.05 WMNT into Merchant Moe's LB router.
>
> An agent trusting an audit enough to move money — `addLiquidityNATIVE 0x52904eb2…`
>
> Two declines, one funded approval. No human in any loop.

**Asset:** three audits on the frontend + DecisionLog APPROVED/DECLINED tx links.

---

## Post 2 — ~Jun 15 · "My oracle was wrong. On-chain."

**Angle:** Most credibility-purchasing post available. A dispute was filed against one of
your own findings, and the oracle retracted it. Frame on the **retraction**, not slashing
(staking deactivated 2026-06-10, slashing now roadmap — don't lean on it).

> 9/ A claim is only as good as what happens when it's wrong.
>
> Someone disputed a finding in the yield-agent audit. The oracle re-audited under the counter-claim — and **RETRACTED** it. The original finding misread a standard AMM exact-output swap.
>
> The retraction is on-chain. submitDispute → resolveDispute.

> 10/ Disputes are permissionless — anyone can challenge a Tier 2 finding. 6 others were filed and DISMISSED, each refuted with specific source lines.
>
> An oracle that never admits error is just a louder PDF. This one corrects itself in public.
>
> (economic slashing behind disputes is on the roadmap — flagged honestly.)

**Asset:** dispute + resolve tx links.

---

## Post 3 — ~Jun 18 · "Here's the part that stops the LLM from lying."

**Angle:** The hallucination guard — your technical moat, explained plainly.

> 11/ The scary part of putting an LLM in an audit path: it invents numbers that sound right.
>
> So nothing the LLM says ships unchecked. Every `$`, `%`, hex literal and address is regex-extracted and verified against the actual source, bytecode, and Tier 1 findings.

> 12/ If a claim can't be backed, two things happen automatically:
> — it's masked `[unsupported]`
> — the finding's honesty label drops one tier (VERIFIED→COMPUTED→…)
>
> and the count is shown publicly: "guard fired: N masked."
>
> The label-drop is a pure, unit-tested function. It can't be talked out of it.

**Asset:** code snippet or before/after of a masked claim. Label ladder
(VERIFIED · COMPUTED · ESTIMATED · EMULATED · LABELED) reads well as an image.

---

## Post 4 — ~Jun 21 · "Three ways to call it. Pick one."

**Angle:** Adoption / dev CTA. Proven it works — now show builders how in 30 seconds.

> 13/ If you're building an agent on Mantle, there are three ways to reach MantleProof — same JSON, same honesty labels out of all three:
>
> — on-chain `getAudit()` — free, trustless
> — MCP server — `npx -y mantleproof-mcp`, zero config
> — x402 REST — pay 0.50 USDC, get Tier 2

> 14/ The x402 path is cross-chain on purpose: you pay in USDC on @base, the audit anchors on @0xMantle, and **both txHashes come back in the response.**
>
> payment `0x98c5137d…` (base) · anchor `0xbffe7ca5…` (mantle)
>
> Drop the MCP server into Claude/Cursor and your agent can audit before it signs.

**Asset:** 10s screen recording of the MCP call, or x402 JSON response with both hashes highlighted.

---

## Post 5 — ~Jun 24 · "Someone who isn't me vouched for it."

**Angle:** Social proof + fortnight close. First paying customer left on-chain ERC-8004
reputation feedback.

> 15/ Closing the loop: the deployer-agent paid for its audit, used it, and then left **on-chain feedback** about MantleProof — rated 4/5, tagged `audit-quality`.
>
> Posted to Mantle's official Reputation Registry. The payer isn't me — verified not the owner/operator. Real customer, not self-applause.

> 16/ Two weeks in: 3 agent decisions, 1 retracted dispute, 1 paying customer's on-chain rating, 5 Mantle-specific checks live.
>
> Everything above is a link, not a claim. That was the whole point.
>
> Audit oracle for the agentic economy. Live on @0xMantle. ↓ [frontend URL]

**Asset:** feedback tx + clean shot of the frontend landing.

---

## Reserve material (filler / quote-tweet fodder)

- **One check, explained:** pick the juiciest of the five (USDe/sUSDe cooldown or
  Merchant Moe LB bins) and show a real finding a generic analyzer would miss.
- **Latency flex:** "Tier 1 p50 = 0.4ms. An agent has ~400ms to decide. We use 0.1% of
  its budget." (honest: Tier 1 only.)
- **Precision, honestly:** 1.00 precision/recall — but say "on a 14-sample labeled set"
  out loud. Understating it *is* the brand.

## Mechanics

- **Tag:** `@0xMantle` always; `@base` on the x402 post. Check for hackathon / Z.ai
  handles to tag on the close.
- **Numbering:** continue 7→16 so the whole campaign reads as one spine.
- **Timing:** first tweet at 9:47am got 49 views — try 1–3pm ET weekdays for proof posts.
- **Every post ends with a link, not an adjective.** That contrast (everyone hypes, you
  link) is the differentiation. Keep doing it.
