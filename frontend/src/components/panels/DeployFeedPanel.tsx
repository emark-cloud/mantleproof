/**
 * DeployFeedPanel — docs/design.md §6.1 (left column).
 *
 * Polls `/api/feed` for recent contract creations classified by the T29
 * deploy-feed walker. Honest cold-state: if the indexer hasn't run yet
 * (`freshness_s == null` and `items == []`), we render the prior
 * placeholder (curated audited targets + a couple of greyed-out skipped
 * rows) and label the column as "indexer cold — run cache-warmer". The
 * panel never fabricates rows.
 */
import { useQuery } from "@tanstack/react-query";
import { StatusDot } from "../primitives/StatusDot";
import { Address } from "../primitives/Address";
import { Timestamp } from "../primitives/Timestamp";
import { Tip } from "../primitives/Tip";
import { getFeed, type FeedItem } from "../../lib/api";
import { KNOWN_TARGETS, MANTLE_CHAIN_ID } from "../../lib/contracts";

type ClsStatus = "complete" | "pending" | "running" | "skipped" | "failed";

const CLASSIFICATION_STATUS: Record<FeedItem["classification"], ClsStatus> = {
  audited: "complete",
  queued: "pending",
  "skipped:template": "skipped",
  "skipped:factory": "skipped",
  unknown: "failed",
};

const CLASSIFICATION_LABEL: Record<FeedItem["classification"], string> = {
  audited: "audited · in priority cache",
  queued: "queued for tier 2",
  "skipped:template": "skipped — ERC-20 clone (template)",
  "skipped:factory": "skipped — factory child",
  unknown: "bytecode unreadable — review",
};

function freshnessText(s: number | null): string {
  if (s === null) return "indexer cold (run cache-warmer)";
  if (s < 60) return `refreshed ${s}s ago`;
  if (s < 3600) return `refreshed ${Math.floor(s / 60)}m ago`;
  return `refreshed ${Math.floor(s / 3600)}h ago`;
}

export function DeployFeedPanel({ chainId = MANTLE_CHAIN_ID }: { chainId?: number }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["feed"],
    queryFn: () => getFeed(50),
    refetchInterval: 30_000,
    retry: 1,
  });

  const isCold = !data || (data.items.length === 0 && data.freshness_s === null);

  return (
    <aside className="panel flex flex-col h-full">
      <header className="px-3 py-2 row-divider flex items-baseline justify-between">
        <h2 className="font-mono text-xs uppercase tracking-wider text-text-primary">
          <Tip text="Live stream of contract creations on Mantle mainnet. Most rows are greyed-out 'skipped' (template proxies, factory children) — we don't pretend to audit everything. Indexed by the T29 deploy-feed walker.">
            Deploy feed
          </Tip>
        </h2>
        <span className="font-mono text-[10px] text-text-muted flex items-center gap-1">
          {isCold ? (
            <>
              <StatusDot status="pending" size={6} /> indexer cold
            </>
          ) : (
            <>
              <StatusDot status="complete" size={6} /> {freshnessText(data?.freshness_s ?? null)}
            </>
          )}
        </span>
      </header>

      {isLoading && !data && (
        <div className="px-3 py-3 text-[11px] text-text-muted font-mono">
          fetching /api/feed…
        </div>
      )}

      {error && (
        <div className="px-3 py-3 text-[11px] text-sev-high font-mono">
          /api/feed unreachable — {(error as Error).message}
        </div>
      )}

      {isCold ? (
        <ColdFallback chainId={chainId} />
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {data!.items.map((item) => {
            const status = CLASSIFICATION_STATUS[item.classification] ?? "failed";
            return (
              <li
                key={item.address + item.tx_hash}
                className="px-3 py-2 row-divider animate-feed-row-insert"
              >
                <div className="flex items-center gap-2 text-xs">
                  <StatusDot status={status} />
                  <Address value={item.address} chainId={chainId} />
                  <span className="ml-auto">
                    <Timestamp epochSeconds={item.timestamp} className="text-text-muted text-[11px]" />
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-text-secondary">
                  {CLASSIFICATION_LABEL[item.classification] ?? item.classification}
                </div>
                <div className="mt-0.5 text-[10px] text-text-muted">
                  block {item.block_number} · deployer{" "}
                  <Address value={item.deployer} chainId={chainId} head={4} tail={4} />
                </div>
              </li>
            );
          })}
          {data!.items.length === 0 && (
            <li className="px-3 py-3 text-[11px] text-text-muted font-mono">
              no creations in the last window
            </li>
          )}
        </ul>
      )}
    </aside>
  );
}

function ColdFallback({ chainId }: { chainId: number }) {
  return (
    <>
      <div className="px-3 py-2 row-divider text-[11px] text-text-muted font-mono">
        Deploy stream comes online after the cache-warmer cron runs. Showing the
        curated audited set so the column carries signal.
      </div>
      <ul className="flex-1 overflow-y-auto">
        {KNOWN_TARGETS.map((t) => (
          <li key={t.address} className="px-3 py-2 row-divider animate-feed-row-insert">
            <div className="flex items-center gap-2 text-xs">
              <StatusDot status="complete" />
              <Address value={t.address} chainId={chainId} />
              <Timestamp epochSeconds={0} className="ml-auto text-text-muted" />
            </div>
            <div className="text-[11px] text-text-secondary mt-0.5">{t.label}</div>
            <div className="text-[10px] text-text-muted mt-0.5">audited · in priority cache</div>
          </li>
        ))}
        <li className="px-3 py-2 row-divider opacity-60">
          <div className="flex items-center gap-2 text-xs">
            <StatusDot status="skipped" />
            <span className="font-mono text-text-muted">0x…</span>
          </div>
          <div className="text-[11px] text-text-disabled mt-0.5">
            skipped — ERC-20 clone (template)
          </div>
        </li>
        <li className="px-3 py-2 row-divider opacity-60">
          <div className="flex items-center gap-2 text-xs">
            <StatusDot status="skipped" />
            <span className="font-mono text-text-muted">0x…</span>
          </div>
          <div className="text-[11px] text-text-disabled mt-0.5">
            skipped — factory child
          </div>
        </li>
      </ul>
    </>
  );
}
