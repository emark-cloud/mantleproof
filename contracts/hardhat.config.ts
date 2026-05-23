import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

// Single repo-root .env (see CLAUDE.md — do not scatter .env files).
dotenv.config({ path: "../.env" });

const accounts = process.env.DEPLOYER_PRIVATE_KEY
  ? [process.env.DEPLOYER_PRIVATE_KEY]
  : [];

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "cancun",
        },
      },
    ],
    // Test mocks for ERC-8004 v2 mirror the canonical contracts' wide
    // function signatures (giveFeedback has 8 args, readAllFeedback returns
    // 7 dynamic arrays) which trip solc's stack-too-deep limit without
    // viaIR. Production contracts compile with the project default
    // (optimizer + EVM cancun); only the test stand-ins use viaIR so the
    // shipped bytecode is unchanged.
    overrides: {
      "contracts/test/MockReputationRegistry.sol": {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "cancun",
          viaIR: true,
        },
      },
    },
  },
  networks: {
    // Develop here (testnet-first).
    mantleSepolia: {
      url: process.env.MANTLE_SEPOLIA_RPC_URL ?? "https://rpc.sepolia.mantle.xyz",
      chainId: 5003,
      accounts,
    },
    // Final deploy + all demo receipts only — after the mainnet cutover gate.
    mantle: {
      url: process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz",
      chainId: 5000,
      accounts,
    },
  },
  // Etherscan API V2 (mandatory since 2026 — V1 per-explorer endpoints are
  // shut down). ONE etherscan.io key, routed by chainId via the unified
  // endpoint; covers Mantle 5000 + Sepolia 5003. Get a free key at
  // https://etherscan.io/myapikey (see docs/setup-checklist.md).
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY ?? "",
    customChains: [
      {
        network: "mantle",
        chainId: 5000,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://mantlescan.xyz",
        },
      },
      {
        network: "mantleSepolia",
        chainId: 5003,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://sepolia.mantlescan.xyz",
        },
      },
    ],
  },
};

export default config;
