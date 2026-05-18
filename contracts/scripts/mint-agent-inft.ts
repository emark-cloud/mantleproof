/**
 * Path A: Mantle auto-issues MantleProof's ERC-8004 identity NFT — we do NOT
 * mint/register it ourselves. This script resolves the Mantle-issued tokenId
 * (via MANTLE_IDENTITY_REGISTRY) and records it for MantleProofAgent wiring.
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
