/**
 * Tip — minimal inline tooltip primitive.
 *
 * Browser-native `title=` attribute (no popover library, no Radix, no portal —
 * keeps the bundle flat and the SR/keyboard semantics built-in). A faint
 * dotted underline cues that an explainer is available; hover/focus reveals
 * the native tooltip. Same `title=` pattern is already used by `Address`,
 * `TxLink`, `Timestamp`, `HonestyLabel`, `JudgeStepCard`, `AuditHistoryRow`,
 * `AgentIdentityHeader` — this just makes it a first-class primitive.
 */
import type { ReactNode } from "react";

export function Tip({
  text,
  children,
  underline = true,
  className = "",
}: {
  text: string;
  children: ReactNode;
  /** Set false when the wrapped element already shows its purpose visually. */
  underline?: boolean;
  className?: string;
}) {
  return (
    <span
      title={text}
      className={
        `${underline ? "border-b border-dotted border-text-muted" : ""} ` +
        `cursor-help ${className}`
      }
    >
      {children}
    </span>
  );
}
