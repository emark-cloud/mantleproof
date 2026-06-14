/**
 * Read-only on-chain helpers for the CLI. Pure viem `publicClient` reads against
 * Mantle mainnet — no wallet, no writes. ABI slices are kept minimal and aligned
 * with `agents/src/lib/mantleproof.ts` + `contracts/contracts/interfaces/`.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  http,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { mantle } from "viem/chains";
import { ADDR, RPC_URL } from "./config.js";

export function makeClient(): PublicClient {
  // One bounded retry layer lives here (viem's transport handles network-level
  // retries); `withRetry` adds at most one more logical retry. Keep both small —
  // stacking deep retries against a slow public RPC is what made `verify` appear
  // to hang for minutes. A short per-request timeout plus the wall-clock deadline
  // in runVerify is the real safety net.
  return createPublicClient({
    chain: mantle,
    transport: http(RPC_URL, { retryCount: 2, retryDelay: 300, timeout: 8_000 }),
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The decoded custom-error name of a contract revert, or undefined. */
export function revertName(e: unknown): string | undefined {
  if (e instanceof BaseError) {
    const r = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) {
      return r.data?.errorName ?? r.reason ?? undefined;
    }
  }
  return undefined;
}

function isDeterministicRevert(e: unknown): boolean {
  return (
    e instanceof BaseError &&
    e.walk((err) => err instanceof ContractFunctionRevertedError) instanceof
      ContractFunctionRevertedError
  );
}

/** Retry transient (network/RPC) failures; never retry a deterministic revert. */
async function withRetry<T>(fn: () => Promise<T>, tries = 2, delayMs = 300): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (isDeterministicRevert(e)) throw e;
      last = e;
      if (i < tries - 1) await sleep(delayMs * (i + 1));
    }
  }
  throw last;
}

// --- ABIs ------------------------------------------------------------------

/** parseAbi rejects bare tuple returns; use structured form for getAudit. */
const REGISTRY_ABI = [
  {
    type: "function",
    name: "getAudit",
    stateMutability: "view",
    inputs: [{ name: "target", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "rootHash", type: "bytes32" },
          { name: "severity", type: "uint8" },
          { name: "ipfsCID", type: "string" },
          { name: "timestamp", type: "uint64" },
          { name: "submitter", type: "address" },
          { name: "tier", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getDispute",
    stateMutability: "view",
    inputs: [{ name: "disputeId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "rootHash", type: "bytes32" },
          { name: "findingIndex", type: "uint256" },
          { name: "disputer", type: "address" },
          { name: "counterClaimIpfs", type: "string" },
          { name: "counterStake", type: "uint256" },
          { name: "antiSpamFee", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "submittedAt", type: "uint64" },
          { name: "resolvedAt", type: "uint64" },
          { name: "reAuditRootHash", type: "bytes32" },
        ],
      },
    ],
  },
  ...parseAbi([
    "function oracleSigner() view returns (address)",
    "function isAudited(address target) view returns (bool)",
    "function auditCount(address target) view returns (uint256)",
    "function disputeCount() view returns (uint256)",
    // Custom errors — declared so viem can decode the revert name.
    "error UnknownTarget(address target)",
    "error UnknownAudit(bytes32 rootHash)",
    "error UnknownDispute(uint256 disputeId)",
  ]),
] as const;

const IDENTITY_ABI = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);

const REPUTATION_ABI = parseAbi([
  "function readAllFeedback(uint256 agentId, address[] clientAddresses, string tag1, string tag2, bool includeRevoked) view returns (address[] clients, uint64[] feedbackIndexes, int128[] values, uint8[] valueDecimals, string[] tag1s, string[] tag2s, bool[] revokedStatuses)",
]);

// --- Types -----------------------------------------------------------------

export interface AuditReport {
  rootHash: Hex;
  severity: number; // 0=INFO 1=LOW 2=MEDIUM 3=HIGH
  ipfsCID: string;
  timestamp: bigint;
  submitter: Address;
  tier: number; // 1 | 2
}

export interface DisputeRecord {
  rootHash: Hex;
  findingIndex: bigint;
  disputer: Address;
  status: number; // 0=PENDING 1=DISMISSED 2=AMENDED 3=RETRACTED
  resolvedAt: bigint;
  reAuditRootHash: Hex;
}

export const SEVERITY_NAMES = ["INFO", "LOW", "MEDIUM", "HIGH"] as const;
export function severityName(s: number): string {
  return SEVERITY_NAMES[s] ?? `UNKNOWN(${s})`;
}

export const DISPUTE_STATUS = [
  "PENDING",
  "DISMISSED",
  "AMENDED",
  "RETRACTED",
] as const;
export function disputeStatusName(s: number): string {
  return DISPUTE_STATUS[s] ?? `UNKNOWN(${s})`;
}

// --- Reads -----------------------------------------------------------------

export async function getCode(c: PublicClient, address: Address): Promise<Hex | undefined> {
  return withRetry(() => c.getBytecode({ address }));
}

export async function readOracleSigner(c: PublicClient): Promise<Address> {
  return withRetry(async () =>
    (await c.readContract({
      address: ADDR.registry,
      abi: REGISTRY_ABI,
      functionName: "oracleSigner",
    })) as Address,
  );
}

/**
 * Latest anchored audit for `target`; null ONLY when the target was never
 * audited (`UnknownTarget` revert). Transient RPC failures are retried, then
 * re-thrown — a flaky RPC must never masquerade as "not audited".
 */
export async function tryGetAudit(
  c: PublicClient,
  target: Address,
): Promise<AuditReport | null> {
  try {
    return await withRetry(async () =>
      (await c.readContract({
        address: ADDR.registry,
        abi: REGISTRY_ABI,
        functionName: "getAudit",
        args: [target],
      })) as AuditReport,
    );
  } catch (e) {
    if (revertName(e) === "UnknownTarget") return null;
    throw e;
  }
}

export async function readDisputeCount(
  c: PublicClient,
  registry: Address = ADDR.registry,
): Promise<bigint> {
  return withRetry(async () =>
    (await c.readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: "disputeCount",
    })) as bigint,
  );
}

export async function getDispute(
  c: PublicClient,
  disputeId: bigint,
  registry: Address = ADDR.registry,
): Promise<DisputeRecord> {
  return withRetry(async () =>
    (await c.readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: "getDispute",
      args: [disputeId],
    })) as DisputeRecord,
  );
}

export async function readBalance(c: PublicClient, address: Address): Promise<bigint> {
  return withRetry(() => c.getBalance({ address }));
}

/** Owner of an ERC-8004 identity tokenId; null if unregistered (view reverts). */
export async function tryOwnerOf(
  c: PublicClient,
  registry: Address,
  tokenId: bigint,
): Promise<Address | null> {
  try {
    return await withRetry(async () =>
      (await c.readContract({
        address: registry,
        abi: IDENTITY_ABI,
        functionName: "ownerOf",
        args: [tokenId],
      })) as Address,
    );
  } catch (e) {
    // ERC721NonexistentToken (or any revert) ⇒ unregistered.
    if (revertName(e) !== undefined) return null;
    throw e;
  }
}

/** Count of feedback entries about `agentId` on the Reputation Registry. */
export async function readFeedbackCount(
  c: PublicClient,
  registry: Address,
  agentId: bigint,
): Promise<number> {
  const res = (await withRetry(() =>
    c.readContract({
      address: registry,
      abi: REPUTATION_ABI,
      functionName: "readAllFeedback",
      args: [agentId, [], "", "", false],
    }),
  )) as readonly unknown[];
  const clients = res[0] as readonly Address[];
  return clients.length;
}
