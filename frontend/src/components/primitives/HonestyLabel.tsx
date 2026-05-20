/**
 * HonestyLabel — docs/design.md §7 + §3. Outline-only pill, small-caps mono.
 *
 * The five labels from CLAUDE.md "Every finding must carry exactly one":
 * VERIFIED / COMPUTED / ESTIMATED / EMULATED / LABELED. Hallucination guard
 * one-tier drops are recorded as the FINAL label here — this component shows
 * the label that was anchored on-chain, not the original pre-drop label.
 *
 * Tooltip carries the explainer + the one-tier-drop rule so a first-time
 * viewer doesn't need to leave the page to know what they're looking at.
 */

export type Label = "VERIFIED" | "COMPUTED" | "ESTIMATED" | "EMULATED" | "LABELED";

const SPEC: Record<Label, { color: string; explainer: string }> = {
  VERIFIED: {
    color: "var(--label-verified)",
    explainer:
      "VERIFIED — the strongest claim we make. The finding traces directly to on-chain bytecode or a verified source line. (The hallucination guard can drop a masked finding from VERIFIED to COMPUTED.)",
  },
  COMPUTED: {
    color: "var(--label-computed)",
    explainer:
      "COMPUTED — mathematically derived from the verified source. One tier below VERIFIED.",
  },
  ESTIMATED: {
    color: "var(--label-estimated)",
    explainer:
      "ESTIMATED — best-effort guess from pattern matching (the fast Tier-1 pass). The highest label Tier-1 ever issues.",
  },
  EMULATED: {
    color: "var(--label-emulated)",
    explainer:
      "EMULATED — derived from a local simulation. Used when re-running the code proves the behaviour.",
  },
  LABELED: {
    color: "var(--label-labeled)",
    explainer:
      "LABELED — a manual classification. This is the floor; the guard can't drop further.",
  },
};

export function HonestyLabel({
  label,
  className = "",
}: {
  label: Label | string;
  className?: string;
}) {
  const upper = (label || "").toUpperCase() as Label;
  const spec = SPEC[upper];
  const color = spec?.color ?? "var(--text-muted)";
  const explainer =
    spec?.explainer ?? `honesty label: ${upper} (unknown variant — first-time appearance)`;
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.15em] px-1.5 py-0.5 cursor-help ${className}`}
      style={{ color, border: `1px solid ${color}`, lineHeight: 1 }}
      title={explainer}
    >
      [{upper}]
    </span>
  );
}
