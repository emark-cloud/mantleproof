/** Per-agent funded wallet loaders (own keys, real MNT/USDC).
 * Reads the single repo-root .env (CLAUDE.md: do NOT scatter .env files).
 * Testnet-first: rehearse on Sepolia before re-pointing at mainnet. */
import { resolve } from "node:path";
import { config as dotenvConfig } from "dotenv";

// CLAUDE.md mandates one .env at the repo root; cwd may be agents/ when run
// via `pnpm demo:*` so we resolve relative to this file, not cwd.
dotenvConfig({ path: resolve(import.meta.dirname, "../../../.env") });

export function loadKey(name: string): `0x${string}` {
  const k = process.env[name];
  if (!k) throw new Error(`missing ${name} in .env`);
  return k as `0x${string}`;
}
