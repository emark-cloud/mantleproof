/**
 * AgentIdentityHeader — docs/design.md §6.3 top section.
 *
 * Reads MantleProofAgent state on Mantle mainnet:
 *  - agentTokenId / agentOwner — from the official ERC-8004 Identity Registry
 *  - memoryRoot — the compounding hash chain (keccak256(prev, rootHash))
 *  - auditsPerformed — count maintained alongside memoryRoot
 *  - reputation — read from official Reputation Registry (best-effort)
 */
import { useReadContracts } from "wagmi";
import { Address } from "../primitives/Address";
import { Tip } from "../primitives/Tip";
import {
  AGENT_ADDRESS,
  AGENT_TOKEN_ID,
  agentAbi,
  MANTLE_CHAIN_ID,
} from "../../lib/contracts";

export function AgentIdentityHeader({ tokenId = AGENT_TOKEN_ID }: { tokenId?: bigint }) {
  const chainId = MANTLE_CHAIN_ID;
  const { data, isLoading } = useReadContracts({
    contracts: [
      { address: AGENT_ADDRESS, abi: agentAbi, functionName: "memoryRoot", chainId },
      { address: AGENT_ADDRESS, abi: agentAbi, functionName: "auditsPerformed", chainId },
      { address: AGENT_ADDRESS, abi: agentAbi, functionName: "agentOwner", chainId },
      { address: AGENT_ADDRESS, abi: agentAbi, functionName: "agentTokenId", chainId },
      { address: AGENT_ADDRESS, abi: agentAbi, functionName: "reputation", chainId },
      { address: AGENT_ADDRESS, abi: agentAbi, functionName: "agentURI", chainId },
    ],
  });

  const memoryRoot = (data?.[0]?.result as `0x${string}` | undefined) ?? "0x";
  const auditsPerformed = (data?.[1]?.result as bigint | undefined) ?? 0n;
  const owner = (data?.[2]?.result as `0x${string}` | undefined) ?? "0x";
  const onChainTokenId = (data?.[3]?.result as bigint | undefined) ?? tokenId;
  const reputation = data?.[4]?.result as bigint | undefined;
  const agentURI = data?.[5]?.result as string | undefined;

  return (
    <section className="panel px-4 py-4">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xl text-accent">● agent #{onChainTokenId.toString()}</span>
        <span className="font-sans text-md text-text-primary">mantleproof</span>
      </div>
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-[12px] font-mono">
        <Stat label="identity owner" value={isLoading ? "…" : <Address value={owner} chainId={chainId} withScanLink />} />
        <Stat
          label="reputation"
          value={
            reputation !== undefined
              ? reputation.toString()
              : <span className="text-text-muted">registry unread</span>
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
          label="agentURI"
          value={
            agentURI
              ? <span className="truncate inline-block max-w-[16ch]" title={agentURI}>{agentURI}</span>
              : <span className="text-text-muted">unset</span>
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
