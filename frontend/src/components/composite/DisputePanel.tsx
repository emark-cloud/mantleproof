/**
 * DisputePanel — list of disputes filed against a given audit rootHash.
 *
 * Reads `getDisputesForRoot(rootHash)` → `getDispute(id)` for each id, off
 * the live MantleProofRegistry. Pattern lifted from FeedbackPanel.tsx (T41):
 * two-pass useReadContracts that scales linearly with the dispute count,
 * skipped entirely on the empty case. Honest cold state: "no disputes yet"
 * with a link to file one rather than fabricated activity.
 */
import { Link } from "react-router-dom";
import { useReadContract, useReadContracts } from "wagmi";
import { Address } from "../primitives/Address";
import { Timestamp } from "../primitives/Timestamp";
import { Tip } from "../primitives/Tip";
import {
  DISPUTE_STATUS_BY_UINT,
  MANTLE_CHAIN_ID,
  REGISTRY_ADDRESS,
  registryAbi,
} from "../../lib/contracts";

type Dispute = {
  rootHash: `0x${string}`;
  findingIndex: bigint;
  disputer: `0x${string}`;
  counterClaimIpfs: string;
  counterStake: bigint;
  antiSpamFee: bigint;
  status: number;
  submittedAt: bigint;
  resolvedAt: bigint;
  reAuditRootHash: `0x${string}`;
};

function statusColor(status: number): string {
  if (status === 0) return "var(--status-disputed-pending)"; // PENDING — purple
  if (status === 3) return "var(--sev-clean)"; // RETRACTED — green for disputer
  if (status === 2) return "var(--sev-medium)"; // AMENDED — orange
  return "var(--status-disputed-final)"; // DISMISSED — grey
}

export function DisputePanel({ rootHash }: { rootHash: `0x${string}` }) {
  const chainId = MANTLE_CHAIN_ID;

  const { data: idsData, isLoading } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "getDisputesForRoot",
    args: [rootHash],
    chainId,
    query: { retry: false },
  });
  const ids = (idsData as readonly bigint[] | undefined) ?? [];

  const { data: disputesData } = useReadContracts({
    contracts: ids.map((id) => ({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: "getDispute" as const,
      args: [id] as const,
      chainId,
    })),
    query: { enabled: ids.length > 0 },
  });

  return (
    <section className="panel px-4 py-4">
      <h2 className="font-mono text-xs uppercase tracking-wider text-text-primary mb-2">
        <Tip
          text={
            "Live on-chain disputes against this audit. Filed via " +
            "MantleProofRegistry.submitDispute(rootHash, findingIndex, ipfsCID) " +
            "— permissionless. The oracle re-runs Tier 2 against the counter-claim and " +
            "posts DISMISSED / AMENDED / RETRACTED. RETRACTED slashes the audit's 2 MNT " +
            "stake to the disputer on-chain."
          }
        >
          Disputes ({ids.length})
        </Tip>
      </h2>
      {isLoading ? (
        <div className="font-mono text-[12px] text-text-muted">loading…</div>
      ) : ids.length === 0 ? (
        <div className="font-mono text-[12px] text-text-muted">
          No disputes filed against this audit.{" "}
          <Link
            to={`/dispute/new?root=${rootHash}`}
            className="text-accent hover:underline"
          >
            [dispute a finding →]
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {ids.map((id, i) => {
            const d = disputesData?.[i]?.result as Dispute | undefined;
            if (!d) {
              return (
                <div
                  key={id.toString()}
                  className="font-mono text-[11px] text-text-muted"
                >
                  dispute #{id.toString()} · loading…
                </div>
              );
            }
            const status = DISPUTE_STATUS_BY_UINT[d.status] ?? "pending";
            return (
              <article
                key={id.toString()}
                className="row-divider px-2 py-2 font-mono text-[12px] flex flex-col gap-1"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-text-secondary">
                    #{id.toString()} · finding [{d.findingIndex.toString()}]
                  </span>
                  <Address value={d.disputer} chainId={chainId} withScanLink />
                  <span
                    className="uppercase tracking-wider tabular-nums"
                    style={{ color: statusColor(d.status) }}
                  >
                    {status}
                  </span>
                  <span className="ml-auto text-text-muted text-[10px]">
                    filed <Timestamp epochSeconds={Number(d.submittedAt)} />
                    {d.resolvedAt > 0n && (
                      <>
                        {" "}
                        · resolved <Timestamp epochSeconds={Number(d.resolvedAt)} />
                      </>
                    )}
                  </span>
                </div>
                <div className="text-[11px] text-text-secondary truncate">
                  counter-claim:{" "}
                  <a
                    href={`https://gateway.pinata.cloud/ipfs/${d.counterClaimIpfs.replace(/^ipfs:\/\//, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline"
                  >
                    {d.counterClaimIpfs}
                  </a>
                </div>
                {d.reAuditRootHash !==
                  "0x0000000000000000000000000000000000000000000000000000000000000000" && (
                  <div className="text-[11px] text-text-muted">
                    re-audit:{" "}
                    <Link
                      to={`/audit/${d.reAuditRootHash}`}
                      className="text-accent hover:underline break-all"
                    >
                      {d.reAuditRootHash.slice(0, 18)}…
                    </Link>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <div className="mt-3 text-[10px] font-mono text-text-muted">
        Anyone can file a dispute against any Tier 2 finding — iNFT holders, the
        audited contract's deployer, or any human via a 0.10 USDC anti-spam fee on
        Base. Counter-stakes (MNT) are refunded on RETRACTED or AMENDED outcomes.
      </div>
    </section>
  );
}
