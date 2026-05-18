# MantleProof — Design.md

UI/UX design spec for the MantleProof dashboard and supporting screens. This document is the source of truth for Week 6 (frontend, dashboard, polish) of the build plan, and the reference for any pre-Week-6 frontend stub work in Weeks 1–5.

**Audience:** Emark (solo build), future contributors, and the hackathon judges who read the public README.

**Constraint:** Demo Day is two minutes per project. Every design decision is in service of one of three goals: (1) make the demo legible at video speed, (2) make the README screenshot a hook in itself, (3) make the Judge Quick Evaluation completable in three minutes.

---

## 1. Design principles

Five rules, ordered by how often they break ties.

1. **Density over decoration.** A judge scrolling through 80 hackathon submissions reads signal density in 0.4 seconds. Empty space is fine; ornament is not. Bloomberg terminals work because every pixel either carries data or frames data.

2. **Movement signals liveness.** The deploy feed scrolls. The audit-in-progress dot pulses. The agent-query log appends in real time. Everything else stays still. Animation costs attention; spend it where "this is real, not a slide deck" is the message.

3. **The vibe is "infrastructure," not "tool."** Tools have onboarding wizards and welcome modals. Infrastructure has status pages and JSON endpoints. MantleProof is the latter — the homepage greets users with data, not a getting-started flow. The implicit promise is: "you're looking at something other agents are already using."

4. **Honesty over confidence.** Severity badges show the honesty label (VERIFIED / COMPUTED / ESTIMATED / EMULATED / LABELED) next to every finding. The `[unsupported]` mask for hallucination-guard catches is visible, not hidden. Trust is earned by showing where we're uncertain, not by claiming certainty everywhere.

5. **Agent-first, human-readable.** Every screen has a visible JSON endpoint, every audit links to a machine-readable permalink, every contract page exposes the on-chain address before the human-readable name. Humans should be able to read it, but the assumption baked into the layout is that the next visitor is an LLM agent or a developer reading at speed.

---

## 2. Aesthetic anchor

**Hybrid: Bloomberg-terminal aesthetic + Datadog-style information architecture.**

- **Aesthetic** (look, feel, density): dark background, monospace where data matters, tabular layouts, ticker-tape feed, status-light dots, no rounded-everything, no soft shadows. Borrowed visual language from Bloomberg, IEX, trading desks.
- **Information architecture** (how data is organized): severity-coded findings, drill-down from cache → contract → finding → source line, time-series tape of audit activity, dashboards-and-panels model. Borrowed organizational logic from Datadog, Grafana, Sentry, GitHub Code Scanning.

Why the hybrid: pure Bloomberg forces a trading-desk mental model onto audit data (which doesn't have prices, doesn't have buy/sell flow). Pure Datadog reads as boring SaaS dashboard with no demo-day pop. Combining the two gives the photogenic dark-terminal pop with an information model that actually matches the domain.

---

## 3. Color system

All colors as CSS variables. Defined once in `globals.css`, used everywhere.

### Surface colors

```css
--bg-canvas:     #0A0A0B;   /* page background, near-black with a hint of warmth */
--bg-panel:      #131316;   /* card / panel background */
--bg-panel-hi:   #1A1A1F;   /* hover state, expanded row */
--bg-input:      #08080A;   /* input fields, slightly darker than canvas for depth */
--border-faint:  #1F1F24;   /* hairlines between rows, 1px */
--border-strong: #2A2A30;   /* panel borders, button outlines */
```

### Text colors

```css
--text-primary:   #E8E8EA;   /* primary copy, near-white */
--text-secondary: #9A9AA0;   /* labels, captions, metadata */
--text-muted:     #5A5A60;   /* timestamps, addresses when not focal */
--text-disabled:  #3A3A40;   /* greyed-out feed rows ("not in priority cache") */
```

### Brand accent

```css
--accent:        #00FFA3;   /* MantleProof brand — Mantle-green-adjacent, electric */
--accent-dim:    #00B374;   /* for borders, less-emphasized states */
--accent-glow:   #00FFA340; /* 25% alpha, for hover halos */
```

Single bright accent. Not used for severity (those have their own palette). Used for: brand logo, primary CTA borders, "MantleProof says" speech-bubble tail, link underlines on hover.

### Severity colors

Mirrors GitHub Code Scanning and Sentry, so judges recognize them in 100ms.

```css
--sev-high:    #FF4D5E;   /* red — high severity finding */
--sev-medium:  #FFA940;   /* amber — medium severity */
--sev-low:     #FFD93D;   /* yellow — low severity */
--sev-info:    #6E7681;   /* grey — informational */
--sev-clean:   #3FB950;   /* green — audit clean, no findings */
```

### Status indicators (dots)

```css
--status-complete: #3FB950;   /* green dot — audit complete */
--status-pending:  #D29922;   /* amber dot — audit pending / in queue */
--status-running:  #00FFA3;   /* accent — audit currently running (pulses) */
--status-skipped:  #5A5A60;   /* grey dot — not in priority cache */
--status-failed:   #F85149;   /* red dot — audit failed (engine error, not high severity) */
```

### Honesty labels (text-only, no fill)

Inline pill badges next to findings. Outline-only style, small caps.

```css
--label-verified:  #00FFA3;   /* accent — strongest provenance */
--label-computed:  #58A6FF;   /* blue — mathematically derived */
--label-estimated: #D29922;   /* amber — heuristic */
--label-emulated:  #BC8CFF;   /* purple — simulated */
--label-labeled:   #9A9AA0;   /* grey — manual */
```

---

## 4. Typography

### Font families

```css
--font-mono: "JetBrains Mono", "Berkeley Mono", "IBM Plex Mono", ui-monospace, monospace;
--font-sans: "Inter", "Inter Tight", system-ui, -apple-system, sans-serif;
```

Both self-hosted (no Google Fonts CDN — privacy and reliability). JetBrains Mono is free, has ligatures we'll turn off, ships every weight we need. Inter is what you already used in zkFabric.

### When to use which

- **Mono:** addresses, hashes, txHashes, numbers in tables, JSON output, code blocks, audit finding evidence, the live deploy feed, severity counts. Anything that's data or that a developer would copy-paste.
- **Sans:** prose copy, headers, button labels, navigation, the hero, README-style explainers. Anything that's a sentence.

### Type scale

Tight scale, six sizes. No `xl-7xl` Tailwind escalation.

```css
--text-xs:   11px;  /* timestamps, table metadata, footer */
--text-sm:   13px;  /* table body, secondary labels */
--text-base: 14px;  /* default UI text — tight by web standards, right for density */
--text-md:   16px;  /* primary copy, finding headlines */
--text-lg:   20px;  /* panel headers, page section titles */
--text-xl:   28px;  /* page H1, hero number */
--text-xxl:  44px;  /* the one big number on the homepage hero */
```

### Line height

```css
--leading-tight:  1.15;   /* headers, big numbers */
--leading-normal: 1.35;   /* table rows, dense UI */
--leading-prose:  1.55;   /* paragraph copy in README sections, About page */
```

### Weights

400 (regular), 500 (medium for labels), 600 (semibold for headers). Never 700+ — heavy weights look cheap on dark backgrounds.

---

## 5. Spacing & layout

### Spacing scale

8px base unit. Tailwind-compatible.

```
0   - 0px
1   - 4px      /* between elements in a tight row */
2   - 8px      /* default inner padding */
3   - 12px
4   - 16px     /* default panel padding */
5   - 20px
6   - 24px     /* between panels */
8   - 32px     /* between major sections */
12  - 48px     /* top-of-page breathing room */
```

### Grid

12-column grid, 1440px max-width container, 24px gutters. The dashboard ignores the grid in favor of a fixed three-column layout (see Section 6); other pages use the grid.

### Density target

Homepage at 1440×900 should show:
- The hero (one big number + thesis line)
- The live deploy feed (at least 15 rows visible without scrolling)
- The top-200 cache panel (at least 8 audits visible)
- The agent query log (at least 5 most-recent queries visible)

If a layout choice forces fewer rows visible, the layout is wrong.

---

## 6. Screen-by-screen

Five screens. ASCII sketches below; production fidelity comes Week 6.

### 6.1 `/` — Homepage / Dashboard

Three columns. Left: live deploy feed (skinny). Middle: top-200 cache (wide). Right: agent query log (skinny). Top: hero strip. Bottom: status footer.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  MANTLEPROOF                                              [docs] [github] [/judge]   │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   1,247                  AUDIT ORACLE FOR THE MANTLE AGENTIC ECONOMY                 │
│   audits anchored        Tier 1 + Tier 2 audits posted on-chain. Queryable by any    │
│   on-chain               agent via MCP, x402, or getAudit(address). Live.            │
│                                                                                      │
│   ▁▂▄▃▅▆█▇▆▅▄▅▆ (7-day audit volume sparkline, mono, 60px tall)                      │
│                                                                                      │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ DEPLOY FEED          │  PRIORITY CACHE (TOP 200)                  │ AGENT QUERIES   │
│ live • 2.1s blocks   │  refreshed daily                            │ live • 0:23 ago│
│                      │                                             │                 │
│ ● 0x4f...e2c1   18s  │  ● 0x39...a807  Merchant Moe LB Pair      │ trading-agent   │
│   USDY integration   │    HIGH · 2 findings · audited 14m ago    │ → 0x88...3f12   │
│   in priority cache  │  ───────────────────────────────────────  │ DECLINED (high) │
│   queued for tier 2  │  ● 0x88...3f12  meme token                │ 0:23 ago        │
│ ────────────────     │    HIGH · pause() backdoor · 1h ago        │                 │
│ ◌ 0x7a...0f49   42s  │  ───────────────────────────────────────  │ yield-agent     │
│   factory child      │  ● 0xd5...0Adfa wrapped mETH (L2)         │ → 0xa1...c220   │
│   skipped (template) │    CLEAN · audited 3h ago                  │ APPROVED        │
│ ────────────────     │  ───────────────────────────────────────  │ 1:47 ago        │
│ ◌ 0x9b...8a3d   1m   │  ● 0x2c...f9b0  ynETH vault                │                 │
│   ERC-20 clone       │    MEDIUM · sUSDe cooldown · 5h ago        │ deployer-agent  │
│   skipped (template) │  ───────────────────────────────────────  │ → 0x3e...0a91   │
│ ────────────────     │  ● 0xf1...44e2  USDe staking router        │ AUDIT (paid)    │
│ ● 0x12...beef   2m   │    LOW · 1 finding · 9h ago                │ 4:12 ago        │
│   sUSDe vault        │  ───────────────────────────────────────  │                 │
│   queued for tier 2  │  [load more — 195 cached contracts]        │ [full log]      │
└──────────────────────┴────────────────────────────────────────────┴─────────────────┘
│ engine: healthy  ·  rpc: rpc.mantle.xyz (210ms)  ·  cache freshness: 47m  ·  v0.4.1 │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Notes on the layout:**

- **Hero number** is the cumulative audit count. Singular, large, mono. The kind of number a VC judge reads in 0.3 seconds and registers as "this is real."
- **Deploy feed (left)** is where Mode C lives — most rows greyed out with `◌` (open circle), audit-worthy rows are `●` (filled). Honest UI: we're not auditing everything, and we don't pretend to.
- **Priority cache (middle)** is the headline panel. Each row shows: status dot, address (truncated), human-readable label, severity badge, finding count, age. Click any row → `/contract/:address`.
- **Agent queries (right)** is the agent-economy proof. Every query other agents have made, with their decision. This is the panel that proves the "audit oracle for the agentic economy" thesis isn't aspirational.
- **Status footer** is the trust signal — judges who care look here. Engine health, RPC latency, cache freshness, version.

### 6.2 `/contract/:address` — Contract drill-down

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ← back to dashboard                                                                  │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ● HIGH  0x39e8a4f2b...e2a807                       audit anchored 14m ago           │
│         Merchant Moe LB Pair: mETH-USDC                                              │
│                                                                                      │
│  [mantlescan ↗]  [view on ipfs ↗]  [json ↗]   2 findings · tier 2 · $0.50 paid       │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  FINDINGS                                                                            │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐    │
│  │ ● HIGH    [VERIFIED]    Liquidity Book bin-id validation missing             │    │
│  │                                                                              │    │
│  │ The pair's addLiquidity path does not validate the active bin against the    │    │
│  │ provided binId range. An attacker can mint liquidity in bins the active      │    │
│  │ bin can't reach, locking the position. See LB v2.2 spec section 4.3.         │    │
│  │                                                                              │    │
│  │ EVIDENCE:                                                                    │    │
│  │   src: addLiquidity() line 184                                               │    │
│  │   bytecode offset: 0x4a2c                                                    │    │
│  │   matched pattern: lb_no_bin_validation_v1                                   │    │
│  │                                                                              │    │
│  │ SUGGESTED FIX:                                                               │    │
│  │   Add: require(activeBin >= binIdLow && activeBin <= binIdHigh)              │    │
│  └──────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐    │
│  │ ● MEDIUM  [COMPUTED]    Variable fee read assumes static tier                │    │
│  │  ...                                                                         │    │
│  └──────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  AUDIT HISTORY (3)                                                                   │
│                                                                                      │
│  14m ago    tier 2    rootHash 0x4f...c281    by mantleproofagent (1)               │
│  3d ago     tier 1    rootHash 0xa1...8be4    cache refresh                          │
│  9d ago     tier 1    rootHash 0x77...2206    cache refresh                          │
│                                                                                      │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  QUERIED BY (5 agents in last 24h)                                                   │
│                                                                                      │
│  trading-agent 0x88...7a99       9 times    last query 0:23 ago    declined         │
│  yield-agent 0xa1...c220          3 times    last query 1:47 ago    approved         │
│  deployer-agent 0x3e...0a91       1 time     last query 4:12 ago    paid for tier 2  │
│  ...                                                                                 │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Notes:**

- **Honesty label badges** (`[VERIFIED]`, `[COMPUTED]`, `[ESTIMATED]`, etc.) appear inline next to every finding's severity. They're outline-only, small-caps, mono. They earn trust.
- **Evidence section** is non-negotiable. Every finding shows source line OR bytecode offset OR matched pattern. No bare prose claims.
- **Audit history** proves the iNFT memoryRoot advances per audit. The rootHash links to `/audit/:rootHash`.
- **Queried by** is the multi-agent demo made permanent — anyone visiting this page sees that real agents have used this finding to make real decisions.

### 6.3 `/agent/:tokenId` — Agent identity page

The first page is `/agent/1` — MantleProof's own iNFT. Other agents (eventually) get their own pages by registering against the Identity Registry on Mantle.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  ● agent #1                                                                          │
│  mantleproof                                                                         │
│                                                                                      │
│  Identity 0x...     Reputation Score 847     Audits Performed 1,247    iNFT URI ↗   │
│                                                                                      │
│  memoryRoot   0x4f1c8a...e281                  (advances per audit)                  │
│                                                                                      │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  CAPABILITIES                                                                        │
│                                                                                      │
│  • auditContract(address, tier)     · tier 1 free · tier 2 0.50 USDC on base        │
│  • getAudit(address)                · free, read-only                                │
│  • requestAudit(address, tier)      · x402, settles on base eip155:8453             │
│                                                                                      │
│  endpoints:                                                                          │
│    https://mantleproof.xyz/api/audit/{address}                                       │
│    https://mantleproof.xyz/mcp     (stdio: npx mantleproof-mcp)                      │
│    on-chain: 0x...registry.getAudit(address)                                         │
│                                                                                      │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  SEVERITY DISTRIBUTION (lifetime)                                                    │
│                                                                                      │
│         ░░░░░░░░░ HIGH      127  (10%)                                               │
│         ▒▒▒▒▒▒▒▒▒ MEDIUM    288  (23%)                                               │
│         ▓▓▓▓▓▓▓▓▓ LOW       412  (33%)                                               │
│         █████████ INFO      420  (34%)                                               │
│                                                                                      │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  RECENT REPUTATION SIGNALS                                                           │
│                                                                                      │
│  +5   yield-agent 0xa1...c220     "audit-led decision worked, vault remained safe"   │
│  +3   trading-agent 0x88...7a99   "declined swap was correct, token rugged 6h later" │
│  ...                                                                                 │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Notes:**

- The severity distribution is the **one chart** on this page. Stacked horizontal bars made from ASCII-style block characters (`░ ▒ ▓ █`). No d3, no chart library. Renders instantly, screenshots perfectly.
- **Reputation signals** are pulled from the Reputation Registry (Path B from Section 3 of the build plan — assuming we deploy our own). Each one references another agent and a sentence of justification.
- **Capabilities + endpoints** is the agent-first design move: any other agent visiting this page can read MantleProof's API surface and pricing without reading prose.

### 6.4 `/audit/:rootHash` — Audit permalink

The permanent public reference to a single audit. IPFS-pinned, on-chain-anchored, signed by the engine. Anyone with the rootHash can verify the audit independently. This page is the trust artifact.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  audit · rootHash 0x4f1c8a...e281                                                    │
│                                                                                      │
│  Target            0x39e8a4f2b...e2a807    Merchant Moe LB Pair: mETH-USDC           │
│  Anchored          block 89,234,112        14m ago    tx 0x9a...c0b1 ↗               │
│  IPFS              bafyb...mxlq            view ↗                                    │
│  Signed by         agent #1 (mantleproof)   sig 0x...verify ↗                        │
│  Tier              2 (paid, claude-opus-4-7 reasoning)                               │
│  Hallucination guard fired: 2 unsupported claims masked                              │
│                                                                                      │
│  [download json ↗]   [verify on-chain ↗]   [view on ipfs ↗]                          │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  (full findings, same component as /contract/:address)                               │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Notes:**

- This is the screenshot judges will paste into Telegram. Single rootHash, single target, full provenance, three verifiability paths (download, on-chain, IPFS).
- "Hallucination guard fired: 2 unsupported claims masked" is the LPLens move — proves we don't hide what was caught.

### 6.5 `/judge` — Judge Quick Evaluation

Walks a judge through six steps in three minutes. Each step ends with a verifiable artifact. This is the page we link in the README's "Judge Quick Evaluation" section.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  JUDGE QUICK EVALUATION                                       estimated time: 3 min  │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  Step 1 of 6 · Verify the audit oracle is live                                       │
│                                                                                      │
│  Open the dashboard at https://mantleproof.xyz                                       │
│  Confirm: deploy feed scrolls, priority cache shows recent audits, query log moves. │
│                                                                                      │
│  [open dashboard ↗]      [✓ I see live data]                                         │
│                                                                                      │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  Step 2 of 6 · Verify on-chain anchoring                                             │
│                                                                                      │
│  Open Mantlescan and check that the MantleProofRegistry has recent submitAudit txs.  │
│                                                                                      │
│  [open mantlescan ↗]    [✓ confirmed]                                                │
│                                                                                      │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  ...                                                                                 │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Six steps, each ~30 seconds:

1. Dashboard is live (open mantleproof.xyz, confirm motion)
2. Verify on-chain anchoring (open Mantlescan, confirm recent `submitAudit` txs)
3. Watch a Tier 2 audit run live (trigger via the page button, see the engine work)
4. Watch an agent query MantleProof in real time (trigger trading-agent demo, see decision)
5. Inspect a finding's evidence (open a contract page, expand a finding, see bytecode offset)
6. Independent verification (read on-chain audit via `cast call`, copy-paste command provided)

Each step has a button that lets the judge **trigger the action themselves** rather than just reading about it. Step 3 and Step 4 are the killer interactions — the judge is the one who fired the agent-to-agent demo. That's their tweet.

---

## 7. Components

The component inventory. Built in this order, used everywhere.

### Primitives (Week 6 day 1)

- **StatusDot** — colored dot, optional pulse. Props: `status` (complete/pending/running/skipped/failed). 8px circle.
- **Address** — truncated address `0x39e8...a807`, click-to-copy, hover shows full address tooltip, optional Mantlescan link icon.
- **SeverityBadge** — pill with severity color, label text, count. Variants: high/medium/low/info/clean.
- **HonestyLabel** — outline-only pill with honesty label color. Small-caps mono.
- **Sparkline** — inline ASCII-block-character sparkline. Props: `values` (array). 60px wide, no axes.
- **TxLink** — link to Mantlescan tx page with an external-arrow icon. Truncates txHash inline.
- **Timestamp** — relative time ("14m ago"), hover for absolute UTC.

### Panels (Week 6 day 2-3)

- **DeployFeedPanel** — left column of dashboard. Live-updating list with virtual scroll (max 100 rows in DOM).
- **PriorityCachePanel** — middle column. Sortable, paginated 50/page, click-row-to-drill-down.
- **AgentQueryPanel** — right column. Append-on-top live log. Each entry: agent name, target, decision, timestamp.
- **FindingCard** — single audit finding with severity, honesty label, description, evidence block, suggested fix.
- **AuditHistoryRow** — single row of audit history for a contract. Tier, rootHash link, timestamp, source ("cache refresh", "paid", "agent-triggered").

### Composite (Week 6 day 4-5)

- **JudgeStepCard** — single step in `/judge` flow. Step number, title, instruction, action button, completion checkbox.
- **EngineStatusFooter** — bottom strip on every page. Engine health, RPC latency, cache freshness, build version.
- **HeroStrip** — homepage top section. Big number, thesis line, sparkline.
- **AgentIdentityHeader** — agent page top section. Token ID, name, identity, reputation, audits count, memoryRoot.

### Pages (Week 6 day 6-7)

Built by composing the above. No new components needed.

---

## 8. Motion spec

Animations are deliberate, named, and consistent.

| Name | Where | Duration | Easing | Notes |
|---|---|---|---|---|
| `feed-row-insert` | Deploy feed, agent query log | 300ms | `ease-out` | New row fades in from `opacity 0`, slides down 4px |
| `pulse-running` | Status dots in `running` state | 1.4s loop | `ease-in-out` | Opacity 0.4 → 1.0 → 0.4. **Only animation that loops.** |
| `hover-row` | Table rows | 120ms | `linear` | Background color transition to `--bg-panel-hi` |
| `expand-finding` | Finding card click | 200ms | `ease-out` | Height auto-expand, content fades in at 50ms offset |
| `count-up` | Hero number on initial page load | 800ms | `ease-out` | Counts from 0 to actual value. **Only fires once per session.** |

**Everything else: no animation.** No page transitions, no fade-ins on scroll, no parallax. The static stuff stays static.

---

## 9. Information honesty rules

Codifies principle 4 from Section 1 into checkable rules.

1. **Every finding has an honesty label.** No exceptions. If the engine can't assign one, the finding doesn't ship.
2. **Every dollar/percent/hex/address claim in a Tier 2 finding has linked evidence.** Bytecode offset, source line, or matched pattern ID. The hallucination guard masks anything else.
3. **The cache freshness counter shows actual age,** not "fresh / stale" boolean. Judges who care about freshness deserve the real number.
4. **Skipped contracts are visible in the deploy feed,** greyed out with a reason ("template", "factory child", "deployer below threshold"). We don't pretend we're auditing everything.
5. **"Hallucination guard fired" is shown on Tier 2 audits when it triggered,** with the count of masked claims. Hiding it would defeat the point.
6. **Cross-chain payments are labeled.** Anywhere a payment is referenced, the chain is named: "0.50 USDC paid on base eip155:8453". No ambiguity about where money moved.

---

## 10. Accessibility floor

Hackathon scope, not WCAG AAA. But three rules:

1. **Color is never the only signal.** Severity badges have text labels (`HIGH`, `MEDIUM`); status dots have aria-labels. A color-blind judge can read the dashboard.
2. **Keyboard navigation works on the homepage and on `/judge`.** Tab through the three panels, enter to drill in, esc to back out. The other pages can stay mouse-first for hackathon scope.
3. **Contrast ratios meet WCAG AA** for body text against backgrounds. The defined color tokens already satisfy this; don't override locally.

No ARIA roles beyond what Radix UI provides by default. No screen-reader polish. Hackathon scope.

---

## 11. Mobile

Three pages render correctly on mobile (Safari iOS, Chrome Android):

- `/` — homepage. Three-column layout collapses to single column: hero → priority cache → deploy feed → agent queries. Stacks vertically with section dividers.
- `/contract/:address` — already single-column; just needs padding tweaks.
- `/audit/:rootHash` — same as contract page.

Two pages are **desktop-only** (display a "best viewed on desktop" banner on mobile, but still load):

- `/agent/:tokenId` — chart panel and side-by-side reputation signals don't compress
- `/judge` — multi-step flow with action buttons works better at 1280+ widths

Demo Day is desktop. Judges score on desktop. Community Voting visitors read on mobile, and the three pages that render on mobile are the ones they'll visit from Twitter links.

---

## 12. What we explicitly don't ship

To keep scope honest and the design defensible:

- **No light mode.** Halves the photogenic value, doubles the design work.
- **No real-time WebSocket everywhere.** Polling at 5s intervals for the deploy feed and agent query log is sufficient. WebSocket adds backend complexity for no visible UX gain at this scale.
- **No 3D / WebGL / Three.js.** Genesis's 3D metric cards in ClawSight cost time and didn't move the needle. Flat panels.
- **No multi-language i18n.** English only. README mentions translations as roadmap.
- **No user accounts.** Every visitor is anonymous. No signup, no login, no preferences. The only "identity" on the site is the ERC-8004 iNFT of MantleProof itself.
- **No comment system, no upvotes, no social.** This is infrastructure, not a social product.
- **No A/B testing, no analytics dashboard for ourselves.** Plausible or nothing.
- **No animated loaders / spinners.** Use the `pulse-running` dot. Spinners look "loading"; pulses look "working."
- **No emoji in UI.** Emoji in the README is fine. Not in the product.
- **No onboarding modal.** First-visit hero is the onboarding.

---

## 13. Build sequence (maps to Week 6 of the build plan)

Five days, allocated.

**Day 1 — Primitives.** Build the 7 primitive components (Section 7). Set up CSS variables, fonts, base layout. Wire viem/wagmi for reading the registry. Smoke-test the Address and TxLink components against real Mantlescan data.

**Day 2 — DeployFeedPanel + PriorityCachePanel.** Both pull live data. Deploy feed polls a `/api/feed` endpoint, cache panel pulls from `/api/cache`. Implement virtual scroll on the feed. Get the homepage three-column shell rendering.

**Day 3 — AgentQueryPanel + HeroStrip + Sparkline.** Wire the agent query log polling. Implement the sparkline ASCII renderer (60px wide, takes a 7-value array of audit counts). Build the count-up hero number. Homepage is feature-complete by EOD.

**Day 4 — Contract drill-down (`/contract/:address`).** Build FindingCard, AuditHistoryRow, the "Queried by" table. Wire the IPFS fetch for full audit JSON. This is the second-most-screenshot-able page; spend extra polish here.

**Day 5 — Agent page (`/agent/:tokenId`), audit permalink (`/audit/:rootHash`), Judge flow (`/judge`).** Three pages in one day because each is mostly composing existing components. Judge flow is the priority of the three — six steps, six cards, action buttons that trigger real demos.

**Buffer (Day 6 if needed).** Mobile responsive fixes, status footer polish, motion timing pass, README screenshots, demo video record.

---

## 14. Decisions deferred

Things I'm deliberately leaving open until Week 6 because they're easier to decide once we've built something:

1. **Final font choice.** JetBrains Mono is the default. If we get late access to Berkeley Mono (paid, but better) and it doesn't slow the build, swap.
2. **Sparkline character set.** `▁▂▃▄▅▆▇█` is the default. Could go bigger (`░▒▓█`) or smaller (`▁▃▅▇`). Decide once we have real audit-volume data.
3. **Demo trigger UX on `/judge`.** Are the demo trigger buttons inline ("[Trigger trading-agent demo →]") or do they open a side panel showing the demo running? Decide after seeing the demo agents work end-to-end in Week 5.
4. **Exact iconography.** Lucide icons are the default (matches your zkFabric stack). If a screen needs an icon we don't have, decide ad-hoc rather than over-specifying now.
5. **The "live" badge styling.** Header text says "live · 2.1s blocks" or similar — exact phrasing decided when we wire the deploy feed timing.

---

## 15. The patterns we're explicitly stealing for design

Source disclosure, for honesty and so we know what we're imitating intentionally:

- **Three-column dashboard with live tape** — Slopstock's Bloomberg-terminal Markets page
- **Honesty label badges (VERIFIED/COMPUTED/ESTIMATED/EMULATED/LABELED)** — LPLens directly
- **Status dot color system** — GitHub Code Scanning + Sentry hybrid
- **Severity badge palette** — GitHub Code Scanning (red/amber/yellow/grey)
- **Permalink-per-audit page (`/audit/:rootHash`)** — LPLens's `/report/:rootHash` pattern
- **Judge Quick Evaluation as a real page, not just README** — SynthLaunch and Genesis pattern, but as a clickable flow not just instructions
- **Engine status footer** — Datadog / Statuspage / GitHub Status pattern
- **ASCII-character data visualizations (sparkline, severity bars)** — IEX old terminal + LPLens AT-2 fixtures aesthetic. Renders instantly, screenshots perfectly, signals "infrastructure not SaaS"
- **Always-visible JSON endpoints** — Cards402 documentation pattern

That is the design spec in full. The build sequence in Section 13 slots into Week 6 of the build plan. The principles in Section 1 are the tiebreakers for any decision not explicitly covered here.
