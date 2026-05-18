/**
 * Official Mantle ERC-8004 registry addresses (Path A — T1b resolved 2026-05-18).
 *
 * We do NOT deploy these — Mantle issues each agent's ERC-8004 identity NFT as an
 * integrated hackathon feature. `MantleProofAgent` is wired to these at deploy.
 * Source: github.com/erc-8004/erc-8004-contracts (canonical, curated by the 8004
 * team). Verified live via eth_getCode on each network's RPC on 2026-05-18.
 *
 * Addresses are deterministic per environment: the mainnet set is identical
 * across Ethereum/Base/Mantle/etc.; the testnet set is identical across testnets.
 * Validation Registry: not separately deployed by the 8004 team — MantleProof
 * does not need it (we use Identity + Reputation only).
 *
 * Override via env (MANTLE_IDENTITY_REGISTRY / MANTLE_REPUTATION_REGISTRY) only
 * if Mantle publishes different canonical addresses.
 */
export type RegistrySet = {
  identityRegistry: `0x${string}`;
  reputationRegistry: `0x${string}`;
};

export const ERC8004_REGISTRIES: Record<number, RegistrySet> = {
  // Mantle mainnet
  5000: {
    identityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    reputationRegistry: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  },
  // Mantle Sepolia (develop here)
  5003: {
    identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  },
};

export function registriesFor(chainId: number): RegistrySet {
  const set = ERC8004_REGISTRIES[chainId];
  if (!set) throw new Error(`No ERC-8004 registry set for chainId ${chainId}`);
  return set;
}
