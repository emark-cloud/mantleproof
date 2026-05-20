/**
 * /judge — docs/design.md §6.5. Six-step Quick Evaluation flow.
 *
 * Each step ends with a verifiable artifact. Real links to live Mantlescan
 * pages + a `cast call` command judges can paste. Step 3 (run an audit) and
 * Step 4 (watch an agent decision) link out to the live x402 endpoint and the
 * DecisionLog respectively — the judge can SEE the agent-to-agent receipts
 * on-chain rather than read about them.
 */
import { Link } from "react-router-dom";
import { JudgeStepCard, type JudgeStep } from "../components/composite/JudgeStepCard";
import { EngineStatusFooter } from "../components/composite/EngineStatusFooter";
import {
  AGENT_ADDRESS,
  DECISION_LOG_ADDRESS,
  KNOWN_TARGETS,
  REGISTRY_ADDRESS,
} from "../lib/contracts";

const MANTLESCAN = "https://mantlescan.xyz";
const TOTAL = 6;

// Pin specific demo targets — fall back to a sentinel if the curated list
// is ever empty (it never is in practice, but the type system needs it).
const DEMO_1 = KNOWN_TARGETS[0]?.address ?? ("0x0" as `0x${string}`);
const DEMO_3 = KNOWN_TARGETS[2]?.address ?? ("0x0" as `0x${string}`);

const STEPS: JudgeStep[] = [
  {
    index: 1,
    total: TOTAL,
    title: "Verify the audit oracle is live",
    instruction: (
      <>
        Open the dashboard. Confirm: the priority cache shows real audited
        targets with severity badges, the agent-query log shows on-chain
        DecisionLog entries, and the engine footer reports a healthy block
        number.
      </>
    ),
    actions: [{ label: "open dashboard", href: "/" }],
  },
  {
    index: 2,
    total: TOTAL,
    title: "Verify on-chain anchoring",
    instruction: (
      <>
        Open MantleProofRegistry on Mantlescan and confirm recent{" "}
        <code className="text-accent">submitAudit</code> txs from the
        oracle-signer address. Every audit referenced here has an on-chain
        rootHash and an IPFS-pinned report.
      </>
    ),
    actions: [
      { label: "registry on mantlescan", href: `${MANTLESCAN}/address/${REGISTRY_ADDRESS}` },
      { label: "agent on mantlescan", href: `${MANTLESCAN}/address/${AGENT_ADDRESS}` },
    ],
  },
  {
    index: 3,
    total: TOTAL,
    title: "Inspect a Tier-2 audit end-to-end",
    instruction: (
      <>
        Open the Demo 1 contract page (intentionally vulnerable
        BuggyYieldVault). Confirm findings carry honesty labels, evidence cites
        source lines or matched patterns, and the integrity check (keccak of
        canonical IPFS report == on-chain rootHash) is ✓.
      </>
    ),
    actions: [{ label: "open contract", href: `/contract/${DEMO_1}` }],
  },
  {
    index: 4,
    total: TOTAL,
    title: "Verify agent-to-agent decisions",
    instruction: (
      <>
        The DecisionLog on Mantle mainnet records every demo agent's decision
        with the audit rootHash it relied on. Demo 2 trading-agent DECLINED a
        backdoored token; Demo 3 yield-agent APPROVED Merchant Moe LBRouter
        and posted real liquidity. Open the DecisionLog on Mantlescan and
        inspect the Decision events.
      </>
    ),
    actions: [
      { label: "decision log on mantlescan", href: `${MANTLESCAN}/address/${DECISION_LOG_ADDRESS}#events` },
      { label: "agent query log", href: "/" },
    ],
  },
  {
    index: 5,
    total: TOTAL,
    title: "Verify the hallucination guard",
    instruction: (
      <>
        Open any Tier-2 audit and confirm the public note
        <span className="text-accent"> "Hallucination guard fired: N masked"</span>{" "}
        appears. The guard is a pure unit-tested function that drops a finding's
        honesty label one tier per unverifiable claim; see{" "}
        <span className="font-mono">engine/mantleproof/tier2/hallucination_guard.py</span>.
      </>
    ),
    actions: [
      { label: "open contract", href: `/contract/${DEMO_3}` },
    ],
  },
  {
    index: 6,
    total: TOTAL,
    title: "Independent verification (paste-able)",
    instruction: (
      <>
        Read the audit yourself via <code className="text-accent">cast call</code>.
        Copy the command below and run against any Mantle RPC. The returned
        rootHash matches what the dashboard shows. No trust in our backend
        required.
      </>
    ),
    actions: [
      {
        label: "cast call (registry.getAudit)",
        copy: `cast call ${REGISTRY_ADDRESS} 'getAudit(address)(bytes32,uint8,string,uint64,address)' ${DEMO_1} --rpc-url https://rpc.mantle.xyz`,
      },
      {
        label: "curl /api/audit",
        copy: `curl -s https://mantleproof.xyz/api/audit/${DEMO_1} | jq .integrity`,
      },
    ],
  },
];

export default function Judge() {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="border-b border-border-strong bg-panel px-4 py-2 flex items-center">
        <Link to="/" className="font-mono text-[11px] text-text-secondary hover:text-accent">
          ← dashboard
        </Link>
        <span className="ml-auto font-mono text-[11px] text-text-muted">
          estimated time: 3 min
        </span>
      </nav>
      <main className="flex-1 px-4 py-4 max-w-3xl w-full mx-auto flex flex-col gap-3">
        <header className="panel px-4 py-3">
          <h1 className="font-mono text-md text-text-primary uppercase tracking-wider">
            Judge Quick Evaluation
          </h1>
          <p className="font-sans text-sm text-text-secondary mt-1">
            Six steps, each ~30 seconds. Every step ends with a verifiable
            artifact — a live URL, a Mantlescan page, or a paste-able
            <code className="text-accent"> cast call </code> command. No trust required.
          </p>
        </header>
        {STEPS.map((s) => (
          <JudgeStepCard key={s.index} step={s} />
        ))}
      </main>
      <EngineStatusFooter />
    </div>
  );
}
