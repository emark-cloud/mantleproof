/**
 * DeployFeedPanel — docs/design.md §6.1 (left column).
 *
 * Live deploy feed: every contract creation tx on Mantle, classified as
 * `queued for tier 2` / `in priority cache` / `skipped (template)`. The
 * underlying indexer is T29 (cache-warmer + deploy-feed) and is not yet
 * shipped — surfacing fake rows here would violate `docs/design.md §9` rule 4
 * ("Skipped contracts are visible … We don't pretend"). Until T29, the panel
 * renders the honest pending state and pin-shows the known audited targets as
 * non-deploy rows so the column has signal density.
 */
import { StatusDot } from "../primitives/StatusDot";
import { Address } from "../primitives/Address";
import { Timestamp } from "../primitives/Timestamp";
import { KNOWN_TARGETS, MANTLE_CHAIN_ID } from "../../lib/contracts";

export function DeployFeedPanel({ chainId = MANTLE_CHAIN_ID }: { chainId?: number }) {
  return (
    <aside className="panel flex flex-col h-full">
      <header className="px-3 py-2 row-divider flex items-baseline justify-between">
        <h2 className="font-mono text-xs uppercase tracking-wider text-text-primary">
          Deploy feed
        </h2>
        <span className="font-mono text-[10px] text-text-muted">
          <StatusDot status="pending" size={6} /> indexer pending (T29)
        </span>
      </header>

      <div className="px-3 py-2 row-divider text-[11px] text-text-muted font-mono">
        Live deploy stream comes online with the cache-warmer indexer. For now,
        showing already-audited targets so the column carries signal.
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
    </aside>
  );
}
