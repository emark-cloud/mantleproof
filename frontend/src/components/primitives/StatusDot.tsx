/**
 * StatusDot — docs/design.md §7 (primitives) + §3 (status colors).
 *
 * 8px circle, color-coded. The ONLY looping animation in the product
 * (`pulse-running`, §8) lives on `status="running"`. Color is never the only
 * signal — `aria-label` carries the status word for screen readers (§10).
 */
import type { CSSProperties } from "react";

export type Status = "complete" | "pending" | "running" | "skipped" | "failed";

const COLOR: Record<Status, string> = {
  complete: "var(--status-complete)",
  pending: "var(--status-pending)",
  running: "var(--status-running)",
  skipped: "var(--status-skipped)",
  failed: "var(--status-failed)",
};

export function StatusDot({ status, size = 8 }: { status: Status; size?: number }) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    background: COLOR[status],
    display: "inline-block",
    flexShrink: 0,
  };
  const className = status === "running" ? "animate-pulse-running" : undefined;
  return (
    <span
      role="img"
      aria-label={`status: ${status}`}
      className={className}
      style={style}
    />
  );
}
