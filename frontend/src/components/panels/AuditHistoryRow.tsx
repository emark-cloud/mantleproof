/**
 * AuditHistoryRow — docs/design.md §6.2 audit history.
 *
 * One row per audit. rootHash links to /audit/:rootHash. The current MVP
 * only exposes the LATEST audit per target on-chain (registry.getAudit returns
 * the head only; full history would require event-log scanning, which we'll
 * wire when T29 indexes events). The current row is rendered from the live
 * envelope; older rows from event-log scan if available.
 */
import { Link } from "react-router-dom";
import { HonestyLabel } from "../primitives/HonestyLabel";
import { Timestamp } from "../primitives/Timestamp";

export interface AuditHistoryEntry {
  rootHash: string;
  tier?: number;
  timestamp: number;
  source: string; // "live", "cache refresh", "agent-triggered"
  label?: string;
}

export function AuditHistoryRow({ entry }: { entry: AuditHistoryEntry }) {
  return (
    <Link
      to={`/audit/${entry.rootHash}`}
      className="block px-4 py-2 row-divider hover:bg-panel-hi grid grid-cols-[80px_60px_1fr_160px_120px] gap-3 items-center text-[12px] font-mono"
    >
      <Timestamp epochSeconds={entry.timestamp} className="text-text-secondary" />
      <span className="text-text-muted">tier {entry.tier ?? "?"}</span>
      <span className="text-accent truncate" title={entry.rootHash}>
        {entry.rootHash.slice(0, 10)}…{entry.rootHash.slice(-6)}
      </span>
      <span className="text-text-muted">{entry.source}</span>
      {entry.label && <HonestyLabel label={entry.label} />}
    </Link>
  );
}
