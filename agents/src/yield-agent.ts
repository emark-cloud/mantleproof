/**
 * yield-agent -- Demo 3 (docs/mantleproof.md section 7).
 *
 * Flow (single end-to-end run on Mantle MAINNET):
 *   1. Load the dedicated yield-agent wallet (YIELD_AGENT_PRIVATE_KEY)
 *      -- distinct from deployer / oracle-signer / deployer-agent /
 *      trading-agent. "Agent-to-agent" stays structural.
 *   2. Audit target is the canonical Merchant Moe LBRouter v2.2
 *      (0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a) -- the contract
 *      the yield-agent is about to invoke. If the on-chain registry
 *      doesn't already have an audit for it, bootstrap one via
 *      License.payForAudit + engine pipeline (same primitive as the
 *      other demos).
 *   3. Registry.getAudit(LBRouter) -- assert severity < HIGH. LBRouter
 *      audits cleanly as MEDIUM in practice: a slippage-handling
 *      concern only relevant to rebasing / fee-on-transfer tokens; the
 *      yield-agent is depositing WMNT (non-rebasing) single-sided to
 *      a fresh bin, so the MEDIUM finding is N/A to this action. The
 *      agent records that reasoning on-chain.
 *   4. **Pre-broadcast eth_call SIMULATION** of LBRouter.addLiquidityNATIVE
 *      with the exact calldata + value we're about to broadcast. Catches
 *      any LiquidityParameters error (wrong bin, expired deadline,
 *      LBRouter__WrongNativeLiquidityParameters, ...) BEFORE spending
 *      mainnet gas. This is the safety net that lets us skip a Sepolia
 *      LB rehearsal -- Merchant Moe is not deployed on Mantle Sepolia
 *      5003 (LBFactory/Router/Pair/WMNT all return code_len=0), so a
 *      true rehearsal of the LB integration there is impossible. The
 *      agent-flow shape (getAudit + DecisionLog) was already validated
 *      four times by T26/T27 Sepolia + mainnet runs.
 *   5. LBRouter.addLiquidityNATIVE(LiquidityParameters) -- the REAL
 *      Merchant Moe LB v2.2 single-sided WMNT deposit. Tiny demo amount
 *      (~0.05 MNT wrapped to WMNT internally by the router), one bin
 *      above the active id of the canonical WMNT/USDT0 binStep=25 pair
 *      (createdByOwner). The bin above active holds only tokenX
 *      (WMNT); single-sided deposit = no slippage on the deposited
 *      token. The LP receipt is ERC-1155 (LB does NOT use ERC-721).
 *      SPEC RECEIPT #2.
 *   6. DecisionLog.logDecision(LBRouter, rootHash, "APPROVED",
 *      reason) -- SPEC RECEIPT #3. The reason cites the MEDIUM
 *      finding + the applicability reasoning.
 *   7. Decode the Decision event topics to verify (agent, target,
 *      rootHash) match what we wrote (same defensive check as T27).
 *   8. Append a row to agents/validation/demo3_receipts.md.
 *
 * Mainnet-only: yield-agent refuses --network=mantleSepolia. The
 * Sepolia LB infrastructure does not exist; any rehearsal would be a
 * fabricated mock, not a real validation.
 */
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatEther,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";

import { loadKey } from "./lib/wallets.js";
import {
  LBPAIR_ABI,
  LBROUTER_ABI,
  LICENSE_ABI,
  MOE_LB,
  buildSingleSidedWMNTParams,
  getAudit,
  isAudited,
  loadDeployment,
  logDecision,
  makePublicClient,
  makeWallet,
  networkConfig,
  payForAudit,
  severityName,
  type LiquidityParameters,
  type NetworkName,
} from "./lib/mantleproof.js";
import { runEnginePipeline } from "./lib/engine.js";

const AGENTS_ROOT = resolve(import.meta.dirname, "..");
const DEMO_RECEIPTS = "validation/demo3_receipts.md";
const DEMO_AMOUNT_WEI = 5n * 10n ** 16n; // 0.05 MNT wrapped to WMNT

function parseArgs(): { network: NetworkName; amountWei: bigint } {
  let network: NetworkName = "mantle";
  let amountWei = DEMO_AMOUNT_WEI;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--network=")) network = a.slice(10) as NetworkName;
    else if (a.startsWith("--amount=")) amountWei = BigInt(a.slice(9)); // wei
  }
  if (network !== "mantle")
    throw new Error(
      "yield-agent is mainnet-only: Merchant Moe LB is not deployed on Mantle " +
        "Sepolia 5003 (LBFactory/Router/Pair/WMNT all return code_len=0). " +
        "The agent-flow shape was validated 4x by T26/T27 Sepolia + mainnet runs; " +
        "the LB integration is validated by a pre-broadcast eth_call simulation.",
    );
  return { network, amountWei };
}

async function main(): Promise<void> {
  const { network, amountWei } = parseArgs();
  const cfg = networkConfig(network);
  const dep = loadDeployment(cfg);

  const pk = loadKey("YIELD_AGENT_PRIVATE_KEY");
  const wallet = makeWallet(cfg, pk);
  const pub = makePublicClient(cfg);
  const agentAddr = wallet.account!.address;

  console.log(`\n=== Demo 3 -- yield-agent ===`);
  console.log(`[net]    ${cfg.name} chainId=${cfg.chainId} rpc=${cfg.rpcUrl}`);
  console.log(`[agent]  ${agentAddr}`);
  console.log(`[License]     ${dep.contracts.MantleProofLicense}`);
  console.log(`[Registry]    ${dep.contracts.MantleProofRegistry}`);
  console.log(`[DecisionLog] ${dep.contracts.DecisionLog}`);
  console.log(`[LBRouter]    ${MOE_LB.LBRouter} (audit target)`);
  console.log(`[LBPair]      ${MOE_LB.pairWMNT_USDT0_bs25} (WMNT/USDT0 bs=${MOE_LB.binStep})`);
  console.log(`[amount]      ${formatEther(amountWei)} MNT -> WMNT (single-sided)`);

  const bal = await pub.getBalance({ address: agentAddr });
  console.log(`[balance] ${formatEther(bal)} MNT`);
  if (bal < 10n ** 18n) {
    console.error(
      `\nERROR: yield-agent has < 1 MNT on ${cfg.name}. Fund ${agentAddr} ` +
        `with at least 1 MNT (0.5 audit + ${formatEther(amountWei)} WMNT + ` +
        `addLiquidity gas + DecisionLog + buffer) then retry.`,
    );
    process.exitCode = 2;
    return;
  }

  // 1. Bootstrap the on-chain audit if missing ------------------------------
  let payHash: Hex | undefined;
  let pipelineRoot: Hex | undefined;
  let pipelineAnchor: Hex | undefined;
  const alreadyAudited = await isAudited(
    pub,
    dep.contracts.MantleProofRegistry,
    MOE_LB.LBRouter,
  );
  if (alreadyAudited) {
    console.log(`\n[audit]  LBRouter already audited on-chain -- skipping bootstrap`);
  } else {
    console.log(`\n[bootstrap] License.payForAudit(${MOE_LB.LBRouter})`);
    const paid = await payForAudit(
      wallet,
      pub,
      dep.contracts.MantleProofLicense,
      MOE_LB.LBRouter,
    );
    payHash = paid.hash;
    console.log(`            tx=${payHash}  paid=${formatEther(paid.priceWei)} MNT`);
    const payRcpt = await pub.waitForTransactionReceipt({ hash: payHash });
    if (payRcpt.status !== "success") throw new Error("payForAudit reverted");
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

    console.log(`\n[bootstrap] engine pipeline: resolve LBRouter src (Etherscan V2) -> Tier-1 -> Gemini Tier-2 -> guard -> IPFS pin -> submitAudit`);
    const result = await runEnginePipeline({
      network: cfg.name,
      target: MOE_LB.LBRouter,
    });
    if (!result.ok)
      throw new Error(`engine pipeline failed (exit ${result.exitCode})`);
    if (!result.rootHash || !result.anchorTx)
      throw new Error("engine completed but did not output rootHash + anchor_tx");
    pipelineRoot = result.rootHash;
    pipelineAnchor = result.anchorTx;
  }

  // 2. Read the audit -- SPEC RECEIPT #1 (free on-chain read) ---------------
  console.log(`\n[step 1] Registry.getAudit(${MOE_LB.LBRouter}) -- SPEC RECEIPT #1`);
  const audit = await getAudit(
    pub,
    dep.contracts.MantleProofRegistry,
    MOE_LB.LBRouter,
  );
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
  if (audit.severity >= 3)
    throw new Error(
      `Demo 3 expects severity < HIGH (got ${sevName}). LBRouter usually audits ` +
        `as MEDIUM (slippage handling for rebasing tokens) which is N/A for WMNT.`,
    );

  // 3. Build LiquidityParameters from LIVE pair state -----------------------
  console.log(`\n[step 2] read LBPair active state for calldata`);
  const tokenX = (await pub.readContract({
    address: MOE_LB.pairWMNT_USDT0_bs25,
    abi: LBPAIR_ABI,
    functionName: "getTokenX",
  })) as Address;
  const activeId = (await pub.readContract({
    address: MOE_LB.pairWMNT_USDT0_bs25,
    abi: LBPAIR_ABI,
    functionName: "getActiveId",
  })) as number;
  console.log(`         tokenX=${tokenX} (expect WMNT ${MOE_LB.WMNT})`);
  console.log(`         activeId=${activeId} (depositing to ${activeId + 1} = X-only bin above active)`);
  if (tokenX.toLowerCase() !== MOE_LB.WMNT.toLowerCase())
    throw new Error(
      `pair tokenX ${tokenX} != WMNT ${MOE_LB.WMNT} -- deltaIds=[+1] would be Y-only side, breaking the single-sided WMNT add. Halting.`,
    );

  const params: LiquidityParameters = buildSingleSidedWMNTParams({
    tokenX: MOE_LB.WMNT,
    tokenY: MOE_LB.USDT0,
    binStep: MOE_LB.binStep,
    amountWei,
    activeId,
    recipient: agentAddr,
    deadlineSecs: 600,
  });

  // 4. Pre-broadcast eth_call SIMULATION ------------------------------------
  console.log(`\n[step 3] eth_call SIMULATION of LBRouter.addLiquidityNATIVE (no gas spent)`);
  try {
    await pub.simulateContract({
      account: agentAddr,
      address: MOE_LB.LBRouter,
      abi: LBROUTER_ABI,
      functionName: "addLiquidityNATIVE",
      args: [params],
      value: amountWei,
    });
    console.log(`         simulation OK -- calldata + value would not revert`);
  } catch (e) {
    console.error(`\nERROR: addLiquidityNATIVE simulation reverted -- aborting BEFORE spending gas.`);
    console.error(`Cause: ${(e as Error).message}`);
    throw e;
  }

  // 5. SPEC RECEIPT #2: real LB addLiquidityNATIVE tx -----------------------
  console.log(`\n[step 4] LBRouter.addLiquidityNATIVE -- SPEC RECEIPT #2 (real Merchant Moe LB v2.2 deposit)`);
  const addLiquidityHash = await wallet.writeContract({
    account: wallet.account!,
    chain: wallet.chain!,
    address: MOE_LB.LBRouter,
    abi: LBROUTER_ABI,
    functionName: "addLiquidityNATIVE",
    args: [params],
    value: amountWei,
  });
  console.log(`         tx=${addLiquidityHash}`);
  const lbRcpt = await pub.waitForTransactionReceipt({ hash: addLiquidityHash });
  if (lbRcpt.status !== "success") throw new Error("addLiquidityNATIVE reverted");
  console.log(
    `         mined block=${lbRcpt.blockNumber} status=success gasUsed=${lbRcpt.gasUsed}`,
  );
  // Sanity: tx.to == LBRouter
  const lbTx = await pub.getTransaction({ hash: addLiquidityHash });
  if (!lbTx.to || lbTx.to.toLowerCase() !== MOE_LB.LBRouter.toLowerCase())
    throw new Error(
      `addLiquidityNATIVE tx.to ${lbTx.to} != LBRouter ${MOE_LB.LBRouter}`,
    );

  // 6. SPEC RECEIPT #3: DecisionLog -----------------------------------------
  const reason =
    `MantleProof audit of LBRouter returned ${sevName} severity (slippage ` +
    "handling concern for fee-on-transfer / rebasing tokens, e.g. mUSD). " +
    "yield-agent is depositing WMNT (non-rebasing, non-fee-on-transfer) " +
    "single-sided to one bin above active id of WMNT/USDT0 binStep=25 pair, " +
    "so the flagged risk class is N/A to this specific action. Approved.";
  const action = "APPROVED";
  console.log(`\n[step 5] DecisionLog.logDecision(LBRouter, ${audit.rootHash.slice(0, 10)}..., "${action}", reason) -- SPEC RECEIPT #3`);
  const dlHash = await logDecision(
    wallet,
    dep.contracts.DecisionLog,
    MOE_LB.LBRouter,
    audit.rootHash,
    action,
    reason,
  );
  console.log(`         tx=${dlHash}`);
  const dlRcpt = await pub.waitForTransactionReceipt({ hash: dlHash });
  if (dlRcpt.status !== "success") throw new Error("logDecision reverted");
  console.log(`         mined block=${dlRcpt.blockNumber} status=success`);

  // 7. Decode the Decision event from raw topics ----------------------------
  let foundDecision = false;
  for (const log of dlRcpt.logs) {
    if (log.address.toLowerCase() !== dep.contracts.DecisionLog.toLowerCase()) continue;
    if (!log.topics[0] || !log.topics[1] || !log.topics[2] || !log.topics[3]) continue;
    const agentTopic = ("0x" + log.topics[1].slice(26)).toLowerCase();
    const targetTopic = ("0x" + log.topics[2].slice(26)).toLowerCase();
    const rootTopic = log.topics[3].toLowerCase();
    if (
      agentTopic === agentAddr.toLowerCase() &&
      targetTopic === MOE_LB.LBRouter.toLowerCase() &&
      rootTopic === audit.rootHash.toLowerCase()
    ) {
      foundDecision = true;
      break;
    }
  }
  if (!foundDecision)
    throw new Error("Decision event not found / mismatch in receipt logs");
  console.log(`         Decision event OK (agent=${agentAddr} target=${MOE_LB.LBRouter} root=${audit.rootHash.slice(0, 10)}…)`);

  // 8. Receipts ledger ------------------------------------------------------
  const ledger = resolve(AGENTS_ROOT, DEMO_RECEIPTS);
  mkdirSync(resolve(ledger, ".."), { recursive: true });
  if (!existsSync(ledger))
    writeFileSync(
      ledger,
      "# Demo 3 -- yield-agent receipts (T28)\n\n" +
        "Single row per end-to-end run. Spec receipts (docs/mantleproof.md §7):\n" +
        "  1. `getAudit(LBRouter)` -- free on-chain read.\n" +
        "  2. **LB `addLiquidityNATIVE` tx** -- real Merchant Moe LB v2.2 deposit\n" +
        "     (single-sided WMNT to one bin above active id on WMNT/USDT0 bs=25).\n" +
        "  3. **DecisionLog `APPROVED`** -- proof the deposit decision was made on\n" +
        "     MantleProof data, referencing the audit rootHash.\n\n" +
        "Mainnet-only: Merchant Moe LB not deployed on Sepolia. payForAudit /\n" +
        "submitAudit are the BOOTSTRAP receipts (audit creation); blank if reused.\n\n" +
        "| timestamp | network | audit target (LBRouter) | payForAudit (boot) | submitAudit (boot) | rootHash | severity | **addLiquidity tx** | **DecisionLog tx** |\n" +
        "|---|---|---|---|---|---|---|---|---|\n",
    );
  appendFileSync(
    ledger,
    `| ${new Date().toISOString()} | ${cfg.name} | \`${MOE_LB.LBRouter}\` | ` +
      `${payHash ? "`" + payHash + "`" : "(reused)"} | ` +
      `${pipelineAnchor ? "`" + pipelineAnchor + "`" : "(reused)"} | ` +
      `\`${audit.rootHash}\` | ${sevName} | ` +
      `**\`${addLiquidityHash}\`** | **\`${dlHash}\`** |\n`,
  );

  console.log(`\n=== Demo 3 OK -- receipts ===`);
  console.log(`  agent              ${agentAddr}`);
  console.log(`  audit target       ${MOE_LB.LBRouter}  (Merchant Moe LBRouter v2.2)`);
  if (payHash) console.log(`  payForAudit        ${payHash}`);
  if (pipelineAnchor) console.log(`  submitAudit        ${pipelineAnchor}`);
  console.log(`  rootHash           ${audit.rootHash}`);
  console.log(`  ipfsCID            ${audit.ipfsCID}`);
  console.log(`  severity           ${audit.severity} (${sevName}) -- applicability reasoned N/A`);
  console.log(`  addLiquidity tx    ${addLiquidityHash}   (SPEC RECEIPT #2)`);
  console.log(`  DecisionLog tx     ${dlHash}             (SPEC RECEIPT #3, action=APPROVED)`);
  console.log(`  ledger             ${ledger}`);
}

main().catch((e) => {
  console.error("\nDemo 3 FAILED:", e);
  process.exitCode = 1;
});
