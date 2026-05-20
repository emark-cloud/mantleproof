/**
 * PriorityCachePanel — docs/design.md §6.1 (middle column, headline panel).
 *
 * Two layers, both real:
 *  1. `KNOWN_TARGETS` (the three mainnet demo audits) read via `/api/audit/{addr}`.
 *     These are the receipts the demo video walks through; we always render them.
 *  2. `/api/cache` rows from the T29 cache-warmer (anchored-audit index). When
 *     the warmer has run, additional rows appear under the curated set,
 *     deduped on `target`. When cold, this layer renders nothing — never fakes
 *     entries. The header carries the cache-warmer freshness honestly.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { StatusDot } from "../primitives/StatusDot";
import { Address } from "../primitives/Address";
import { SeverityBadge } from "../primitives/SeverityBadge";
import { Timestamp } from "../primitives/Timestamp";
import { Tip } from "../primitives/Tip";
import { KNOWN_TARGETS, MANTLE_CHAIN_ID } from "../../lib/contracts";
import { getAudit, getCacheFeed, type AuditResponse, type CacheItem } from "../../lib/api";

function freshnessText(s: number | null): string {
  if (s === null) return "indexer warming up";
  if (s < 60) return `indexed ${s}s ago`;
  if (s < 3600) return `indexed ${Math.floor(s / 60)}m ago`;
  return `indexed ${Math.floor(s / 3600)}h ago`;
}

export function PriorityCachePanel({ chainId = MANTLE_CHAIN_ID }: { chainId?: number }) {
  // Layer 1 — curated demo targets, always rendered.
  const queries = useQueries({
    queries: KNOWN_TARGETS.map((t) => ({
      queryKey: ["audit", t.address],
      queryFn: () => getAudit(t.address),
      staleTime: 30_000,
      retry: 1,
    })),
  });

  const curatedRows = useMemo(() => {
    return KNOWN_TARGETS.map((t, i) => {
      const q = queries[i];
      return {
        target: t,
        data: q?.data as AuditResponse | undefined,
        isLoading: q?.isLoading,
        error: q?.error,
      };
    });
  }, [queries]);

  // Layer 2 — T29 cache-warmer rows (only those not already in the curated set).
  const cache = useQuery({
    queryKey: ["cache"],
    queryFn: () => getCacheFeed(50),
    refetchInterval: 60_000,
    retry: 1,
  });
  const curatedAddrs = useMemo(
    () => new Set(KNOWN_TARGETS.map((t) => t.address.toLowerCase())),
    [],
  );
  const extraRows: CacheItem[] = (cache.data?.items ?? []).filter(
    (r) => !curatedAddrs.has(r.target.toLowerCase()),
  );

  const totalAudited =
    curatedRows.filter((r) => r.data?.audited).length + extraRows.length;
  const totalShown = curatedRows.length + extraRows.length;
  const freshness = cache.data?.freshness_s ?? null;

  return (
    <section className="panel flex flex-col h-full">
      <header className="px-3 py-2 row-divider flex items-baseline justify-between">
        <h2 className="font-mono text-xs uppercase tracking-wider text-text-primary">
          <Tip text="Every contract MantleProof has published an audit for. Each row carries a verifiable audit hash (rootHash) on Mantle; click into a row to see severity, findings, evidence, and the integrity check.">
            Audited contracts (top {totalShown})
          </Tip>
        </h2>
        <span className="font-mono text-[10px] text-text-muted">
          {totalAudited}/{totalShown} audited · {freshnessText(freshness)}
        </span>
      </header>

      <ul className="flex-1 overflow-y-auto">
        {curatedRows.map(({ target, data, isLoading, error }) => {
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
                    {anchor && (
                      <Timestamp
                        epochSeconds={anchor.timestamp}
                        className="text-text-muted text-[11px]"
                      />
                    )}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="text-text-primary">{target.label}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                  {isAudited ? (
                    <>
                      <SeverityBadge severity={severity} count={findingCount} />
                      <Tip text="Tier 1 = fast pattern-matching pass. Tier 2 = deeper LLM-reasoning pass.">
                        <span className="text-text-muted">tier {report?.tier ?? "?"}</span>
                      </Tip>
                      <span className="text-text-muted">· {anchor!.audit_count} audits</span>
                    </>
                  ) : isLoading ? (
                    <span className="text-text-muted">reading on-chain…</span>
                  ) : error ? (
                    <span className="text-sev-high">
                      engine unreachable — {(error as Error).message}
                    </span>
                  ) : (
                    <span className="text-text-muted">not audited yet</span>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-text-muted">{target.provenance}</div>
              </Link>
            </li>
          );
        })}

        {extraRows.map((row) => (
          <li key={row.target}>
            <Link
              to={`/contract/${row.target}`}
              className="block px-3 py-3 row-divider hover:bg-panel-hi transition-colors"
            >
              <div className="flex items-center gap-2">
                <StatusDot status="complete" />
                <Address value={row.target} chainId={chainId} withScanLink />
                <span className="ml-auto">
                  <Timestamp epochSeconds={row.timestamp} className="text-text-muted text-[11px]" />
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                <SeverityBadge severity={row.severity} />
                <span className="text-text-muted">· {row.audit_count} audits</span>
                <span className="text-text-muted">· block {row.block_number}</span>
              </div>
              <div className="mt-1 text-[10px] text-text-muted">
                indexed from /api/cache
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <footer className="px-3 py-2 row-divider text-[10px] text-text-muted">
        Curated demos always shown; additional rows arrive as the background indexer picks them up.
      </footer>
    </section>
  );
}
