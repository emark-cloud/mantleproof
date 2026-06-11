/**
 * PriorityCachePanel — docs/design.md §6.1 (middle column, headline panel).
 *
 * Renders the three mainnet demo audits (`KNOWN_TARGETS`) read via
 * `/api/audit/{addr}` — the receipts the demo video walks through. These are the
 * only audits re-anchored to the live registry, so they are the only ones shown.
 * The T29 cache-warmer feed (`/api/cache`) is intentionally NOT surfaced here:
 * we show only the curated, re-anchored demo set.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { StatusDot } from "../primitives/StatusDot";
import { Address } from "../primitives/Address";
import { SeverityBadge } from "../primitives/SeverityBadge";
import { Timestamp } from "../primitives/Timestamp";
import { Tip } from "../primitives/Tip";
import { KNOWN_TARGETS, MANTLE_CHAIN_ID } from "../../lib/contracts";
import { getAudit, type AuditResponse } from "../../lib/api";

/** Case-insensitive substring match across address + name. Empty query matches all. */
function matches(q: string, address: string, name?: string | null, label?: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return (
    address.toLowerCase().includes(t) ||
    (name ?? "").toLowerCase().includes(t) ||
    (label ?? "").toLowerCase().includes(t)
  );
}

export function PriorityCachePanel({ chainId = MANTLE_CHAIN_ID }: { chainId?: number }) {
  // Curated demo targets, read live from /api/audit/{addr}.
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

  const [query, setQuery] = useState("");

  // Sort by on-chain anchor timestamp, newest first.
  //   - loaded + audited → anchor.timestamp
  //   - still loading    → +Infinity (pin to top so loading state is visible;
  //                         resolves into real position once the query lands)
  //   - not audited      → 0 (sink to bottom; honest)
  const sorted = useMemo(() => {
    const withTs = curatedRows.map((entry) => {
      let sortTs = 0;
      if (entry.isLoading) sortTs = Number.POSITIVE_INFINITY;
      else if (entry.data?.audited && entry.data.anchor)
        sortTs = entry.data.anchor.timestamp;
      return { entry, sortTs };
    });
    withTs.sort((a, b) => b.sortTs - a.sortTs);
    return withTs.map((r) => r.entry);
  }, [curatedRows]);

  const filtered = useMemo(
    () =>
      sorted.filter((entry) => {
        const name =
          (entry.data?.audited && entry.data.report
            ? (entry.data.report.contract_name as string | undefined)
            : undefined) ?? entry.target.label;
        return matches(query, entry.target.address, name, entry.target.label);
      }),
    [sorted, query],
  );

  const totalAudited = curatedRows.filter((r) => r.data?.audited).length;
  const totalShown = curatedRows.length;
  const shownAfterFilter = filtered.length;

  return (
    <section className="panel flex flex-col h-full">
      <header className="px-3 py-2 row-divider flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-xs uppercase tracking-wider text-text-primary">
          <Tip text="Every contract MantleProof has published an audit for, newest first. Each row carries a verifiable audit hash (rootHash) on Mantle; click into a row to see severity, findings, evidence, and the integrity check.">
            Audited contracts ({query ? `${shownAfterFilter}/${totalShown}` : totalShown})
          </Tip>
        </h2>
        <span className="font-mono text-[10px] text-text-muted">
          {totalAudited}/{totalShown} audited
        </span>
      </header>

      <div className="px-3 py-2 row-divider">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search address or name (e.g. 0x5d3a… or USDe)"
          aria-label="search audited contracts by address or name"
          className="w-full bg-panel-hi border border-border-faint rounded px-2 py-1.5 font-mono text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>

      <ul className="flex-1 overflow-y-auto">
        {query && shownAfterFilter === 0 && (
          <li className="px-3 py-4 font-mono text-[11px] text-text-muted">
            no audited contracts match <span className="text-text-secondary">{query}</span>
          </li>
        )}
        {filtered.map((entry) => {
          const { target, data, isLoading, error } = entry;
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
                  <StatusDot
                    status={isLoading ? "running" : isAudited ? "complete" : "skipped"}
                  />
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
      </ul>

      <footer className="px-3 py-2 row-divider text-[10px] text-text-muted">
        The three agent-to-agent demo audits, anchored on Mantle mainnet. Newest
        anchor first.
      </footer>
    </section>
  );
}
