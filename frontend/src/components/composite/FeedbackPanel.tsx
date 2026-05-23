/**
 * FeedbackPanel — live ERC-8004 v2 reputation reads for /agent/:tokenId.
 *
 * Reads the latest feedback from each client that has rated the agent
 * through Mantle's canonical Reputation Registry. Honest cold-state: when
 * `getClients(agentId)` is empty, render "no on-chain feedback yet" rather
 * than fabricating numbers or hiding the section.
 */
import { useReadContracts } from "wagmi";
import { Address } from "../primitives/Address";
import { Tip } from "../primitives/Tip";
import {
  MANTLE_CHAIN_ID,
  REPUTATION_REGISTRY_ADDRESS,
  reputationRegistryAbi,
} from "../../lib/contracts";

export function FeedbackPanel({ tokenId }: { tokenId: bigint }) {
  const chainId = MANTLE_CHAIN_ID;

  const { data: clientsData, isLoading: clientsLoading } = useReadContracts({
    contracts: [
      {
        address: REPUTATION_REGISTRY_ADDRESS,
        abi: reputationRegistryAbi,
        functionName: "getClients",
        args: [tokenId],
        chainId,
      },
    ],
  });
  const clients = (clientsData?.[0]?.result as `0x${string}`[] | undefined) ?? [];

  // For each client, read getLastIndex then readFeedback(client, lastIndex)
  // — two parallel multicall round-trips. Skipped when client list empty.
  const { data: lastIndexData } = useReadContracts({
    contracts: clients.map((c) => ({
      address: REPUTATION_REGISTRY_ADDRESS,
      abi: reputationRegistryAbi,
      functionName: "getLastIndex" as const,
      args: [tokenId, c] as const,
      chainId,
    })),
    query: { enabled: clients.length > 0 },
  });

  const lastIndexes: bigint[] = (lastIndexData ?? []).map(
    (r) => (r?.result as bigint | undefined) ?? 0n,
  );

  // readFeedback returns a 5-tuple [value, valueDecimals, tag1, tag2, isRevoked].
  // viem decodes named-output ABIs as an object; cast accordingly.
  const { data: feedbackData } = useReadContracts({
    contracts: clients.map((c, i) => ({
      address: REPUTATION_REGISTRY_ADDRESS,
      abi: reputationRegistryAbi,
      functionName: "readFeedback" as const,
      args: [tokenId, c, lastIndexes[i] ?? 0n] as const,
      chainId,
    })),
    query: { enabled: clients.length > 0 && lastIndexes.every((i) => i > 0n) },
  });

  return (
    <section className="panel px-4 py-4">
      <h2 className="font-mono text-xs uppercase tracking-wider text-text-primary mb-2">
        <Tip text={
          "Live read from Mantle's canonical ERC-8004 v2 Reputation Registry at " +
          REPUTATION_REGISTRY_ADDRESS +
          ". Anyone (except MantleProof's own owner/operator) may post feedback here " +
          "via giveFeedback(agentId, value, valueDecimals, tag1, tag2, endpoint, " +
          "feedbackURI, feedbackHash). MantleProof never signs these — paying agents " +
          "submit their own. Negative ratings are possible and correct."
        }>
          On-chain feedback ({clients.length})
        </Tip>
      </h2>
      {clientsLoading ? (
        <div className="font-mono text-[12px] text-text-muted">loading…</div>
      ) : clients.length === 0 ? (
        <div className="font-mono text-[12px] text-text-muted">
          no on-chain feedback yet — read live from{" "}
          <span className="text-text-secondary">
            getClients({tokenId.toString()})
          </span>
          {" "}on the official Reputation Registry
        </div>
      ) : (
        <div className="font-mono text-[12px] space-y-1">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 text-[10px] uppercase tracking-wider text-text-muted">
            <span>client</span>
            <span>idx</span>
            <span>value</span>
            <span>tag1</span>
            <span>tag2</span>
          </div>
          {clients.map((c, i) => {
            const fb = feedbackData?.[i]?.result as
              | readonly [bigint, number, string, string, boolean]
              | undefined;
            const value = fb?.[0]?.toString() ?? "…";
            const tag1 = fb?.[2] ?? "…";
            const tag2 = fb?.[3] ?? "…";
            const revoked = fb?.[4] ?? false;
            const idx = lastIndexes[i]?.toString() ?? "…";
            return (
              <div key={c} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-center py-0.5">
                <Address value={c} chainId={chainId} withScanLink />
                <span className="text-text-secondary tabular-nums">{idx}</span>
                <span className={revoked ? "text-text-muted line-through tabular-nums" : "text-text-primary tabular-nums"}>
                  {value}
                </span>
                <span className="text-text-secondary truncate max-w-[14ch]" title={tag1}>{tag1}</span>
                <span className="text-text-muted truncate max-w-[14ch]" title={tag2}>{tag2}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3 text-[10px] font-mono text-text-muted">
        Shows the latest feedback entry per client (call readFeedback for full history).
      </div>
    </section>
  );
}
