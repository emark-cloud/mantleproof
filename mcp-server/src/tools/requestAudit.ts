/**
 * MCP tool: requestAudit (T23, honest scaffold gated on T11).
 *
 * The paid Tier-2 audit path settles 0.50 USDC on **Base (eip155:8453)** via
 * x402, then the engine runs the full pipeline (Tier-1 → Tier-2 → guard → IPFS
 * pin → oracle-signed submitAudit) and anchors the rootHash on **Mantle
 * (eip155:5000)**. Both txHashes — the Base payment + the Mantle anchor — are
 * returned in the response (CLAUDE.md "cross-chain rule").
 *
 * That path is gated on **T11** (x402 middleware + Base USDC settlement). Until
 * T11 ships, this tool MUST NOT fabricate a payment receipt. We:
 *
 *   1. degrade to ``getAudit`` if a cached audit already exists for ``address``;
 *   2. otherwise return a clear "not yet wired — T11" message + instructions.
 *
 * No tx hash will ever be returned by this tool that didn't come from a real
 * receipt on chain (CLAUDE.md honesty-label invariant).
 */
import { fetchAudit } from "../client.js";
import { formatAuditResult, type ToolResult } from "../format.js";

export async function requestAudit(address: string, tier = 2): Promise<ToolResult> {
  // Cache-first — many agents will call requestAudit defensively even when a
  // cached audit already exists. Free is better than fabricated.
  const resp = await fetchAudit(address);
  if (resp.ok && "audited" in resp && resp.audited) {
    const cached = formatAuditResult(resp);
    return {
      content: [
        {
          type: "text",
          text:
            "cached audit found — returning it instead of charging again. " +
            "(x402-paid requestAudit is gated on T11; calling it for an already-" +
            "audited target would have been a no-op anyway.)",
        },
        ...cached.content,
      ],
    };
  }

  // No cache + no x402 endpoint live → honest refusal.
  const text = [
    `requestAudit(${address}, tier=${tier}) cannot complete:`,
    "the x402 paywall endpoint is not yet deployed (project task T11).",
    "",
    "what this tool WILL do once T11 ships:",
    "  1. 402 challenge → client signs an EIP-3009 transferWithAuthorization",
    "     for 0.50 USDC on Base (eip155:8453);",
    "  2. engine runs the full pipeline (Tier-1 + Tier-2 + hallucination guard);",
    "  3. report pinned to IPFS, rootHash anchored on Mantle (eip155:5000);",
    "  4. response includes BOTH txHashes: Base payment + Mantle anchor.",
    "",
    "for now, use `getAudit(address)` to read any existing anchored audit, or",
    "call this tool again after T11 lands.",
  ].join(" ");

  return {
    content: [
      { type: "text", text },
      {
        type: "text",
        text: JSON.stringify(
          { ok: false, error: "x402 endpoint not deployed (T11)", target: address, tier },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}
