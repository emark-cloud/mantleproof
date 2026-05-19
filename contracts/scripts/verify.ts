/**
 * Verify deployed contracts on the explorer (Etherscan-compatible).
 * Mantle mainnet = api.mantlescan.xyz; Sepolia = api-sepolia.mantlescan.xyz
 * (one MANTLESCAN_API_KEY covers both — confirmed 2026-05-19).
 * Reconstructs constructor args identically to scripts/deploy.ts.
 */
import { readFileSync } from "node:fs";
import hre, { ethers, network } from "hardhat";

async function main(): Promise<void> {
  const dep = JSON.parse(
    readFileSync(`deployments/${network.name}.addresses.json`, "utf8"),
  );
  const c = dep.contracts;
  const owner: string =
    dep.owner ?? (await ethers.getSigners())[0].address;
  const auditPrice = ethers.parseEther(process.env.AUDIT_PRICE_MNT ?? "0.5");
  const subPrice = ethers.parseEther(process.env.SUB_PRICE_MNT ?? "5");

  const jobs: Array<{ name: string; address: string; args: unknown[] }> = [
    {
      name: "MantleProofRegistry",
      address: c.MantleProofRegistry,
      args: [dep.oracleSigner, owner],
    },
    {
      name: "MantleProofAgent",
      address: c.MantleProofAgent,
      args: [
        dep.officialIdentityRegistry,
        dep.officialReputationRegistry,
        BigInt(dep.agentTokenId ?? "0"),
        owner,
      ],
    },
    { name: "TreasurySplit", address: c.TreasurySplit, args: [owner] },
    {
      name: "MantleProofLicense",
      address: c.MantleProofLicense,
      args: [c.MantleProofAgent, c.TreasurySplit, auditPrice, subPrice, owner],
    },
    { name: "DecisionLog", address: c.DecisionLog, args: [] },
  ];

  for (const j of jobs) {
    try {
      await hre.run("verify:verify", {
        address: j.address,
        constructorArguments: j.args,
      });
      console.log(`[verify] OK   ${j.name} ${j.address}`);
    } catch (e) {
      const msg = (e as Error).message;
      if (/already verified/i.test(msg)) {
        console.log(`[verify] SKIP ${j.name} (already verified)`);
      } else {
        console.error(`[verify] FAIL ${j.name}: ${msg}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
