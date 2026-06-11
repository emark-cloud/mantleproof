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
import { useQueries, useQuery } from "@tanstack/react-query";
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
        <Coverage />
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
          big="3"
          label="ways to query"
          tip="On-chain getAudit() — trustless read · MCP server — agent-native read · REST + x402 — paid, triggers a fresh audit."
        />
      </div>
    </section>
  );
}

function Stat({ big, label, tip }: { big: string; label: string; tip?: string }) {
  const labelNode = (
    <span className="block text-[10px] uppercase tracking-wider text-text-muted mt-1">
      {label}
    </span>
  );
  return (
    <div>
      <div className="text-xl md:text-xxl text-text-primary tabular-nums leading-none">{big}</div>
      {tip ? <Tip text={tip}>{labelNode}</Tip> : labelNode}
    </div>
  );
}

/* ------------------------------ Coverage ------------------------------- */

/**
 * Coverage — plain-English self-test results over the labeled validation set
 * (T32/T35). Source artifact at /metrics.json, also embedded in every audit
 * JSON via metrics_ref. ML jargon (precision/recall/F1, p50/p95/p99, sha256)
 * lives in a "How to verify" details expander for developer readers; the
 * default render speaks in human terms.
 *
 * Honest disclosure: when the artifact is absent (fresh checkout, script
 * never run) the section degrades to a one-line note rather than fabricating
 * numbers.
 */
type Metrics = {
  schema: string;
  computed_at: string;
  dataset: {
    positives: number;
    negatives: number;
    samples: number;
    sha256: string;
    by_kind: Record<string, number>;
  };
  overall: { precision: number; recall: number; f1: number; tp: number; fp: number; tn: number; fn: number };
  by_check: Record<string, {
    precision: number; recall: number; f1: number;
    tp: number; fp: number; tn: number; fn: number;
    n_pos: number; n_neg: number;
  }>;
  latency_ms?: { p50: number; p95: number; p99: number; samples: number };
};

// Friendly name per check_id — kept in sync with the DIMENSIONS table below
// so the Coverage section never shows raw `*_check_v1` identifiers.
const CHECK_LABELS: Record<string, string> = {
  usdy_check_v1: "USDY / mUSD",
  meth_check_v1: "mETH (bridged L2)",
  usde_check_v1: "USDe / sUSDe",
  dex_check_v1: "Merchant Moe LB v2.2",
  replay_check_v1: "EIP-712 chain-id replay",
};

function checkSummary(m: { tp: number; fp: number; n_pos: number; n_neg: number }): {
  text: string;
  good: boolean;
} {
  // "Caught N of M · no false alarms" — translates per-check P/R into a sentence
  // any reader can parse, while keeping the underlying numbers exact.
  const recallText = `caught ${m.tp} of ${m.n_pos}`;
  const fpText = m.fp === 0
    ? "no false alarms"
    : `${m.fp} false alarm${m.fp === 1 ? "" : "s"}`;
  return {
    text: `${recallText} · ${fpText}`,
    good: m.tp === m.n_pos && m.fp === 0,
  };
}

function Coverage() {
  const { data, isLoading } = useQuery<Metrics>({
    queryKey: ["metrics"],
    queryFn: async () => {
      const r = await fetch("/metrics.json", { cache: "no-cache" });
      if (!r.ok) throw new Error(`metrics.json: ${r.status}`);
      return (await r.json()) as Metrics;
    },
    staleTime: 60_000,
    retry: false,
  });

  return (
    <section className="px-6 py-12 max-w-5xl mx-auto">
      <SectionLabel>Self-test</SectionLabel>
      <h2 className="font-sans text-xl md:text-2xl text-text-primary mt-2 mb-3">
        Do the checks actually catch bugs?
      </h2>
      <p className="font-sans text-[14px] text-text-secondary max-w-3xl mb-6 leading-relaxed">
        We test the engine on a small set of contracts where we already know the answer —
        ones we should flag, and clean ones we shouldn't. The numbers below come from{" "}
        <code className="text-accent">/metrics.json</code> and are regenerated by a script
        in the repo, so anyone can re-run and check.
      </p>

      {isLoading ? (
        <div className="panel p-6 font-sans text-sm text-text-secondary">
          Loading test results…
        </div>
      ) : !data ? (
        <div className="panel p-6 font-sans text-sm text-text-secondary">
          Test results not generated yet — run{" "}
          <code className="text-accent">python engine/scripts/measure_metrics.py</code>{" "}
          to populate this section.
        </div>
      ) : (
        <div className="panel p-6 space-y-6">
          {/* Headline — plain numbers, no acronyms */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <Stat
              big={String(data.dataset.samples)}
              label="test contracts"
              tip={`${data.dataset.by_kind.fixture_pos ?? 0} designed to trigger a specific check, ${data.dataset.by_kind.fixture_neg ?? 0} known-clean, ${data.dataset.by_kind.bait ?? 0} bait contracts deployed on Mantle mainnet`}
            />
            <Stat
              big={`${data.overall.tp} of ${data.overall.tp + data.overall.fn}`}
              label="bugs caught"
              tip={`${data.overall.tp} true positives, ${data.overall.fn} missed (false negatives)`}
            />
            <Stat
              big={String(data.overall.fp)}
              label="false alarms"
              tip={`Flagged ${data.overall.fp} clean contract${data.overall.fp === 1 ? "" : "s"} as buggy (false positives)`}
            />
            <Stat
              big={data.latency_ms ? `< ${Math.max(1, Math.ceil(data.latency_ms.p95))} ms` : "—"}
              label="per check"
              tip={data.latency_ms
                ? `Median ${data.latency_ms.p50}ms, 95th-percentile ${data.latency_ms.p95}ms, 99th-percentile ${data.latency_ms.p99}ms over ${data.latency_ms.samples} runs (Tier 1 only)`
                : undefined}
            />
          </div>

          {/* Per-area — human dimension names + plain-English status */}
          <div className="border-t border-border-faint pt-4">
            <div className="text-text-muted uppercase tracking-wider text-[10px] mb-3 font-mono">
              by area
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
              {Object.entries(data.by_check).map(([cid, m]) => {
                const s = checkSummary(m);
                return (
                  <div key={cid} className="flex items-center gap-2 font-sans text-[13px]">
                    <StatusDot status={s.good ? "complete" : "failed"} size={6} />
                    <span className="text-text-primary">{CHECK_LABELS[cid] ?? cid}</span>
                    <span className="text-text-muted">— {s.text}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Developer-reader details: methodology + reproducibility recipe */}
          <details className="border-t border-border-faint pt-4 font-mono text-[11px] text-text-muted">
            <summary className="cursor-pointer hover:text-text-secondary">
              How to verify these numbers
            </summary>
            <div className="mt-3 space-y-2 leading-relaxed">
              <p>
                Dataset:{" "}
                <span className="text-text-secondary">{data.dataset.samples} labeled samples</span>{" "}
                ({data.dataset.by_kind.fixture_pos ?? 0} positive fixtures +{" "}
                {data.dataset.by_kind.fixture_neg ?? 0} negative fixtures +{" "}
                {data.dataset.by_kind.bait ?? 0} mainnet bait contracts). Fingerprint{" "}
                <span className="text-text-secondary">{data.dataset.sha256.slice(0, 16)}…</span>
                {" "}— anyone running on the same fixtures will get the same hash.
              </p>
              <p>
                Headline metrics: precision{" "}
                <span className="text-text-secondary">{data.overall.precision.toFixed(2)}</span>,
                recall{" "}
                <span className="text-text-secondary">{data.overall.recall.toFixed(2)}</span>,
                F1{" "}
                <span className="text-text-secondary">{data.overall.f1.toFixed(2)}</span>
                {data.latency_ms ? (
                  <>
                    {" · "}Tier-1 latency p50/p95/p99{" "}
                    <span className="text-text-secondary">
                      {data.latency_ms.p50}/{data.latency_ms.p95}/{data.latency_ms.p99} ms
                    </span>
                    {" "}(N={data.latency_ms.samples}, no LLM in the measurement).
                  </>
                ) : null}
              </p>
              <p>
                Computed{" "}
                <span className="text-text-secondary">
                  {data.computed_at.slice(0, 19).replace("T", " ")}Z
                </span>
                . Regenerate:{" "}
                <code className="text-accent">python engine/scripts/measure_metrics.py</code>{" "}
                · Inspect:{" "}
                <a href="/metrics.json" className="text-accent hover:underline">
                  /metrics.json
                </a>
                .
              </p>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

/* ----------------------------- Dimensions ------------------------------ */

const DIMENSIONS: { name: string; breaks: string; example: string; slugs: string[] }[] = [
  {
    name: "USDY / mUSD",
    breaks: "Rebase + RWA oracle + blocklist semantics",
    example:
      "Balance snapshot cached then reused after a state transition (misses the rebase); non-RWA oracle for price; treating USDY ≠ mUSD 1:1.",
    slugs: ["usdy.balance_snapshot", "usdy.wrong_oracle", "usdy.par_assumption", "usdy.unguarded_transfer"],
  },
  {
    name: "mETH (bridged L2)",
    breaks: "L1 staking + L2 wrapped token + exchange-rate accounting",
    example:
      "balance-proportional math (mETH accrues via exchange rate, not balances); missing L1 Oracle read; cmETH conflation; Validator-Queue assumptions post-Liquidity-Buffer.",
    slugs: ["meth.balance_proportional", "meth.no_rate_read", "meth.cmeth_conflation", "meth.stale_redemption"],
  },
  {
    name: "USDe / sUSDe",
    breaks: "Cooldown-aware redemption + non-1:1 conversion + depeg",
    example:
      "sUSDe redeem path without cooldown logic; assumption of 1:1 convertibility; missing depeg-event handling.",
    slugs: ["usde.cooldown_unawareness", "usde.par_assumption", "usde.no_depeg_handling"],
  },
  {
    name: "Merchant Moe LB v2.2 (+ Uniswap V3 secondary)",
    breaks: "Discrete bins, constant-sum within bin, ERC-1155 LP, variable fee",
    example:
      "mint/burn without bin-id validation (positions locked in wrong bins); reading a static fee on an LB pool (volatility-accumulator-driven); ERC-1155 hooks that assume V3 NFT semantics.",
    slugs: ["dex.lb_bin_bounds", "dex.lb_static_fee", "dex.lb_v3_fee_accounting", "dex.v3_no_slippage"],
  },
  {
    name: "EIP-712 chain-id replay",
    breaks: "Domain separator missing chainId / hardcoded mainnet copy-paste",
    example:
      "Hardcoded chainId=1 in a Mantle deploy; typehash omitting chainId; signature reuse across L1/L2; hardcoded 2300-gas ETH transfer.",
    slugs: ["replay.no_chainid", "replay.eip712_missing_chainid", "replay.hardcoded_2300_gas"],
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
            className="grid grid-cols-1 md:grid-cols-[220px_220px_1fr] gap-3 px-4 py-3"
          >
            <div>
              <div className="font-mono text-sm text-accent">{d.name}</div>
              <div className="font-mono text-[10px] text-text-muted mt-1">
                {d.slugs.length} sub-detectors
              </div>
            </div>
            <div className="font-mono text-[12px] text-text-secondary">{d.breaks}</div>
            <div className="space-y-2">
              <div className="font-sans text-[13px] text-text-secondary leading-snug">{d.example}</div>
              <div className="flex flex-wrap gap-1.5">
                {d.slugs.map((slug) => (
                  <span
                    key={slug}
                    className="font-mono text-[10px] px-1.5 py-0.5 border border-border-faint text-text-secondary"
                  >
                    {slug}
                  </span>
                ))}
              </div>
            </div>
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
        <p className="font-sans text-[12px] text-text-secondary mt-3 leading-relaxed">
          MantleProof itself carries on-chain reputation: paying agents leave
          ERC-8004 feedback about us through Mantle's canonical{" "}
          <span className="text-accent">Reputation Registry</span>. The live
          score is read from chain — see{" "}
          <Link to="/agent/96" className="text-accent hover:underline">
            /agent/96
          </Link>
          . Negative feedback from real customers is possible and correct.
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
      <SectionLabel>Three audits on Mantle mainnet — independently verifiable</SectionLabel>
      <h2 className="font-sans text-xl md:text-2xl text-text-primary mt-2 mb-6">
        Three agent-to-agent flows, each a verifiable on-chain receipt
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
  const x402 = `# x402 paywall — pay 0.50 USDC on Base
curl -X POST https://mantleproof.xyz/x402/audit/0x... \\
  -H 'X-PAYMENT: <base64 EIP-3009 transferWithAuthorization>'`;

  return (
    <section className="px-6 py-12 max-w-5xl mx-auto">
      <SectionLabel>The three query surfaces</SectionLabel>
      <h2 className="font-sans text-xl md:text-2xl text-text-primary mt-2 mb-3">
        Three ways an agent queries MantleProof
      </h2>
      <p className="font-sans text-sm text-text-secondary mb-6 max-w-3xl leading-relaxed">
        One audit engine, one canonical result — three access patterns. The
        first two <span className="text-text-primary">read</span> an
        already-published audit; the third can{" "}
        <span className="text-text-primary">create</span> a new one. Pick the
        surface by how much you want to trust, and by whether the contract has
        been audited yet.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-stretch">
        <QueryMethod
          n="1"
          name="On-chain"
          call="getAudit()"
          purpose="Read a published audit straight from the registry contract and recompute the proof yourself — no MantleProof server in the loop. This is the trust anchor: the engine cannot lie about an audit you can verify from public chain + IPFS data."
          meta={["read-only", "trustless", "free"]}
          body={cast}
        />
        <QueryMethod
          n="2"
          name="MCP server"
          call="npx mantleproof-mcp"
          purpose="Drop MantleProof into an AI agent (Claude Desktop, Cursor) as a tool. The agent looks up an audit mid-conversation and gets the same canonical result, formatted to reason over."
          meta={["read-only", "agent-native", "free"]}
          body={mcp}
        />
        <QueryMethod
          n="3"
          name="REST + x402"
          call="POST /x402/audit"
          purpose="No audit exists yet? Pay 0.50 USDC on Base to trigger a fresh Tier-2 audit. It anchors on Mantle and is cached — so every later read on surfaces 1 and 2 is free for everyone."
          meta={["read + create", "paid", "USDC on Base"]}
          body={x402}
        />
      </div>

      <div className="panel mt-4 px-4 py-3 border-l-2 border-accent-dim">
        <div className="font-mono text-[10px] uppercase tracking-wider text-accent-dim mb-1">
          The registry is a commons — by design
        </div>
        <p className="font-sans text-[12px] text-text-secondary leading-relaxed">
          Surface 3 charges to <span className="text-text-primary">create</span>{" "}
          an audit, never to read one. The first agent to need a contract
          checked pays 0.50 USDC once; the audit is then anchored on Mantle and
          pinned to IPFS — public by construction, since trustless verification
          (surface 1) depends on it. Every agent, human, and judge after the
          first reads it free. Each paid audit compounds a shared registry every
          agent draws on — the growing commons is the product, not a side
          effect.
        </p>
      </div>

      <div className="mt-3 text-[11px] font-mono text-text-muted">
        mantleproof-mcp will be published to npm at submission. On-chain + REST
        are live now against Mantle mainnet.
      </div>
    </section>
  );
}

function QueryMethod({
  n,
  name,
  call,
  purpose,
  meta,
  body,
}: {
  n: string;
  name: string;
  call: string;
  purpose: string;
  meta: string[];
  body: string;
}) {
  return (
    <div className="panel flex flex-col">
      <div className="px-3 py-2.5 row-divider">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-accent">
            {n} · {name}
          </span>
          <CopyButton
            label="copy"
            text={body}
            className="font-mono text-[10px] text-text-muted hover:text-accent"
          />
        </div>
        <div className="font-mono text-[11px] text-text-secondary mt-0.5">{call}</div>
        <p className="font-sans text-[12px] text-text-secondary mt-2 leading-relaxed">
          {purpose}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {meta.map((m) => (
            <span
              key={m}
              className="font-mono text-[9px] uppercase tracking-wider text-text-muted border border-border-faint px-1.5 py-0.5"
            >
              {m}
            </span>
          ))}
        </div>
      </div>
      <pre className="px-3 py-3 text-[11px] text-text-secondary font-mono whitespace-pre-wrap break-all leading-relaxed flex-1">
        {body}
      </pre>
    </div>
  );
}

/* --------------------------------- FAQ --------------------------------- */

const FAQ_ITEMS: { q: string; a: React.ReactNode }[] = [
  {
    q: "How does this differ from Aderyn-MCP, GoPlus, Forta, Blockaid?",
    a: (
      <div className="space-y-2">
        <p>
          <code className="text-accent">Aderyn-MCP</code> is a Solidity static
          analyzer for developers at write time. MantleProof is a runtime oracle
          for agents at execution time. Different consumer, different surface
          (MCP + on-chain <code className="text-accent">getAudit()</code> + x402).
        </p>
        <p>
          <code className="text-accent">GoPlus</code> is a centralized token /
          address risk API. MantleProof is Mantle-native (USDY/mUSD, mETH, USDe,
          Merchant Moe LB, EIP-712 replay), on-chain anchored, and signs every
          verdict.
        </p>
        <p>
          <code className="text-accent">Forta</code> monitors live transactions;
          MantleProof audits contracts before they are touched.
        </p>
        <p>
          <code className="text-accent">Blockaid</code> simulates transactions
          inside wallets. MantleProof audits the contract source + bytecode and
          publishes a signed verdict an agent can read on-chain.
        </p>
      </div>
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
    q: "How paid audits work",
    a: (
      <>
        When an agent needs an audit on a contract no one has audited yet, it
        pays <span className="text-text-primary">0.50 USDC</span> over{" "}
        <code className="text-accent">x402</code> (the agentic-payment standard)
        to trigger a fresh one. Settlement is USDC on Base — Coinbase's hosted
        x402 facilitator covers Base / Polygon / Arbitrum / World / Solana, not
        Mantle, so we use Base for the payment rail. The audit itself runs on
        our engine and anchors on Mantle. Every paid response carries{" "}
        <span className="text-text-primary">two transaction hashes</span> — the
        USDC payment on Base and the audit anchor on Mantle — both verifiable
        in their respective explorers. Once anchored, the audit is public, so
        the next agent reading the same contract via{" "}
        <code className="text-accent">getAudit()</code> gets it free.
      </>
    ),
  },
  {
    q: "If I pay for an audit, why can everyone else read it free?",
    a: (
      <>
        Because a paywalled audit oracle is a contradiction. Trustless
        verification — reading <code className="text-accent">getAudit()</code>{" "}
        straight from the registry and recomputing the proof — only works if the
        rootHash and the IPFS report are public, so an audit is public the
        moment it is anchored. The 0.50 USDC on the x402 surface pays to{" "}
        <span className="text-text-primary">produce</span> a new audit, never to
        read an existing one. The first agent to need an unaudited contract
        funds it once; every agent after gets it free. The payer isn't
        subsidising strangers — it is buying a timely safety decision at the
        moment that decision has value, and the audit it leaves behind compounds
        the very registry it relies on. MantleProof is infrastructure; the
        registry is a commons by design.
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
