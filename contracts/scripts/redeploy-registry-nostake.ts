/**
 * Minimal staking-removal redeploy (2026-06-10).
 *
 * The deployed MantleProofRegistry hardcodes a 2 MNT Tier-2 stake (TIER2_STAKE
 * constant + InvalidStakeValue revert), so audit staking cannot be turned off
 * on the live bytecode. We deactivate it (roadmap) by deploying a SINGLE new
 * staking-free registry and re-pointing the EXISTING agent at it — no agent,
 * license, treasury, or DecisionLog redeploy, no re-mint.
 *
 *   new MantleProofRegistry(oracleSigner, owner)   // nonpayable submitAudit
 *     -> registry.setAgent(existingAgent)
 *     -> existingAgent.setAuditor(newRegistry)      // owner-only; reuses agent
 *
 * Re-anchoring the demo audits on the new registry then costs gas only. The old
 * registry's on-chain history (audits, disputes, reputation feedback) stays
 * valid as historical receipts — the new registry simply starts empty.
 *
 * Rewrites deployments/<network>.addresses.json in place: swaps the
 * MantleProofRegistry address, drops tier2StakeWei, records the redeploy.
 *
 *   pnpm exec hardhat run scripts/redeploy-registry-nostake.ts --network mantle
 */
import { readFileSync, writeFileSync } from "node:fs";
import { ethers, network } from "hardhat";

async function main(): Promise<void> {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const [deployer] = await ethers.getSigners();
  const owner = deployer.address;

  const path = `deployments/${network.name}.addresses.json`;
  const dep = JSON.parse(readFileSync(path, "utf8"));
  const agentAddr: string = dep.contracts.MantleProofAgent;
  const oldRegistry: string = dep.contracts.MantleProofRegistry;

  // The new registry's oracleSigner must equal the existing one so the engine's
  // oracle key remains the sole writer.
  const oracleSigner = process.env.ORACLE_SIGNER_PRIVATE_KEY
    ? new ethers.Wallet(process.env.ORACLE_SIGNER_PRIVATE_KEY).address
    : owner;
  if (
    dep.oracleSigner &&
    oracleSigner.toLowerCase() !== String(dep.oracleSigner).toLowerCase()
  ) {
    throw new Error(
      `oracleSigner mismatch: env=${oracleSigner} != deployments=${dep.oracleSigner}. ` +
        `Refusing to deploy a registry the engine key cannot write to.`,
    );
  }

  console.log(`[redeploy] network=${network.name} chainId=${chainId}`);
  console.log(`[redeploy] owner/deployer = ${owner}`);
  console.log(`[redeploy] oracleSigner   = ${oracleSigner}`);
  console.log(`[redeploy] reusing agent  = ${agentAddr}`);
  console.log(`[redeploy] OLD registry   = ${oldRegistry}`);

  // 1. Deploy the staking-free registry.
  const registry = await (
    await ethers.getContractFactory("MantleProofRegistry")
  ).deploy(oracleSigner, owner);
  await registry.waitForDeployment();
  const newRegistry = await registry.getAddress();
  console.log(`[redeploy] NEW registry   = ${newRegistry}`);

  // 2. Bidirectional re-wire: registry -> agent, agent.auditor -> new registry.
  await (await registry.setAgent(agentAddr)).wait();
  console.log(`[redeploy] registry.setAgent(${agentAddr}) ok`);

  const agent = await ethers.getContractAt("MantleProofAgent", agentAddr);
  await (await agent.setAuditor(newRegistry)).wait();
  console.log(`[redeploy] agent.setAuditor(${newRegistry}) ok`);

  // Sanity: the agent now only accepts updates from the new registry.
  const auditor: string = await agent.auditor();
  if (auditor.toLowerCase() !== newRegistry.toLowerCase()) {
    throw new Error(`auditor wiring failed: agent.auditor()=${auditor}`);
  }

  // 3. Rewrite deployments json in place.
  dep.contracts.MantleProofRegistry = newRegistry;
  dep.previousRegistry = oldRegistry;
  delete dep.tier2StakeWei;
  delete dep.contracts.StakingPool; // kept in-tree, no longer part of the deployment
  dep.staking = "deactivated (roadmap) — audits anchor for gas only";
  dep.registryRedeployedAt = process.env.REDEPLOY_AT ?? dep.deployedAt;
  writeFileSync(path, JSON.stringify(dep, null, 2) + "\n");
  console.log(`[redeploy] rewrote ${path}`);
  console.log(
    `\n[redeploy] DONE. Update MANTLEPROOF_REGISTRY_ADDRESS=${newRegistry} ` +
      `in .env, then re-anchor the demos.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
