/**
 * X402ReceiptPanel — "PAID AUDIT · x402 RECEIPT" card.
 *
 * Shown on a contract's audit page when the engine attached an `x402` block
 * (i.e. this audit was funded via the `POST /x402/audit/{addr}` paywall).
 * Ties three honest facts together: which agent paid (Base address), the
 * payment tx on Base, and the anchor tx on Mantle — the cross-chain pair
 * that produced the audit being shown.
 *
 * No new chain config: explorer URLs come from the shared `lib/explorers.ts`
 * (`TxLink` + `Address` already know Base 8453 and Mantle 5000). Dark-only,
 * no spinners, no emoji, ASCII only — per `docs/design.md`.
 */
import { Link } from "react-router-dom";
import type { Severity, X402Receipt } from "../../lib/api";
import { Address } from "../primitives/Address";
import { SeverityBadge } from "../primitives/SeverityBadge";
import { TxLink } from "../primitives/TxLink";

function shortHash(h: string, head = 6, tail = 4): string {
  if (!h || !h.startsWith("0x") || h.length < head + tail + 4) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

function chainLabel(chain: string): string {
  // Capitalize for display ("base" -> "Base", "mantle" -> "Mantle") without
  // affecting the engine-emitted value the row carries.
  return chain.charAt(0).toUpperCase() + chain.slice(1);
}

export function X402ReceiptPanel({ receipt }: { receipt: X402Receipt }) {
  const usdc = (Number(receipt.amount_base_units) / 1e6).toFixed(2);
  return (
    <section className="panel">
      <header className="px-4 py-3 row-divider">
        <h3 className="font-mono text-xs uppercase tracking-wider text-text-primary">
          paid audit · x402 receipt
        </h3>
      </header>

      <dl className="px-4 py-3 grid grid-cols-[7rem_1fr] gap-y-2 text-[12px] font-mono items-center">
        <dt className="text-text-muted">paying agent</dt>
        <dd>
          {receipt.payer ? (
            <Address
              value={receipt.payer}
              chainId={receipt.payment_chain_id}
              withScanLink
            />
          ) : (
            <span className="text-text-muted">unknown</span>
          )}
        </dd>

        <dt className="text-text-muted">amount</dt>
        <dd className="text-text-primary">{usdc} USDC</dd>

        <dt className="text-text-muted">payment</dt>
        <dd className="flex items-center gap-2">
          {receipt.payment_tx ? (
            <>
              <TxLink hash={receipt.payment_tx} chainId={receipt.payment_chain_id} />
              <span className="text-text-muted">{chainLabel(receipt.payment_chain)}</span>
            </>
          ) : (
            <span className="text-sev-high">
              {receipt.settle_error ?? "no payment tx"}
            </span>
          )}
        </dd>

        <dt className="text-text-muted">anchor</dt>
        <dd className="flex items-center gap-2">
          {receipt.anchor_tx ? (
            <>
              <TxLink hash={receipt.anchor_tx} chainId={receipt.anchor_chain_id} />
              <span className="text-text-muted">{chainLabel(receipt.anchor_chain)}</span>
            </>
          ) : (
            <span className="text-text-muted">(none)</span>
          )}
        </dd>

        <dt className="text-text-muted">audit</dt>
        <dd className="flex items-center gap-2">
          <SeverityBadge severity={receipt.severity as Severity} />
          <Link
            to={`/audit/${receipt.root_hash}`}
            className="text-text-secondary hover:text-accent inline-flex items-center gap-1"
            title={receipt.root_hash}
          >
            <span>{shortHash(receipt.root_hash)}</span>
            <span aria-hidden>↗</span>
          </Link>
        </dd>
      </dl>
    </section>
  );
}
