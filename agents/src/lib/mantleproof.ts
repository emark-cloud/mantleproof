/**
 * Shared on-chain helpers for the three demo agents (T26 deployer / T27
 * trading / T28 yield). Talks to:
 *
 *   MantleProofLicense  -- payForAudit(address) payable, 80/20 split
 *   MantleProofRegistry -- getAudit(address) view returns (Report)
 *   DecisionLog         -- logDecision(target, rootHash, action, reason)
 *
 * Addresses come from `contracts/deployments/<network>.addresses.json` so
 * Sepolia rehearsal and mainnet share one code path. Each demo agent ships
 * with its own viem WalletClient -- the "agent-to-agent" property requires
 * agent != deployer != oracleSigner.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantle, mantleSepoliaTestnet } from "viem/chains";

export type NetworkName = "mantle" | "mantleSepolia";

export interface NetworkConfig {
  name: NetworkName;
  chain: Chain;
  chainId: number;
  rpcUrl: string;
  deploymentsPath: string;
}

export interface Deployment {
  chainId: number;
  network: string;
  owner: Address;
  oracleSigner: Address;
  agentTokenId: string;
  contracts: {
    MantleProofRegistry: Address;
    MantleProofAgent: Address;
    TreasurySplit: Address;
    MantleProofLicense: Address;
    DecisionLog: Address;
    /** T43 (docs/update.md §3) — sibling pool holding Tier 2 stakes for 30 days.
     *  Optional in the type for back-compat with pre-T43 deployment files; the
     *  disputer-agent + verifier scripts assert presence at use time. */
    StakingPool?: Address;
  };
}

const CONTRACTS_ROOT = resolve(import.meta.dirname, "../../../contracts");

const RPC_DEFAULTS: Record<NetworkName, string> = {
  mantle: "https://rpc.mantle.xyz",
  mantleSepolia: "https://rpc.sepolia.mantle.xyz",
};

export function networkConfig(name: NetworkName): NetworkConfig {
  const chain = name === "mantle" ? mantle : mantleSepoliaTestnet;
  const rpcUrl = process.env[`${name === "mantle" ? "MANTLE" : "MANTLE_SEPOLIA"}_RPC_URL`] || RPC_DEFAULTS[name];
  return {
    name,
    chain,
    chainId: chain.id,
    rpcUrl,
    deploymentsPath: resolve(CONTRACTS_ROOT, `deployments/${name}.addresses.json`),
  };
}

export function loadDeployment(cfg: NetworkConfig): Deployment {
  const raw = readFileSync(cfg.deploymentsPath, "utf8");
  const d = JSON.parse(raw) as Deployment;
  if (d.chainId !== cfg.chainId)
    throw new Error(
      `deployment chainId ${d.chainId} != requested ${cfg.chainId} (file: ${cfg.deploymentsPath})`,
    );
  return d;
}

export function makePublicClient(cfg: NetworkConfig): PublicClient {
  return createPublicClient({ chain: cfg.chain, transport: http(cfg.rpcUrl) });
}

export function makeWallet(cfg: NetworkConfig, privateKey: Hex): WalletClient {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({ account, chain: cfg.chain, transport: http(cfg.rpcUrl) });
}

// --- ABI slices (minimal — only what the demos call) ----------------------
export const LICENSE_ABI = parseAbi([
  "function payForAudit(address target) external payable",
  "function auditPrice() view returns (uint256)",
  "event AuditPaid(address indexed payer, address indexed target, uint256 amount)",
]);

// parseAbi's human-readable form rejects bare `tuple(...)` returns; use the
// structured ABI form for getAudit's `Report` struct. Other entries stay
// human-readable for legibility.
// T43: Report gains `tier` (uint8); AuditSubmitted event gains `tier`; new
// submitDispute / disputeCount / getDisputesForRoot / DisputeSubmitted +
// DisputeResolved.
export const REGISTRY_ABI = [
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
  ...parseAbi([
    "function isAudited(address target) view returns (bool)",
    "function disputeCount() view returns (uint256)",
    "function getDisputesForRoot(bytes32) view returns (uint256[])",
    "function auditTier(bytes32) view returns (uint8)",
    "function submitDispute(bytes32 rootHash, uint256 findingIndex, string counterClaimIpfs) payable returns (uint256)",
    "event AuditSubmitted(address indexed target, bytes32 indexed rootHash, uint8 severity, string ipfsCID, uint8 tier)",
    "event DisputeSubmitted(uint256 indexed disputeId, bytes32 indexed rootHash, uint256 findingIndex, address indexed disputer, string counterClaimIpfs, uint256 counterStake)",
    "event DisputeResolved(uint256 indexed disputeId, bytes32 indexed rootHash, uint8 status, bytes32 reAuditRootHash)",
  ]),
] as const;

export const DECISIONLOG_ABI = parseAbi([
  "function logDecision(address target, bytes32 auditRootHash, string action, string reason) external",
]);

// --- Merchant Moe LB v2.2 (canonical, Mantle mainnet 5000 only) -----------
// Addresses from docs.merchantmoe.com/resources/contracts.md, confirmed live
// via eth_getCode + LBFactory.getAllLBPairs. Sepolia 5003 has no Merchant Moe
// deployment, so the yield-agent (T28) is mainnet-only.
export const MOE_LB = {
  LBFactory: "0xa6630671775c4EA2743840F9A5016dCf2A104054" as Address,
  LBRouter: "0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a" as Address,
  WMNT: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8" as Address,
  USDT0: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE" as Address,
  MOE: "0x4515A45337F461A11Ff0FE8aBF3c606AE5dC00c9" as Address,
  // WMNT/USDT0 binStep=25 — deepest pair (932k WMNT + 599k USDT0,
  // canonical createdByOwner). tokenX=WMNT, tokenY=USDT0.
  pairWMNT_USDT0_bs25: "0x365722f12ceb2063286A268B03c654Df81B7C00F" as Address,
  binStep: 25,
} as const;

// Minimal LB Pair ABI -- only what yield-agent reads (active bin id +
// reserves) to pick a single-sided WMNT bin above the active id.
export const LBPAIR_ABI = parseAbi([
  "function getActiveId() view returns (uint24)",
  "function getReserves() view returns (uint128 reserveX, uint128 reserveY)",
  "function getTokenX() view returns (address)",
  "function getTokenY() view returns (address)",
]);

// LBRouter.addLiquidityNATIVE -- the LiquidityParameters struct (LB v2.2,
// matches Trader Joe). Defined in structured ABI form because parseAbi can't
// handle struct args. Returns layout omitted -- yield-agent only needs the
// tx receipt status, not the depositIds/liquidityMinted arrays.
export const LBROUTER_ABI = [
  {
    type: "function",
    name: "addLiquidityNATIVE",
    stateMutability: "payable",
    inputs: [
      {
        name: "liquidityParameters",
        type: "tuple",
        components: [
          { name: "tokenX", type: "address" },
          { name: "tokenY", type: "address" },
          { name: "binStep", type: "uint256" },
          { name: "amountX", type: "uint256" },
          { name: "amountY", type: "uint256" },
          { name: "amountXMin", type: "uint256" },
          { name: "amountYMin", type: "uint256" },
          { name: "activeIdDesired", type: "uint256" },
          { name: "idSlippage", type: "uint256" },
          { name: "deltaIds", type: "int256[]" },
          { name: "distributionX", type: "uint256[]" },
          { name: "distributionY", type: "uint256[]" },
          { name: "to", type: "address" },
          { name: "refundTo", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [
      { name: "amountXAdded", type: "uint256" },
      { name: "amountYAdded", type: "uint256" },
      { name: "amountXLeft", type: "uint256" },
      { name: "amountYLeft", type: "uint256" },
      { name: "depositIds", type: "uint256[]" },
      { name: "liquidityMinted", type: "uint256[]" },
    ],
  },
] as const;

/** Build the LB v2.2 LiquidityParameters for a single-sided WMNT deposit
 * to one bin above the active id (X-only side). `msg.value` of the tx
 * MUST equal `amountX` -- the router enforces this when tokenX is WMNT.
 *
 * distributionX = [1e18] = 100% of WMNT into the single bin (normalized).
 * distributionY = [0]    = no USDT0 added.
 * deltaIds      = [+1]   = the bin immediately above active (X-only side).
 * amountXMin    = amountX (no slippage on the X side — single-sided add
 *                 doesn't slip on the deposited token; idSlippage handles
 *                 active-id drift).
 */
export interface LiquidityParameters {
  tokenX: Address;
  tokenY: Address;
  binStep: bigint;
  amountX: bigint;
  amountY: bigint;
  amountXMin: bigint;
  amountYMin: bigint;
  activeIdDesired: bigint;
  idSlippage: bigint;
  deltaIds: readonly bigint[];
  distributionX: readonly bigint[];
  distributionY: readonly bigint[];
  to: Address;
  refundTo: Address;
  deadline: bigint;
}

export function buildSingleSidedWMNTParams(opts: {
  tokenX: Address;
  tokenY: Address;
  binStep: number;
  amountWei: bigint;
  activeId: number;
  recipient: Address;
  deadlineSecs?: number;
}): LiquidityParameters {
  const deadline = BigInt(
    Math.floor(Date.now() / 1000) + (opts.deadlineSecs ?? 600),
  );
  return {
    tokenX: opts.tokenX,
    tokenY: opts.tokenY,
    binStep: BigInt(opts.binStep),
    amountX: opts.amountWei,
    amountY: 0n,
    amountXMin: opts.amountWei, // single-sided, no slippage on X
    amountYMin: 0n,
    activeIdDesired: BigInt(opts.activeId),
    idSlippage: 10n, // tolerate ±10 bins of active-id drift
    deltaIds: [1n], // one bin above active = X-only side
    distributionX: [10n ** 18n], // 100% of WMNT into that bin
    distributionY: [0n],
    to: opts.recipient,
    refundTo: opts.recipient,
    deadline,
  };
}

export interface AuditReport {
  rootHash: Hex;
  severity: number; // 0=Info 1=Low 2=Med 3=High (Solidity-uint8)
  ipfsCID: string;
  timestamp: bigint;
  submitter: Address;
  tier: number; // 1 or 2 — post-T43 (docs/update.md)
}

const SEVERITY_NAMES = ["INFO", "LOW", "MEDIUM", "HIGH"] as const;
export function severityName(s: number): string {
  return SEVERITY_NAMES[s] ?? `UNKNOWN(${s})`;
}

/**
 * Pay the License contract for a one-off audit of `target`. Returns the tx hash.
 * Reverts (insufficient payment) if `valueWei` < License.auditPrice() at the
 * head block, so we read the live price first instead of assuming 0.5 MNT.
 */
export async function payForAudit(
  wallet: WalletClient,
  pub: PublicClient,
  license: Address,
  target: Address,
): Promise<{ hash: Hex; priceWei: bigint }> {
  if (!wallet.account) throw new Error("wallet has no account");
  const priceWei = (await pub.readContract({
    address: license,
    abi: LICENSE_ABI,
    functionName: "auditPrice",
  })) as bigint;
  const hash = await wallet.writeContract({
    account: wallet.account,
    chain: wallet.chain ?? null,
    address: license,
    abi: LICENSE_ABI,
    functionName: "payForAudit",
    args: [target],
    value: priceWei,
  });
  return { hash, priceWei };
}

/** Read the latest anchored audit for `target`. Reverts via UnknownTarget if none. */
export async function getAudit(
  pub: PublicClient,
  registry: Address,
  target: Address,
): Promise<AuditReport> {
  const r = (await pub.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "getAudit",
    args: [target],
  })) as AuditReport;
  return r;
}

export async function isAudited(
  pub: PublicClient,
  registry: Address,
  target: Address,
): Promise<boolean> {
  return (await pub.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "isAudited",
    args: [target],
  })) as boolean;
}

/** Write a decision-log entry. T27/T28 receipt. */
export async function logDecision(
  wallet: WalletClient,
  decisionLog: Address,
  target: Address,
  auditRootHash: Hex,
  action: string,
  reason: string,
): Promise<Hex> {
  if (!wallet.account) throw new Error("wallet has no account");
  return wallet.writeContract({
    account: wallet.account,
    chain: wallet.chain ?? null,
    address: decisionLog,
    abi: DECISIONLOG_ABI,
    functionName: "logDecision",
    args: [target, auditRootHash, action, reason],
  });
}
