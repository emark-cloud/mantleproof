/**
 * Address — docs/design.md §7. Truncated `0x39e8…a807`, click-to-copy,
 * hover tooltip with full address, optional external explorer link.
 *
 * Self-contained: uses `navigator.clipboard` when available, falls back to a
 * textarea hack on older browsers. No external copy library. The explorer
 * URL comes from the shared `lib/explorers.ts` (Mantle + Base).
 */
import { useState } from "react";
import { addressUrl } from "../../lib/explorers";

function shorten(addr: string, head = 6, tail = 4): string {
  if (!addr || !addr.startsWith("0x") || addr.length < head + tail + 4) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

export function Address({
  value,
  chainId = 5000,
  withScanLink = false,
  head = 6,
  tail = 4,
  className = "",
}: {
  value: string;
  chainId?: number;
  withScanLink?: boolean;
  head?: number;
  tail?: number;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const scan = addressUrl(chainId, value);
  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await copy(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <span className={`font-mono inline-flex items-center gap-1 ${className}`} title={value}>
      <button
        type="button"
        onClick={handleCopy}
        className="hover:text-accent transition-colors"
        aria-label={`copy address ${value}`}
      >
        {shorten(value, head, tail)}
      </button>
      {copied && <span className="text-accent text-xs">copied</span>}
      {withScanLink && scan && (
        <a
          href={scan}
          target="_blank"
          rel="noreferrer"
          className="text-text-muted hover:text-accent"
          aria-label="open on explorer"
          onClick={(e) => e.stopPropagation()}
        >
          ↗
        </a>
      )}
    </span>
  );
}
