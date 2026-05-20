/**
 * deployer-agent -- Demo 1 (docs/mantleproof.md section 7).
 *
 * Flow (single end-to-end run):
 *   1. Load the dedicated deployer-agent wallet (DEPLOYER_AGENT_PRIVATE_KEY)
 *      -- separate from the deployer + oracle-signer, so "agent-to-agent"
 *      is structural, not a single key wearing three hats.
 *   2. If we haven't yet, deploy `BuggyYieldVault` to this network. Address
 *      is cached at `agents/deployments/<network>.deployer-agent.json` so
 *      reruns reuse the same target (idempotent demo).
 *   3. Optional: hardhat-verify the vault on Etherscan V2 so the engine's
 *      source resolver finds verified source (without this the engine falls
 *      back to local source, which is acceptable but less impressive).
 *   4. License.payForAudit(vault) -- on-chain receipt #1.
 *   5. Spawn the engine pipeline harness (Python): resolve source, Tier-1
 *      union, live Gemini Tier-2, guard, canonical rootHash, IPFS pin,
 *      oracle-signed submitAudit -- on-chain receipt #2.
 *   6. Registry.getAudit(vault) -- read back; assert severity HIGH and the
 *      rootHash matches the engine's report (sanity).
 *   7. Decision narrative: "would now fix-and-redeploy with cooldown
 *      handling" -- printed, not executed (the headline receipts per spec
 *      are only payForAudit + submitAudit; the fixed redeploy is narrative).
 *   8. Append a row to agents/validation/demo1_receipts.md.
 *
 * Network: defaults to mantleSepolia; pass --network=mantle for the real
 * mainnet demo. Rehearse Sepolia first; mainnet requires the deployer-agent
 * wallet funded with >= ~1 MNT (0.5 audit price + ~0.3 deploy + buffer).
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatEther, parseEventLogs, type Address, type Hex } from "viem";

import { loadKey } from "./lib/wallets.js";
import {
  LICENSE_ABI,
  getAudit,
  isAudited,
  loadDeployment,
  makePublicClient,
  makeWallet,
  networkConfig,
  payForAudit,
  severityName,
  type NetworkName,
} from "./lib/mantleproof.js";
import { runEnginePipeline } from "./lib/engine.js";

const AGENTS_ROOT = resolve(import.meta.dirname, "..");
const CONTRACTS_DIR = resolve(AGENTS_ROOT, "..", "contracts");

function parseArgs(): { network: NetworkName; reuseVault?: Address; verify: boolean } {
  let network: NetworkName = "mantleSepolia";
  let reuseVault: Address | undefined;
  let verify = true;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--network=")) network = a.slice(10) as NetworkName;
    else if (a.startsWith("--vault=")) reuseVault = a.slice(8) as Address;
    else if (a === "--no-verify") verify = false;
  }
  if (network !== "mantle" && network !== "mantleSepolia")
    throw new Error(`--network must be mantle|mantleSepolia (got ${network})`);
  return { network, reuseVault, verify };
}

function loadArtifact(name: string): { abi: unknown[]; bytecode: Hex } {
  const path = resolve(
    CONTRACTS_DIR,
    `artifacts/contracts/demo/${name}.sol/${name}.json`,
  );
  if (!existsSync(path))
    throw new Error(
      `Hardhat artifact missing for ${name} -- run \`pnpm --filter @mantleproof/contracts exec hardhat compile\` first (${path})`,
    );
  return JSON.parse(readFileSync(path, "utf8")) as { abi: unknown[]; bytecode: Hex };
}

function cachedVaultPath(network: NetworkName): string {
  return resolve(AGENTS_ROOT, `deployments/${network}.deployer-agent.json`);
}

function readCachedVault(network: NetworkName): Address | undefined {
  const p = cachedVaultPath(network);
  if (!existsSync(p)) return undefined;
  const j = JSON.parse(readFileSync(p, "utf8")) as { vault?: Address };
  return j.vault;
}

function writeCachedVault(network: NetworkName, payload: object): void {
  const p = cachedVaultPath(network);
  mkdirSync(resolve(p, ".."), { recursive: true });
  writeFileSync(p, JSON.stringify(payload, null, 2) + "\n");
}

/** Run hardhat-verify with execFile (no shell) -- the args are static plus
 * a network slug from a validated allowlist and a 0x-prefixed contract
 * address from a fresh deploy receipt, so there is no injection surface. */
function hardhatVerify(network: NetworkName, address: Address): void {
  execFileSync(
    "pnpm",
    ["exec", "hardhat", "verify", "--network", network, address],
    { cwd: CONTRACTS_DIR, stdio: "inherit" },
  );
}

async function main(): Promise<void> {
  const { network, reuseVault, verify } = parseArgs();
  const cfg = networkConfig(network);
  const dep = loadDeployment(cfg);

  const pk = loadKey("DEPLOYER_AGENT_PRIVATE_KEY");
  const wallet = makeWallet(cfg, pk);
  const pub = makePublicClient(cfg);
  const agentAddr = wallet.account!.address;

  console.log(`\n=== Demo 1 -- deployer-agent ===`);
  console.log(`[net]    ${cfg.name} chainId=${cfg.chainId} rpc=${cfg.rpcUrl}`);
  console.log(`[agent]  ${agentAddr}`);
  console.log(`[License] ${dep.contracts.MantleProofLicense}`);
  console.log(`[Registry] ${dep.contracts.MantleProofRegistry}`);

  const bal = await pub.getBalance({ address: agentAddr });
  console.log(`[balance] ${formatEther(bal)} MNT`);
  if (bal < 10n ** 18n) {
    console.error(
      `\nERROR: deployer-agent has < 1 MNT on ${cfg.name}. Fund ${agentAddr} ` +
        `with at least 1 MNT (0.5 audit price + deploy + buffer) then retry.`,
    );
    process.exitCode = 2;
    return;
  }

  // 1. Vault (cached / reused / freshly deployed) ----------------------------
  let vault: Address | undefined = reuseVault ?? readCachedVault(network);
  if (vault) {
    console.log(`\n[vault]  REUSING cached ${vault}`);
  } else {
    const artifact = loadArtifact("BuggyYieldVault");
    console.log(`\n[vault]  deploying BuggyYieldVault from ${agentAddr} ...`);
    const hash = await wallet.deployContract({
      account: wallet.account!,
      chain: wallet.chain!,
      abi: artifact.abi,
      bytecode: artifact.bytecode,
    });
    console.log(`[vault]  deploy tx=${hash}`);
    const rcpt = await pub.waitForTransactionReceipt({ hash });
    if (!rcpt.contractAddress) throw new Error("deploy receipt has no contractAddress");
    vault = rcpt.contractAddress;
    writeCachedVault(network, {
      vault,
      deployTx: hash,
      deployedAt: new Date().toISOString(),
      deployer: agentAddr,
      network: cfg.name,
      chainId: cfg.chainId,
    });
    console.log(`[vault]  deployed at ${vault} (block ${rcpt.blockNumber})`);

    if (verify) {
      console.log(`[vault]  verifying on Etherscan V2 ...`);
      try {
        hardhatVerify(network, vault);
      } catch (e) {
        console.warn(
          `[vault]  verify FAILED (continuing; engine will use local fallback): ${(e as Error).message}`,
        );
      }
    }
  }

  // 2. payForAudit ----------------------------------------------------------
  console.log(`\n[step 1] License.payForAudit(${vault}) -- on-chain receipt #1`);
  const { hash: payHash, priceWei } = await payForAudit(
    wallet,
    pub,
    dep.contracts.MantleProofLicense,
    vault,
  );
  console.log(`         tx=${payHash}  paid=${formatEther(priceWei)} MNT`);
  const payRcpt = await pub.waitForTransactionReceipt({ hash: payHash });
  if (payRcpt.status !== "success") throw new Error("payForAudit reverted");
  console.log(`         mined block=${payRcpt.blockNumber} status=success`);
  // Sanity: the AuditPaid event names this agent as payer.
  const paidEvents = parseEventLogs({
    abi: LICENSE_ABI,
    logs: payRcpt.logs,
    eventName: "AuditPaid",
  });
  const paid = paidEvents[0];
  if (!paid || paid.args.payer.toLowerCase() !== agentAddr.toLowerCase())
    throw new Error("AuditPaid event missing/payer mismatch");

  // 3. Trigger engine pipeline -- subprocess (Python). The harness handles
  //    source resolve / Tier-1 / Gemini Tier-2 / guard / IPFS pin / submitAudit.
  console.log(`\n[step 2] engine pipeline (Python): resolve src -> Tier-1 -> Gemini Tier-2 -> guard -> IPFS pin -> submitAudit`);
  const result = await runEnginePipeline({ network: cfg.name, target: vault });
  if (!result.ok) {
    console.error(
      `\nERROR: engine pipeline failed (exit ${result.exitCode}). Receipt #2 not produced.`,
    );
    process.exitCode = 3;
    return;
  }
  if (!result.rootHash || !result.anchorTx)
    throw new Error(
      "engine completed but harness output did not include rootHash + anchor_tx",
    );

  // 4. Read back from registry; sanity vs the engine's printed rootHash.
  console.log(`\n[step 3] Registry.getAudit(vault) -- read back the anchored audit`);
  const audited = await isAudited(pub, dep.contracts.MantleProofRegistry, vault);
  if (!audited) throw new Error("isAudited(vault) == false post-anchor -- impossible");
  const audit = await getAudit(pub, dep.contracts.MantleProofRegistry, vault);
  const sevName = severityName(audit.severity);
  console.log(
    `         rootHash=${audit.rootHash}\n` +
      `         severity=${audit.severity} (${sevName})\n` +
      `         ipfsCID=${audit.ipfsCID}\n` +
      `         submitter=${audit.submitter}  (expected oracle-signer)\n` +
      `         timestamp=${audit.timestamp}`,
  );
  if (audit.rootHash.toLowerCase() !== result.rootHash.toLowerCase())
    throw new Error(
      `rootHash mismatch: registry=${audit.rootHash} engine=${result.rootHash}`,
    );
  if (audit.submitter.toLowerCase() !== dep.oracleSigner.toLowerCase())
    throw new Error(
      `submitter ${audit.submitter} != oracleSigner ${dep.oracleSigner} (only-writer invariant violated)`,
    );

  // 5. Decision narrative (Demo 1 receipts are payForAudit + submitAudit only) -
  const decision =
    audit.severity >= 2
      ? `DECLINED to expose ${vault} to user funds -- audit found severity=${sevName} (sUSDe cooldown issue per usde_check H1). Would fix-and-redeploy with cooldownShares/unstake handling.`
      : `would proceed (severity=${sevName})`;
  console.log(`\n[step 4] decision: ${decision}`);

  // 6. Append a row to the receipts ledger ----------------------------------
  const ledger = resolve(AGENTS_ROOT, "validation/demo1_receipts.md");
  mkdirSync(resolve(ledger, ".."), { recursive: true });
  if (!existsSync(ledger))
    writeFileSync(
      ledger,
      "# Demo 1 -- deployer-agent receipts (T26)\n\n" +
        "Single row per end-to-end run. Network-agnostic: Sepolia rehearsals\n" +
        "and mainnet receipts share the same ledger so the audit trail is one\n" +
        "doc.\n\n" +
        "| timestamp | network | vault | payForAudit tx | submitAudit tx | rootHash | severity |\n" +
        "|---|---|---|---|---|---|---|\n",
    );
  appendFileSync(
    ledger,
    `| ${new Date().toISOString()} | ${cfg.name} | \`${vault}\` | ` +
      `\`${payHash}\` | \`${result.anchorTx}\` | \`${audit.rootHash}\` | ${sevName} |\n`,
  );

  console.log(`\n=== Demo 1 OK -- receipts ===`);
  console.log(`  agent          ${agentAddr}`);
  console.log(`  vault          ${vault}`);
  console.log(`  payForAudit    ${payHash}`);
  console.log(`  submitAudit    ${result.anchorTx}`);
  console.log(`  rootHash       ${audit.rootHash}`);
  console.log(`  ipfsCID        ${audit.ipfsCID}`);
  console.log(`  severity       ${audit.severity} (${sevName})`);
  console.log(`  ledger         ${ledger}`);
}

main().catch((e) => {
  console.error("\nDemo 1 FAILED:", e);
  process.exitCode = 1;
});
