/**
 * Landing page at `/` — the demo-day opening shot.
 *
 * Spec override note: `docs/design.md` §1.3 + §12 originally locked the homepage
 * as the dashboard ("infrastructure not tool"). The user opted to add a real
 * landing page for the submission window; the dashboard moved to `/app` and
 * keeps its semantics intact. See TODO.md Decisions log 2026-05-20.
 *
 * Aesthetic: same tokens as the dashboard (dark, mono where data matters), more
 * whitespace permitted but no spinners / emoji / light mode. Every live stat
 * is read on-chain or via /api/audit; nothing is fabricated.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { EngineStatusFooter } from "../components/composite/EngineStatusFooter";
import { SeverityBadge } from "../components/primitives/SeverityBadge";
import { Address } from "../components/primitives/Address";
import { StatusDot } from "../components/primitives/StatusDot";
import { Tip } from "../components/primitives/Tip";
import {
  AGENT_ADDRESS,
  DECISION_LOG_ADDRESS,
  KNOWN_TARGETS,
  MANTLE_CHAIN_ID,
  REGISTRY_ADDRESS,
  agentAbi,
  registryAbi,
} from "../lib/contracts";
import { getAudit, type AuditResponse } from "../lib/api";

const MANTLESCAN = "https://mantlescan.xyz";
const GITHUB = "https://github.com/emark-cloud/mantleproof";

function useCountUp(target: number, durationMs = 700): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) return setVal(0);
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.floor(target * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return val;
}

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <main className="flex-1">
        <Hero />
        <Dimensions />
        <Tier2Flow />
        <Demos />
        <Install />
        <FAQ />
      </main>
      <EngineStatusFooter />
    </div>
  );
}

/* ------------------------------- NavBar -------------------------------- */

function NavBar() {
  return (
    <nav className="border-b border-border-strong bg-panel px-6 py-3 flex items-center gap-6">
      <Link to="/" className="font-mono text-sm font-semibold text-accent tracking-wider">
        MANTLEPROOF
      </Link>
      <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider hidden sm:inline">
        on-chain audit oracle · Mantle mainnet
      </span>
      <div className="ml-auto flex items-center gap-4 text-[12px] font-mono text-text-secondary">
        <Link to="/app" className="hover:text-accent">[dashboard]</Link>
        <Link to="/judge" className="hover:text-accent">[/judge]</Link>
        <a href={GITHUB} target="_blank" rel="noreferrer" className="hover:text-accent">[github ↗]</a>
      </div>
    </nav>
  );
}

/* -------------------------------- Hero --------------------------------- */

function Hero() {
  const { data } = useReadContracts({
    contracts: [
      ...KNOWN_TARGETS.map((t) => ({
        address: REGISTRY_ADDRESS,
        abi: registryAbi,
        functionName: "auditCount" as const,
        args: [t.address] as const,
        chainId: MANTLE_CHAIN_ID,
      })),
      {
        address: AGENT_ADDRESS,
        abi: agentAbi,
        functionName: "auditsPerformed" as const,
        chainId: MANTLE_CHAIN_ID,
      },
    ],
  });
  const totalAudits = data
    ? data
        .slice(0, KNOWN_TARGETS.length)
        .reduce((acc, r) => acc + Number((r?.result as bigint | undefined) ?? 0n), 0)
    : 0;
  const agentAudits = Number((data?.[KNOWN_TARGETS.length]?.result as bigint | undefined) ?? 0n);
  const counted = useCountUp(totalAudits);

  return (
    <section className="px-6 py-12 md:py-20 max-w-5xl mx-auto">
      <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-dim mb-4">
        ● live on Mantle mainnet
      </div>
      <h1 className="font-sans text-3xl md:text-5xl font-semibold text-text-primary leading-tight">
        The on-chain audit oracle for{" "}
        <span className="text-accent">
          <Tip
            text="Mantle's framing for agent-to-agent transactions — autonomous AI agents acting as the primary users of on-chain finance."
            underline={false}
          >
            Mantle's agentic economy
          </Tip>
        </span>
      </h1>
      <p className="font-sans text-md md:text-lg text-text-secondary mt-5 max-w-3xl leading-relaxed">
        AI agents query MantleProof before touching a smart contract and get a
        structured safety signal back in under a second. Five Mantle-specific
        risk checks, a{" "}
        <Tip text="A fast pattern-matching pass (Tier 1), then a deeper LLM-reasoning pass (Tier 2) for anything that needs it.">
          two-tier pipeline
        </Tip>
        , a{" "}
        <Tip text="Every $, %, hex, and address claim in an LLM-written finding is regex-checked against the contract source and bytecode. Unverifiable claims are masked and the finding's honesty label drops one tier.">
          hallucination guard
        </Tip>
        , and every audit published on Mantle with the full report on IPFS.
      </p>
      <p className="font-sans text-sm md:text-md text-text-secondary mt-3 max-w-3xl leading-relaxed">
        MantleProof also watches every fresh deployment on Mantle and classifies
        it — already audited, a real candidate worth a look, or a template /
        factory child safe to skip — so agents see new contracts the moment
        they appear.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          to="/app"
          className="font-mono text-sm px-4 py-2 border border-accent text-accent hover:bg-accent-glow"
        >
          Open dashboard →
        </Link>
        <Link
          to="/judge"
          className="font-mono text-sm px-4 py-2 border border-border-strong text-text-primary hover:border-accent hover:text-accent"
        >
          Judge quick eval (3 min)
        </Link>
        <CopyButton
          label="npx mantleproof-mcp"
          text="npx -y mantleproof-mcp"
          className="font-mono text-sm px-4 py-2 border border-border-strong text-text-primary hover:border-accent hover:text-accent"
        />
      </div>

      <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-6 font-mono">
        <Stat
          big={counted.toLocaleString()}
          label="audits published on Mantle"
        />
        <Stat
          big={agentAudits.toLocaleString()}
          label="agent #96 lifetime audits"
        />
        <Stat
          big="5"
          label="risk checks"
        />
        <Stat
          big="4"
          label="ways to query"
        />
      </div>
    </section>
  );
}

function Stat({ big, label }: { big: string; label: string }) {
  return (
    <div>
      <div className="text-xl md:text-xxl text-text-primary tabular-nums leading-none">{big}</div>
      <div className="text-[10px] uppercase tracking-wider text-text-muted mt-1">{label}</div>
    </div>
  );
}

/* ----------------------------- Dimensions ------------------------------ */

const DIMENSIONS: { name: string; breaks: string; example: string }[] = [
  {
    name: "USDY / mUSD",
    breaks: "Rebase + RWA oracle + blocklist semantics",
    example:
      "Balance snapshot cached then reused after a state transition (misses the rebase); non-RWA oracle for price; treating USDY ≠ mUSD 1:1.",
  },
  {
    name: "mETH (bridged L2)",
    breaks: "L1 staking + L2 wrapped token + exchange-rate accounting",
    example:
      "balance-proportional math (mETH accrues via exchange rate, not balances); missing L1 Oracle read; cmETH conflation; Validator-Queue assumptions post-Liquidity-Buffer.",
  },
  {
    name: "USDe / sUSDe",
    breaks: "Cooldown-aware redemption + non-1:1 conversion + depeg",
    example:
      "sUSDe redeem path without cooldown logic; assumption of 1:1 convertibility; missing depeg-event handling.",
  },
  {
    name: "Merchant Moe LB v2.2 (+ Uniswap V3 secondary)",
    breaks: "Discrete bins, constant-sum within bin, ERC-1155 LP, variable fee",
    example:
      "mint/burn without bin-id validation (positions locked in wrong bins); reading a static fee on an LB pool (volatility-accumulator-driven); ERC-1155 hooks that assume V3 NFT semantics.",
  },
  {
    name: "EIP-712 chain-id replay",
    breaks: "Domain separator missing chainId / hardcoded mainnet copy-paste",
    example:
      "Hardcoded chainId=1 in a Mantle deploy; typehash omitting chainId; signature reuse across L1/L2; hardcoded 2300-gas ETH transfer.",
  },
];

function Dimensions() {
  return (
    <section className="px-6 py-12 max-w-5xl mx-auto">
      <SectionLabel>The five risk checks</SectionLabel>
      <h2 className="font-sans text-xl md:text-2xl text-text-primary mt-2 mb-6">
        The five checks Tier 1 runs as pattern matches and Tier 2 reasons over
      </h2>
      <div className="panel divide-y divide-border-faint">
        {DIMENSIONS.map((d) => (
          <div
            key={d.name}
            className="grid grid-cols-1 md:grid-cols-[220px_240px_1fr] gap-3 px-4 py-3"
          >
            <div className="font-mono text-sm text-accent">{d.name}</div>
            <div className="font-mono text-[12px] text-text-secondary">{d.breaks}</div>
            <div className="font-sans text-[13px] text-text-secondary leading-snug">{d.example}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ Tier 2 flow ---------------------------- */

function Tier2Flow() {
  return (
    <section className="px-6 py-12 max-w-5xl mx-auto">
      <SectionLabel>How a deep (Tier-2) audit ships</SectionLabel>
      <h2 className="font-sans text-xl md:text-2xl text-text-primary mt-2 mb-6">
        Pattern checks first, then LLM reasoning — every claim verified before we sign
      </h2>

      <div className="panel px-4 py-5">
        <ol className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1fr] gap-4 font-mono text-[12px]">
          <FlowStep n="1" title="resolve">
            Pull verified source (Etherscan V2) and runtime bytecode (RPC). Run
            the five fast (Tier-1) checks and load protocol-specific briefs.
          </FlowStep>
          <FlowStep n="2" title="reason">
            Send a tightly-scoped prompt to the LLM (Gemini). Findings come back
            as text, each citing a source line or bytecode offset.
          </FlowStep>
          <FlowStep n="3" title="guard">
            Every $, %, hex, and address claim is checked against source,
            bytecode, and Tier-1 findings. Anything we can't verify is masked
            and the finding's honesty label drops one tier.
          </FlowStep>
          <FlowStep n="4" title="publish">
            Hash the canonical report (keccak256), pin the full report to IPFS
            (Pinata), and call <span className="text-accent">submitAudit</span>{" "}
            on Mantle. The agent's running audit fingerprint (
            <Tip text="A rolling keccak256 over every audit this agent has signed. Past audits are tamper-evident even though only the head lives on chain.">
              memoryRoot
            </Tip>
            ) advances.
          </FlowStep>
        </ol>

        <p className="font-sans text-[12px] text-text-secondary mt-5 leading-relaxed">
          Anyone can verify a finding without trusting our backend: fetch the
          IPFS report, recompute the hash, and check it against the value on
          Mantle. The dashboard's{" "}
          <span className="text-accent">integrity ✓</span> badge means that
          check passed for the row in front of you. The hallucination guard's
          count is surfaced publicly on every deep audit (
          <span className="text-text-primary">guard fired: N masked</span>) — we
          never hide what was caught.
        </p>
      </div>
    </section>
  );
}

function FlowStep({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="border-l-2 border-accent-dim pl-3">
      <div className="text-accent font-semibold">{n}. {title}</div>
      <div className="text-text-secondary mt-1 leading-snug">{children}</div>
    </li>
  );
}

/* -------------------------------- Demos -------------------------------- */

const DEMO_BLURBS: Record<string, { agent: string; verdict: "APPROVED" | "DECLINED" | "FLAGGED"; story: string }> = {
  "0x1892f77e335C133Ce4a7B28555f13bA74cBB76fA": {
    agent: "deployer-agent",
    verdict: "DECLINED",
    story:
      "An intentionally vulnerable BuggyYieldVault. The deep audit flagged a sUSDe-cooldown handling bug. The agent declined to deploy further; the audit itself is the on-chain receipt.",
  },
  "0x8F6679EB031799fc9C5e149DFb75b4543808912F": {
    agent: "trading-agent",
    verdict: "DECLINED",
    story:
      "BackdooredMemeToken with a pause() + mint() admin backdoor. The pre-swap audit returned HIGH severity; the agent refused the swap and posted a DECLINED entry to the on-chain DecisionLog.",
  },
  "0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a": {
    agent: "yield-agent",
    verdict: "APPROVED",
    story:
      "The canonical Merchant Moe LBRouter v2.2 — the contract the agent was about to call. The audit came back clean; the agent posted a real single-sided WMNT addLiquidity transaction on Mantle and recorded APPROVED in the DecisionLog.",
  },
  "0xE6829d9a7eE3040e1276Fa75293Bde931859e8fA": {
    agent: "production scan",
    verdict: "FLAGGED",
    story:
      "Live scan of cmETH — mETH Protocol's restaked-mETH receipt on Mantle. Tier-2 returned MEDIUM after the design-pattern allowlist suppressed the by-design OFT yield-preservation observation; the remaining findings are blocklist DoS vectors, one with an intent caveat explaining the trade-off. Guard fired 0 masks.",
  },
  "0x5bE26527e817998A7206475496fDE1E68957c5a6": {
    agent: "production scan",
    verdict: "FLAGGED",
    story:
      "Live scan of USDYW — Ondo's wrapped USDY on Mantle. Tier-2 examined the contract and judged it does NOT match the wstETH-style allowlist (no on-chain wrap/unwrap mechanics for the underlying USDY) — so the allowlist was correctly NOT applied. 2 findings, severity HIGH. Guard fired 0 masks; read the findings before drawing conclusions.",
  },
  "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2": {
    agent: "production scan",
    verdict: "FLAGGED",
    story:
      "Live scan of Ethena sUSDe (StakedUSDeOFT, LayerZero-bridged). Tier-2 returned MEDIUM after the allowlist dropped the by-design OFT 1:1 observation; surfaced two grounded MEDIUM concerns about role-key compromise (rogue blackLister, rogue rateLimiter) with named attack paths. Guard fired 0 masks.",
  },
  "0xB65E1C3ab3072d5fBF25A5bF625318E3035D4505": {
    agent: "self-deployed bait",
    verdict: "FLAGGED",
    story:
      "Bait for check #5 (EIP-712 replay). The permit contract hardcodes chainId=1 in its domain separator and never reads block.chainid — signatures replay to any chain the bytecode lands on. Tier-2 caught it: 1 HIGH on replay_check (the designed catch), plus a MEDIUM on EIP-20 approve race + LOW on ecrecover malleability the rubric correctly placed below HIGH. Guard fired 0 masks.",
  },
  "0xeB19da38EcdAec1aAAAdE76098c7f3cAf24Ec1F0": {
    agent: "self-deployed bait",
    verdict: "FLAGGED",
    story:
      "Bait for check #2 (mETH accounting). The vault uses balanceOf / totalSupply proportion to size shares and never reads any exchange rate — early stakers silently diluted as mETH yield accrues. Tier-2 caught it: 1 HIGH on meth_check (the designed catch), plus a second HIGH on the classic share-price inflation attack — a concrete exploit path the rubric kept at HIGH. Guard fired 0 masks.",
  },
};

function Demos() {
  const queries = useQueries({
    queries: KNOWN_TARGETS.map((t) => ({
      queryKey: ["audit", t.address],
      queryFn: () => getAudit(t.address),
      staleTime: 60_000,
      retry: 1,
    })),
  });

  return (
    <section className="px-6 py-12 max-w-5xl mx-auto">
      <SectionLabel>Eight audits on Mantle mainnet — independently verifiable</SectionLabel>
      <h2 className="font-sans text-xl md:text-2xl text-text-primary mt-2 mb-6">
        Three agent-to-agent flows · three live scans of real Mantle protocols · two self-deployed check-coverage baits
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {KNOWN_TARGETS.map((t, i) => {
          const q = queries[i];
          const data = q?.data as AuditResponse | undefined;
          const audited = data?.audited === true;
          const sev = audited ? data!.anchor.severity : "info";
          const findings = audited
            ? Array.isArray(data!.report?.findings)
              ? data!.report!.findings.length
              : 0
            : 0;
          const integrityOk = audited && data!.integrity.match === true;
          const blurb = DEMO_BLURBS[t.address] ?? {
            agent: "demo agent",
            verdict: "APPROVED" as const,
            story: t.provenance,
          };
          return (
            <Link
              key={t.address}
              to={`/contract/${t.address}`}
              className="panel block px-4 py-4 hover:bg-panel-hi transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  {i < 3 ? `Demo ${i + 1}` : i < 6 ? `Audit ${i + 1}` : `Bait ${i + 1}`} · {blurb.agent}
                </span>
                <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-text-muted flex items-center gap-1">
                  {integrityOk && (
                    <>
                      <StatusDot status="complete" size={6} /> integrity ✓
                    </>
                  )}
                </span>
              </div>
              <div className="mt-2 font-sans text-md text-text-primary leading-tight">
                {t.label}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <SeverityBadge severity={sev} count={findings} />
                <span
                  className={
                    blurb.verdict === "APPROVED"
                      ? "font-mono text-xs uppercase tracking-wider text-sev-clean"
                      : "font-mono text-xs uppercase tracking-wider text-sev-high"
                  }
                >
                  {blurb.verdict}
                </span>
              </div>
              <p className="mt-3 font-sans text-[12px] text-text-secondary leading-relaxed">
                {blurb.story}
              </p>
              <div className="mt-3 text-[10px] font-mono text-text-muted">
                target <Address value={t.address} chainId={MANTLE_CHAIN_ID} />
              </div>
            </Link>
          );
        })}
      </div>
      <div className="mt-3 text-[11px] font-mono text-text-muted">
        click any card → drill into the audit · severity/findings read live from{" "}
        <span className="text-accent">/api/audit</span>
      </div>
    </section>
  );
}

/* ----------------------------- Install / Use --------------------------- */

function Install() {
  const cast = `cast call ${REGISTRY_ADDRESS} \\
  'getAudit(address)(bytes32,uint8,string,uint64,address)' \\
  0x1892f77e335C133Ce4a7B28555f13bA74cBB76fA \\
  --rpc-url https://rpc.mantle.xyz`;
  const mcp = `# stdio MCP server — Claude Desktop / Cursor
npx -y mantleproof-mcp
# tools: getAudit, auditContract, requestAudit`;
  const x402 = `# x402 paywall — USDC on Base, anchor on Mantle
curl -X POST https://mantleproof.xyz/x402/audit/0x... \\
  -H 'X-PAYMENT: <base64 EIP-3009 transferWithAuthorization>'`;

  return (
    <section className="px-6 py-12 max-w-5xl mx-auto">
      <SectionLabel>Install · use</SectionLabel>
      <h2 className="font-sans text-xl md:text-2xl text-text-primary mt-2 mb-6">
        Three ways an agent queries MantleProof
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <CodeBlock title="On-chain (free, read-only)" body={cast} />
        <CodeBlock title="MCP (stdio, agent-to-agent)" body={mcp} />
        <CodeBlock title="REST + x402 (paid)" body={x402} />
      </div>
      <div className="mt-3 text-[11px] font-mono text-text-muted">
        mantleproof-mcp will be published to npm at submission. On-chain + REST
        are live now against Mantle mainnet.
      </div>
    </section>
  );
}

function CodeBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel flex flex-col">
      <div className="px-3 py-2 row-divider flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          {title}
        </div>
        <CopyButton
          label="copy"
          text={body}
          className="font-mono text-[10px] text-text-muted hover:text-accent"
        />
      </div>
      <pre className="px-3 py-3 text-[11px] text-text-secondary font-mono whitespace-pre-wrap break-all leading-relaxed">
        {body}
      </pre>
    </div>
  );
}

/* --------------------------------- FAQ --------------------------------- */

const FAQ_ITEMS: { q: string; a: React.ReactNode }[] = [
  {
    q: "What does HIGH severity actually mean?",
    a: (
      <>
        HIGH = exploitable now or near-certain to be (fund loss / control transfer
        / catastrophic state corruption). MEDIUM = logic flaw with real loss
        conditions. LOW = deviation from best practice with limited impact. INFO
        = informational, no defect. CLEAN = audit ran, no findings. Every
        severity is paired with an honesty label (VERIFIED / COMPUTED /
        ESTIMATED / EMULATED / LABELED) that tells you how strong the provenance
        is.
      </>
    ),
  },
  {
    q: "How is the audit verifiable without trusting your backend?",
    a: (
      <>
        Every audit has a <code className="text-accent">rootHash</code> — a
        keccak256 hash over the report's canonical JSON. The full report is
        pinned to IPFS; the rootHash, severity, and IPFS CID live on Mantle via{" "}
        <code className="text-accent">submitAudit</code>. Anyone can read the
        audit straight from a Mantle RPC (
        <code className="text-accent">cast call getAudit(target)</code>), fetch
        the report from IPFS, recompute the hash locally, and check it matches.
        The dashboard's <span className="text-accent">integrity ✓</span> badge
        means that check passed for the row in front of you.
      </>
    ),
  },
  {
    q: "Why USDC on Base if this is a Mantle product?",
    a: (
      <>
        Coinbase's hosted x402 facilitator supports Base / Polygon / Arbitrum /
        World / Solana, not Mantle. So the paywall settles in USDC on Base and
        the audit anchors on Mantle. Both transaction hashes appear in every
        200 response — payment receipt on Base, audit anchor on Mantle.
        Cross-chain is fine because audit findings reference contract addresses,
        not payment chains. Self-hosting a Mantle facilitator is roadmap.
      </>
    ),
  },
  {
    q: "Why Gemini, not Claude?",
    a: (
      <>
        The LLMProvider Protocol ships three adapters — GeminiProvider (default,
        live-tested), ClaudeProvider, and ZaiProvider — selected by{" "}
        <code className="text-accent">AUDIT_LLM_PROVIDER</code>. Gemini is the
        default because the build's only live key is a Gemini key; Claude / Z.ai
        adapters are interface-complete + key-gated + shape-tested against
        mocked transport, but not yet exercised against the live APIs. The
        hallucination guard is provider-agnostic (relies on raw text only, never
        tool-use structured output) so the credibility loop is unchanged by the
        choice of provider.
      </>
    ),
  },
  {
    q: "What's the hallucination guard?",
    a: (
      <>
        A pure, unit-tested function that runs before any deep (Tier-2) audit
        is signed and published. Every <code>$</code>, <code>%</code>, hex, and
        address claim in the LLM's output is regex-extracted and checked
        against the contract source line, bytecode offset, or Tier-1 finding it
        cites. Anything we can't verify is masked{" "}
        <code className="text-accent">[unsupported]</code> and the finding's
        honesty label drops one tier (VERIFIED → COMPUTED → …, with LABELED as
        the floor). The masked count is shown publicly on every audit. This is
        the single most credibility-purchasing piece of the build.
      </>
    ),
  },
  {
    q: "Where's the source?",
    a: (
      <>
        Repo: <a href={GITHUB} className="text-accent" target="_blank" rel="noreferrer">github.com/emark-cloud/mantleproof</a>.
        Build plan: <code>docs/mantleproof.md</code>. Design spec:{" "}
        <code>docs/design.md</code>. Live receipts + decisions:{" "}
        <code>TODO.md</code>. Engine tests: <code>167/167 passing</code>.
        License MIT.
      </>
    ),
  },
];

function FAQ() {
  return (
    <section className="px-6 py-12 max-w-3xl mx-auto">
      <SectionLabel>FAQ</SectionLabel>
      <h2 className="font-sans text-xl md:text-2xl text-text-primary mt-2 mb-6">
        Common questions
      </h2>
      <div className="space-y-3">
        {FAQ_ITEMS.map((item) => (
          <details key={item.q} className="panel px-4 py-3 group">
            <summary className="font-sans text-md text-text-primary cursor-pointer list-none flex items-center gap-2">
              <span className="text-accent group-open:rotate-90 transition-transform inline-block">›</span>
              {item.q}
            </summary>
            <div className="mt-3 font-sans text-sm text-text-secondary leading-relaxed">
              {item.a}
            </div>
          </details>
        ))}
      </div>

      <div className="mt-10 panel px-4 py-4 text-[12px] font-mono text-text-muted">
        <div className="text-text-secondary mb-2">deployed contracts (Mantle mainnet):</div>
        <ul className="space-y-1">
          <li>registry · <ContractLink address={REGISTRY_ADDRESS} /></li>
          <li>agent · <ContractLink address={AGENT_ADDRESS} /></li>
          <li>decision log · <ContractLink address={DECISION_LOG_ADDRESS} /></li>
          <li>
            <a
              href={`${MANTLESCAN}/address/${REGISTRY_ADDRESS}#events`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-accent"
            >
              view AuditSubmitted events on mantlescan ↗
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------ Bits and bobs -------------------------- */

/** Truncated address rendered as a direct explorer link (whole truncation is
 *  the click target). Used in the deployed-contracts footer where the user's
 *  intent is "open explorer," not "copy address" (which is the default
 *  semantic of `Address`). */
function ContractLink({ address }: { address: string }) {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return (
    <a
      href={`${MANTLESCAN}/address/${address}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-text-secondary hover:text-accent"
      title={address}
    >
      {short} ↗
    </a>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-dim">
      {children}
    </div>
  );
}

function CopyButton({
  label,
  text,
  className = "",
}: {
  label: string;
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button onClick={onClick} className={className}>
      {copied ? "copied ✓" : label}
    </button>
  );
}
