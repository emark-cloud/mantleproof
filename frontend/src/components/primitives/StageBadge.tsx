/**
 * StageBadge — docs/plan-high-leverage-improvements.md Item 3 (visibility row:
 * "per-finding `stage` + `sub_detector` badges in audit view").
 *
 * Lifecycle stage tag deterministically derived from a finding's sub-detector
 * slug (engine `checks/taxonomy.py:stage_of`). Color-coded per the plan —
 * configuration → info (grey), economic → amber (medium), exploitation → red
 * (high) — so a deployer-agent (and a judge skimming) can prioritize at a
 * glance: block on exploitation, warn on economic, log on configuration.
 *
 * Outline-only pill, small-caps mono, to sit beside SeverityBadge + HonestyLabel.
 */

export type Stage = "configuration" | "economic" | "exploitation";

const SPEC: Record<Stage, { color: string; explainer: string }> = {
  configuration: {
    color: "var(--sev-info)",
    explainer:
      "STAGE configuration — a wiring / setup mistake (e.g. missing chain-ID, unguarded transfer hook). Lowest urgency; log it.",
  },
  economic: {
    color: "var(--sev-medium)",
    explainer:
      "STAGE economic — a value/accounting hazard (e.g. balance-snapshot under rebase, sUSDe cooldown ignored). Warn before acting.",
  },
  exploitation: {
    color: "var(--sev-high)",
    explainer:
      "STAGE exploitation — directly exploitable (e.g. missing bin bounds, no slippage guard, stale rate read). Block on this.",
  },
};

export function StageBadge({
  stage,
  className = "",
}: {
  stage: Stage | string;
  className?: string;
}) {
  const lower = (stage || "").toLowerCase() as Stage;
  const spec = SPEC[lower];
  if (!spec) return null; // unknown / empty stage → render nothing
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.15em] px-1.5 py-0.5 cursor-help ${className}`}
      style={{ color: spec.color, border: `1px solid ${spec.color}`, lineHeight: 1 }}
      title={spec.explainer}
    >
      {lower}
    </span>
  );
}
