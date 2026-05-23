/**
 * TxLink — docs/design.md §7. Link to a block-explorer tx page with truncated
 * hash and external-arrow icon. `chainId` selects the explorer via the shared
 * `lib/explorers.ts` map (Mantle 5000/5003, Base 8453/84532 — the latter pair
 * is needed for x402 payment-tx links).
 */
import { txUrl } from "../../lib/explorers";

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
  const href = txUrl(chainId, hash);
  if (!href) return <span className={`font-mono ${className}`}>{shorten(hash)}</span>;
  return (
    <a
      href={href}
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
