/**
 * Verify deployed contracts on the explorer.
 * SCAFFOLD — implement in T4.
 * NOTE: mainnet = Mantlescan (api.mantlescan.xyz). Sepolia = Routescan; confirm
 * the exact apiURL Week 1 (see hardhat.config.ts customChains comment).
 */
import hre from "hardhat";

async function main(): Promise<void> {
  console.log(`[verify] network=${hre.network.name} — SCAFFOLD, not implemented`);
  // TODO(T4): read deployments/<network>.addresses.json, run hre.run("verify:verify").
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
