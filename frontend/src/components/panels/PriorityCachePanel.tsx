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
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { StatusDot } from "../primitives/StatusDot";
import { Address } from "../primitives/Address";
import { SeverityBadge } from "../primitives/SeverityBadge";
import { Timestamp } from "../primitives/Timestamp";
import { Tip } from "../primitives/Tip";
import { KNOWN_TARGETS, MANTLE_CHAIN_ID } from "../../lib/contracts";
import { getAudit, getCacheFeed, type AuditResponse, type CacheItem } from "../../lib/api";

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
  // /api/cache already returns rows newest-first; defensively re-sort so the
  // panel ordering doesn't depend on the route's contract.
  const extraRows: CacheItem[] = useMemo(
    () =>
      (cache.data?.items ?? [])
        .filter((r) => !curatedAddrs.has(r.target.toLowerCase()))
        .slice()
        .sort((a, b) => b.block_number - a.block_number),
    [cache.data?.items, curatedAddrs],
  );

  // Unify both layers into a single timestamp-sorted list. The user reads
  // this as "audited contracts, newest first" — having curated demos pinned
  // above newer cache rows contradicts that, so we merge and sort.
  //
  // Each row carries a `sortTs` derived from on-chain anchor timestamp:
  //   - curated, loaded + audited → anchor.timestamp
  //   - curated, still loading    → +Infinity (pin to top so loading state
  //                                  is visible; resolves into real position
  //                                  once the query completes)
  //   - curated, not audited      → 0 (sink to bottom; honest)
  //   - extra (cache row)         → row.timestamp
  type UnifiedRow =
    | { kind: "curated"; key: string; sortTs: number; entry: (typeof curatedRows)[number] }
    | { kind: "extra"; key: string; sortTs: number; row: CacheItem };

  const [query, setQuery] = useState("");

  const unified: UnifiedRow[] = useMemo(() => {
    const out: UnifiedRow[] = [];
    for (const entry of curatedRows) {
      let sortTs = 0;
      if (entry.isLoading) sortTs = Number.POSITIVE_INFINITY;
      else if (entry.data?.audited && entry.data.anchor)
        sortTs = entry.data.anchor.timestamp;
      out.push({ kind: "curated", key: entry.target.address, sortTs, entry });
    }
    for (const row of extraRows) {
      out.push({ kind: "extra", key: row.target, sortTs: row.timestamp, row });
    }
    out.sort((a, b) => b.sortTs - a.sortTs);
    return out;
  }, [curatedRows, extraRows]);

  const filtered = useMemo(
    () =>
      unified.filter((u) => {
        if (u.kind === "curated") {
          const name =
            (u.entry.data?.audited && u.entry.data.report
              ? (u.entry.data.report.contract_name as string | undefined)
              : undefined) ?? u.entry.target.label;
          return matches(query, u.entry.target.address, name, u.entry.target.label);
        }
        return matches(query, u.row.target, u.row.contract_name);
      }),
    [unified, query],
  );

  const totalAudited =
    curatedRows.filter((r) => r.data?.audited).length + extraRows.length;
  const totalShown = unified.length;
  const shownAfterFilter = filtered.length;
  const freshness = cache.data?.freshness_s ?? null;

  return (
    <section className="panel flex flex-col h-full">
      <header className="px-3 py-2 row-divider flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-xs uppercase tracking-wider text-text-primary">
          <Tip text="Every contract MantleProof has published an audit for, newest first. Each row carries a verifiable audit hash (rootHash) on Mantle; click into a row to see severity, findings, evidence, and the integrity check.">
            Audited contracts ({query ? `${shownAfterFilter}/${totalShown}` : totalShown})
          </Tip>
        </h2>
        <span className="font-mono text-[10px] text-text-muted">
          {totalAudited}/{totalShown} audited · {freshnessText(freshness)}
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
        {filtered.map((u) => {
          if (u.kind === "curated") {
            const { target, data, isLoading, error } = u.entry;
            const isAudited = data?.audited === true;
            const anchor = isAudited && data ? data.anchor : null;
            const report = isAudited && data ? data.report : null;
            const severity = anchor?.severity ?? "info";
            const findingCount = Array.isArray(report?.findings)
              ? (report!.findings as unknown[]).length
              : 0;
            return (
              <li key={u.key}>
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
          }
          const row = u.row;
          return (
            <li key={u.key}>
              <Link
                to={`/contract/${row.target}`}
                className="block px-3 py-3 row-divider hover:bg-panel-hi transition-colors"
              >
                <div className="flex items-center gap-2">
                  <StatusDot status="complete" />
                  <Address value={row.target} chainId={chainId} withScanLink />
                  <span className="ml-auto">
                    <Timestamp
                      epochSeconds={row.timestamp}
                      className="text-text-muted text-[11px]"
                    />
                  </span>
                </div>
                {row.contract_name && (
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="text-text-primary">{row.contract_name}</span>
                  </div>
                )}
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
          );
        })}
      </ul>

      <footer className="px-3 py-2 row-divider text-[10px] text-text-muted">
        Newest anchor first. Demo targets stay visible; cache rows arrive as the
        indexer picks them up.
      </footer>
    </section>
  );
}
