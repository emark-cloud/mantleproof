/**
 * disputer-agent — Demo 4 (docs/update.md §3.7).
 *
 * The 5th demo wallet, distinct from deployer / oracle / deployer-agent /
 * trading-agent / yield-agent. Pre-funded with MNT for counter-stakes (and
 * 0.5 USDC on Base if a human-path anti-spam fee is needed; not exercised
 * by this CLI — the anti-spam route uses the existing x402 facilitator).
 *
 * Subcommands (single-shot, idempotent-friendly):
 *
 *   dispute --root 0x… --idx <n> [--claim <ipfs-cid>] [--stake <mnt>]
 *           [--network mantle|mantleSepolia]
 *     Calls MantleProofRegistry.submitDispute(rootHash, findingIndex, ipfs)
 *     with optional msg.value (counter-stake). Returns the disputeId via
 *     the DisputeSubmitted event topic.
 *
 *   status --root 0x… [--network …]
 *     Lists all disputes filed against the given audit rootHash with their
 *     on-chain status (PENDING / DISMISSED / AMENDED / RETRACTED) plus the
 *     re-audit rootHash if resolved.
 *
 *   stake --root 0x… [--network …]
 *     Reads StakingPool.stakeOf(rootHash) — shows lifecycle state of the
 *     audit's 2 MNT stake.
 *
 * The disputer-agent does NOT pin counter-claims to IPFS itself — pass a
 * pre-pinned CID via --claim. Mainnet runs default to a published
 * fixture CID under `agents/validation/dispute_seeds/` (see T47).
 */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatEther,
  parseEther,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";

import { loadKey } from "./lib/wallets.js";
import {
  loadDeployment,
  makePublicClient,
  makeWallet,
  networkConfig,
  REGISTRY_ABI,
  type NetworkName,
} from "./lib/mantleproof.js";

const AGENTS_ROOT = resolve(import.meta.dirname, "..");

// Mirror of IMantleProofRegistry.DisputeStatus (Solidity enum).
const DISPUTE_STATUS = ["PENDING", "DISMISSED", "AMENDED", "RETRACTED"] as const;

interface CommonArgs {
  network: NetworkName;
}
interface DisputeArgs extends CommonArgs {
  cmd: "dispute";
  rootHash: Hex;
  findingIndex: bigint;
  claimIpfs: string;
  stakeWei: bigint;
}
interface StatusArgs extends CommonArgs {
  cmd: "status";
  rootHash: Hex;
}
interface StakeArgs extends CommonArgs {
  cmd: "stake";
  rootHash: Hex;
}
type Args = DisputeArgs | StatusArgs | StakeArgs;

function parseArgs(argv: string[]): Args {
  let cmd: "dispute" | "status" | "stake" | undefined;
  let network: NetworkName = "mantleSepolia";
  let rootHash = "" as Hex | "";
  let findingIndex = 0n;
  let claimIpfs = "";
  let stakeWei = 0n;
  for (const a of argv) {
    if (!cmd && (a === "dispute" || a === "status" || a === "stake")) {
      cmd = a;
    } else if (a.startsWith("--network=")) network = a.slice(10) as NetworkName;
    else if (a.startsWith("--root=")) rootHash = a.slice(7) as Hex;
    else if (a.startsWith("--idx=")) findingIndex = BigInt(a.slice(6));
    else if (a.startsWith("--claim=")) claimIpfs = a.slice(8);
    else if (a.startsWith("--stake=")) stakeWei = parseEther(a.slice(8));
  }
  if (!cmd) {
    throw new Error(
      "missing subcommand. Use: dispute|status|stake  --network=…  --root=0x…",
    );
  }
  if (network !== "mantle" && network !== "mantleSepolia") {
    throw new Error(`--network must be mantle|mantleSepolia (got ${network})`);
  }
  if (!rootHash.startsWith("0x") || rootHash.length !== 66) {
    throw new Error(`--root must be a 32-byte 0x hex (got ${rootHash || "<empty>"})`);
  }
  if (cmd === "dispute") {
    if (!claimIpfs) {
      throw new Error("dispute: --claim=<ipfs cid or ipfs:// uri> required");
    }
    return { cmd, network, rootHash: rootHash as Hex, findingIndex, claimIpfs, stakeWei };
  }
  return { cmd, network, rootHash: rootHash as Hex };
}

async function runDispute(args: DisputeArgs): Promise<void> {
  const cfg = networkConfig(args.network);
  const dep = loadDeployment(cfg);
  const pub = makePublicClient(cfg);
  const key = loadKey("DISPUTER_AGENT_PRIVATE_KEY");
  const wallet = makeWallet(cfg, key);
  if (!wallet.account) throw new Error("wallet has no account");

  const me = wallet.account.address;
  const bal = await pub.getBalance({ address: me });
  console.log(
    `[disputer] network=${cfg.name} chainId=${cfg.chainId} addr=${me} balance=${formatEther(bal)} MNT`,
  );
  if (bal < args.stakeWei + parseEther("0.05")) {
    throw new Error(
      `insufficient balance: need ${formatEther(args.stakeWei + parseEther("0.05"))} MNT ` +
        `(stake + gas buffer), have ${formatEther(bal)}`,
    );
  }

  // Pre-flight: the audit must exist on-chain AND be tier 2.
  const tier = (await pub.readContract({
    address: dep.contracts.MantleProofRegistry,
    abi: REGISTRY_ABI,
    functionName: "auditTier",
    args: [args.rootHash],
  })) as number;
  if (tier === 0) {
    throw new Error(`rootHash ${args.rootHash} is not anchored on this registry`);
  }
  if (tier !== 2) {
    throw new Error(`rootHash ${args.rootHash} is tier ${tier} — only Tier 2 audits are disputable (docs/update.md §8)`);
  }

  console.log(
    `[disputer] submitDispute rootHash=${args.rootHash} idx=${args.findingIndex} ` +
      `ipfs=${args.claimIpfs} stake=${formatEther(args.stakeWei)} MNT`,
  );
  const hash = await wallet.writeContract({
    account: wallet.account,
    chain: wallet.chain ?? null,
    address: dep.contracts.MantleProofRegistry,
    abi: REGISTRY_ABI,
    functionName: "submitDispute",
    args: [args.rootHash, args.findingIndex, args.claimIpfs],
    value: args.stakeWei,
  });
  console.log(`[disputer] tx broadcast: ${hash}`);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`submitDispute reverted: tx=${hash}`);
  }

  // Decode the DisputeSubmitted event to recover the disputeId.
  const logs = parseEventLogs({
    abi: REGISTRY_ABI,
    eventName: "DisputeSubmitted",
    logs: receipt.logs,
  });
  if (logs.length === 0) {
    throw new Error("DisputeSubmitted event missing from receipt");
  }
  const firstLog = logs[0];
  if (!firstLog) throw new Error("DisputeSubmitted event missing from receipt");
  const ev = firstLog.args as {
    disputeId: bigint;
    rootHash: Hex;
    findingIndex: bigint;
    disputer: Address;
    counterClaimIpfs: string;
    counterStake: bigint;
  };
  console.log(`[disputer] ✓ dispute #${ev.disputeId} filed`);
  console.log(`  rootHash:     ${ev.rootHash}`);
  console.log(`  disputer:     ${ev.disputer}`);
  console.log(`  finding idx:  ${ev.findingIndex}`);
  console.log(`  counterStake: ${formatEther(ev.counterStake)} MNT`);
  console.log(`  ipfs:         ${ev.counterClaimIpfs}`);
  console.log(`  tx:           ${hash}`);
  console.log(`  block:        ${receipt.blockNumber}`);

  // Append to receipts ledger for T47 / Demo 4.
  appendReceipt(args.network, {
    cmd: "dispute",
    rootHash: args.rootHash,
    findingIndex: args.findingIndex.toString(),
    disputeId: ev.disputeId.toString(),
    disputer: ev.disputer,
    counterClaimIpfs: ev.counterClaimIpfs,
    counterStake: formatEther(ev.counterStake),
    tx: hash,
    block: receipt.blockNumber.toString(),
    ts: new Date().toISOString(),
  });
}

async function runStatus(args: StatusArgs): Promise<void> {
  const cfg = networkConfig(args.network);
  const dep = loadDeployment(cfg);
  const pub = makePublicClient(cfg);

  const ids = (await pub.readContract({
    address: dep.contracts.MantleProofRegistry,
    abi: REGISTRY_ABI,
    functionName: "getDisputesForRoot",
    args: [args.rootHash],
  })) as readonly bigint[];

  console.log(`[disputer] disputes for ${args.rootHash}: ${ids.length}`);
  if (ids.length === 0) return;

  // getDispute returns the full Dispute struct — declare its ABI inline so
  // we don't have to extend REGISTRY_ABI's parseAbi humans-friendly list.
  const getDisputeAbi = [
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
  ] as const;

  for (const id of ids) {
    const d = (await pub.readContract({
      address: dep.contracts.MantleProofRegistry,
      abi: getDisputeAbi,
      functionName: "getDispute",
      args: [id],
    })) as {
      rootHash: Hex;
      findingIndex: bigint;
      disputer: Address;
      counterClaimIpfs: string;
      counterStake: bigint;
      antiSpamFee: bigint;
      status: number;
      submittedAt: bigint;
      resolvedAt: bigint;
      reAuditRootHash: Hex;
    };
    const status = DISPUTE_STATUS[d.status] ?? `UNKNOWN(${d.status})`;
    console.log(
      `  #${id}  ${status}  finding[${d.findingIndex}]  disputer=${d.disputer}  ` +
        `stake=${formatEther(d.counterStake)} MNT  filed=${new Date(Number(d.submittedAt) * 1000).toISOString()}` +
        (d.resolvedAt > 0n
          ? `  resolved=${new Date(Number(d.resolvedAt) * 1000).toISOString()}  reAudit=${d.reAuditRootHash}`
          : ""),
    );
  }
}

async function runStake(args: StakeArgs): Promise<void> {
  const cfg = networkConfig(args.network);
  const dep = loadDeployment(cfg);
  if (!dep.contracts.StakingPool) {
    throw new Error("deployment file missing StakingPool address (pre-T43 file?)");
  }
  const pub = makePublicClient(cfg);

  const stakeAbi = [
    {
      type: "function",
      name: "stakeOf",
      stateMutability: "view",
      inputs: [{ name: "rootHash", type: "bytes32" }],
      outputs: [
        {
          name: "",
          type: "tuple",
          components: [
            { name: "rootHash", type: "bytes32" },
            { name: "auditor", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "lockedAt", type: "uint64" },
            { name: "unlocksAt", type: "uint64" },
            { name: "status", type: "uint8" },
          ],
        },
      ],
    },
  ] as const;

  const s = (await pub.readContract({
    address: dep.contracts.StakingPool,
    abi: stakeAbi,
    functionName: "stakeOf",
    args: [args.rootHash],
  })) as {
    rootHash: Hex;
    auditor: Address;
    amount: bigint;
    lockedAt: bigint;
    unlocksAt: bigint;
    status: number;
  };
  const statusName = ["LOCKED", "RELEASED", "SLASHED_DISPUTE", "SLASHED_EXPLOIT"][s.status] ?? "?";
  console.log(`[disputer] stake for ${args.rootHash}`);
  console.log(`  status:    ${statusName}`);
  console.log(`  amount:    ${formatEther(s.amount)} MNT`);
  console.log(`  auditor:   ${s.auditor}`);
  console.log(`  lockedAt:  ${new Date(Number(s.lockedAt) * 1000).toISOString()}`);
  console.log(`  unlocksAt: ${new Date(Number(s.unlocksAt) * 1000).toISOString()}`);
}

interface ReceiptRow {
  cmd: string;
  rootHash: string;
  findingIndex: string;
  disputeId: string;
  disputer: string;
  counterClaimIpfs: string;
  counterStake: string;
  tx: string;
  block: string;
  ts: string;
}

function appendReceipt(network: NetworkName, row: ReceiptRow): void {
  const path = resolve(AGENTS_ROOT, `validation/dispute_receipts.${network}.jsonl`);
  if (!existsSync(resolve(AGENTS_ROOT, "validation"))) {
    mkdirSync(resolve(AGENTS_ROOT, "validation"), { recursive: true });
  }
  const line = JSON.stringify(row) + "\n";
  if (existsSync(path)) {
    writeFileSync(path, readFileSync(path, "utf8") + line);
  } else {
    writeFileSync(path, line);
  }
  console.log(`[disputer] appended receipt to ${path}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.cmd === "dispute") await runDispute(args);
  else if (args.cmd === "status") await runStatus(args);
  else if (args.cmd === "stake") await runStake(args);
}

main().catch((e) => {
  console.error(`[disputer] FAILED: ${(e as Error).message}`);
  process.exitCode = 1;
});
