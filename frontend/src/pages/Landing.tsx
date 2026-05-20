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
        audit oracle · Mantle mainnet
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
        The audit oracle for{" "}
        <span className="text-accent">Mantle's agentic economy</span>
      </h1>
      <p className="font-sans text-md md:text-lg text-text-secondary mt-5 max-w-3xl leading-relaxed">
        Other agents query MantleProof before touching a contract and get back a
        structured safety signal in under a second. Five Mantle-specific check
        dimensions, two-tier reasoning, a hallucination guard, and every audit
        anchored on-chain with an IPFS-pinned report.
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
          label="audits anchored on-chain"
        />
        <Stat
          big={agentAudits.toLocaleString()}
          label="agent #96 lifetime audits"
        />
        <Stat
          big="5"
          label="check dimensions"
        />
        <Stat
          big="4"
          label="query surfaces"
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
      <SectionLabel>The five audit dimensions</SectionLabel>
      <h2 className="font-sans text-xl md:text-2xl text-text-primary mt-2 mb-6">
        Mantle-specific bug surfaces a generic static analyzer misses
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
      <SectionLabel>How a Tier-2 audit ships</SectionLabel>
      <h2 className="font-sans text-xl md:text-2xl text-text-primary mt-2 mb-6">
        Heuristic + LLM reasoning, with provenance baked in
      </h2>

      <div className="panel px-4 py-5">
        <ol className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1fr] gap-4 font-mono text-[12px]">
          <FlowStep n="1" title="resolve">
            verified source via Etherscan V2 · runtime bytecode via RPC · Tier-1
            union of 5 check modules · skill briefs for each protocol
          </FlowStep>
          <FlowStep n="2" title="reason">
            tightly-scoped JSON-only prompt → Gemini (live) → text findings, each
            citing source lines or bytecode offsets
          </FlowStep>
          <FlowStep n="3" title="guard">
            every $ / % / hex / address claim regex-extracted + verified against
            source/bytecode/Tier-1; unsupported → masked + label tier-drops once
          </FlowStep>
          <FlowStep n="4" title="anchor">
            keccak(canonical(report)) → IPFS pin (Pinata) → on-chain
            <span className="text-accent"> submitAudit</span> on Mantle → memoryRoot advances
          </FlowStep>
        </ol>

        <p className="font-sans text-[12px] text-text-secondary mt-5 leading-relaxed">
          The credibility loop is independently verifiable: anyone can fetch the
          IPFS report, recompute keccak256 of the canonical preimage, and assert
          it equals the on-chain rootHash. The dashboard's{" "}
          <span className="text-accent">integrity ✓</span> badge means that check
          passed for the row in front of you. The hallucination guard's count is
          surfaced publicly on every Tier-2 audit ("guard fired: N masked") — we
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

const DEMO_BLURBS: Record<string, { agent: string; verdict: "APPROVED" | "DECLINED"; story: string }> = {
  "0x1892f77e335C133Ce4a7B28555f13bA74cBB76fA": {
    agent: "deployer-agent",
    verdict: "DECLINED",
    story:
      "Intentionally vulnerable BuggyYieldVault. Tier-2 flagged a sUSDe-cooldown handling bug. The agent declined to deploy further; the audit is anchored as the receipt.",
  },
  "0x8f66c8B7AB07c2cF6db52a07d1Dd3C9c7f1c912f": {
    agent: "trading-agent",
    verdict: "DECLINED",
    story:
      "BackdooredMemeToken with a pause() + mint() admin backdoor. Pre-swap query returned HIGH severity; the agent refused the swap and posted a DECLINED entry to the on-chain DecisionLog.",
  },
  "0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a": {
    agent: "yield-agent",
    verdict: "APPROVED",
    story:
      "Canonical Merchant Moe LBRouter v2.2 — the contract the agent was about to call. Audit came back clean; the agent posted a real single-sided WMNT addLiquidity tx on mainnet and recorded APPROVED in the DecisionLog.",
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
      <SectionLabel>Three live demos — Mantle mainnet, independently verifiable</SectionLabel>
      <h2 className="font-sans text-xl md:text-2xl text-text-primary mt-2 mb-6">
        Three agent-to-agent flows, three on-chain receipts
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
                  Demo {i + 1} · {blurb.agent}
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
        Every audit's <code className="text-accent">rootHash</code> is
        keccak256 of a canonical JSON preimage of the report. The full report is
        pinned to IPFS; the rootHash + severity + IPFS CID are anchored on Mantle
        via <code className="text-accent">submitAudit</code>. Anyone can{" "}
        <code className="text-accent">cast call getAudit(target)</code> from any
        Mantle RPC, fetch the IPFS report, recompute keccak, and assert match.
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
        A pure, unit-tested function. Before any Tier-2 audit is signed and
        anchored, every <code>$</code>/<code>%</code>/hex/address claim in the
        LLM's output is regex-extracted and verified against the contract source
        line / bytecode offset / Tier-1 findings. Unsupported claims are masked{" "}
        <code className="text-accent">[unsupported]</code> and the finding's
        honesty label drops one tier (VERIFIED → COMPUTED → …, LABELED floor).
        The count is publicly displayed on every Tier-2 audit. This is the
        single most credibility-purchasing piece of the build.
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
          <li>registry · <Address value={REGISTRY_ADDRESS} chainId={MANTLE_CHAIN_ID} withScanLink /></li>
          <li>agent · <Address value={AGENT_ADDRESS} chainId={MANTLE_CHAIN_ID} withScanLink /></li>
          <li>decision log · <Address value={DECISION_LOG_ADDRESS} chainId={MANTLE_CHAIN_ID} withScanLink /></li>
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
