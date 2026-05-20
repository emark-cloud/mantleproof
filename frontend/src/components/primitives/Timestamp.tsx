/**
 * Timestamp — docs/design.md §7. Relative ("14m ago") with absolute UTC hover.
 *
 * Pure, deterministic relative formatter (no `date-fns` / `intl` dependency).
 * Re-renders are caller-driven; for live "0:23 ago" tickers, wrap in a hook
 * that re-renders every 15s (the AgentQueryPanel does this).
 */

export function relativeFromNow(epochSeconds: number, now: number = Date.now()): string {
  if (!epochSeconds) return "unknown";
  const diff = Math.floor(now / 1000 - epochSeconds);
  if (diff < 0) return "in the future";
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function isoUtc(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().replace(".000Z", "Z");
}

export function Timestamp({
  epochSeconds,
  className = "",
  now,
}: {
  epochSeconds: number;
  className?: string;
  now?: number;
}) {
  if (!epochSeconds) return <span className={className}>unknown</span>;
  return (
    <span className={`font-mono ${className}`} title={isoUtc(epochSeconds)}>
      {relativeFromNow(epochSeconds, now)}
    </span>
  );
}
