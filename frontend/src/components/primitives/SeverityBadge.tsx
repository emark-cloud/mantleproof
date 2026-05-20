/**
 * SeverityBadge — docs/design.md §7 + §3.
 *
 * Pill with severity color + uppercase label. Variants high/medium/low/info/clean.
 * Text is always shown (color is never the only signal — §10).
 */

export type Severity = "high" | "medium" | "low" | "info" | "clean";

const TOKEN: Record<Severity, { color: string; label: string }> = {
  high: { color: "var(--sev-high)", label: "HIGH" },
  medium: { color: "var(--sev-medium)", label: "MEDIUM" },
  low: { color: "var(--sev-low)", label: "LOW" },
  info: { color: "var(--sev-info)", label: "INFO" },
  clean: { color: "var(--sev-clean)", label: "CLEAN" },
};

export function SeverityBadge({
  severity,
  count,
  className = "",
}: {
  severity: Severity | string;
  count?: number;
  className?: string;
}) {
  const key = (severity || "info").toLowerCase() as Severity;
  const t = TOKEN[key] ?? TOKEN.info;
  return (
    <span
      className={`font-mono text-xs uppercase tracking-wider px-1.5 py-0.5 inline-flex items-center gap-1 ${className}`}
      style={{ color: t.color, border: `1px solid ${t.color}`, lineHeight: 1 }}
      aria-label={`severity ${t.label}`}
    >
      <span>{t.label}</span>
      {typeof count === "number" && (
        <span className="text-text-secondary">· {count}</span>
      )}
    </span>
  );
}
