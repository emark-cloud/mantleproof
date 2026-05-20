/**
 * TxLink — docs/design.md §7. Link to Mantlescan tx page with truncated hash
 * and external-arrow icon. Chain id selects the explorer (Mantlescan mainnet,
 * Routescan testnet) — same map as `Address`, kept duplicated rather than
 * imported to keep this file zero-dep.
 */

const SCAN_BASE: Record<number, string> = {
  5000: "https://mantlescan.xyz/tx",
  5003: "https://5003.testnet.routescan.io/tx",
};

function shorten(hash: string, head = 6, tail = 4): string {
  if (!hash || !hash.startsWith("0x") || hash.length < head + tail + 4) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function TxLink({
  hash,
  chainId = 5000,
  className = "",
  label,
}: {
  hash: string;
  chainId?: number;
  className?: string;
  label?: string;
}) {
  const base = SCAN_BASE[chainId];
  if (!base) return <span className={`font-mono ${className}`}>{shorten(hash)}</span>;
  return (
    <a
      href={`${base}/${hash}`}
      target="_blank"
      rel="noreferrer"
      className={`font-mono inline-flex items-center gap-1 text-text-secondary hover:text-accent ${className}`}
      title={hash}
    >
      <span>{label ?? shorten(hash)}</span>
      <span aria-hidden>↗</span>
    </a>
  );
}
