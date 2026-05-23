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

/**
 * Canonical ERC-8004 v2 Reputation Registry on Mantle mainnet 5000.
 * Verified live 2026-05-23 in T37 (`docs/erc8004-abi-notes.md`) — both
 * `getVersion()=="2.0.0"` and `getIdentityRegistry()` matches the
 * canonical Identity Registry. We DO NOT deploy this contract; we read
 * MantleProof's reputation from it directly (T41 — replaces the defunct
 * `MantleProofAgent.reputation()` view, which was compiled against a
 * fictional interface and reverts on-chain at runtime).
 */
export const REPUTATION_REGISTRY_ADDRESS =
  (import.meta.env.VITE_REPUTATION_REGISTRY_ADDRESS as `0x${string}`) ??
  ("0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const);

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

// `agentAbi` deliberately omits `reputation()` and `agentURI()` — both views
// were compiled against the fictional pre-T38 IEIP8004 interface and revert
// on-chain (see contracts/contracts/MantleProofAgent.sol). The frontend
// reads reputation from REPUTATION_REGISTRY_ADDRESS directly via
// `reputationRegistryAbi` below; identity tokenURI is read from the
// canonical Identity Registry (T41).
export const agentAbi = parseAbi([
  "function memoryRoot() view returns (bytes32)",
  "function auditsPerformed() view returns (uint256)",
  "function agentTokenId() view returns (uint256)",
  "function agentOwner() view returns (address)",
]);

/**
 * Minimal read ABI for the canonical ERC-8004 v2 Reputation Registry.
 * Mirrors `engine/mantleproof/reputation/feedback.py` + the verified
 * Phase-0 ABI in `docs/erc8004-abi-notes.md`. Critical: `getSummary`
 * REQUIRES non-empty `clientAddresses` (reverts otherwise) — callers
 * MUST first call `getClients(agentId)` and pass the result.
 */
export const reputationRegistryAbi = parseAbi([
  "function getClients(uint256 agentId) view returns (address[])",
  "function getLastIndex(uint256 agentId, address clientAddress) view returns (uint64)",
  "function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) view returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)",
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
  "function getVersion() pure returns (string)",
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
    address: "0x8F6679EB031799fc9C5e149DFb75b4543808912F",
    label: "BackdooredMemeToken (Demo 2)",
    provenance: "trading-agent target — pause() backdoor",
  },
  {
    address: "0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a",
    label: "Merchant Moe LBRouter v2.2 (Demo 3)",
    provenance: "yield-agent target — canonical mainnet protocol",
  },
  {
    address: "0xE6829d9a7eE3040e1276Fa75293Bde931859e8fA",
    label: "cmETH — restaked mETH receipt (Audit 4)",
    provenance: "live production audit — mETH Protocol's LayerZero-bridged restaking token on Mantle",
  },
  {
    address: "0x5bE26527e817998A7206475496fDE1E68957c5a6",
    label: "USDYW — Ondo wrapped RWA (Audit 5)",
    provenance: "live production audit — Ondo's wrapped USDY on Mantle",
  },
  {
    address: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2",
    label: "sUSDe — Ethena staked USDe OFT (Audit 6)",
    provenance: "live production audit — Ethena yield-bearing stable bridged via LayerZero",
  },
  {
    address: "0xB65E1C3ab3072d5fBF25A5bF625318E3035D4505",
    label: "ChainIdReplayPermit (Bait 7)",
    provenance: "self-deployed bait — EIP-712 domain hardcodes chainId=1; bait for check #5 (replay)",
  },
  {
    address: "0xeB19da38EcdAec1aAAAdE76098c7f3cAf24Ec1F0",
    label: "MisaccountedMethVault (Bait 8)",
    provenance: "self-deployed bait — mETH balance-proportional accounting, no exchange-rate read; bait for check #2 (mETH math)",
  },
] as const;
