#!/usr/bin/env node
/**
 * MantleProof CLI — entry point.
 *
 *   mantleproof verify          live verification against Mantle mainnet
 *   mantleproof check 0x…       audit any Mantle contract (free read, no wallet)
 *
 * Everything is a public read. No private key is ever required or used.
 */
import { runVerify } from "./verify.js";
import { runCheck } from "./check.js";
import { c } from "./ui.js";

function help(): void {
  console.log(`
${c.bold("mantleproof")} — the on-chain audit oracle for Mantle's agentic economy

${c.bold("Usage")}
  mantleproof verify              Verify MantleProof is live on Mantle mainnet
  mantleproof check <address>     Audit a Mantle contract (free read, no wallet)
  mantleproof help                Show this help

${c.bold("Examples")}
  npx mantleproof verify
  npx mantleproof check 0x1892f77e335c133ce4a7b28555f13ba74cbb76fa

${c.bold("Environment")}
  MANTLE_RPC_URL   use a single RPC instead of the built-in fallback list
  ENGINE_URL       optional engine base URL for the Tier-2-reachable check
  NO_COLOR         disable ANSI colors
`);
}

async function main(): Promise<number> {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case "verify":
      return runVerify();
    case "check":
      return runCheck(arg);
    case undefined:
    case "help":
    case "-h":
    case "--help":
      help();
      return 0;
    default:
      console.error(c.red(`unknown command: ${cmd}`));
      help();
      return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(c.red(`fatal: ${e instanceof Error ? e.message : String(e)}`));
    process.exit(1);
  });
