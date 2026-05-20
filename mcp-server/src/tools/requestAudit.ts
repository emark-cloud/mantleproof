/**
 * MCP tool: requestAudit — invokes the live x402 paywall endpoint (T11).
 *
 * Hits ``POST /x402/audit/{address}`` against the engine. The engine responds:
 *
 *   - **402** with the payment requirements (asset, amount, payTo, EIP-712
 *     domain, resource URL). The client (= an x402-aware wallet) must sign an
 *     EIP-3009 ``transferWithAuthorization`` for the exact requirements and
 *     re-call with ``X-PAYMENT: base64(json(PaymentPayload))``.
 *   - **200** with the cross-chain envelope (audit + both txHashes) if the
 *     client already supplied ``X-PAYMENT``. The MCP server itself does NOT
 *     hold the user's USDC key — it surfaces the requirements honestly so the
 *     client can complete the dance.
 *
 * This tool is therefore the FIRST half of the dance from the MCP side: it
 * tells the agent exactly what to sign and where to send the signed payload.
 * No fabricated tx hash will ever be returned by this tool — that property
 * (CLAUDE.md honesty-label invariant) survives the move from scaffold to live.
 *
 * If the agent calls this tool against an already-audited target, we degrade
 * to the cached audit (free) rather than triggering a no-op payment dance.
 */
import { fetchAudit, startX402Audit } from "../client.js";
import { formatAuditResult, type ToolResult } from "../format.js";

export async function requestAudit(address: string, tier = 2): Promise<ToolResult> {
  // Cache-first — many agents will call requestAudit defensively. Free beats
  // paying for a no-op.
  const cached = await fetchAudit(address);
  if (cached.ok && "audited" in cached && cached.audited) {
    const formatted = formatAuditResult(cached);
    return {
      content: [
        {
          type: "text",
          text:
            "cached audit found — returning it for free instead of charging " +
            "again (a fresh requestAudit would have been a no-op).",
        },
        ...formatted.content,
      ],
    };
  }

  // No cache → invoke the x402 endpoint to get the payment requirements.
  const x402 = await startX402Audit(address);
  if (!x402.ok) {
    return {
      content: [
        { type: "text", text: `engine unreachable: ${x402.error}` },
        { type: "text", text: JSON.stringify(x402, null, 2) },
      ],
      isError: true,
    };
  }

  if (x402.status === 200) {
    // An x402-aware proxy in front of us could have already completed the
    // dance and the engine returned the audit directly — pass it through.
    return {
      content: [
        { type: "text", text: "x402 dance already complete — audit anchored." },
        { type: "text", text: JSON.stringify(x402.body, null, 2) },
      ],
    };
  }

  // 402 — surface the payment requirements so the client can sign.
  const req = x402.body.accepts?.[0];
  if (!req) {
    return {
      content: [
        { type: "text", text: "engine returned 402 with no accepts[] entry" },
        { type: "text", text: JSON.stringify(x402.body, null, 2) },
      ],
      isError: true,
    };
  }
  const usdc = (BigInt(req.maxAmountRequired) / 10000n).toString();
  const usdcDisplay = `${usdc.slice(0, -2) || "0"}.${usdc.slice(-2).padStart(2, "0")} USDC`;
  const text = [
    `requestAudit(${address}, tier=${tier}) requires payment:`,
    `  ${usdcDisplay}  on ${req.network} (asset ${req.asset})`,
    `  payTo:    ${req.payTo || "<UNCONFIGURED — engine has no X402_PAYTO_ADDRESS>"}`,
    `  resource: ${req.resource}`,
    `  timeout:  ${req.maxTimeoutSeconds}s`,
    "",
    "to complete the dance, sign an EIP-3009 transferWithAuthorization for the",
    "exact (asset, amount, payTo) above against the USDC contract on Base,",
    "base64-encode the PaymentPayload JSON, and POST it back to /x402/audit/" +
      `${address} as X-PAYMENT. The MCP server does not hold your USDC key —`,
    "this dance is completed by an x402-aware wallet, not by this tool.",
    "",
    "the audit is anchored on Mantle (eip155:5000); the payment settles on",
    "Base (eip155:8453). The 200 response carries BOTH tx hashes.",
  ].join("\n");

  return {
    content: [
      { type: "text", text },
      { type: "text", text: JSON.stringify(x402.body, null, 2) },
    ],
  };
}
