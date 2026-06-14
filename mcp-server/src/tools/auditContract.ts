/**
 * MCP tool: auditContract (T23).
 *
 * Cache-first: if a Tier-1 or Tier-2 audit is already anchored for ``address``,
 * return it as ``getAudit`` would. Otherwise return an actionable "no cache; use
 * payAndAudit" message that points the agent at the paid path.
 */
import { fetchAudit } from "../client.js";
import { formatAuditResult, type ToolResult } from "../format.js";

export async function auditContract(address: string, tier = 2): Promise<ToolResult> {
  const resp = await fetchAudit(address);
  // 200 — return the cached audit, regardless of which tier it was. The agent
  // can inspect ``anchor.severity`` / ``report.tier`` and decide whether the
  // cached tier meets its bar.
  if (resp.ok && "audited" in resp && resp.audited) {
    return formatAuditResult(resp);
  }
  // 404 — no audit. Tell the agent how to get one.
  if (resp.ok && "audited" in resp && resp.audited === false) {
    const text = [
      `no cached audit for ${resp.target} on chainId ${resp.chain_id}.`,
      `to obtain a Tier-${tier} audit, call \`payAndAudit(${resp.target}, ${tier})\``,
      "— it pays 0.50 USDC on Base (eip155:8453) with the agent's own wallet,",
      "signs the EIP-3009 authorization, runs the pipeline + hallucination guard,",
      "anchors on Mantle (eip155:5000), and returns both txHashes. (Use",
      "`requestAudit` instead if an external x402 wallet will sign the payment.)",
    ].join(" ");
    return {
      content: [
        { type: "text", text },
        { type: "text", text: JSON.stringify({ ...resp, suggested_tier: tier }, null, 2) },
      ],
    };
  }
  // Network / engine error — bubble up.
  return formatAuditResult(resp);
}
