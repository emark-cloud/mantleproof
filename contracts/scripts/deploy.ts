/**
 * Path B deploy: EIP-8004 registries + MantleProof contracts + DecisionLog.
 * SCAFFOLD — orchestration skeleton only, implement in T3/T4.
 *
 * Order: IdentityRegistry -> ReputationRegistry -> ValidationRegistry
 *      -> MantleProofRegistry(oracleSigner) -> MantleProofAgent
 *      -> MantleProofLicense -> TreasurySplit -> DecisionLog
 * Writes deployments/<network>.addresses.json (committed).
 */
import hre from "hardhat";

async function main(): Promise<void> {
  const net = hre.network.name; // mantleSepolia (dev) | mantle (post-cutover)
  console.log(`[deploy] network=${net} — SCAFFOLD, not implemented`);
  // TODO(T3/T4): deploy contracts in order, save addresses json, log tx hashes.
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
