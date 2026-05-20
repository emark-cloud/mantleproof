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
        ],
      },
    ],
  },
  ...parseAbi([
    "function isAudited(address target) view returns (bool)",
    "event AuditSubmitted(address indexed target, bytes32 indexed rootHash, uint8 severity, string ipfsCID)",
  ]),
] as const;

export const DECISIONLOG_ABI = parseAbi([
  "function logDecision(address target, bytes32 auditRootHash, string action, string reason) external",
]);

export interface AuditReport {
  rootHash: Hex;
  severity: number; // 0=Info 1=Low 2=Med 3=High (Solidity-uint8)
  ipfsCID: string;
  timestamp: bigint;
  submitter: Address;
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
