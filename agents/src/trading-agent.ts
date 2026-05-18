/**
 * trading-agent — Demo 2 — getAudit before swapping; high-severity pause() backdoor -> refuse -> DecisionLog tx.
 * All receipts on Mantle MAINNET by Demo Day. SCAFFOLD — implement Week 5.
 */
import { loadKey } from "./lib/wallets.js";

async function main(): Promise<void> {
  void loadKey;
  // TODO(Week 5): orchestrate the demo flow end-to-end; capture txHashes for README.
  throw new Error("SCAFFOLD: trading-agent not implemented (Week 5)");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
