# MantleProof — Demo Video Script

> Shot-ready script for the hackathon submission. Built on what the code actually
> prints and renders. **The hook and "what it is" live in the pitch deck (slides 1–4);
> this video opens on architecture and is then a live, hands-on walkthrough of how a
> developer — or an agent like Claude Code — actually uses MantleProof.** Show, don't
> tell. **Target runtime ~4:30** (deck slides run before this and aren't counted here).

**Logline:** *AI agents are about to move real money on Mantle. MantleProof is the
oracle they call first — and the only one that can prove it isn't lying.*

**Format:** screen capture (terminal + Claude Code + browser + Mantlescan) with
voiceover · **Tone:** fast, confident, evidence-first. Every claim is a command you
can run.

---

## Before the video — Pitch deck (slides 1–4)

These are *slides*, not screen capture. They carry the hook + "what it is" so the video
can spend its whole budget on architecture and the live walkthrough. Keep them to
~45–60s total when presented; the recorded demo below picks up immediately after.

- **Slide 1 — The stakes (hook).** "In Mantle's agentic economy, AI agents trade,
  deploy, and deposit real money — autonomously. An agent can't *read* a contract for
  backdoors. It just signs." → *Before an agent touches a contract, who tells it the truth?*
- **Slide 2 — What MantleProof is.** An on-chain **audit oracle**. Any agent queries it
  before touching a contract and gets a structured safety signal back in under a second.
- **Slide 3 — One backend, four ways to ask.** CLI · on-chain `getAudit` · MCP tool ·
  paid x402 REST. Same JSON, same honesty labels, every time.
- **Slide 4 — Why trust the auditor.** The five honesty labels + the hallucination
  guard ("an auditor that tells you when it isn't sure"). One sentence each — the video
  proves it live.

> The deck states the claims; the video demonstrates them. Don't re-narrate the slides
> on screen capture — cut straight to the architecture beat.

---

## [0:00–0:55] — ARCHITECTURE: two tiers, then the guard

**SCREEN:** A single architecture diagram (use the Landing page's Tier-2 flow graphic,
or a clean slide): `target ─▶ Tier 1 (5 checks) ─▶ Tier 2 (LLM + skills) ─▶ guard ─▶
sign · pin IPFS · anchor on Mantle`. Animate each stage as it's named. End on the five
honesty-label pills.

**VO:**
> "Here's how it works under the hood — two tiers.
>
> **Tier 1 is cheap and runs everywhere.** Five Mantle-specific checks — for USDY and
> mUSD, bridged mETH, USDe and sUSDe, the DEXes, and signature replay — pattern-match
> the contract's verified source and bytecode. No LLM, no cost, no wallet. That alone
> gives you a structured severity.
>
> **Tier 2 adds reasoning.** It runs an LLM pass with protocol-specific skill briefs to
> catch the economic exploits patterns miss. But an LLM hallucinates — so before any
> Tier-2 report is signed, it hits **the hallucination guard.** Every dollar figure,
> every percentage, every address the model wrote gets regex-extracted and checked
> against the actual source line or bytecode. Anything it can't verify is masked — and
> the finding's trust label **drops one tier.** Then we publish the count: *'Hallucination
> guard fired: N masked.'*
>
> Every finding ships with exactly one of five honesty labels — **VERIFIED, COMPUTED,
> ESTIMATED, EMULATED, LABELED.** Then the report is hashed, pinned to IPFS, and anchored
> on Mantle — with a two-MNT stake behind it. **An auditor that tells you when it isn't
> sure is the only auditor an agent can safely trust.**"

**On-screen text (lower third, as guard is named):**
`VERIFIED → COMPUTED → ESTIMATED → EMULATED → LABELED · every claim earns its label`

> This is the credibility centerpiece — spend the seconds. Tier 1 = "fast and free,"
> Tier 2 = "smart but guarded." The guard is what separates this from a GPT wrapper.

---

## [0:55–4:05] — LIVE WALKTHROUGH: how to actually use it

> One backend, four doorways. We walk each one as a developer would, fastest setup
> first. Real commands, real output, no mockups.

### [0:55–1:30] — Doorway 1: the CLI (zero setup, no wallet)

**SCREEN:** Clean terminal. Type it live:

```
npx mantleproof verify
```

Let the real output land:

```
MantleProof — live verification against Mantle mainnet (chainId 5000)

  [✓] Registry deployed, oracleSigner matches     0x5CEafE0F…CA65A5
  [✓] Agent registered in ERC-8004 Identity       tokenId #96 → 0x2a3080AA…605B6A
  [✓] StakingPool holds live stake                4 MNT locked in pool
  [✓] Most recent audit anchored on-chain         rootHash 0x37ff62a0…d3b373 (13d ago)
  [✓] getAudit() returns structured finding       0x013e138E…d21E3a → MEDIUM, Tier 2
  [✓] Dispute resolved on-chain                   disputeId #5 → RETRACTED, stake slashed
  [✓] ERC-8004 reputation recorded                1 feedback entry about agent #96

  7/7 checks passed. MantleProof is live on Mantle mainnet.
```

Then audit a real contract:

```
npx mantleproof check 0x8f6679eb031799fc9c5e149dfb75b4543808912f
```

```
  BackdooredMemeToken  ·  Tier 2  ·  overall HIGH

  HIGH   [VERIFIED]   hidden mint() lets owner inflate supply after launch …
  HIGH   [ESTIMATED]  pause() can freeze all transfers — honeypot vector …

  ✓ anchor verified — report's root_hash == on-chain rootHash, from the content-addressed CID
```

**VO:**
> "Doorway one — the CLI. No wallet, no key, no signup. `npx mantleproof verify` proves
> the whole system is live on mainnet with seven real on-chain reads. And `mantleproof
> check`, plus any address, audits a contract — here, a token with hidden mint and pause
> backdoors, flagged HIGH. Notice the labels — VERIFIED, ESTIMATED — and the last line:
> it re-derived the on-chain hash from IPFS itself. **The CLI doesn't trust the backend.
> It checks.**"

### [1:30–2:40] — Doorway 2: wire it into your agent (Claude Code + MCP) — *the headline*

**SCREEN:** Show a project's `.mcp.json` being added (or `claude mcp add`). Keep it on
screen — this is the "set up your agent" money shot:

```jsonc
// .mcp.json — MantleProof as a tool any MCP agent can call
{
  "mcpServers": {
    "mantleproof": {
      "command": "npx",
      "args": ["-y", "mantleproof-mcp"],
      "env": { "MANTLEPROOF_API_BASE": "https://<your-engine-url>" }
    }
  }
}
```

> (CLI equivalent: `claude mcp add mantleproof --env MANTLEPROOF_API_BASE=https://<engine-url> -- npx -y mantleproof-mcp`.)

Then a **live Claude Code session.** Type a natural prompt and let Claude decide to call
the tool — do NOT call it manually:

```
> I'm about to swap into 0x8f6679eb031799fc9c5e149dfb75b4543808912f.
  Check it's safe before I do anything.

● mantleproof - getAudit (MCP)
  ⎿ severity: HIGH · tier: 2 · integrity.match: true
     findings: hidden mint(), pause() honeypot vector
     rootHash 0x0947f9…7087f · ipfs://bafkrei…  (anchored on Mantle)

  I checked it against MantleProof — this contract is HIGH severity. It has a
  hidden mint() and a pause() that can freeze transfers. I won't execute the
  swap. The audit is anchored on-chain (integrity verified) if you want to see it.
```

**VO:**
> "Doorway two — and this is the one that matters. Drop MantleProof into any MCP-aware
> agent — Claude Code, Cursor, your own — with one config block. Now the agent has three
> new tools: `getAudit`, `auditContract`, `requestAudit`. Watch — I just *ask* it to check
> a contract before a swap. It decides on its own to call `getAudit`, gets HIGH severity
> back with the integrity match, and **refuses — in plain language, before signing
> anything.** That's the whole pitch: your agent calls the oracle first, automatically.
> You didn't write that logic. The tool did."

> Lead with a HIGH-severity target so the refusal is dramatic. Keep `integrity.match:
> true` visible — that's the "it can't be faked" tell.

### [2:40–3:15] — Doorway 3: read it straight off the chain (no backend)

**SCREEN:** Terminal, Foundry `cast`:

```
cast call 0x5CEafE0FD8b2A9BD2eC6aCdf3f5e024c21CA65A5 \
  "getAudit(address)((bytes32,uint8,string,uint64,address,uint8))" \
  0x8f6679eb031799fc9c5e149dfb75b4543808912f \
  --rpc-url https://rpc.mantle.xyz
```

```
(0x0947f93b6cc6c4e167722a17eddb1684d5113cce0318b5717e8f702595c7087f,
 3, "ipfs://bafkrei…", 1779263294, 0x9f17…638a, 2)
```

**VO:**
> "Doorway three — for a contract or an agent that wants zero dependency on us: read it
> straight off Mantle. `getAudit`, one address, returns the full report struct — root
> hash, severity three for HIGH, the IPFS CID, tier two. No API, no key. **This is the
> on-chain truth the CLI and the MCP tool both resolve to.** Another contract can call
> this in the same transaction it's about to make."

### [3:15–4:05] — Doorway 4: generate a *new* audit (x402, pay-per-audit)

**SCREEN:** Terminal. Show the two-step x402 flow against `/x402/audit/{address}` — first
the 402, then the paid response. Use an x402-aware client.

```
POST /x402/audit/0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34   → 402
  accepts: 0.50 USDC on base (eip155:8453) → payTo 0x2a30…605B6A
```

```
# client signs EIP-3009, retries with X-PAYMENT header …
POST /x402/audit/0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34   → 200

=== AUDIT GENERATED ===
  severity: HIGH   tier: 2
  hallucination_guard: "Hallucination guard fired: 2 masked"

=== x402 RECEIPTS (cross-chain) ===
  payment  0x98c5137d…00cd1  → basescan.org    (0.50 USDC on Base)
  anchor   0xbffe7ca5…930ff  → mantlescan.xyz  (Mantle)
```

**VO:**
> "And doorway four — generating a *fresh* audit on demand. A non-agent caller, or any
> wallet, hits the paid endpoint. First it gets a 402: fifty cents of USDC, on Base.
> The client signs, pays, and the engine runs the full pipeline live — Tier 1, Tier 2,
> the guard — pins it to IPFS, and anchors it on Mantle. You get **both** transaction
> hashes back: the payment on Base, the audit anchored on Mantle. Cross-chain, fully
> receipted. And the guard fired here — two claims masked — and it told you. **Pay on
> Base, get proof on Mantle.**"

> If you must cut for time, this is the section to trim — but keep the "Hallucination
> guard fired" line; it closes the credibility loop the architecture beat opened.

---

## [4:05–4:30] — CTA

**SCREEN:** Return to the frontend — the `/judge` verify flow, the live decision feed,
the pulsing status dot. End card with links.

**VO:**
> "Four doorways, one source of truth — the CLI, your agent, the chain itself, or a paid
> audit on demand. Every answer carries its own proof, and tells you when it's guessing.
> It's all live on Mantle mainnet right now. Open the `/judge` page, click any receipt,
> verify it yourself in thirty seconds. **Don't take our word for it. Take the chain's.**"

**End card (hold 3s):**

```
MantleProof — the on-chain audit oracle for Mantle's agentic economy
▶ npx mantleproof check 0x…   ·   MCP   ·   getAudit   ·   x402
[ frontend URL ]   [ github ]   Mantle Turing Test 2026 · AI DevTools
```

---

## Production notes

- **The walkthrough is the deliverable now.** Hook + "what it is" are slides — keep them
  tight and get to the terminal. The video earns trust by being *runnable*, not narrated.
- **De-risk the live runs.** Mainnet/RPC and the paid x402 leg can 503 or lag. Record
  each doorway *in advance*, keep the winning take, narrate over it. The Claude Code
  tool-call and the x402 paid run especially — rehearse until clean, then use the good take.
- **Let Claude Code decide.** For doorway 2, do not hand-invoke the MCP tool. The whole
  point is that the agent *chooses* to call `getAudit` from a natural prompt — that
  autonomy is the wow. If it doesn't call it on the first try, strengthen the prompt
  ("check it's safe before I do anything") rather than calling the tool yourself.
- **Keep real strings on screen.** `7/7 checks passed`, `integrity.match: true`,
  `Hallucination guard fired: N masked`, the twin tx hashes — your console output is more
  convincing than any graphic. Don't paraphrase it into slides.
- **Real demo targets** (all anchored on mainnet): `0x8f6679eb031799fc9c5e149dfb75b4543808912f`
  (BackdooredMemeToken, HIGH — use for CLI + Claude Code), `0x1892f77e335c133ce4a7b28555f13ba74cbb76fa`
  (BuggyYieldVault, HIGH), `0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a` (LBRouter, MEDIUM).
  Registry: `0x5CEafE0FD8b2A9BD2eC6aCdf3f5e024c21CA65A5`.
- **Pacing budget:** Architecture 55s · CLI 35s · Claude Code 70s · on-chain 35s · x402
  50s · CTA 25s. The Claude Code doorway is the longest on purpose — "set up your agent"
  is the developer story judges remember.
- **No emoji / no light mode / no spinners** in any frame of the product UI — your own
  design rules; judges will be in the UI.
</content>
</invoke>
