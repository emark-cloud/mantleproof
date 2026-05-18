/**
 * Path A deploy (T1 resolved): we do NOT deploy ERC-8004 registries — Mantle
 * issues the identity NFT automatically. Deploy 4 contracts + DecisionLog and
 * wire MantleProofAgent to Mantle's official registry addresses.
 *
 * Order: MantleProofRegistry(oracleSigner, owner)
 *      -> MantleProofAgent(identityRegistry, reputationRegistry, tokenId, owner)
 *      -> registry.setAgent(agent) ; agent.setAuditor(registry)
 *      -> TreasurySplit(owner)
 *      -> MantleProofLicense(agent, treasury, auditPrice, subPrice, owner)
 *      -> DecisionLog()
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
  if (agentTokenId === 0n) {
    console.warn("[deploy] WARNING: MANTLEPROOF_AGENT_TOKEN_ID unset (T5 pending)");
  }

  const registry = await (
    await ethers.getContractFactory("MantleProofRegistry")
  ).deploy(oracleSigner, owner);
  await registry.waitForDeployment();

  const agent = await (
    await ethers.getContractFactory("MantleProofAgent")
  ).deploy(identity, reputation, agentTokenId, owner);
  await agent.waitForDeployment();

  await (await registry.setAgent(await agent.getAddress())).wait();
  await (await agent.setAuditor(await registry.getAddress())).wait();

  const treasury = await (
    await ethers.getContractFactory("TreasurySplit")
  ).deploy(owner);
  await treasury.waitForDeployment();

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

  const decisionLog = await (
    await ethers.getContractFactory("DecisionLog")
  ).deploy();
  await decisionLog.waitForDeployment();

  const out = {
    chainId,
    network: network.name,
    deployedAt: new Date().toISOString(),
    oracleSigner,
    agentTokenId: agentTokenId.toString(),
    officialIdentityRegistry: identity,
    officialReputationRegistry: reputation,
    contracts: {
      MantleProofRegistry: await registry.getAddress(),
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
