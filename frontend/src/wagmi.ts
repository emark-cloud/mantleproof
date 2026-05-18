/** wagmi v2 + viem chain config for Mantle. SCAFFOLD — used by T7/T24. */
import { http, createConfig } from "wagmi";
import { defineChain } from "viem";

export const mantle = defineChain({
  id: 5000,
  name: "Mantle",
  nativeCurrency: { name: "Mantle", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mantle.xyz"] } },
  blockExplorers: { default: { name: "Mantlescan", url: "https://mantlescan.xyz" } },
});

export const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "Mantle", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.sepolia.mantle.xyz"] } },
  blockExplorers: {
    default: { name: "Routescan", url: "https://5003.testnet.routescan.io" },
  },
  testnet: true,
});

export const config = createConfig({
  chains: [mantleSepolia, mantle],
  transports: {
    [mantle.id]: http(),
    [mantleSepolia.id]: http(),
  },
});
