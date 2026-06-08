# MantleProof — Demo Video Script

> Shot-ready script for the hackathon submission demo video. Built on what the code
> actually prints and renders. Prioritized for wow factor and a coherent arc — not a
> feature tour. **Target runtime ~3:50.**

**Logline:** *AI agents are about to move real money on Mantle. MantleProof is the
oracle they call first — and the only one that can prove it isn't lying.*

**Format:** screen capture (terminal + browser + Mantlescan) with voiceover ·
**Tone:** fast, confident, evidence-first.

---

## [0:00–0:18] — HOOK (cold open, no logo yet)

**SCREEN:** Black. A single terminal line types out an AI agent about to call a
contract. Then a hard cut to a Mantlescan page of `BackdooredMemeToken` — zoom on a
`pause()` / `mint()` backdoor in the source.

**VO:**
> "In Mantle's agentic economy, AI agents trade, deploy, and deposit real money —
> autonomously. But an agent can't *read* a contract for backdoors. It just signs. So
> here's the question nobody's answering: **before an agent touches a contract, who
> tells it the truth?**"

**On-screen text (lower third):** `Agents move money. They can't tell safe from rugged.`

> Why this hook: it names the stakes (real money, autonomous), names the gap, and ends
> on a question the rest of the video answers. No "Hi, I'm…" — get to tension in 18s.

---

## [0:18–0:40] — WHAT IT IS

**SCREEN:** Logo beat (1s), then the Landing hero with the count-up number animating
and the Tier-2 flow diagram `resolve → reason → guard → publish`.

**VO:**
> "MantleProof is an on-chain **audit oracle**. Any agent queries it before touching a
> contract and gets a structured safety signal back — in under a second. One backend,
> three ways to ask: a direct on-chain `getAudit` call, an MCP tool, or a paid REST
> endpoint. Same answer, same honesty, every time."

---

## [0:40–1:25] — THE DIFFERENTIATOR: the hallucination guard

**SCREEN:** Open an Audit permalink (`/audit/:rootHash`). Slow-pan the finding cards —
linger on the honesty-label pills `[VERIFIED] [COMPUTED] [ESTIMATED]`. Then zoom hard
on the public note: **"Hallucination guard fired: 3 masked."** Cut to the
`hallucination_guard.py` test file scrolling green.

**VO:**
> "Here's the part that matters. Most AI auditors just trust whatever the model says.
> We don't. Every dollar figure, every percentage, every address the LLM writes gets
> regex-extracted and checked against the actual source line or bytecode. If a claim
> can't be verified, we mask it — and we **drop the finding's trust label by one
> tier**. Then we show you exactly how many times it fired. That number is public on
> every report. **An auditor that tells you when it isn't sure is the only auditor an
> agent can safely trust.**"

**On-screen text:** `VERIFIED → COMPUTED → ESTIMATED → EMULATED → LABELED · every claim earns its label`

> This is your credibility centerpiece. Spend real seconds here — it's what separates
> you from "another GPT wrapper."

---

## [1:25–2:45] — THE HEADLINE: agents acting on-chain (the wow)

**SCREEN:** Sequential. Run `trading-agent` live in the terminal. Let these real lines
land on screen:

```
[step 1] Registry.getAudit(...) — the Demo 2 headline read (free, on-chain)
         severity=HIGH   ipfsCID=ipfs://Qm...
[step 2] DecisionLog.logDecision(..., "DECLINED", reason) — THE HEADLINE RECEIPT
         tx=0x...   Decision event OK (agent=... target=... root=...)
=== Demo 2 OK — receipts ===
```

Then **cut to Mantlescan** and open that `DecisionLog` tx — show the `Decision` event
with `DECLINED` on **mainnet**.

**VO:**
> "Now watch an agent actually use it. This trading agent wants to buy a token. First
> it asks MantleProof — `getAudit`, a free on-chain read. The answer comes back **HIGH
> severity**: hidden mint and pause backdoors. So the agent **refuses the trade — in
> code** — and writes its refusal to the chain. Here's the receipt. On Mantle mainnet.
> The audit hash in this decision *matches* the one it read — it can't fabricate the
> reason after the fact."

**SCREEN:** Quick cut — run `yield-agent`, show:

```
[step 3] eth_call SIMULATION ... simulation OK — would not revert
[step 4] LBRouter.addLiquidityNATIVE — real Merchant Moe LB v2.2 deposit
         tx=0x...   status=success
[step 5] DecisionLog.logDecision(..., "APPROVED", reason)
```

Cut to the `addLiquidity` tx on Mantlescan.

**VO:**
> "And the flip side — a yield agent checks an audit, clears it, simulates first, then
> deposits **real funds** into Merchant Moe liquidity. Approved, logged, on mainnet.
> **These aren't mockups. Every decision in this demo is a verifiable receipt you can
> open right now.**"

> This block is the heart of the submission — real money, real refusal, real receipts.
> Lead with DECLINED (more dramatic), close with APPROVED (shows it's not just a "no"
> machine).

---

## [2:45–3:20] — ECONOMIC TEETH + cross-chain reach

**SCREEN:** Run `disputer-agent`. Show `submitDispute` → then `stakeOf` printing:

```
status: SLASHED_DISPUTE   amount: 2.0 MNT
```

Then a 4-second beat on `x402-audit` output:

```
=== x402 RECEIPTS (cross-chain) ===
  payment  0x... → basescan.org   (0.50 USDC on Base)
  anchor   0x... → mantlescan.xyz (Mantle)
```

**VO:**
> "Why believe the auditor itself? Because it has skin in the game. Every Tier-2 audit
> **stakes two MNT**. Anyone can dispute a finding — and if it's wrong, that stake gets
> **slashed** to the challenger. And for non-agent callers, there's a paywall: pay
> fifty cents of USDC on Base, get your audit anchored on Mantle — **both transaction
> hashes in every response.** Cross-chain, fully receipted."

---

## [3:20–3:50] — CTA

**SCREEN:** Return to the frontend `/judge` page (the 6-step verify flow) and the
dashboard with the live decision feed and pulsing status dot. End card with links.

**VO:**
> "MantleProof: the audit oracle for agents that move real money — and the only one
> that proves when it's guessing. Everything you saw is live on Mantle mainnet. Open
> the `/judge` page, click any receipt, verify it yourself in thirty seconds. **Don't
> take our word for it. Take the chain's.**"

**End card (hold 3s):**

```
MantleProof — the on-chain audit oracle for Mantle's agentic economy
▶ live demos · verifiable receipts · /judge
[ frontend URL ]   [ github ]   Mantle Turing Test 2026 · AI DevTools
```

---

## Production notes

- **De-risk the live runs.** Mainnet calls can 503 or lag. Record each agent run *in
  advance*, keep the winning take, and narrate over it. Judges care that the receipts
  are real and openable — not that you typed it live.
- **Keep real strings on screen.** Your console output (`THE HEADLINE RECEIPT`,
  `Hallucination guard fired: N masked`, `SLASHED_DISPUTE`) is more convincing than any
  slide. Don't paraphrase it in graphics — show the actual terminal.
- **Pacing budget:** Hook 18s · What 22s · Guard 45s · Agents 80s · Teeth 35s · CTA
  30s. The agent block is the longest on purpose — it's the deliverable.
- **One number to flash early and repeat:** the count-up of total audits, and "under a
  second." Repetition makes it stick.
- **No emoji / no light mode / no spinners** in any frame of the product UI — your own
  design rules; judges will be in the UI.
- **If you must cut for time,** drop the x402 half of section 5 first (keep slashing —
  it's more novel), then trim section 2.
