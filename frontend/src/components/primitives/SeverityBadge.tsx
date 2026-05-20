/**
 * SeverityBadge — docs/design.md §7 + §3.
 *
 * Pill with severity color + uppercase label. Variants high/medium/low/info/clean.
 * Text is always shown (color is never the only signal — §10). A `title=`
 * tooltip carries a plain-English explainer for first-time viewers; this is
 * the spec's "first-visit hero is the onboarding" rule extended to the data
 * cells themselves — the meaning travels with the component.
 */

export type Severity = "high" | "medium" | "low" | "info" | "clean";

const TOKEN: Record<
  Severity,
  { color: string; label: string; explainer: string }
> = {
  high: {
    color: "var(--sev-high)",
    label: "HIGH",
    explainer:
      "HIGH = exploitable now or near-certain to be (fund loss / control transfer / catastrophic state corruption).",
  },
  medium: {
    color: "var(--sev-medium)",
    label: "MEDIUM",
    explainer:
      "MEDIUM = logic flaw with real loss conditions, but not immediately exploitable.",
  },
  low: {
    color: "var(--sev-low)",
    label: "LOW",
    explainer:
      "LOW = deviation from best practice with limited impact.",
  },
  info: {
    color: "var(--sev-info)",
    label: "INFO",
    explainer:
      "INFO = informational; the audit ran but no defect was found.",
  },
  clean: {
    color: "var(--sev-clean)",
    label: "CLEAN",
    explainer:
      "CLEAN = audit ran, zero findings.",
  },
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
      className={`font-mono text-xs uppercase tracking-wider px-1.5 py-0.5 inline-flex items-center gap-1 cursor-help ${className}`}
      style={{ color: t.color, border: `1px solid ${t.color}`, lineHeight: 1 }}
      aria-label={`severity ${t.label}`}
      title={t.explainer}
    >
      <span>{t.label}</span>
      {typeof count === "number" && (
        <span className="text-text-secondary">· {count}</span>
      )}
    </span>
  );
}
