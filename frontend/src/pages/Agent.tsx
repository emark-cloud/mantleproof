/**
 * /agent/:tokenId — docs/design.md §6.3.
 *
 * MantleProof's own identity page (`/agent/96` is the canonical entry). Reads
 * on-chain agent state via `AgentIdentityHeader`, lists capabilities + agent
 * surfaces, renders an ASCII severity distribution from the known audited set.
 */
import { Link, useParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { AgentIdentityHeader } from "../components/composite/AgentIdentityHeader";
import { EngineStatusFooter } from "../components/composite/EngineStatusFooter";
import { SeverityBadge } from "../components/primitives/SeverityBadge";
import { getAudit } from "../lib/api";
import {
  AGENT_ADDRESS,
  AGENT_TOKEN_ID,
  KNOWN_TARGETS,
  REGISTRY_ADDRESS,
  DECISION_LOG_ADDRESS,
  MANTLE_CHAIN_ID,
} from "../lib/contracts";

const SEVERITIES: ("high" | "medium" | "low" | "info" | "clean")[] = [
  "high",
  "medium",
  "low",
  "info",
  "clean",
];

export default function Agent() {
  const { tokenId } = useParams();
  const idn = tokenId ? BigInt(tokenId) : AGENT_TOKEN_ID;
  const audits = useQueries({
    queries: KNOWN_TARGETS.map((t) => ({
      queryKey: ["audit", t.address],
      queryFn: () => getAudit(t.address),
      staleTime: 60_000,
    })),
  });

  const counts: Record<string, number> = { high: 0, medium: 0, low: 0, info: 0, clean: 0 };
  let total = 0;
  audits.forEach((q) => {
    const d = q.data;
    if (d?.audited) {
      const sev = d.anchor.severity.toLowerCase();
      counts[sev] = (counts[sev] ?? 0) + 1;
      total += 1;
    }
  });

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="border-b border-border-strong bg-panel px-4 py-2">
        <Link to="/app" className="font-mono text-[11px] text-text-secondary hover:text-accent">
          ← dashboard
        </Link>
      </nav>
      <main className="flex-1 px-4 py-4 max-w-4xl w-full mx-auto flex flex-col gap-4">
        <AgentIdentityHeader tokenId={idn} />

        <section className="panel px-4 py-4">
          <h2 className="font-mono text-xs uppercase tracking-wider text-text-primary mb-2">
            Capabilities
          </h2>
          <ul className="font-mono text-[12px] text-text-secondary space-y-1">
            <li>• <span className="text-accent">auditContract(address, tier)</span> · tier 1 free · tier 2 0.50 USDC on base</li>
            <li>• <span className="text-accent">getAudit(address)</span> · free, read-only (on-chain + REST)</li>
            <li>• <span className="text-accent">requestAudit(address, tier)</span> · x402, settles USDC on Base eip155:8453, anchors on Mantle eip155:5000</li>
          </ul>
          <div className="mt-3 font-mono text-[11px] text-text-muted">
            <div>endpoints:</div>
            <ul className="mt-1 space-y-0.5">
              <li>· GET /api/audit/{"{"}address{"}"} (free)</li>
              <li>· POST /x402/audit/{"{"}address{"}"} (paid, USDC on Base)</li>
              <li>· npx mantleproof-mcp (stdio, 3 tools: getAudit, auditContract, requestAudit)</li>
              <li>· on-chain: MantleProofRegistry.getAudit(address)</li>
            </ul>
          </div>
        </section>

        <section className="panel px-4 py-4">
          <h2 className="font-mono text-xs uppercase tracking-wider text-text-primary mb-3">
            Severity distribution ({total} audits)
          </h2>
          {total === 0 ? (
            <div className="font-mono text-[12px] text-text-muted">no audits yet</div>
          ) : (
            <div className="font-mono text-[12px]">
              {SEVERITIES.map((s) => {
                const n = counts[s] ?? 0;
                const pct = total ? Math.round((n / total) * 100) : 0;
                const bar = pct ? "█".repeat(Math.max(1, Math.round(pct / 4))) : "";
                return (
                  <div key={s} className="flex items-center gap-3 py-0.5">
                    <span className="w-20">
                      <SeverityBadge severity={s} />
                    </span>
                    <span className="text-accent" aria-label={`${pct} percent`}>{bar}</span>
                    <span className="text-text-muted ml-auto tabular-nums">
                      {n} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 text-[10px] font-mono text-text-muted">
            Computed from the {KNOWN_TARGETS.length} curated audited targets. Lifetime totals require T29 indexer.
          </div>
        </section>

        <section className="panel px-4 py-4 text-[11px] font-mono text-text-muted space-y-1">
          <div>
            agent contract <span className="text-text-secondary break-all">{AGENT_ADDRESS}</span>
          </div>
          <div>
            registry <span className="text-text-secondary break-all">{REGISTRY_ADDRESS}</span>
          </div>
          <div>
            decision log <span className="text-text-secondary break-all">{DECISION_LOG_ADDRESS}</span>
          </div>
          <div>chainId {MANTLE_CHAIN_ID}</div>
        </section>
      </main>
      <EngineStatusFooter />
    </div>
  );
}
