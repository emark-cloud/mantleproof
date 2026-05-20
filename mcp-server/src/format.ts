/**
 * Shared formatter: turn an AuditResponse into MCP-style content (T23).
 *
 * MCP tool results have two roles to play simultaneously:
 *   1. Human-readable summary the LLM/agent can quote back to a user.
 *   2. The raw JSON envelope the agent can parse to make a decision.
 *
 * We return both: a Markdown-ish text block + a `json` text block holding the
 * exact engine response (the same JSON `/api/audit` would return). Agents that
 * want fields parse the JSON; humans read the text. We never lie about
 * integrity — `integrity.match=false` is printed front-and-centre, never
 * hidden, per CLAUDE.md "never weaken / hide the hallucination guard".
 */

import type { AuditResponse } from "./client.js";

export type ContentBlock = { type: "text"; text: string };
export type ToolResult = { content: ContentBlock[]; isError?: boolean };

const SEVERITY_DOT: Record<string, string> = {
  info: "○",
  low: "◐",
  medium: "◑",
  high: "●",
};

function shortHash(hex: string, head = 6, tail = 4): string {
  if (!hex.startsWith("0x") || hex.length < head + tail + 4) return hex;
  return `${hex.slice(0, head + 2)}…${hex.slice(-tail)}`;
}

function ts(epoch: number): string {
  if (!epoch) return "unknown";
  return new Date(epoch * 1000).toISOString().replace(".000Z", "Z");
}

/** Build the dual text+json content blocks for an /api/audit response. */
export function formatAuditResult(resp: AuditResponse): ToolResult {
  if (!resp.ok) {
    // Engine unreachable / bad address — return error string + raw envelope.
    return {
      content: [
        { type: "text", text: `error: ${resp.error}` },
        { type: "text", text: JSON.stringify(resp, null, 2) },
      ],
      isError: true,
    };
  }
  if (resp.audited === false) {
    // Honest 404 — actionable so the agent knows what to do next.
    const text = [
      `no on-chain audit for ${resp.target} on chainId ${resp.chain_id}.`,
      "use the `requestAudit` tool to pay 0.50 USDC on Base and trigger a Tier-2",
      "audit (note: requestAudit currently depends on the x402 paywall endpoint",
      "being deployed — T11). until that ships, this target has no MantleProof",
      "audit history.",
    ].join(" ");
    return {
      content: [
        { type: "text", text },
        { type: "text", text: JSON.stringify(resp, null, 2) },
      ],
    };
  }

  // Happy path — surface the safety signal first; integrity match second.
  const { anchor, integrity, report, ipfs_error, target, explorer, chain_id } = resp;
  const sevDot = SEVERITY_DOT[anchor.severity] ?? "?";
  const integrityLine =
    integrity.match === true
      ? "integrity ✓ recomputed keccak matches on-chain rootHash"
      : integrity.match === false
        ? `integrity ✗ MISMATCH — recomputed ${shortHash(
            integrity.recomputed_root_hash ?? "0x?",
          )} != on-chain ${shortHash(integrity.expected_root_hash)}; report below may have been tampered with`
        : `integrity ? IPFS not fetched (${ipfs_error ?? "unknown"})`;

  const findingCount =
    Array.isArray(report?.findings) ? (report?.findings as unknown[]).length : 0;
  const tier = report?.tier ?? "?";
  const provider = report?.provider ?? "";
  const guardLine =
    report?.hallucination_guard?.public_note ??
    (report ? "hallucination guard: 0 masked" : "");

  const lines = [
    `${sevDot} ${anchor.severity.toUpperCase()}  ${target}  (chainId ${chain_id})`,
    `  anchored ${ts(anchor.timestamp)}   audit_count=${anchor.audit_count}`,
    `  rootHash  ${anchor.root_hash}`,
    `  ipfs      ${anchor.ipfs_uri}`,
    `  submitter ${anchor.submitter}    (must equal MantleProofRegistry.oracleSigner)`,
    `  explorer  ${explorer.target}`,
    `  ${integrityLine}`,
  ];
  if (report) {
    lines.push(
      `  tier=${tier} provider=${provider} findings=${findingCount}  ${guardLine}`,
    );
    if (report.contract_name) lines.push(`  contract: ${report.contract_name}`);
    if (report.summary) lines.push(`  summary: ${report.summary}`);
  } else if (ipfs_error) {
    lines.push(`  report: <unavailable> (${ipfs_error})`);
  }

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "text", text: JSON.stringify(resp, null, 2) },
    ],
  };
}
