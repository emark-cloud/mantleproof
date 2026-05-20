/**
 * Deploy the two bait contracts (ChainIdReplayPermit + MisaccountedMethVault)
 * that fill the check-dimension audit matrix for the demo. These exist solely
 * to be audited; they DO NOT participate in any agent flow.
 *
 * Usage:
 *   pnpm exec hardhat run scripts/deploy-bait.ts --network mantle
 *   pnpm exec hardhat run scripts/deploy-bait.ts --network mantleSepolia
 *
 * Writes addresses to deployments/<network>.bait.json (committed).
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { ethers, network } from "hardhat";

async function main(): Promise<void> {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const [deployer] = await ethers.getSigners();
  console.log(`[deploy-bait] network=${network.name} chainId=${chainId}`);
  console.log(`[deploy-bait] deployer=${deployer.address}`);

  const Replay = await ethers.getContractFactory("ChainIdReplayPermit");
  const replay = await Replay.deploy();
  await replay.waitForDeployment();
  const replayAddr = await replay.getAddress();
  console.log(`[deploy-bait] ChainIdReplayPermit -> ${replayAddr}`);

  const Vault = await ethers.getContractFactory("MisaccountedMethVault");
  const vault = await Vault.deploy();
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log(`[deploy-bait] MisaccountedMethVault -> ${vaultAddr}`);

  const outDir = `${__dirname}/../deployments`;
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = `${outDir}/${network.name}.bait.json`;
  const existing = existsSync(outPath)
    ? JSON.parse(readFileSync(outPath, "utf8"))
    : {};
  const payload = {
    ...existing,
    chainId,
    network: network.name,
    deployer: deployer.address,
    contracts: {
      ...(existing.contracts ?? {}),
      ChainIdReplayPermit: replayAddr,
      MisaccountedMethVault: vaultAddr,
    },
    deployedAt: new Date().toISOString(),
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  console.log(`[deploy-bait] wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
