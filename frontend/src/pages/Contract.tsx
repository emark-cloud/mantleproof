/**
 * /contract/:address — docs/design.md §6.2.
 *
 * Drill-down for a single audited target. Pulls the canonical envelope from
 * `/api/audit/{address}` (T7), then composes the page from primitives:
 *  - hero strip with severity + address + integrity badge
 *  - FindingCard list
 *  - AuditHistoryRow (latest only — historical scan is T29 work)
 *  - Queried by — DecisionLog events filtered to this target
 */
import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useBlockNumber, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { getAudit, type AuditResponse } from "../lib/api";
import {
  DECISION_LOG_ADDRESS,
  decisionLogAbi,
  MANTLE_CHAIN_ID,
} from "../lib/contracts";
import { StatusDot } from "../components/primitives/StatusDot";
import { Address } from "../components/primitives/Address";
import { SeverityBadge, type Severity } from "../components/primitives/SeverityBadge";
import { Timestamp } from "../components/primitives/Timestamp";
import { HonestyLabel } from "../components/primitives/HonestyLabel";
import { FindingCard } from "../components/panels/FindingCard";
import {
  AuditHistoryRow,
  type AuditHistoryEntry,
} from "../components/panels/AuditHistoryRow";
import { EngineStatusFooter } from "../components/composite/EngineStatusFooter";

export default function Contract() {
  const { address = "" } = useParams();
  const chainId = MANTLE_CHAIN_ID;
  const { data, error, isLoading } = useQuery<AuditResponse>({
    queryKey: ["audit", address],
    queryFn: () => getAudit(address),
    enabled: !!address,
  });

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="border-b border-border-strong bg-panel px-4 py-2">
        <Link to="/" className="font-mono text-[11px] text-text-secondary hover:text-accent">
          ← back to dashboard
        </Link>
      </nav>

      <main className="flex-1 px-4 py-4 flex flex-col gap-4 max-w-5xl w-full mx-auto">
        {isLoading && <div className="font-mono text-text-muted">loading…</div>}
        {error && (
          <div className="font-mono text-sev-high">
            engine error — {(error as Error).message}
          </div>
        )}
        {data?.audited === false && (
          <div className="panel px-4 py-4 font-mono text-sm text-text-secondary">
            no audit on chainId {data.chain_id} for{" "}
            <Address value={data.target} chainId={chainId} withScanLink />.
            <div className="mt-2 text-[11px] text-text-muted">
              To request one, call <span className="text-accent">requestAudit({data.target}, 2)</span>{" "}
              via the MCP server or POST <span className="text-accent">/x402/audit/{data.target}</span>{" "}
              with 0.50 USDC on Base.
            </div>
          </div>
        )}
        {data?.audited === true && <AuditedView data={data} chainId={chainId} />}
      </main>
      <EngineStatusFooter />
    </div>
  );
}

function AuditedView({
  data,
  chainId,
}: {
  data: Extract<AuditResponse, { audited: true }>;
  chainId: number;
}) {
  const { anchor, integrity, report, target, explorer, ipfs_error } = data;
  const sev = anchor.severity as Severity;
  const findings = report?.findings ?? [];
  const integrityOk = integrity.match === true;
  const integrityFailed = integrity.match === false;

  const history: AuditHistoryEntry[] = [
    {
      rootHash: anchor.root_hash,
      tier: report?.tier,
      timestamp: anchor.timestamp,
      source: anchor.audit_count > 1 ? `latest of ${anchor.audit_count}` : "first audit",
      label: findings[0]?.label,
    },
  ];

  return (
    <>
      <section className="panel px-4 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          <SeverityBadge severity={sev} count={findings.length} />
          <Address value={target} chainId={chainId} withScanLink />
          <span className="ml-auto font-mono text-[11px] text-text-muted">
            anchored <Timestamp epochSeconds={anchor.timestamp} /> · audit_count {anchor.audit_count}
          </span>
        </div>
        {report?.contract_name && (
          <div className="mt-2 font-sans text-md text-text-primary">{report.contract_name}</div>
        )}
        {report?.summary && (
          <div className="mt-1 font-sans text-sm text-text-secondary">{report.summary}</div>
        )}
        <div className="mt-3 flex items-center gap-3 text-[11px] font-mono">
          <a
            href={explorer.target}
            target="_blank"
            rel="noreferrer"
            className="text-text-secondary hover:text-accent"
          >
            [mantlescan ↗]
          </a>
          {anchor.ipfs_uri && (
            <a
              href={anchor.ipfs_uri.replace("ipfs://", "https://w3s.link/ipfs/")}
              target="_blank"
              rel="noreferrer"
              className="text-text-secondary hover:text-accent"
            >
              [view on ipfs ↗]
            </a>
          )}
          <Link
            to={`/audit/${anchor.root_hash}`}
            className="text-text-secondary hover:text-accent"
          >
            [audit permalink ↗]
          </Link>
          <span className="ml-auto">
            tier {report?.tier ?? "?"} · provider {report?.provider ?? "—"}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2 font-mono text-[11px]">
          {integrityOk && (
            <span className="text-sev-clean">
              <StatusDot status="complete" size={6} /> integrity ✓ recomputed keccak == on-chain rootHash
            </span>
          )}
          {integrityFailed && (
            <span className="text-sev-high">
              <StatusDot status="failed" size={6} /> integrity ✗ MISMATCH — IPFS content may have been
              tampered with
            </span>
          )}
          {integrity.match === null && (
            <span className="text-text-muted">
              <StatusDot status="pending" size={6} /> IPFS gateway not reachable ({ipfs_error ?? "unknown"})
            </span>
          )}
        </div>
        {report?.hallucination_guard?.public_note && (
          <div className="mt-2 font-mono text-[11px] text-text-secondary">
            {report.hallucination_guard.public_note}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-mono text-xs uppercase tracking-wider text-text-primary">
            Findings ({findings.length})
          </h2>
          {findings[0]?.label && (
            <span className="font-mono text-[10px] text-text-muted flex items-center gap-1">
              top label <HonestyLabel label={findings[0].label} />
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {findings.length === 0 ? (
            <div className="panel px-4 py-4 font-mono text-sm text-text-secondary">
              No findings — audit returned clean (severity {anchor.severity.toUpperCase()}).
            </div>
          ) : (
            findings.map((f, i) => <FindingCard key={i} finding={f} />)
          )}
        </div>
      </section>

      <section>
        <h2 className="font-mono text-xs uppercase tracking-wider text-text-primary mb-2">
          Audit history ({anchor.audit_count})
        </h2>
        <div className="panel">
          <div className="px-4 py-2 row-divider grid grid-cols-[80px_60px_1fr_160px_120px] gap-3 text-[10px] font-mono uppercase tracking-wider text-text-muted">
            <span>when</span>
            <span>tier</span>
            <span>rootHash</span>
            <span>source</span>
            <span>label</span>
          </div>
          {history.map((h) => (
            <AuditHistoryRow key={h.rootHash} entry={h} />
          ))}
          {anchor.audit_count > 1 && (
            <div className="px-4 py-2 text-[10px] font-mono text-text-muted">
              Older audits live in registry event logs; full history view ships with T29.
            </div>
          )}
        </div>
      </section>

      <QueriedBySection target={target} rootHash={anchor.root_hash} chainId={chainId} />
    </>
  );
}

interface DecisionRow {
  txHash: string;
  agent: string;
  action: string;
  reason: string;
  timestamp: number;
}

function QueriedBySection({
  target,
  rootHash,
  chainId,
}: {
  target: string;
  rootHash: string;
  chainId: number;
}) {
  const client = usePublicClient({ chainId });
  const { data: head } = useBlockNumber({ chainId });
  const [rows, setRows] = useState<DecisionRow[] | null>(null);

  useEffect(() => {
    if (!client || !head) return;
    let cancelled = false;
    (async () => {
      try {
        const logs = await client.getLogs({
          address: DECISION_LOG_ADDRESS,
          event: decisionLogAbi[1],
          args: { target: target as `0x${string}` },
          fromBlock: head > 200_000n ? head - 200_000n : 0n,
          toBlock: head,
        });
        const out: DecisionRow[] = [];
        for (const log of logs) {
          const blk = await client.getBlock({ blockNumber: log.blockNumber ?? undefined });
          const args = log.args as { agent?: string; action?: string; reason?: string };
          out.push({
            txHash: log.transactionHash ?? "",
            agent: args.agent ?? "",
            action: args.action ?? "",
            reason: args.reason ?? "",
            timestamp: Number(blk.timestamp),
          });
        }
        if (!cancelled) setRows(out.reverse());
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [client, head, target]);

  return (
    <section>
      <h2 className="font-mono text-xs uppercase tracking-wider text-text-primary mb-2">
        Queried by{rows ? ` (${rows.length})` : ""}
      </h2>
      <div className="panel">
        {rows === null && (
          <div className="px-4 py-3 font-mono text-[12px] text-text-muted">
            scanning DecisionLog…
          </div>
        )}
        {rows?.length === 0 && (
          <div className="px-4 py-3 font-mono text-[12px] text-text-muted">
            No on-chain decisions reference rootHash {rootHash.slice(0, 12)}… yet.
          </div>
        )}
        {rows && rows.length > 0 && (
          <ul>
            {rows.map((r) => (
              <li
                key={r.txHash}
                className="px-4 py-2 row-divider grid grid-cols-[1fr_100px_140px] gap-3 items-baseline text-[12px] font-mono"
              >
                <Address value={r.agent} chainId={chainId} />
                <span
                  className={
                    r.action === "APPROVED"
                      ? "text-sev-clean"
                      : r.action === "DECLINED"
                        ? "text-sev-high"
                        : "text-text-secondary"
                  }
                >
                  {r.action || "—"}
                </span>
                <Timestamp epochSeconds={r.timestamp} className="text-text-muted text-right" />
                {r.reason && (
                  <span className="col-span-3 text-[11px] text-text-secondary">{r.reason}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
