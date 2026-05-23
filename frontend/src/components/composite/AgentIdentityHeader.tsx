/**
 * AgentIdentityHeader — docs/design.md §6.3 top section.
 *
 * Reads MantleProofAgent + the canonical ERC-8004 v2 Reputation Registry on
 * Mantle mainnet:
 *
 *   - memoryRoot / auditsPerformed / agentOwner / agentTokenId — from our
 *     own `MantleProofAgent` wrapper (the only views on that contract that
 *     still work; reputation() and agentURI() were defunct as of T38).
 *   - reputation count + summary value — read DIRECTLY from the official
 *     Reputation Registry via `getClients(96)` → `getSummary(96, clients,
 *     "", "")` (T41). When `getClients` returns an empty list we render
 *     "no feedback yet" honestly — no fabricated numbers, per design rules.
 */
import { useReadContracts } from "wagmi";
import { Address } from "../primitives/Address";
import { Tip } from "../primitives/Tip";
import {
  AGENT_ADDRESS,
  AGENT_TOKEN_ID,
  MANTLE_CHAIN_ID,
  REPUTATION_REGISTRY_ADDRESS,
  agentAbi,
  reputationRegistryAbi,
} from "../../lib/contracts";

export function AgentIdentityHeader({ tokenId = AGENT_TOKEN_ID }: { tokenId?: bigint }) {
  const chainId = MANTLE_CHAIN_ID;

  // First pass: read agent state + the client list. getSummary requires a
  // non-empty client list (reverts otherwise per T37 verification), so we
  // can't fold it into the same useReadContracts call — we need the clients
  // array as an input first.
  const { data: agentData, isLoading: agentLoading } = useReadContracts({
    contracts: [
      { address: AGENT_ADDRESS, abi: agentAbi, functionName: "memoryRoot", chainId },
      { address: AGENT_ADDRESS, abi: agentAbi, functionName: "auditsPerformed", chainId },
      { address: AGENT_ADDRESS, abi: agentAbi, functionName: "agentOwner", chainId },
      { address: AGENT_ADDRESS, abi: agentAbi, functionName: "agentTokenId", chainId },
      {
        address: REPUTATION_REGISTRY_ADDRESS,
        abi: reputationRegistryAbi,
        functionName: "getClients",
        args: [tokenId],
        chainId,
      },
    ],
  });

  const memoryRoot = (agentData?.[0]?.result as `0x${string}` | undefined) ?? "0x";
  const auditsPerformed = (agentData?.[1]?.result as bigint | undefined) ?? 0n;
  const owner = (agentData?.[2]?.result as `0x${string}` | undefined) ?? "0x";
  const onChainTokenId = (agentData?.[3]?.result as bigint | undefined) ?? tokenId;
  const clients = (agentData?.[4]?.result as `0x${string}`[] | undefined) ?? [];

  // Second pass: now that we have a non-empty client list, we can summarize.
  // Skip the read entirely when clients is empty — getSummary would revert
  // "clientAddresses required".
  const { data: summaryData } = useReadContracts({
    contracts: [
      {
        address: REPUTATION_REGISTRY_ADDRESS,
        abi: reputationRegistryAbi,
        functionName: "getSummary",
        args: [tokenId, clients, "", ""],
        chainId,
      },
    ],
    query: { enabled: clients.length > 0 },
  });

  const summary = summaryData?.[0]?.result as
    | readonly [bigint, bigint, number]
    | undefined;
  const feedbackCount = summary ? summary[0] : 0n;
  const summaryValue = summary ? summary[1] : 0n;

  return (
    <section className="panel px-4 py-4">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xl text-accent">● agent #{onChainTokenId.toString()}</span>
        <span className="font-sans text-md text-text-primary">mantleproof</span>
      </div>
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-[12px] font-mono">
        <Stat
          label="identity owner"
          value={agentLoading ? "…" : <Address value={owner} chainId={chainId} withScanLink />}
        />
        <Stat
          label={
            <Tip text={
              "Live read from Mantle's canonical ERC-8004 v2 Reputation Registry " +
              "via getSummary(96, getClients(96), '', ''). Honest cold-state: 'no " +
              "feedback yet' when no agent has rated MantleProof on-chain. Anyone " +
              "(except MantleProof's own owner/operator) may post feedback through " +
              "the official registry — the on-chain reputation surface is permissionless."
            }>
              reputation
            </Tip>
          }
          value={
            clients.length === 0
              ? <span className="text-text-muted">no feedback yet</span>
              : (
                <span className="text-text-primary">
                  {summaryValue.toString()}
                  <span className="text-text-muted text-[10px] ml-1">
                    / {feedbackCount.toString()} {feedbackCount === 1n ? "rating" : "ratings"}
                  </span>
                </span>
              )
          }
        />
        <Stat
          label={
            <Tip text="Number of audits this agent has signed and published. Maintained on-chain inside MantleProofAgent.updateMemoryRoot, called by the registry on every submitAudit.">
              audits performed
            </Tip>
          }
          value={auditsPerformed.toString()}
        />
        <Stat
          label={
            <Tip text="Unique agent wallets that have left on-chain feedback about MantleProof through the official ERC-8004 Reputation Registry. Read live via getClients(96).">
              feedback clients
            </Tip>
          }
          value={
            clients.length === 0
              ? <span className="text-text-muted">0</span>
              : <span className="text-text-primary">{clients.length}</span>
          }
        />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-1 text-[12px] font-mono">
        <Stat
          label={
            <Tip text="A rolling fingerprint covering every audit this agent has signed. Each new audit advances it: memoryRoot' = keccak256(memoryRoot, rootHash). Only the latest value lives on-chain, but the full audit history is committed into it — past audits are tamper-evident.">
              audit fingerprint (memoryRoot)
            </Tip>
          }
          value={<span className="text-text-secondary break-all">{memoryRoot}</span>}
        />
        <span className="text-[10px] text-text-muted">
          rolls forward: <span className="text-text-secondary">memoryRoot' = keccak256(memoryRoot, rootHash)</span> on every audit
        </span>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-0.5 text-text-primary">{value}</div>
    </div>
  );
}
