/**
 * Tiny zero-dependency terminal styling. Honors NO_COLOR and non-TTY output.
 */
const useColor = process.env.NO_COLOR === undefined && process.stdout.isTTY;

const wrap = (code: string) => (s: string) =>
  useColor ? `\x1b[${code}m${s}\x1b[0m` : s;

export const c = {
  green: wrap("32"),
  red: wrap("31"),
  yellow: wrap("33"),
  cyan: wrap("36"),
  dim: wrap("2"),
  bold: wrap("1"),
};

export const PASS = c.green("[✓]"); // [✓]
export const FAIL = c.red("[✗]"); // [✗]
export const SKIP = c.dim("[–]"); // [–]

/** Pad a label to a fixed column so the detail text aligns. */
export function row(symbol: string, label: string, detail = ""): string {
  const LABEL_W = 42;
  const plain = label.length;
  const pad = plain < LABEL_W ? " ".repeat(LABEL_W - plain) : " ";
  return `  ${symbol} ${label}${pad}${c.dim(detail)}`;
}

export function shortHex(h: string, lead = 10, tail = 6): string {
  if (h.length <= lead + tail + 2) return h;
  return `${h.slice(0, lead)}…${h.slice(-tail)}`;
}

export function explorerAddr(base: string, addr: string): string {
  return `${base}/address/${addr}`;
}
