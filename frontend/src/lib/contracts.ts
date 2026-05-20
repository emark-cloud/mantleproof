/**
 * Canonical on-chain references for the frontend.
 *
 * Sourced from `contracts/deployments/mantle.addresses.json` (T25 cutover deploy,
 * 2026-05-19). These are mainnet 5000 contracts; Sepolia rehearsal stack lives
 * in `mantleSepolia.addresses.json` and is loadable via `VITE_DEPLOYMENTS` for
 * a testnet build, but we ship mainnet by default — the dashboard's job is to
 * make the live mainnet receipts believable.
 */
import { parseAbi } from "viem";

export const REGISTRY_ADDRESS =
  (import.meta.env.VITE_REGISTRY_ADDRESS as `0x${string}`) ??
  ("0x60E97c83Dd184D3B0812Ce25430e9D6930eD63aE" as const);

export const AGENT_ADDRESS =
  (import.meta.env.VITE_AGENT_ADDRESS as `0x${string}`) ??
  ("0x966A385A7C56794E1Bb40C9F0f73cCDaA0724503" as const);

export const DECISION_LOG_ADDRESS =
  (import.meta.env.VITE_DECISION_LOG_ADDRESS as `0x${string}`) ??
  ("0x1823359f0a5bB8b2af71a55200B08ECcCedFec6f" as const);

export const LICENSE_ADDRESS =
  (import.meta.env.VITE_LICENSE_ADDRESS as `0x${string}`) ??
  ("0x906390B3594384bE83F3465cFeDf8661f4d1a410" as const);

export const TREASURY_ADDRESS =
  (import.meta.env.VITE_TREASURY_ADDRESS as `0x${string}`) ??
  ("0x53459fb149CB1772ea389ACE325501DA2B28E437" as const);

export const MANTLE_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 5000);
export const AGENT_TOKEN_ID = 96n; // MantleProof's own ERC-8004 identity (T5).

/* --------------------------------- ABIs --------------------------------- */

// Minimal read ABI — mirrors `engine/mantleproof/persistence/registry_reader.py`
// so frontend & engine read the SAME on-chain shape.
export const registryAbi = parseAbi([
  "function auditCount(address) view returns (uint256)",
  "function isAudited(address) view returns (bool)",
  "function oracleSigner() view returns (address)",
  "function getAudit(address) view returns ((bytes32 rootHash, uint8 severity, string ipfsCID, uint64 timestamp, address submitter))",
  "event AuditSubmitted(address indexed target, bytes32 indexed rootHash, uint8 severity, string ipfsCID)",
]);

export const agentAbi = parseAbi([
  "function memoryRoot() view returns (bytes32)",
  "function auditsPerformed() view returns (uint256)",
  "function agentTokenId() view returns (uint256)",
  "function agentOwner() view returns (address)",
  "function reputation() view returns (uint256)",
  "function agentURI() view returns (string)",
]);

export const decisionLogAbi = parseAbi([
  "function count() view returns (uint256)",
  "event Decision(address indexed agent, address indexed target, bytes32 indexed auditRootHash, string action, string reason)",
]);

/* ------------------------------ Severity enum ------------------------------ */

// Matches `IMantleProofRegistry.Severity` (Solidity) + `severity_from_uint8`
// (engine). Keep these aligned — drift here = wrong colors on the dashboard.
export const SEVERITY_BY_UINT: Record<number, "info" | "low" | "medium" | "high"> = {
  0: "info",
  1: "low",
  2: "medium",
  3: "high",
};

/* ------------------------- Known audited targets ------------------------- */

/**
 * The three audits anchored by the demo flows on Mantle mainnet. Until the
 * cache-warmer (T29) lands and an index of all anchored audits exists, the
 * dashboard's "priority cache" panel reads from this hand-curated list — every
 * row here has a verifiable on-chain rootHash (see TODO.md Decisions log
 * 2026-05-20 T28). Honest UI: we don't pretend the cache has 200 entries.
 */
export const KNOWN_TARGETS: readonly { address: `0x${string}`; label: string; provenance: string }[] = [
  {
    address: "0x1892f77e335C133Ce4a7B28555f13bA74cBB76fA",
    label: "BuggyYieldVault (Demo 1)",
    provenance: "agent-deployed contract, intentionally vulnerable",
  },
  {
    address: "0x8f66c8B7AB07c2cF6db52a07d1Dd3C9c7f1c912f",
    label: "BackdooredMemeToken (Demo 2)",
    provenance: "trading-agent target — pause() backdoor",
  },
  {
    address: "0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a",
    label: "Merchant Moe LBRouter v2.2 (Demo 3)",
    provenance: "yield-agent target — canonical mainnet protocol",
  },
] as const;
