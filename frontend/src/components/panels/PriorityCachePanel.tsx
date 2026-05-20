/**
 * PriorityCachePanel — docs/design.md §6.1 (middle column, headline panel).
 *
 * Reads each known target's audit envelope via the engine REST (`/api/audit/{addr}`).
 * Each row → click → `/contract/:address`. Severity color + dot + age + audit count
 * — the panel that proves "this oracle has real outputs."
 *
 * Until T29 indexes the full anchored set, the row list is the hand-curated
 * `KNOWN_TARGETS` (the three mainnet demo receipts). Cache freshness is honest:
 * the count footer reads "3 cached contracts (cache-warmer pending)".
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { StatusDot } from "../primitives/StatusDot";
import { Address } from "../primitives/Address";
import { SeverityBadge } from "../primitives/SeverityBadge";
import { Timestamp } from "../primitives/Timestamp";
import { KNOWN_TARGETS, MANTLE_CHAIN_ID } from "../../lib/contracts";
import { getAudit, type AuditResponse } from "../../lib/api";

export function PriorityCachePanel({ chainId = MANTLE_CHAIN_ID }: { chainId?: number }) {
  const queries = useQueries({
    queries: KNOWN_TARGETS.map((t) => ({
      queryKey: ["audit", t.address],
      queryFn: () => getAudit(t.address),
      staleTime: 30_000,
      retry: 1,
    })),
  });

  const rows = useMemo(() => {
    return KNOWN_TARGETS.map((t, i) => {
      const q = queries[i];
      return { target: t, data: q?.data as AuditResponse | undefined, isLoading: q?.isLoading, error: q?.error };
    });
  }, [queries]);

  const audited = rows.filter((r) => r.data?.audited).length;

  return (
    <section className="panel flex flex-col h-full">
      <header className="px-3 py-2 row-divider flex items-baseline justify-between">
        <h2 className="font-mono text-xs uppercase tracking-wider text-text-primary">
          Priority cache (top {KNOWN_TARGETS.length})
        </h2>
        <span className="font-mono text-[10px] text-text-muted">
          {audited}/{KNOWN_TARGETS.length} audited · cache-warmer pending (T29)
        </span>
      </header>

      <ul className="flex-1 overflow-y-auto">
        {rows.map(({ target, data, isLoading, error }) => {
          const isAudited = data?.audited === true;
          const anchor = isAudited && data ? data.anchor : null;
          const report = isAudited && data ? data.report : null;
          const severity = anchor?.severity ?? "info";
          const findingCount = Array.isArray(report?.findings)
            ? (report!.findings as unknown[]).length
            : 0;
          return (
            <li key={target.address}>
              <Link
                to={`/contract/${target.address}`}
                className="block px-3 py-3 row-divider hover:bg-panel-hi transition-colors"
              >
                <div className="flex items-center gap-2">
                  <StatusDot status={isLoading ? "running" : isAudited ? "complete" : "skipped"} />
                  <Address value={target.address} chainId={chainId} withScanLink />
                  <span className="ml-auto">
                    {anchor && <Timestamp epochSeconds={anchor.timestamp} className="text-text-muted text-[11px]" />}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="text-text-primary">{target.label}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                  {isAudited ? (
                    <>
                      <SeverityBadge severity={severity} count={findingCount} />
                      <span className="text-text-muted">tier {report?.tier ?? "?"}</span>
                      <span className="text-text-muted">
                        · audit_count {anchor!.audit_count}
                      </span>
                    </>
                  ) : isLoading ? (
                    <span className="text-text-muted">reading on-chain…</span>
                  ) : error ? (
                    <span className="text-sev-high">engine unreachable — {(error as Error).message}</span>
                  ) : (
                    <span className="text-text-muted">not audited yet</span>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-text-muted">{target.provenance}</div>
              </Link>
            </li>
          );
        })}
      </ul>

      <footer className="px-3 py-2 row-divider text-[10px] text-text-muted">
        Cache is hand-curated until the T29 deploy-feed indexer ships. Each row
        carries a real on-chain rootHash.
      </footer>
    </section>
  );
}
