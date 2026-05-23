/**
 * Per-chain block-explorer URL helpers. Single source of truth so `TxLink`
 * and `Address` don't drift, and so the x402 receipt panel can link tx and
 * address pages on the *payment* chain (Base) and the *anchor* chain
 * (Mantle) with the same primitives.
 *
 * Unknown chainId → empty string; callers fall back to plain text.
 *
 * Coverage:
 *   5000  — Mantle mainnet      (mantlescan.xyz)
 *   5003  — Mantle Sepolia      (5003.testnet.routescan.io)
 *   8453  — Base mainnet        (basescan.org)
 *   84532 — Base Sepolia        (sepolia.basescan.org)
 */

const TX_BASE: Record<number, string> = {
  5000: "https://mantlescan.xyz/tx",
  5003: "https://5003.testnet.routescan.io/tx",
  8453: "https://basescan.org/tx",
  84532: "https://sepolia.basescan.org/tx",
};

const ADDRESS_BASE: Record<number, string> = {
  5000: "https://mantlescan.xyz/address",
  5003: "https://5003.testnet.routescan.io/address",
  8453: "https://basescan.org/address",
  84532: "https://sepolia.basescan.org/address",
};

export function txUrl(chainId: number, hash: string): string {
  const base = TX_BASE[chainId];
  return base ? `${base}/${hash}` : "";
}

export function addressUrl(chainId: number, address: string): string {
  const base = ADDRESS_BASE[chainId];
  return base ? `${base}/${address}` : "";
}
