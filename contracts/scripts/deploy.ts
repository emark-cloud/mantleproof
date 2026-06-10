/**
 * Path A deploy (T1 resolved): we do NOT deploy ERC-8004 registries — Mantle
 * issues the identity NFT automatically. Deploy 5 contracts:
 *
 *   TreasurySplit(owner)
 *     -> MantleProofRegistry(oracleSigner, owner)
 *     -> MantleProofAgent(identityRegistry, reputationRegistry, tokenId, owner)
 *     -> registry.setAgent(agent) ; agent.setAuditor(registry)
 *     -> MantleProofLicense(agent, treasury, auditPrice, subPrice, owner)
 *     -> DecisionLog()
 *
 * Audit staking is DEACTIVATED (roadmap): the StakingPool + 2 MNT Tier-2 stake
 * + dispute-slashing were removed, so audits anchor for gas only and the
 * registry constructor no longer takes a pool address. StakingPool.sol remains
 * in-tree (undeployed) as the future economic-security layer. For the minimal
 * staking-removal redeploy that reuses the existing agent, see
 * scripts/redeploy-registry-nostake.ts.
 *
 * Writes deployments/<network>.addresses.json (committed).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { ethers, network } from "hardhat";
import { registriesFor } from "../config/registries";

async function main(): Promise<void> {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const [deployer] = await ethers.getSigners();
  const owner = deployer.address;

  const reg = registriesFor(chainId);
  const identity = process.env.MANTLE_IDENTITY_REGISTRY || reg.identityRegistry;
  const reputation = process.env.MANTLE_REPUTATION_REGISTRY || reg.reputationRegistry;

  const oracleSigner = process.env.ORACLE_SIGNER_PRIVATE_KEY
    ? new ethers.Wallet(process.env.ORACLE_SIGNER_PRIVATE_KEY).address
    : owner;
  const agentTokenId = BigInt(process.env.MANTLEPROOF_AGENT_TOKEN_ID ?? "0");
  const auditPrice = ethers.parseEther(process.env.AUDIT_PRICE_MNT ?? "0.5");
  const subPrice = ethers.parseEther(process.env.SUB_PRICE_MNT ?? "5");

  console.log(`[deploy] network=${network.name} chainId=${chainId} owner=${owner}`);
  console.log(`[deploy] identity=${identity} reputation=${reputation}`);
  console.log(`[deploy] oracleSigner=${oracleSigner}`);
  if (agentTokenId === 0n) {
    console.warn("[deploy] WARNING: MANTLEPROOF_AGENT_TOKEN_ID unset (T5 pending)");
  }

  // 1. TreasurySplit (no deps).
  const treasury = await (
    await ethers.getContractFactory("TreasurySplit")
  ).deploy(owner);
  await treasury.waitForDeployment();
  console.log(`[deploy] TreasurySplit  = ${await treasury.getAddress()}`);

  // 2. MantleProofRegistry — staking deactivated, so the constructor is just
  //    (oracleSigner, owner); no StakingPool to pre-deploy or address-predict.
  const registry = await (
    await ethers.getContractFactory("MantleProofRegistry")
  ).deploy(oracleSigner, owner);
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log(`[deploy] Registry       = ${registryAddr}`);

  // 3. MantleProofAgent + bidirectional wiring.
  const agent = await (
    await ethers.getContractFactory("MantleProofAgent")
  ).deploy(identity, reputation, agentTokenId, owner);
  await agent.waitForDeployment();
  console.log(`[deploy] Agent          = ${await agent.getAddress()}`);

  await (await registry.setAgent(await agent.getAddress())).wait();
  await (await agent.setAuditor(registryAddr)).wait();

  // 5. License.
  const license = await (
    await ethers.getContractFactory("MantleProofLicense")
  ).deploy(
    await agent.getAddress(),
    await treasury.getAddress(),
    auditPrice,
    subPrice,
    owner,
  );
  await license.waitForDeployment();
  console.log(`[deploy] License        = ${await license.getAddress()}`);

  // 6. DecisionLog.
  const decisionLog = await (
    await ethers.getContractFactory("DecisionLog")
  ).deploy();
  await decisionLog.waitForDeployment();
  console.log(`[deploy] DecisionLog    = ${await decisionLog.getAddress()}`);

  const out = {
    chainId,
    network: network.name,
    deployedAt: new Date().toISOString(),
    owner,
    oracleSigner,
    agentTokenId: agentTokenId.toString(),
    auditPriceWei: auditPrice.toString(),
    subPriceWei: subPrice.toString(),
    staking: "deactivated (roadmap) — audits anchor for gas only",
    officialIdentityRegistry: identity,
    officialReputationRegistry: reputation,
    contracts: {
      MantleProofRegistry: registryAddr,
      MantleProofAgent: await agent.getAddress(),
      TreasurySplit: await treasury.getAddress(),
      MantleProofLicense: await license.getAddress(),
      DecisionLog: await decisionLog.getAddress(),
    },
  };
  mkdirSync("deployments", { recursive: true });
  const path = `deployments/${network.name}.addresses.json`;
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
  console.log(`[deploy] wrote ${path}`);
  console.table(out.contracts);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
