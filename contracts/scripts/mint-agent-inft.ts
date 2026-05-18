/**
 * Register MantleProof as agent tokenId 1 in the IdentityRegistry.
 * SCAFFOLD — implement in T5.
 */
import hre from "hardhat";

async function main(): Promise<void> {
  console.log(`[mint-agent-inft] network=${hre.network.name} — SCAFFOLD, not implemented`);
  // TODO(T5): registerAgent(tokenURI) -> expect tokenId 1, wire MantleProofAgent.
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
