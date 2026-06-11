/**
 * Canonical on-chain references for the frontend.
 *
 * Sourced from `contracts/deployments/mantle.addresses.json` (T43 redeploy,
 * 2026-05-24 — the 6-contract stack with the disputes + StakingPool layer that
 * supersedes the T25 5-contract deploy from 2026-05-19). These are mainnet 5000
 * contracts; Sepolia rehearsal stack lives in `mantleSepolia.addresses.json` and
 * is loadable via the `VITE_*` overrides for a testnet build, but we ship mainnet
 * by default — the dashboard's job is to make the live mainnet receipts believable.
 * Keep these defaults in sync with `mantle.addresses.json` (same rule the CLI's
 * `cli/src/config.ts` follows).
 */
import { parseAbi } from "viem";
import type { PublicClient } from "viem";

// Staking-free registry (2026-06-10 redeploy): submitAudit is nonpayable and
// audits anchor for gas only. The StakingPool layer was retired to roadmap.
export const REGISTRY_ADDRESS =
  (import.meta.env.VITE_REGISTRY_ADDRESS as `0x${string}`) ??
  ("0xcF3703BD76C64DA8a13461e820456d0576662aaf" as const);

/** The previous registry deployment (pre-staking-removal) — historical only. */
export const PREVIOUS_REGISTRY_ADDRESS =
  "0x5CEafE0FD8b2A9BD2eC6aCdf3f5e024c21CA65A5" as const;

export const AGENT_ADDRESS =
  (import.meta.env.VITE_AGENT_ADDRESS as `0x${string}`) ??
  ("0x6661Fb91CfA5F5691E3F80cA319b665824CB02e9" as const);

export const DECISION_LOG_ADDRESS =
  (import.meta.env.VITE_DECISION_LOG_ADDRESS as `0x${string}`) ??
  ("0x11B395452e2bF8Ab20F21cd4deA8f9a7650CCf65" as const);

export const LICENSE_ADDRESS =
  (import.meta.env.VITE_LICENSE_ADDRESS as `0x${string}`) ??
  ("0x51fA686747ea148f6BeC7e30390C8B929DC45447" as const);

export const TREASURY_ADDRESS =
  (import.meta.env.VITE_TREASURY_ADDRESS as `0x${string}`) ??
  ("0xEaea8a20288528ea6E55B619DB3F7442890c9600" as const);

/**
 * StakingPool — ROADMAP (deactivated 2026-06-10). The economic-security layer
 * (2 MNT Tier-2 stake, 30-day window, slash-to-disputer) is future work; audits
 * currently anchor for gas only. This address is the retired pool from the
 * previous deployment, kept for historical reference only — the staking-free
 * registry does not lock into it. The constants below are roadmap mirrors.
 */
export const STAKING_POOL_ADDRESS =
  (import.meta.env.VITE_STAKING_POOL_ADDRESS as `0x${string}`) ??
  ("0x2E279f4cAE39B5d0Fa57e08D0d455Ec9f6080ee9" as const);

export const MANTLE_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 5000);
/** Roadmap: planned Tier 2 stake amount in wei (staking currently deactivated). */
export const TIER2_STAKE_WEI = 2n * 10n ** 18n;
/** Roadmap: planned 30-day stake window (staking currently deactivated). */
export const DISPUTE_UNLOCK_WINDOW_SECONDS = 30 * 24 * 60 * 60;
export const AGENT_TOKEN_ID = 96n; // MantleProof's own ERC-8004 identity (T5).

/**
 * Canonical ERC-8004 v2 Reputation Registry on Mantle mainnet 5000.
 * Verified live 2026-05-23 in T37 (`docs/erc8004-abi-notes.md`) — both
 * `getVersion()=="2.0.0"` and `getIdentityRegistry()` matches the
 * canonical Identity Registry. We DO NOT deploy this contract; we read
 * MantleProof's reputation from it directly (T41 — replaces the defunct
 * `MantleProofAgent.reputation()` view, which was compiled against a
 * fictional interface and reverts on-chain at runtime).
 */
export const REPUTATION_REGISTRY_ADDRESS =
  (import.meta.env.VITE_REPUTATION_REGISTRY_ADDRESS as `0x${string}`) ??
  ("0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const);

/* --------------------------------- ABIs --------------------------------- */

// Minimal read ABI — mirrors `engine/mantleproof/persistence/registry_reader.py`
// so frontend & engine read the SAME on-chain shape.
// Report struct carries `tier`; disputes layer: submitDispute/resolveDispute/
// getDispute/getDisputesForRoot + DisputeSubmitted/DisputeResolved events.
// submitAudit is nonpayable (staking deactivated — audits anchor for gas only).
export const registryAbi = parseAbi([
  "function auditCount(address) view returns (uint256)",
  "function isAudited(address) view returns (bool)",
  "function oracleSigner() view returns (address)",
  "function auditTarget(bytes32) view returns (address)",
  "function auditTier(bytes32) view returns (uint8)",
  "function disputeCount() view returns (uint256)",
  "function getAudit(address) view returns ((bytes32 rootHash, uint8 severity, string ipfsCID, uint64 timestamp, address submitter, uint8 tier))",
  "function getDispute(uint256) view returns ((bytes32 rootHash, uint256 findingIndex, address disputer, string counterClaimIpfs, uint256 counterStake, uint256 antiSpamFee, uint8 status, uint64 submittedAt, uint64 resolvedAt, bytes32 reAuditRootHash))",
  "function getDisputesForRoot(bytes32) view returns (uint256[])",
  "function submitDispute(bytes32 rootHash, uint256 findingIndex, string counterClaimIpfs) payable returns (uint256)",
  "event AuditSubmitted(address indexed target, bytes32 indexed rootHash, uint8 severity, string ipfsCID, uint8 tier)",
  "event DisputeSubmitted(uint256 indexed disputeId, bytes32 indexed rootHash, uint256 findingIndex, address indexed disputer, string counterClaimIpfs, uint256 counterStake)",
  "event DisputeResolved(uint256 indexed disputeId, bytes32 indexed rootHash, uint8 status, bytes32 reAuditRootHash)",
]);

/**
 * Minimal read ABI for the StakingPool sibling contract (T43).
 * Mirrors `engine/mantleproof/staking/reader.py`. Read-only on the frontend
 * — locking is registry-internal, slashing is registry-routed, and `unlock`
 * is permissionless but we don't surface it as a button in this UI.
 */
export const stakingPoolAbi = parseAbi([
  "function stakeOf(bytes32 rootHash) view returns ((bytes32 rootHash, address auditor, uint256 amount, uint64 lockedAt, uint64 unlocksAt, uint8 status))",
  "function isLocked(bytes32 rootHash) view returns (bool)",
  "function treasury() view returns (address)",
  "function registry() view returns (address)",
  "event StakeLocked(bytes32 indexed rootHash, address indexed auditor, uint256 amount, uint64 unlocksAt)",
  "event StakeSlashedByDispute(bytes32 indexed rootHash, address indexed beneficiary, uint256 portion, uint256 remainder)",
  "event StakeReleased(bytes32 indexed rootHash, uint256 treasuryCut, uint256 retained)",
]);

/**
 * DisputeStatus enum mirror (Solidity order):
 *   0 = PENDING, 1 = DISMISSED, 2 = AMENDED, 3 = RETRACTED
 */
export const DISPUTE_STATUS_BY_UINT: Record<number, "pending" | "dismissed" | "amended" | "retracted"> = {
  0: "pending",
  1: "dismissed",
  2: "amended",
  3: "retracted",
};

/**
 * StakingPool.Status enum mirror:
 *   0 = LOCKED, 1 = RELEASED, 2 = SLASHED_DISPUTE, 3 = SLASHED_EXPLOIT (reserved)
 */
export const STAKE_STATUS_BY_UINT: Record<number, "locked" | "released" | "slashed_dispute" | "slashed_exploit"> = {
  0: "locked",
  1: "released",
  2: "slashed_dispute",
  3: "slashed_exploit",
};

// `agentAbi` deliberately omits `reputation()` and `agentURI()` — both views
// were compiled against the fictional pre-T38 IEIP8004 interface and revert
// on-chain (see contracts/contracts/MantleProofAgent.sol). The frontend
// reads reputation from REPUTATION_REGISTRY_ADDRESS directly via
// `reputationRegistryAbi` below; identity tokenURI is read from the
// canonical Identity Registry (T41).
export const agentAbi = parseAbi([
  "function memoryRoot() view returns (bytes32)",
  "function auditsPerformed() view returns (uint256)",
  "function agentTokenId() view returns (uint256)",
  "function agentOwner() view returns (address)",
]);

/**
 * Minimal read ABI for the canonical ERC-8004 v2 Reputation Registry.
 * Mirrors `engine/mantleproof/reputation/feedback.py` + the verified
 * Phase-0 ABI in `docs/erc8004-abi-notes.md`. Critical: `getSummary`
 * REQUIRES non-empty `clientAddresses` (reverts otherwise) — callers
 * MUST first call `getClients(agentId)` and pass the result.
 */
export const reputationRegistryAbi = parseAbi([
  "function getClients(uint256 agentId) view returns (address[])",
  "function getLastIndex(uint256 agentId, address clientAddress) view returns (uint64)",
  "function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) view returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)",
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
  "function getVersion() pure returns (string)",
]);

export const decisionLogAbi = parseAbi([
  "function count() view returns (uint256)",
  "event Decision(address indexed agent, address indexed target, bytes32 indexed auditRootHash, string action, string reason)",
]);

/**
 * Public `rpc.mantle.xyz` rejects any `eth_getLogs` whose block range exceeds
 * ~10k blocks ("Invalid parameters were provided to the RPC method"). Stay
 * comfortably under the cap per request.
 */
export const GETLOGS_MAX_RANGE = 9_500n;

/**
 * Earliest block to scan DecisionLog from. The on-chain Demo 2/3 decisions live
 * around blocks 95.57M–95.75M (2026-05-20…05-24); pinning a floor avoids both
 * the per-request range cap above AND a pointless multi-million-block sweep from
 * genesis. Env-overridable for a fresh redeploy / testnet build.
 */
export const DECISION_LOG_START_BLOCK = BigInt(
  (import.meta.env.VITE_DECISION_LOG_START_BLOCK as string | undefined) ?? "95560000",
);

/** Indexed-arg filter for the Decision event (all three topics optional). */
export type DecisionLogFilter = {
  agent?: `0x${string}`;
  target?: `0x${string}`;
  auditRootHash?: `0x${string}`;
};

/**
 * `eth_getLogs` for the Decision event over an arbitrary [fromBlock, toBlock]
 * range, transparently split into <= GETLOGS_MAX_RANGE windows so the public
 * Mantle RPC accepts it. Chunks run with bounded concurrency; logs are returned
 * flattened in ascending block order. Callers still narrow `log.args` themselves.
 */
export async function getDecisionLogsChunked(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
  args?: DecisionLogFilter,
) {
  const get = (lo: bigint, hi: bigint) =>
    client.getLogs({
      address: DECISION_LOG_ADDRESS,
      event: decisionLogAbi[1],
      args,
      fromBlock: lo,
      toBlock: hi,
    });
  type Logs = Awaited<ReturnType<typeof get>>;

  const ranges: Array<[bigint, bigint]> = [];
  for (let lo = fromBlock; lo <= toBlock; lo += GETLOGS_MAX_RANGE + 1n) {
    const hi = lo + GETLOGS_MAX_RANGE > toBlock ? toBlock : lo + GETLOGS_MAX_RANGE;
    ranges.push([lo, hi]);
  }

  const results: Logs[] = new Array(ranges.length);
  let cursor = 0;
  const CONCURRENCY = 6;
  const worker = async () => {
    while (cursor < ranges.length) {
      const i = cursor++;
      const range = ranges[i];
      if (!range) break;
      results[i] = await get(range[0], range[1]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, ranges.length) }, worker),
  );
  return results.flat() as Logs;
}

/* ------------------------------ Severity enum ------------------------------ */

// Matches `IMantleProofRegistry.Severity` (Solidity) + `severity_from_uint8`
// (engine). Keep these aligned — drift here = wrong colors on the dashboard.
export const SEVERITY_BY_UINT: Record<number, "info" | "low" | "medium" | "high"> = {
  0: "info",
  1: "low",
  2: "medium",
  3: "high",
};

/* ------------------------- Known audited targets ------------------------- */

/**
 * The three audits anchored by the demo flows on Mantle mainnet. Until the
 * cache-warmer (T29) lands and an index of all anchored audits exists, the
 * dashboard's "priority cache" panel reads from this hand-curated list — every
 * row here has a verifiable on-chain rootHash (see TODO.md Decisions log
 * 2026-05-20 T28). Honest UI: we don't pretend the cache has 200 entries.
 */
export const KNOWN_TARGETS: readonly { address: `0x${string}`; label: string; provenance: string }[] = [
  {
    address: "0x1892f77e335C133Ce4a7B28555f13bA74cBB76fA",
    label: "BuggyYieldVault (Demo 1)",
    provenance: "agent-deployed contract, intentionally vulnerable",
  },
  {
    address: "0x8F6679EB031799fc9C5e149DFb75b4543808912F",
    label: "BackdooredMemeToken (Demo 2)",
    provenance: "trading-agent target — pause() backdoor",
  },
  {
    address: "0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a",
    label: "Merchant Moe LBRouter v2.2 (Demo 3)",
    provenance: "yield-agent target — canonical mainnet protocol",
  },
] as const;
