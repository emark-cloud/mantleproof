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
import { useEffect, useMemo, useRef, useState } from "react";
import { useBlockNumber, usePublicClient } from "wagmi";
import { Link } from "react-router-dom";
import { StatusDot } from "../primitives/StatusDot";
import { Address } from "../primitives/Address";
import { Timestamp } from "../primitives/Timestamp";
import { Tip } from "../primitives/Tip";
import {
  DECISION_LOG_START_BLOCK,
  GETLOGS_MAX_RANGE,
  getDecisionLogsChunked,
  MANTLE_CHAIN_ID,
} from "../../lib/contracts";

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

export function AgentQueryPanel({ chainId = MANTLE_CHAIN_ID }: { chainId?: number }) {
  const client = usePublicClient({ chainId });
  const { data: head } = useBlockNumber({ chainId, watch: true, query: { refetchInterval: 8_000 } });
  const [rows, setRows] = useState<DecisionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Decisions are immutable historical events spread across a ~180k-block window
  // (Demo 2/3, ~3 weeks back) plus any freshly-run demo near head. We keep an
  // accumulating map keyed by tx+logIndex so the one-time history scan and the
  // live-tip poll merge without duplicates; block timestamps are cached too.
  const rowsRef = useRef<Map<string, DecisionRow>>(new Map());
  const tsRef = useRef<Map<string, number>>(new Map());

  type DecisionLog = Awaited<ReturnType<typeof getDecisionLogsChunked>>[number];
  const ingest = async (logs: DecisionLog[]) => {
    for (const log of logs) {
      const key = `${log.transactionHash}:${log.logIndex}`;
      if (rowsRef.current.has(key)) continue;
      const bn = log.blockNumber ?? 0n;
      let ts = tsRef.current.get(bn.toString());
      if (ts === undefined) {
        const blk = await client!.getBlock({ blockNumber: bn });
        ts = Number(blk.timestamp);
        tsRef.current.set(bn.toString(), ts);
      }
      const args = log.args as {
        agent?: string;
        target?: string;
        auditRootHash?: string;
        action?: string;
        reason?: string;
      };
      rowsRef.current.set(key, {
        txHash: log.transactionHash ?? "",
        blockNumber: bn,
        timestamp: ts,
        agent: args.agent ?? "",
        target: args.target ?? "",
        auditRootHash: args.auditRootHash ?? "",
        action: args.action ?? "",
        reason: args.reason ?? "",
      });
    }
  };
  const commit = () => {
    const all = [...rowsRef.current.values()].sort(
      (a, b) => Number(b.blockNumber - a.blockNumber),
    );
    setRows(all.slice(0, 25));
  };

  // One-time deep scan of the historical decision window (chunked under the RPC
  // range cap). Runs once when the client is ready, NOT on every new block.
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        const head = await client.getBlockNumber();
        const logs = await getDecisionLogsChunked(client, DECISION_LOG_START_BLOCK, head);
        await ingest(logs);
        if (!cancelled) {
          commit();
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // Cheap live-tip poll (one getLogs over the last window) for demos re-run now.
  useEffect(() => {
    if (!client || !head) return;
    let cancelled = false;
    (async () => {
      try {
        const from = head > GETLOGS_MAX_RANGE ? head - GETLOGS_MAX_RANGE : 0n;
        const logs = await getDecisionLogsChunked(client, from, head);
        await ingest(logs);
        if (!cancelled) {
          commit();
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <Tip text="Every receipt of an agent acting on a MantleProof audit (APPROVED or DECLINED, referencing the audit hash). Read live from the DecisionLog contract on Mantle and verifiable on Mantlescan.">
            Agent decisions
          </Tip>
        </h2>
        <span className="font-mono text-[10px] text-text-muted flex items-center gap-1">
          <StatusDot status="running" size={6} /> live
        </span>
      </header>
      <div className="px-3 py-2 row-divider text-[10px] text-text-muted font-mono">
        from DecisionLog on Mantle · {counters.total} · APPROVED {counters.approved} · DECLINED {counters.declined}
      </div>
      {error && (
        <div className="px-3 py-2 text-sev-high text-[11px] font-mono">
          rpc error — {error.slice(0, 80)}
        </div>
      )}
      <ul className="flex-1 overflow-y-auto">
        {rows.length === 0 && !error ? (
          <li className="px-3 py-4 text-[11px] text-text-muted font-mono">
            scanning DecisionLog on Mantle…
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
