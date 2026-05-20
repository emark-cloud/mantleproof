/**
 * MCP tool: getAudit (T23).
 *
 * Read-only on-chain readback against ``MantleProofRegistry.getAudit(address)``,
 * joined with the pinned IPFS report and the keccak(canonical) integrity check.
 *
 * Maps directly to ``GET /api/audit/{address}``. Free, no payment, no signer.
 * The MCP equivalent of curl + jq for an agent that wants the safety signal
 * before touching a contract.
 */
import { fetchAudit } from "../client.js";
import { formatAuditResult, type ToolResult } from "../format.js";

export async function getAudit(address: string): Promise<ToolResult> {
  const resp = await fetchAudit(address);
  return formatAuditResult(resp);
}
