/**
 * Path A deploy (T1 resolved) + Disputes/Staking (T43, docs/update.md): we do
 * NOT deploy ERC-8004 registries — Mantle issues the identity NFT automatically.
 * Deploy 6 contracts:
 *
 *   TreasurySplit(owner)
 *     -> StakingPool(predictedRegistryAddr, treasury)
 *     -> MantleProofRegistry(oracleSigner, owner, stakingPool)
 *     -> MantleProofAgent(identityRegistry, reputationRegistry, tokenId, owner)
 *     -> registry.setAgent(agent) ; agent.setAuditor(registry)
 *     -> MantleProofLicense(agent, treasury, auditPrice, subPrice, owner)
 *     -> DecisionLog()
 *
 * StakingPool's `registry` is `immutable`, so we must know the registry
 * address BEFORE the pool is deployed. We compute it from the deployer nonce
 * via CREATE address derivation (no CREATE2 needed since we control the
 * nonce sequence in this script).
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

  // 2. StakingPool — its `registry` is immutable, so we must predict the
  //    Registry's CREATE address from the deployer's next-but-one nonce.
  //    "pending" so the just-mined TreasurySplit nonce IS counted (some RPCs
  //    lag on "latest" right after waitForDeployment, off-by-one corruption).
  const currentNonce = await ethers.provider.getTransactionCount(
    deployer.address,
    "pending",
  );
  const predictedRegistry = ethers.getCreateAddress({
    from: deployer.address,
    nonce: currentNonce + 1, // pool deploys at currentNonce, registry at +1
  });
  console.log(`[deploy] predicted Registry address: ${predictedRegistry}`);

  const stakingPool = await (
    await ethers.getContractFactory("StakingPool")
  ).deploy(predictedRegistry, await treasury.getAddress());
  await stakingPool.waitForDeployment();
  console.log(`[deploy] StakingPool    = ${await stakingPool.getAddress()}`);

  // 3. MantleProofRegistry — uses the predicted address (which now matches).
  const registry = await (
    await ethers.getContractFactory("MantleProofRegistry")
  ).deploy(oracleSigner, owner, await stakingPool.getAddress());
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log(`[deploy] Registry       = ${registryAddr}`);
  if (registryAddr.toLowerCase() !== predictedRegistry.toLowerCase()) {
    throw new Error(
      `[deploy] FATAL: predicted ${predictedRegistry} != actual ${registryAddr} ` +
        `— StakingPool would mis-wire. Abort and investigate nonce drift.`,
    );
  }

  // 4. MantleProofAgent + bidirectional wiring.
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
    tier2StakeWei: ethers.parseEther("2").toString(),
    officialIdentityRegistry: identity,
    officialReputationRegistry: reputation,
    contracts: {
      MantleProofRegistry: registryAddr,
      MantleProofAgent: await agent.getAddress(),
      TreasurySplit: await treasury.getAddress(),
      StakingPool: await stakingPool.getAddress(),
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
