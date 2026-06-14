#!/usr/bin/env node
/**
 * mantleproof-mcp — stdio MCP server exposing the MantleProof audit oracle as
 * four tools any agent can call (T23).
 *
 *   auditContract(address, tier)  · cache-first lookup
 *   getAudit(address)             · free, read-only on-chain lookup
 *   requestAudit(address, tier)   · x402 — surfaces what to sign (no key held)
 *   payAndAudit(address, tier)    · x402 — completes the dance with the agent's
 *                                   own wallet; commissions a fresh Tier-2 audit
 *
 * All return the same canonical JSON shape the REST API does (T7) — the MCP
 * server is intentionally a thin wrapper over the engine HTTP API, so the query
 * surfaces (on-chain getAudit, REST, MCP) carry identical data.
 *
 * Status note: ``getAudit`` is fully live; ``auditContract`` is cache-first;
 * ``requestAudit`` surfaces the 402 requirements but holds no key (refuses to
 * fabricate a receipt); ``payAndAudit`` completes the full x402 dance using the
 * agent's OWN payer wallet (MANTLEPROOF_PAYER_KEY, else an ephemeral wallet) —
 * never the oracle-signer key, and every returned tx hash is a real settlement.
 *
 * Add to Claude Code (zero config — defaults to the hosted engine):
 *   claude mcp add mantleproof -- npx -y mantleproof-mcp
 *
 * Claude Desktop config:
 *   { "mcpServers": { "mantleproof": { "command": "npx",
 *     "args": ["-y", "mantleproof-mcp"] } } }
 *
 * Point at a local engine with MANTLEPROOF_API_BASE=http://localhost:8000.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { auditContract } from "./tools/auditContract.js";
import { getAudit } from "./tools/getAudit.js";
import { payAndAudit } from "./tools/payAndAudit.js";
import { requestAudit } from "./tools/requestAudit.js";

const server = new McpServer({ name: "mantleproof", version: "0.1.0" });

server.tool(
  "auditContract",
  "Cache-first audit lookup. Returns the latest anchored MantleProof audit " +
    "for `address`; if none exists, points the agent at requestAudit. Same " +
    "JSON shape as the REST /api/audit endpoint.",
  { address: z.string().describe("EVM contract address to audit (0x…40)"),
    tier: z.number().int().min(1).max(2).default(2)
      .describe("Audit tier the caller wants (1 free, 2 paid via x402).") },
  async ({ address, tier }) => auditContract(address, tier),
);

server.tool(
  "getAudit",
  "Read-only on-chain lookup against MantleProofRegistry.getAudit(address). " +
    "Joins the on-chain anchor with the IPFS report and verifies keccak " +
    "integrity. Free, no payment, no signer. Returns 404 if not audited.",
  { address: z.string().describe("EVM contract address (0x…40)") },
  async ({ address }) => getAudit(address),
);

server.tool(
  "requestAudit",
  "Paid Tier-2 audit via x402: settles USDC on Base (eip155:8453), anchors on " +
    "Mantle (eip155:5000). Returns both txHashes. NOTE: this endpoint is gated " +
    "on project task T11 and will refuse rather than fabricate a receipt; use " +
    "getAudit until T11 ships.",
  { address: z.string().describe("EVM contract address to audit (0x…40)"),
    tier: z.number().int().min(1).max(2).default(2)
      .describe("Audit tier (default 2 — Tier-1 is free, no payment needed).") },
  async ({ address, tier }) => requestAudit(address, tier),
);

server.tool(
  "payAndAudit",
  "Commission a FRESH Tier-2 audit and pay for it with the agent's own wallet. " +
    "Cache-first (free if already audited); otherwise completes the full x402 " +
    "dance: signs an EIP-3009 USDC payment on Base (eip155:8453), the engine " +
    "runs the pipeline + hallucination guard, anchors on Mantle (eip155:5000), " +
    "and settles on Base. Returns BOTH txHashes. On first use it auto-creates a " +
    "REUSABLE wallet saved at ~/.mantleproof/wallet.json; if that wallet is " +
    "unfunded, it returns the address for the user to fund ONCE with USDC on " +
    "Base, then reuses it for every future audit (MANTLEPROOF_PAYER_KEY " +
    "overrides). Never uses the oracle key; never fabricates a receipt.",
  { address: z.string().describe("EVM contract address to audit (0x…40)"),
    tier: z.number().int().min(1).max(2).default(2)
      .describe("Audit tier (default 2 — the paid, LLM-reasoned tier).") },
  async ({ address, tier }) => payAndAudit(address, tier),
);

const transport = new StdioServerTransport();
await server.connect(transport);
