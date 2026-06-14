/**
 * PriorityCachePanel — docs/design.md §6.1 (middle column, headline panel).
 *
 * Renders EVERY audit anchored to the live registry, newest first, read from
 * the T29 cache-warmer index (`/api/cache`) — the on-chain `AuditSubmitted`
 * stream the walker keeps indexed. The curated demo three (`KNOWN_TARGETS`)
 * are unioned in (so they always show, even if the walker hasn't indexed them
 * yet) and their friendly label/provenance is overlaid on the feed row. Each
 * visible row is then enriched via `/api/audit/{addr}` for tier + finding count
 * + integrity. The cache row supplies severity/name/timestamp so rows render
 * immediately, before the per-audit fetch lands.
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

/** Curated demo targets keyed by lowercased address for overlay lookup. */
const CURATED = new Map(KNOWN_TARGETS.map((t) => [t.address.toLowerCase(), t]));

/** One target to render: address + display metadata + optional cache-feed row. */
type PanelTarget = {
  address: `0x${string}`;
  label: string;
  provenance: string;
  cache?: CacheItem;
};

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
  // Primary source: the on-chain anchored-audit index (T29 cache-warmer).
  const cacheQ = useQuery({
    queryKey: ["cache-feed"],
    queryFn: () => getCacheFeed(50),
    staleTime: 30_000,
    retry: 1,
  });

  // Merge feed ∪ curated. Feed rows come first (already newest-first from the
  // engine); curated targets not yet indexed are appended so they never vanish.
  const targets = useMemo<PanelTarget[]>(() => {
    const seen = new Set<string>();
    const out: PanelTarget[] = [];
    for (const it of cacheQ.data?.items ?? []) {
      const key = it.target.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const cur = CURATED.get(key);
      out.push({
        address: it.target as `0x${string}`,
        label: cur?.label ?? it.contract_name ?? "unverified contract",
        provenance: cur?.provenance ?? `anchored on Mantle mainnet · block ${it.block_number}`,
        cache: it,
      });
    }
    for (const t of KNOWN_TARGETS) {
      if (!seen.has(t.address.toLowerCase())) out.push({ ...t });
    }
    return out;
  }, [cacheQ.data]);

  // Enrich each target with the full audit envelope (tier, finding count, integrity).
  const queries = useQueries({
    queries: targets.map((t) => ({
      queryKey: ["audit", t.address],
      queryFn: () => getAudit(t.address),
      staleTime: 30_000,
      retry: 1,
    })),
  });

  const rows = useMemo(() => {
    return targets.map((t, i) => {
      const q = queries[i];
      return {
        target: t,
        data: q?.data as AuditResponse | undefined,
        isLoading: q?.isLoading,
        error: q?.error,
      };
    });
  }, [targets, queries]);

  const [query, setQuery] = useState("");

  // Sort by on-chain anchor timestamp, newest first.
  //   - loaded + audited → anchor.timestamp
  //   - cache row only   → cache.timestamp (renders correctly before enrich lands)
  //   - still loading    → +Infinity (pin to top so loading state is visible)
  //   - not audited      → 0 (sink to bottom; honest)
  const sorted = useMemo(() => {
    const withTs = rows.map((entry) => {
      let sortTs = 0;
      if (entry.data?.audited && entry.data.anchor) sortTs = entry.data.anchor.timestamp;
      else if (entry.target.cache) sortTs = entry.target.cache.timestamp;
      else if (entry.isLoading) sortTs = Number.POSITIVE_INFINITY;
      return { entry, sortTs };
    });
    withTs.sort((a, b) => b.sortTs - a.sortTs);
    return withTs.map((r) => r.entry);
  }, [rows]);

  const filtered = useMemo(
    () =>
      sorted.filter((entry) => {
        const name =
          (entry.data?.audited && entry.data.report
            ? (entry.data.report.contract_name as string | undefined)
            : undefined) ??
          entry.target.cache?.contract_name ??
          entry.target.label;
        return matches(query, entry.target.address, name, entry.target.label);
      }),
    [sorted, query],
  );

  // "audited" = has a cache row (anchored on-chain) or a resolved audited envelope.
  const totalAudited = rows.filter((r) => r.data?.audited || r.target.cache).length;
  const totalShown = rows.length;
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
        {cacheQ.isLoading && totalShown === 0 && (
          <li className="px-3 py-4 font-mono text-[11px] text-text-muted">
            reading anchored-audit index…
          </li>
        )}
        {query && shownAfterFilter === 0 && (
          <li className="px-3 py-4 font-mono text-[11px] text-text-muted">
            no audited contracts match <span className="text-text-secondary">{query}</span>
          </li>
        )}
        {filtered.map((entry) => {
          const { target, data, isLoading, error } = entry;
          const cache = target.cache;
          const isAudited = data?.audited === true;
          const anchor = isAudited && data ? data.anchor : null;
          const report = isAudited && data ? data.report : null;
          // Prefer the enriched envelope; fall back to the cache-feed row so a
          // freshly-indexed audit renders fully before /api/audit resolves.
          const severity = anchor?.severity ?? cache?.severity ?? "info";
          const anchorTs = anchor?.timestamp ?? cache?.timestamp ?? null;
          const auditCount = anchor?.audit_count ?? cache?.audit_count ?? null;
          const findingCount = Array.isArray(report?.findings)
            ? (report!.findings as unknown[]).length
            : undefined;
          const onChain = isAudited || Boolean(cache);
          return (
            <li key={target.address}>
              <Link
                to={`/contract/${target.address}`}
                className="block px-3 py-3 row-divider hover:bg-panel-hi transition-colors"
              >
                <div className="flex items-center gap-2">
                  <StatusDot
                    status={onChain ? "complete" : isLoading ? "running" : "skipped"}
                  />
                  <Address value={target.address} chainId={chainId} withScanLink />
                  <span className="ml-auto">
                    {anchorTs !== null && (
                      <Timestamp
                        epochSeconds={anchorTs}
                        className="text-text-muted text-[11px]"
                      />
                    )}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="text-text-primary">{target.label}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                  {onChain ? (
                    <>
                      <SeverityBadge severity={severity} count={findingCount} />
                      {report?.tier && (
                        <Tip text="Tier 1 = fast pattern-matching pass. Tier 2 = deeper LLM-reasoning pass.">
                          <span className="text-text-muted">tier {report.tier}</span>
                        </Tip>
                      )}
                      {auditCount !== null && (
                        <span className="text-text-muted">· {auditCount} audits</span>
                      )}
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
        Every audit anchored to the MantleProof registry on Mantle mainnet,
        newest anchor first. The three agent-to-agent demo audits are pinned in
        by name.
      </footer>
    </section>
  );
}
