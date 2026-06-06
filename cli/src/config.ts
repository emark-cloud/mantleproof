/**
 * Bundled Mantle mainnet (chainId 5000) configuration.
 *
 * These addresses are immutable on-chain artifacts (the deployed MantleProof
 * contracts + Mantle's canonical ERC-8004 registries). They are bundled — not
 * read from `contracts/deployments/` — so `npx mantleproof verify` works for a
 * judge who has never cloned the repo. Source of truth for the deploy is
 * `contracts/deployments/mantle.addresses.json`; keep this in sync with it.
 *
 * Everything the CLI does is a public read. No private key is ever used.
 */
import type { Address, Hex } from "viem";

export const CHAIN_ID = 5000 as const;
export const RPC_URL = process.env.MANTLE_RPC_URL || "https://rpc.mantle.xyz";
export const EXPLORER = "https://mantlescan.xyz";

/** MantleProof's own ERC-8004 agent identity tokenId (assigned on registration). */
export const AGENT_TOKEN_ID = 96n;

export const ADDR = {
  registry: "0x5CEafE0FD8b2A9BD2eC6aCdf3f5e024c21CA65A5" as Address,
  agent: "0x6661Fb91CfA5F5691E3F80cA319b665824CB02e9" as Address,
  stakingPool: "0x2E279f4cAE39B5d0Fa57e08D0d455Ec9f6080ee9" as Address,
  license: "0x51fA686747ea148f6BeC7e30390C8B929DC45447" as Address,
  treasurySplit: "0xEaea8a20288528ea6E55B619DB3F7442890c9600" as Address,
  decisionLog: "0x11B395452e2bF8Ab20F21cd4deA8f9a7650CCf65" as Address,
  identityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as Address,
  reputationRegistry: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as Address,
} as const;

/** The immutable oracle-signer — the only writer to `submitAudit`. */
export const ORACLE_SIGNER =
  "0x9f17b625902B0d35a02fd790aF45cf95e9F4638a" as Address;

/**
 * Known audited targets, used by `verify` to discover the most-recent anchored
 * audit via the per-target `getAudit` view (the registry has no global audit
 * enumeration). Targets that were never audited revert `UnknownTarget` and are
 * skipped, so an over-broad list self-filters — these are just the demo targets.
 */
export const KNOWN_TARGETS: readonly Address[] = [
  "0x1892f77e335c133ce4a7b28555f13ba74cbb76fa", // Demo 1 — BuggyYieldVault
  "0x8f6679eb031799fc9c5e149dfb75b4543808912f", // Demo 2 — BackdooredMemeToken
  "0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a", // Demo 3 — Merchant Moe LBRouter
] as const;

/** Optional engine health endpoint for the bonus Tier-2-reachable check. */
export const ENGINE_URL = process.env.ENGINE_URL || "";

export type { Address, Hex };
