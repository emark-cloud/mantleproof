/**
 * AgentQueryPanel — docs/design.md §6.1 (right column).
 *
 * Reads `Decision(agent, target, auditRootHash, action, reason)` events from
 * the DecisionLog contract (real, on-chain — Demo 2 trading-agent DECLINED a
 * backdoored token, Demo 3 yield-agent APPROVED Merchant Moe LBRouter). This
 * is the agent-economy proof; the data is genuine.
 *
 * Polls every 8s via wagmi. Each new row enters with `feed-row-insert` (§8).
 */
import { useEffect, useMemo, useState } from "react";
import { useBlockNumber, usePublicClient } from "wagmi";
import { Link } from "react-router-dom";
import { StatusDot } from "../primitives/StatusDot";
import { Address } from "../primitives/Address";
import { Timestamp } from "../primitives/Timestamp";
import { DECISION_LOG_ADDRESS, decisionLogAbi, MANTLE_CHAIN_ID } from "../../lib/contracts";

interface DecisionRow {
  txHash: string;
  blockNumber: bigint;
  timestamp: number;
  agent: string;
  target: string;
  auditRootHash: string;
  action: string;
  reason: string;
}

const LOOKBACK_BLOCKS = 200_000n; // ~ a week at 2s blocks; cheap on Mantle archive

export function AgentQueryPanel({ chainId = MANTLE_CHAIN_ID }: { chainId?: number }) {
  const client = usePublicClient({ chainId });
  const { data: head } = useBlockNumber({ chainId, watch: true, query: { refetchInterval: 8_000 } });
  const [rows, setRows] = useState<DecisionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !head) return;
    const from = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n;
    let cancelled = false;
    (async () => {
      try {
        const logs = await client.getLogs({
          address: DECISION_LOG_ADDRESS,
          event: decisionLogAbi[1], // Decision event
          fromBlock: from,
          toBlock: head,
        });
        // Sort newest first.
        const sorted = [...logs].sort((a, b) => Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n)));
        const next: DecisionRow[] = [];
        for (const log of sorted.slice(0, 25)) {
          const blk = await client.getBlock({ blockNumber: log.blockNumber ?? undefined });
          const args = log.args as {
            agent?: string;
            target?: string;
            auditRootHash?: string;
            action?: string;
            reason?: string;
          };
          next.push({
            txHash: log.transactionHash ?? "",
            blockNumber: log.blockNumber ?? 0n,
            timestamp: Number(blk.timestamp),
            agent: args.agent ?? "",
            target: args.target ?? "",
            auditRootHash: args.auditRootHash ?? "",
            action: args.action ?? "",
            reason: args.reason ?? "",
          });
        }
        if (!cancelled) {
          setRows(next);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [client, head]);

  const counters = useMemo(() => {
    const total = rows.length;
    const approved = rows.filter((r) => r.action === "APPROVED").length;
    const declined = rows.filter((r) => r.action === "DECLINED").length;
    return { total, approved, declined };
  }, [rows]);

  return (
    <aside className="panel flex flex-col h-full">
      <header className="px-3 py-2 row-divider flex items-baseline justify-between">
        <h2 className="font-mono text-xs uppercase tracking-wider text-text-primary">
          Agent queries
        </h2>
        <span className="font-mono text-[10px] text-text-muted flex items-center gap-1">
          <StatusDot status="running" size={6} /> live
        </span>
      </header>
      <div className="px-3 py-2 row-divider text-[10px] text-text-muted font-mono">
        on-chain DecisionLog · {counters.total} · APPROVED {counters.approved} · DECLINED {counters.declined}
      </div>
      {error && (
        <div className="px-3 py-2 text-sev-high text-[11px] font-mono">
          rpc error — {error.slice(0, 80)}
        </div>
      )}
      <ul className="flex-1 overflow-y-auto">
        {rows.length === 0 && !error ? (
          <li className="px-3 py-4 text-[11px] text-text-muted font-mono">
            scanning {LOOKBACK_BLOCKS.toString()} blocks on Mantle mainnet…
          </li>
        ) : (
          rows.map((r) => {
            const isApproved = r.action.toUpperCase() === "APPROVED";
            const isDeclined = r.action.toUpperCase() === "DECLINED";
            const tone = isApproved ? "text-sev-clean" : isDeclined ? "text-sev-high" : "text-text-secondary";
            return (
              <li key={r.txHash} className="px-3 py-2 row-divider animate-feed-row-insert">
                <div className="flex items-center gap-2 text-xs">
                  <Address value={r.agent} chainId={chainId} />
                  <span className="text-text-muted">→</span>
                  <Link to={`/contract/${r.target}`} className="hover:text-accent">
                    <Address value={r.target} chainId={chainId} />
                  </Link>
                </div>
                <div className={`mt-1 font-mono text-xs uppercase tracking-wider ${tone}`}>
                  {r.action || "—"}
                </div>
                {r.reason && (
                  <div className="mt-0.5 text-[11px] text-text-secondary line-clamp-2">
                    {r.reason}
                  </div>
                )}
                <div className="mt-1 flex items-center justify-between text-[10px] text-text-muted">
                  <Timestamp epochSeconds={r.timestamp} />
                  {r.auditRootHash && (
                    <Link
                      to={`/audit/${r.auditRootHash}`}
                      className="font-mono hover:text-accent"
                      title={r.auditRootHash}
                    >
                      audit ↗
                    </Link>
                  )}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
