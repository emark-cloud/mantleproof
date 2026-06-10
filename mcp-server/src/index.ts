#!/usr/bin/env node
/**
 * mantleproof-mcp — stdio MCP server exposing the MantleProof audit oracle as
 * three tools any agent can call (T23).
 *
 * The spec (docs/design.md §6.3, "/agent/:tokenId page") commits to exactly
 * three tools:
 *
 *   auditContract(address, tier)  · tier 1 free · tier 2 0.50 USDC on base
 *   getAudit(address)             · free, read-only
 *   requestAudit(address, tier)   · x402, settles on base eip155:8453
 *
 * All three return the same canonical JSON shape the REST API does (T7) — the
 * MCP server is intentionally a thin wrapper over the engine HTTP API, so the
 * three query surfaces (on-chain getAudit, REST, MCP) carry identical data.
 *
 * Status note: ``getAudit`` is fully live today; ``auditContract`` is
 * cache-first (returns the cached audit if one exists); ``requestAudit`` is
 * honestly gated on T11 (x402 paywall endpoint) and refuses rather than
 * fabricating a payment receipt.
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

const transport = new StdioServerTransport();
await server.connect(transport);
