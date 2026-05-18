#!/usr/bin/env node
/**
 * mantleproof-mcp — stdio MCP server exposing 3 tools over the engine API.
 * SCAFFOLD — registers tool names; handlers delegate to ./tools (T23).
 *
 * Claude Desktop config:
 *   { "mcpServers": { "mantleproof": { "command": "npx",
 *     "args": ["-y", "mantleproof-mcp"] } } }
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { auditContract } from "./tools/auditContract.js";
import { getAudit } from "./tools/getAudit.js";
import { requestAudit } from "./tools/requestAudit.js";

const server = new McpServer({ name: "mantleproof", version: "0.0.0" });

server.tool(
  "auditContract",
  "Pull cached audit, or trigger a paid audit if not cached.",
  { address: z.string() },
  async ({ address }) => auditContract(address),
);

server.tool(
  "getAudit",
  "Read-only lookup from MantleProofRegistry.getAudit(address).",
  { address: z.string() },
  async ({ address }) => getAudit(address),
);

server.tool(
  "requestAudit",
  "Paid Tier 2 audit via x402 (USDC on Base).",
  { address: z.string(), tier: z.number().default(2) },
  async ({ address, tier }) => requestAudit(address, tier),
);

const transport = new StdioServerTransport();
await server.connect(transport);
