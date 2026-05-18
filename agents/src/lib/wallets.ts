/** Per-agent funded wallet loaders (own keys, real MNT/USDC). SCAFFOLD — T26-28.
 * Reads ../.env (single repo-root env). Testnet-first: rehearse on Sepolia
 * before re-pointing at mainnet. */
import "dotenv/config";

export function loadKey(name: string): `0x${string}` {
  const k = process.env[name];
  if (!k) throw new Error(`missing ${name} in .env`);
  return k as `0x${string}`;
}
