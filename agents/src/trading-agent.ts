/**
 * trading-agent -- Demo 2 (docs/mantleproof.md section 7).
 *
 * Flow (single end-to-end run):
 *   1. Load the dedicated trading-agent wallet (TRADING_AGENT_PRIVATE_KEY)
 *      -- separate from deployer / oracle-signer / deployer-agent so the
 *      "agent-to-agent" property is structural.
 *   2. If we haven't yet, deploy `BackdooredMemeToken` to this network
 *      (a deliberately-buggy "yield-bearing meme token" target with pause()
 *      + mint() backdoors + broken sUSDe yield path). Address cached at
 *      `agents/deployments/<network>.trading-agent.json`.
 *   3. Optional: hardhat-verify the token on Etherscan V2 so the engine's
 *      source resolver finds verified source; otherwise local fallback.
 *   4. License.payForAudit(token) -- bootstrap receipt #1 (the audit must
 *      exist on-chain for the trading-agent flow to be reproducible end-to-
 *      end; this is the same pay-per-audit primitive as Demo 1).
 *   5. Spawn the engine pipeline (Python): resolve src -> Tier-1 -> Gemini
 *      Tier-2 -> guard -> IPFS pin -> submitAudit (bootstrap receipt #2).
 *   6. Registry.getAudit(token) -- the **Demo 2 headline read**: assert
 *      severity >= MEDIUM and the rootHash matches the engine.
 *   7. DecisionLog.logDecision(token, rootHash, "DECLINED", reason)
 *      -- **the headline Demo 2 receipt** (the trading-agent refuses the
 *      swap because of a MantleProof finding, posts a tx proving the
 *      decision was made on MantleProof data, exactly per the spec).
 *   8. Re-read the DecisionLog `Decision` event and assert agent ==
 *      trading-agent, target == token, auditRootHash == on-chain rootHash.
 *   9. Append a row to agents/validation/demo2_receipts.md (headline
 *      column is the DecisionLog tx).
 *
 * Network: defaults to mantleSepolia; pass --network=mantle for mainnet.
 * Mainnet rehearses on Sepolia first; mainnet requires the trading-agent
 * wallet funded with >= ~1 MNT (0.5 audit price + deploy + DecisionLog tx +
 * buffer).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatEther,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";

import { loadKey } from "./lib/wallets.js";
import {
  LICENSE_ABI,
  getAudit,
  isAudited,
  loadDeployment,
  logDecision,
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

const TARGET_CONTRACT = "BackdooredMemeToken";
const DEMO_RECEIPTS = "validation/demo2_receipts.md";
const VAULT_CACHE_KEY = "trading-agent";

function parseArgs(): { network: NetworkName; reuseToken?: Address; verify: boolean } {
  let network: NetworkName = "mantleSepolia";
  let reuseToken: Address | undefined;
  let verify = true;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--network=")) network = a.slice(10) as NetworkName;
    else if (a.startsWith("--token=")) reuseToken = a.slice(8) as Address;
    else if (a === "--no-verify") verify = false;
  }
  if (network !== "mantle" && network !== "mantleSepolia")
    throw new Error(`--network must be mantle|mantleSepolia (got ${network})`);
  return { network, reuseToken, verify };
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

function cachedTokenPath(network: NetworkName): string {
  return resolve(AGENTS_ROOT, `deployments/${network}.${VAULT_CACHE_KEY}.json`);
}

function readCachedToken(network: NetworkName): Address | undefined {
  const p = cachedTokenPath(network);
  if (!existsSync(p)) return undefined;
  const j = JSON.parse(readFileSync(p, "utf8")) as { token?: Address };
  return j.token;
}

function writeCachedToken(network: NetworkName, payload: object): void {
  const p = cachedTokenPath(network);
  mkdirSync(resolve(p, ".."), { recursive: true });
  writeFileSync(p, JSON.stringify(payload, null, 2) + "\n");
}

/** Run hardhat-verify with execFile (no shell) -- args are static plus a
 * network slug from a validated allowlist and a 0x-prefixed contract address
 * from a fresh deploy receipt, so there is no injection surface. */
function hardhatVerify(network: NetworkName, address: Address): void {
  execFileSync(
    "pnpm",
    ["exec", "hardhat", "verify", "--network", network, address],
    { cwd: CONTRACTS_DIR, stdio: "inherit" },
  );
}

async function main(): Promise<void> {
  const { network, reuseToken, verify } = parseArgs();
  const cfg = networkConfig(network);
  const dep = loadDeployment(cfg);

  const pk = loadKey("TRADING_AGENT_PRIVATE_KEY");
  const wallet = makeWallet(cfg, pk);
  const pub = makePublicClient(cfg);
  const agentAddr = wallet.account!.address;

  console.log(`\n=== Demo 2 -- trading-agent ===`);
  console.log(`[net]    ${cfg.name} chainId=${cfg.chainId} rpc=${cfg.rpcUrl}`);
  console.log(`[agent]  ${agentAddr}`);
  console.log(`[License]     ${dep.contracts.MantleProofLicense}`);
  console.log(`[Registry]    ${dep.contracts.MantleProofRegistry}`);
  console.log(`[DecisionLog] ${dep.contracts.DecisionLog}`);

  const bal = await pub.getBalance({ address: agentAddr });
  console.log(`[balance] ${formatEther(bal)} MNT`);
  if (bal < 10n ** 18n) {
    console.error(
      `\nERROR: trading-agent has < 1 MNT on ${cfg.name}. Fund ${agentAddr} ` +
        `with at least 1 MNT (0.5 audit + deploy + DecisionLog + buffer) then retry.`,
    );
    process.exitCode = 2;
    return;
  }

  // 1. Token target (cached / reused / freshly deployed) --------------------
  let token: Address | undefined = reuseToken ?? readCachedToken(network);
  let alreadyAudited = false;
  if (token) {
    console.log(`\n[token]  REUSING cached ${token}`);
    alreadyAudited = await isAudited(pub, dep.contracts.MantleProofRegistry, token);
    if (alreadyAudited)
      console.log(`[token]  already audited on-chain -- skipping bootstrap (payForAudit + pipeline)`);
  } else {
    const artifact = loadArtifact(TARGET_CONTRACT);
    console.log(`\n[token]  deploying ${TARGET_CONTRACT} from ${agentAddr} ...`);
    const hash = await wallet.deployContract({
      account: wallet.account!,
      chain: wallet.chain!,
      abi: artifact.abi,
      bytecode: artifact.bytecode,
    });
    console.log(`[token]  deploy tx=${hash}`);
    const rcpt = await pub.waitForTransactionReceipt({ hash });
    if (!rcpt.contractAddress) throw new Error("deploy receipt has no contractAddress");
    token = rcpt.contractAddress;
    writeCachedToken(network, {
      token,
      contract: TARGET_CONTRACT,
      deployTx: hash,
      deployedAt: new Date().toISOString(),
      deployer: agentAddr,
      network: cfg.name,
      chainId: cfg.chainId,
    });
    console.log(`[token]  deployed at ${token} (block ${rcpt.blockNumber})`);

    if (verify) {
      console.log(`[token]  verifying on Etherscan V2 ...`);
      try {
        hardhatVerify(network, token);
      } catch (e) {
        console.warn(
          `[token]  verify FAILED (continuing; engine will use local fallback): ${(e as Error).message}`,
        );
      }
    }
  }

  // 2. Bootstrap the on-chain audit (payForAudit + pipeline) -- skipped if
  //    the registry already has a record for this target. ------------------
  let payHash: Hex | undefined;
  let pipelineRoot: Hex | undefined;
  let pipelineAnchor: Hex | undefined;
  if (!alreadyAudited) {
    console.log(`\n[bootstrap] License.payForAudit(${token}) -- receipt #1 (audit-creation)`);
    const paid = await payForAudit(
      wallet,
      pub,
      dep.contracts.MantleProofLicense,
      token,
    );
    payHash = paid.hash;
    console.log(`         tx=${payHash}  paid=${formatEther(paid.priceWei)} MNT`);
    const payRcpt = await pub.waitForTransactionReceipt({ hash: payHash });
    if (payRcpt.status !== "success") throw new Error("payForAudit reverted");
    console.log(`         mined block=${payRcpt.blockNumber} status=success`);
    const paidEvents = parseEventLogs({
      abi: LICENSE_ABI,
      logs: payRcpt.logs,
      eventName: "AuditPaid",
    });
    if (
      !paidEvents[0] ||
      paidEvents[0].args.payer.toLowerCase() !== agentAddr.toLowerCase()
    )
      throw new Error("AuditPaid event missing/payer mismatch");

    console.log(
      `\n[bootstrap] engine pipeline (Python): resolve src -> Tier-1 -> Gemini Tier-2 -> guard -> IPFS pin -> submitAudit`,
    );
    // Pass MANTLEPROOF_TARGET_NAME so the harness's local-source fallback
    // disambiguates if Etherscan V2 verification hasn't propagated yet.
    process.env.MANTLEPROOF_TARGET_NAME = TARGET_CONTRACT;
    const result = await runEnginePipeline({ network: cfg.name, target: token });
    if (!result.ok)
      throw new Error(`engine pipeline failed (exit ${result.exitCode})`);
    if (!result.rootHash || !result.anchorTx)
      throw new Error("engine completed but harness output did not include rootHash + anchor_tx");
    pipelineRoot = result.rootHash;
    pipelineAnchor = result.anchorTx;
  }

  // 3. The headline Demo 2 READ: Registry.getAudit(token) -------------------
  console.log(`\n[step 1] Registry.getAudit(${token}) -- the Demo 2 headline read (free, on-chain)`);
  const audit = await getAudit(pub, dep.contracts.MantleProofRegistry, token);
  const sevName = severityName(audit.severity);
  console.log(
    `         rootHash=${audit.rootHash}\n` +
      `         severity=${audit.severity} (${sevName})\n` +
      `         ipfsCID=${audit.ipfsCID}\n` +
      `         submitter=${audit.submitter}  (expected oracle-signer)\n` +
      `         timestamp=${audit.timestamp}`,
  );
  if (audit.submitter.toLowerCase() !== dep.oracleSigner.toLowerCase())
    throw new Error(
      `submitter ${audit.submitter} != oracleSigner ${dep.oracleSigner} (only-writer invariant violated)`,
    );
  if (pipelineRoot && audit.rootHash.toLowerCase() !== pipelineRoot.toLowerCase())
    throw new Error(
      `rootHash mismatch: registry=${audit.rootHash} engine=${pipelineRoot}`,
    );
  if (audit.severity < 2)
    throw new Error(
      `Demo 2 expects severity >= MEDIUM (got ${sevName}). ` +
        `BackdooredMemeToken should fire usde_check H1 + Tier-2 pause()/mint() backdoors.`,
    );

  // 4. The headline Demo 2 WRITE: DecisionLog.logDecision ------------------
  const reason =
    "MantleProof audit returned " +
    `${sevName} severity (pause()/mint() admin backdoors + broken sUSDe yield ` +
    "(cooldown bypass)). Refuse to swap into this token.";
  const action = "DECLINED";
  console.log(`\n[step 2] DecisionLog.logDecision(${token}, ${audit.rootHash.slice(0, 10)}..., "${action}", reason) -- THE HEADLINE DEMO 2 RECEIPT`);
  const dlHash = await logDecision(
    wallet,
    dep.contracts.DecisionLog,
    token,
    audit.rootHash,
    action,
    reason,
  );
  console.log(`         tx=${dlHash}`);
  const dlRcpt = await pub.waitForTransactionReceipt({ hash: dlHash });
  if (dlRcpt.status !== "success") throw new Error("logDecision reverted");
  console.log(`         mined block=${dlRcpt.blockNumber} status=success`);

  // 5. Sanity: re-read the Decision event we just emitted ------------------
  //    DECISIONLOG_ABI in mantleproof.ts only declares the function (not the
  //    event); decode from raw topics directly. Indexed topics: 1=agent,
  //    2=target, 3=auditRootHash. Verify the (agent, target, rootHash)
  //    triple matches what we just wrote.
  let foundDecision = false;
  for (const log of dlRcpt.logs) {
    if (log.address.toLowerCase() !== dep.contracts.DecisionLog.toLowerCase()) continue;
    if (!log.topics[0] || !log.topics[1] || !log.topics[2] || !log.topics[3]) continue;
    // topic1 = indexed agent (left-padded address as bytes32)
    const agentTopic = ("0x" + log.topics[1].slice(26)).toLowerCase();
    const targetTopic = ("0x" + log.topics[2].slice(26)).toLowerCase();
    const rootTopic = log.topics[3].toLowerCase();
    if (
      agentTopic === agentAddr.toLowerCase() &&
      targetTopic === token!.toLowerCase() &&
      rootTopic === audit.rootHash.toLowerCase()
    ) {
      foundDecision = true;
      break;
    }
  }
  if (!foundDecision)
    throw new Error(
      "Decision event not found / agent/target/rootHash mismatch in receipt logs",
    );
  console.log(`         Decision event OK (agent=${agentAddr} target=${token} root=${audit.rootHash.slice(0, 10)}…)`);

  // 6. Append a row to the receipts ledger ----------------------------------
  const ledger = resolve(AGENTS_ROOT, DEMO_RECEIPTS);
  mkdirSync(resolve(ledger, ".."), { recursive: true });
  if (!existsSync(ledger))
    writeFileSync(
      ledger,
      "# Demo 2 -- trading-agent receipts (T27)\n\n" +
        "Single row per end-to-end run. Headline receipt = the **DecisionLog tx**\n" +
        "(the spec's Demo 2 on-chain proof that the swap was refused on MantleProof\n" +
        "data). The payForAudit / submitAudit columns are the bootstrap (audit-creation)\n" +
        "receipts; blank when the target was already audited.\n\n" +
        "| timestamp | network | token | payForAudit (bootstrap) | submitAudit (bootstrap) | rootHash | severity | **DecisionLog tx (headline)** |\n" +
        "|---|---|---|---|---|---|---|---|\n",
    );
  appendFileSync(
    ledger,
    `| ${new Date().toISOString()} | ${cfg.name} | \`${token}\` | ` +
      `${payHash ? "`" + payHash + "`" : "(reused)"} | ` +
      `${pipelineAnchor ? "`" + pipelineAnchor + "`" : "(reused)"} | ` +
      `\`${audit.rootHash}\` | ${sevName} | ` +
      `**\`${dlHash}\`** |\n`,
  );

  console.log(`\n=== Demo 2 OK -- receipts ===`);
  console.log(`  agent              ${agentAddr}`);
  console.log(`  token              ${token}`);
  if (payHash) console.log(`  payForAudit        ${payHash}`);
  if (pipelineAnchor) console.log(`  submitAudit        ${pipelineAnchor}`);
  console.log(`  rootHash           ${audit.rootHash}`);
  console.log(`  ipfsCID            ${audit.ipfsCID}`);
  console.log(`  severity           ${audit.severity} (${sevName})`);
  console.log(`  DecisionLog tx     ${dlHash}   (HEADLINE Demo 2 receipt)`);
  console.log(`  ledger             ${ledger}`);
}

main().catch((e) => {
  console.error("\nDemo 2 FAILED:", e);
  process.exitCode = 1;
});
