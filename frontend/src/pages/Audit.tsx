/**
 * /audit/:rootHash — docs/design.md §6.4 audit permalink.
 *
 * The single most credibility-purchasing screenshot. Single rootHash, three
 * verifiability paths (download JSON, on-chain explorer, IPFS). For now we
 * cannot reverse rootHash → target without an indexer (T29), so we search the
 * curated set; if the rootHash isn't in our hand list, we show an honest
 * "rootHash not indexed yet — full reverse-lookup ships with T29".
 */
import { Link, useParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { EngineStatusFooter } from "../components/composite/EngineStatusFooter";
import { SeverityBadge } from "../components/primitives/SeverityBadge";
import { Address } from "../components/primitives/Address";
import { Timestamp } from "../components/primitives/Timestamp";
import { StatusDot } from "../components/primitives/StatusDot";
import { FindingCard } from "../components/panels/FindingCard";
import { X402ReceiptPanel } from "../components/panels/X402ReceiptPanel";
import { getAudit, type AuditResponse } from "../lib/api";
import { KNOWN_TARGETS, MANTLE_CHAIN_ID } from "../lib/contracts";

export default function Audit() {
  const { rootHash = "" } = useParams();
  const audits = useQueries({
    queries: KNOWN_TARGETS.map((t) => ({
      queryKey: ["audit", t.address],
      queryFn: () => getAudit(t.address),
    })),
  });
  const matched = audits
    .map((q) => q.data)
    .find((d): d is Extract<AuditResponse, { audited: true }> =>
      d?.audited === true && d.anchor.root_hash.toLowerCase() === rootHash.toLowerCase(),
    );

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="border-b border-border-strong bg-panel px-4 py-2">
        <Link to="/app" className="font-mono text-[11px] text-text-secondary hover:text-accent">
          ← dashboard
        </Link>
      </nav>
      <main className="flex-1 px-4 py-4 max-w-4xl w-full mx-auto flex flex-col gap-4">
        <header>
          <div className="font-mono text-[11px] text-text-muted uppercase tracking-wider">
            audit · audit hash (rootHash)
          </div>
          <div className="mt-1 font-mono text-sm text-accent break-all">{rootHash}</div>
        </header>

        {!matched ? (
          <div className="panel px-4 py-4 font-mono text-sm">
            <div className="flex items-center gap-2">
              <StatusDot status="pending" />
              <span className="text-text-secondary">
                This audit hash isn't in the curated set yet.
              </span>
            </div>
            <div className="mt-2 text-[11px] text-text-muted">
              Looking up an audit hash → target contract needs the event
              indexer, which is still warming up. For now, only the{" "}
              {KNOWN_TARGETS.length} contracts listed on the dashboard resolve
              here.
            </div>
            <div className="mt-3 text-[11px] text-text-muted">
              You can still verify it on-chain by calling
              <span className="text-accent"> registry.getAudit(target)</span>{" "}
              for the matching contract.
            </div>
          </div>
        ) : (
          <ResolvedAudit data={matched} />
        )}
      </main>
      <EngineStatusFooter />
    </div>
  );
}

function ResolvedAudit({ data }: { data: Extract<AuditResponse, { audited: true }> }) {
  const { anchor, integrity, report, target, ipfs_error } = data;
  const findings = report?.findings ?? [];
  const ipfsHttp = anchor.ipfs_uri?.replace("ipfs://", "https://w3s.link/ipfs/") ?? "";
  return (
    <>
      <section className="panel px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] font-mono">
        <Field k="Target">
          <Link to={`/contract/${target}`} className="hover:text-accent">
            <Address value={target} chainId={MANTLE_CHAIN_ID} withScanLink />
          </Link>
        </Field>
        <Field k="Anchored">
          <Timestamp epochSeconds={anchor.timestamp} className="text-text-primary" />
          <span className="ml-2 text-text-muted">submitter</span>{" "}
          <Address value={anchor.submitter} chainId={MANTLE_CHAIN_ID} />
        </Field>
        <Field k="IPFS">
          <a href={ipfsHttp} target="_blank" rel="noreferrer" className="text-accent break-all">
            {anchor.ipfs_cid}
          </a>
        </Field>
        <Field k="Tier · provider">
          tier {report?.tier ?? "?"} · {report?.provider ?? "—"}
        </Field>
        <Field k="Severity">
          <SeverityBadge severity={anchor.severity} count={findings.length} />
        </Field>
        <Field k="Integrity">
          {integrity.match === true ? (
            <span className="text-sev-clean" title="keccak256(canonical(report)) == on-chain rootHash">
              ✓ report matches on-chain hash
            </span>
          ) : integrity.match === false ? (
            <span className="text-sev-high">✗ MISMATCH — possible tamper</span>
          ) : (
            <span className="text-text-muted">IPFS unreachable ({ipfs_error ?? "unknown"})</span>
          )}
        </Field>
        {report?.hallucination_guard?.public_note && (
          <div className="md:col-span-2 text-text-secondary mt-1">
            {report.hallucination_guard.public_note}
          </div>
        )}
      </section>

      {data.x402 && <X402ReceiptPanel receipt={data.x402} />}

      <section className="flex items-center gap-2 flex-wrap font-mono text-[11px]">
        {ipfsHttp && (
          <a
            href={ipfsHttp}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 border border-accent text-accent hover:bg-accent-glow"
          >
            download json ↗
          </a>
        )}
        <a
          href={data.explorer.target}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 border border-border-strong text-text-secondary hover:border-accent hover:text-accent"
        >
          verify target on mantlescan ↗
        </a>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-xs uppercase tracking-wider text-text-primary">
          Findings ({findings.length})
        </h2>
        {findings.length === 0 ? (
          <div className="panel px-4 py-3 font-mono text-sm text-text-secondary">
            No findings — audit clean.
          </div>
        ) : (
          findings.map((f, i) => <FindingCard key={i} finding={f} />)
        )}
      </section>
    </>
  );
}

function Field({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{k}</div>
      <div className="mt-0.5 text-text-primary">{children}</div>
    </div>
  );
}
