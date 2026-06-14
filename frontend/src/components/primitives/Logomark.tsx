/**
 * MantleProof logomark — the hexagonal shield + oracle-pulse mark from the
 * brand kit (`mantleproof_brand_kit.html` §02). Accent-on-dark variant; pair
 * with the wordmark at ≥24px display sizes per the brand usage rules. Hard
 * geometric edges, no rounding, no glow/shadow (brand kit "Don't" list).
 *
 * Decorative when shown next to the wordmark, so `aria-hidden`; the adjacent
 * text carries the accessible name.
 */
export function Logomark({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Outer hexagonal shield */}
      <path
        d="M16 2L28 8V20C28 25.5 22.5 29.5 16 30C9.5 29.5 4 25.5 4 20V8L16 2Z"
        fill="none"
        stroke="#00FFA3"
        strokeWidth="1.5"
      />
      {/* Inner shield — circuit-trace / audit mark */}
      <path
        d="M16 7L23 10.5V18C23 21.5 19.8 24.2 16 24.5C12.2 24.2 9 21.5 9 18V10.5L16 7Z"
        fill="#00FFA310"
        stroke="#00FFA3"
        strokeWidth="1"
      />
      {/* Oracle pulse dot */}
      <circle cx="16" cy="17" r="2.5" fill="#00FFA3" />
      <line
        x1="16"
        y1="12"
        x2="16"
        y2="14.5"
        stroke="#00FFA3"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
