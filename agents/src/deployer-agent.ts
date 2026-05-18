/**
 * deployer-agent — Demo 1 — pay for a pre-deploy audit, read the finding, decline + redeploy. Receipt: payForAudit tx + submitAudit tx.
 * All receipts on Mantle MAINNET by Demo Day. SCAFFOLD — implement Week 5.
 */
import { loadKey } from "./lib/wallets.js";

async function main(): Promise<void> {
  void loadKey;
  // TODO(Week 5): orchestrate the demo flow end-to-end; capture txHashes for README.
  throw new Error("SCAFFOLD: deployer-agent not implemented (Week 5)");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
