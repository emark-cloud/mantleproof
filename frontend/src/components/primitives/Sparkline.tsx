/**
 * Sparkline — docs/design.md §7. ASCII block characters only, no SVG.
 *
 * Renders an array of numbers as a single-line `▁▂▃▄▅▆▇█` sparkline. Empty /
 * all-zero arrays render as a flat row of `▁` rather than crashing — judges
 * will look at the hero before any real data ships and we want the layout
 * stable.
 */

const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function Sparkline({
  values,
  className = "",
  width,
}: {
  values: number[];
  className?: string;
  width?: number;
}) {
  if (!values.length) return <span className={className}>▁</span>;
  const display = typeof width === "number" ? values.slice(-width) : values;
  const max = Math.max(...display);
  const min = Math.min(...display);
  const range = max - min || 1;
  const chars = display.map((v) => {
    const norm = (v - min) / range;
    const idx = Math.min(BLOCKS.length - 1, Math.max(0, Math.round(norm * (BLOCKS.length - 1))));
    return BLOCKS[idx];
  });
  return (
    <span
      className={`font-mono leading-none tracking-tight ${className}`}
      aria-label={`sparkline ${display.length} values, min ${min}, max ${max}`}
    >
      {chars.join("")}
    </span>
  );
}
