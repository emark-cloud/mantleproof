/**
 * Path A deploy (T1 resolved): we do NOT deploy ERC-8004 registries — Mantle
 * issues the identity NFT automatically. Deploy 4 contracts + DecisionLog and
 * wire MantleProofAgent to Mantle's official registry addresses.
 * SCAFFOLD — orchestration skeleton only, implement in T3/T4.
 *
 * Order: MantleProofRegistry(oracleSigner)
 *      -> MantleProofAgent(identityRegistry, reputationRegistry, agentTokenId)
 *         // registries from config/registries.ts (verified canonical, per-chain;
 *         // env MANTLE_IDENTITY_REGISTRY/MANTLE_REPUTATION_REGISTRY override).
 *         // agentTokenId = MANTLEPROOF_AGENT_TOKEN_ID (Mantle-issued, T5).
 *      -> MantleProofLicense -> TreasurySplit -> DecisionLog
 * Writes deployments/<network>.addresses.json (committed).
 */
import hre from "hardhat";
import { registriesFor } from "../config/registries";

void registriesFor; // TODO(T3/T4): wire into MantleProofAgent deploy.

async function main(): Promise<void> {
  const net = hre.network.name; // mantleSepolia (dev) | mantle (post-cutover)
  console.log(`[deploy] network=${net} — SCAFFOLD, not implemented`);
  // TODO(T3/T4): deploy contracts in order, save addresses json, log tx hashes.
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
