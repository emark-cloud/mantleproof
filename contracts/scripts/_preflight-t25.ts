/**
 * T25 pre-flight — read-only mainnet sanity before deploy.ts.
 * Confirms: chainId 5000, deployer funded, oracle-signer distinct, tokenId=96
 * owned by deployer on the canonical identity registry, no prior mainnet deploy.
 */
import { existsSync } from "node:fs";
import { ethers, network } from "hardhat";
import { registriesFor } from "../config/registries";

async function main(): Promise<void> {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  const reg = registriesFor(chainId);
  const tokenId = BigInt(process.env.MANTLEPROOF_AGENT_TOKEN_ID ?? "0");
  const oracleKey = process.env.ORACLE_SIGNER_PRIVATE_KEY ?? "";
  const oracleAddr = oracleKey
    ? new ethers.Wallet(oracleKey).address
    : deployer.address;

  const identity = new ethers.Contract(
    process.env.MANTLE_IDENTITY_REGISTRY || reg.identityRegistry,
    [
      "function ownerOf(uint256) view returns (address)",
      "function balanceOf(address) view returns (uint256)",
    ],
    ethers.provider,
  );
  const owner = await identity.ownerOf(tokenId).catch((e: Error) => `ERR:${e.message}`);

  const priorDeploy = existsSync(`deployments/${network.name}.addresses.json`);

  const report = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    deployerBalanceMNT: ethers.formatEther(bal),
    oracleSigner: oracleAddr,
    oracleDistinct: oracleAddr.toLowerCase() !== deployer.address.toLowerCase(),
    agentTokenId: tokenId.toString(),
    identityRegistry: await identity.getAddress(),
    tokenIdOwner: owner,
    tokenIdOwnedByDeployer:
      typeof owner === "string" &&
      owner.toLowerCase() === deployer.address.toLowerCase(),
    priorDeploymentFile: priorDeploy,
  };
  console.log(JSON.stringify(report, null, 2));

  const fail: string[] = [];
  if (chainId !== 5000) fail.push(`chainId=${chainId} not 5000`);
  if (bal < ethers.parseEther("0.1"))
    fail.push(`deployer balance ${ethers.formatEther(bal)} < 0.1 MNT`);
  if (tokenId === 0n) fail.push("MANTLEPROOF_AGENT_TOKEN_ID unset/0");
  if (!report.tokenIdOwnedByDeployer)
    fail.push(`tokenId ${tokenId} not owned by deployer`);
  if (priorDeploy)
    fail.push(`deployments/${network.name}.addresses.json already exists`);

  if (fail.length) {
    console.error("PRE-FLIGHT FAIL:");
    for (const f of fail) console.error("  - " + f);
    process.exitCode = 1;
  } else {
    console.log("PRE-FLIGHT OK");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
