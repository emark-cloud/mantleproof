/**
 * HonestyLabel — docs/design.md §7 + §3. Outline-only pill, small-caps mono.
 *
 * The five labels from CLAUDE.md "Every finding must carry exactly one":
 * VERIFIED / COMPUTED / ESTIMATED / EMULATED / LABELED. Hallucination guard
 * one-tier drops are recorded as the FINAL label here — this component shows
 * the label that was anchored on-chain, not the original pre-drop label.
 */

export type Label = "VERIFIED" | "COMPUTED" | "ESTIMATED" | "EMULATED" | "LABELED";

const COLOR: Record<Label, string> = {
  VERIFIED: "var(--label-verified)",
  COMPUTED: "var(--label-computed)",
  ESTIMATED: "var(--label-estimated)",
  EMULATED: "var(--label-emulated)",
  LABELED: "var(--label-labeled)",
};

export function HonestyLabel({
  label,
  className = "",
}: {
  label: Label | string;
  className?: string;
}) {
  const upper = (label || "").toUpperCase() as Label;
  const color = COLOR[upper] ?? "var(--text-muted)";
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.15em] px-1.5 py-0.5 ${className}`}
      style={{ color, border: `1px solid ${color}`, lineHeight: 1 }}
      title={`honesty label: ${upper}`}
    >
      [{upper}]
    </span>
  );
}
