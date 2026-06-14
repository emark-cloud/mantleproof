/**
 * MCP tool: payAndAudit — the agent commissions a *fresh* Tier-2 audit and pays
 * for it with its own wallet (demo-video doorway 4).
 *
 * Unlike `requestAudit` (which only surfaces the 402 requirements and refuses to
 * hold a key), this tool completes the full x402 dance end-to-end:
 *
 *   1. cache-first — if the target is already audited, return it free (no pay)
 *   2. POST /x402/audit/{address} (no payment) → 402 with requirements
 *   3. resolve the agent's payer wallet (MANTLEPROOF_PAYER_KEY, else ephemeral)
 *   4. best-effort USDC-on-Base balance check — refuse to sign a doomed auth
 *   5. sign EIP-3009 transferWithAuthorization, re-POST with X-PAYMENT
 *   6. engine: facilitator verify → pipeline (Tier 1+2+guard) → anchor on
 *      Mantle → settle USDC on Base → returns BOTH txHashes
 *
 * Honesty (CLAUDE.md): the payer wallet is the AGENT's money, never the
 * oracle-signer key; every tx hash returned is a real settlement, never
 * fabricated. The hallucination-guard count is surfaced verbatim.
 */
import {
  fetchAudit,
  postX402WithPayment,
  startX402Audit,
  type X402PaidEnvelope,
} from "../client.js";
import { formatAuditResult, type ToolResult } from "../format.js";
import { fmtUsdc, resolvePayer, signXPayment, usdcBalance } from "../wallet.js";

// The x402 paywall endpoint always produces a Tier-2 audit; `_tier` is accepted
// for interface symmetry with the other tools but does not change the request.
export async function payAndAudit(address: string, _tier = 2): Promise<ToolResult> {
  // 1. Cache-first — never charge for a no-op when an audit already exists.
  const cached = await fetchAudit(address);
  if (cached.ok && "audited" in cached && cached.audited) {
    return {
      content: [
        {
          type: "text",
          text:
            "cached audit found — returning it for free instead of paying for " +
            "a fresh one (payAndAudit would have been a no-op).",
        },
        ...formatAuditResult(cached).content,
      ],
    };
  }

  // 2. Get the 402 payment requirements.
  const init = await startX402Audit(address);
  if (!init.ok) {
    return {
      content: [
        { type: "text", text: `engine unreachable: ${init.error}` },
        { type: "text", text: JSON.stringify(init, null, 2) },
      ],
      isError: true,
    };
  }
  if (init.status === 200) {
    // An x402-aware proxy already completed the dance — pass it through.
    return {
      content: [
        { type: "text", text: "x402 dance already complete — audit anchored." },
        { type: "text", text: JSON.stringify(init.body, null, 2) },
      ],
    };
  }
  const req = init.body.accepts?.[0];
  if (!req) {
    return {
      content: [
        { type: "text", text: "engine returned 402 with no accepts[] entry" },
        { type: "text", text: JSON.stringify(init.body, null, 2) },
      ],
      isError: true,
    };
  }

  // 3. Resolve the agent's payer wallet.
  let payer;
  try {
    payer = resolvePayer();
  } catch (e) {
    return {
      content: [
        {
          type: "text",
          text: `invalid MANTLEPROOF_PAYER_KEY: ${(e as Error).message}`,
        },
      ],
      isError: true,
    };
  }
  const asset = req.asset as `0x${string}`;
  const need = BigInt(req.maxAmountRequired);
  // A just-created wallet is definitionally empty — skip the RPC read.
  const balance = payer.justCreated ? 0n : await usdcBalance(asset, payer.account.address);
  const balLine =
    balance === null
      ? "balance unknown (Base RPC read failed — proceeding; settle is the source of truth)"
      : `${fmtUsdc(balance)} on Base`;
  const walletDesc =
    payer.source === "env"
      ? "configured payer wallet (MANTLEPROOF_PAYER_KEY)"
      : payer.source === "file"
        ? "your saved MantleProof audit wallet"
        : "your new MantleProof audit wallet";

  // 4. Not enough USDC → hand the user the address to fund (once). Never sign a
  //    doomed authorization. `balance === null` (RPC down, not just-created)
  //    falls through — settle becomes the source of truth.
  if (balance !== null && balance < need) {
    const savedAt = payer.path
      ? `\n(saved at ${payer.path} — reusable across all future audits)`
      : "\n(couldn't be written to disk — this wallet won't persist; set MANTLEPROOF_WALLET_PATH or MANTLEPROOF_PAYER_KEY)";
    const lead =
      payer.source === "generated"
        ? `I created a reusable MantleProof audit wallet for you — it's empty.${savedAt}`
        : payer.source === "file"
          ? `Your saved MantleProof audit wallet is low.${savedAt}`
          : "The configured payer wallet is low on USDC.";
    return {
      content: [
        {
          type: "text",
          text:
            `${lead}\n\n` +
            `It holds ${fmtUsdc(balance)} on Base, but this audit costs ${fmtUsdc(need)}.\n\n` +
            `Fund it once by sending at least ${fmtUsdc(need)} on Base ` +
            `(chain id 8453) to:\n\n    ${payer.account.address}\n\n` +
            "then ask me to run the audit again. This wallet is reusable — fund " +
            "it once and just top it up when it runs low. Keep only small amounts " +
            "in it; it pays for audits and nothing else.",
        },
      ],
      isError: true,
    };
  }

  // 5. Sign EIP-3009 + encode the X-PAYMENT header.
  let xPayment: string;
  try {
    xPayment = await signXPayment(payer.account, req);
  } catch (e) {
    return {
      content: [
        { type: "text", text: `failed to sign x402 payment: ${(e as Error).message}` },
      ],
      isError: true,
    };
  }

  // 6. Re-POST with payment → engine runs the pipeline, anchors, settles.
  const paid = await postX402WithPayment(address, xPayment);
  if (!paid.ok) {
    return {
      content: [
        {
          type: "text",
          text:
            `payment leg failed: ${paid.error}. ` +
            `Paid from ${walletDesc} ${payer.account.address} (${balLine}). ` +
            "If verify passed but the pipeline failed, the EIP-3009 " +
            "authorization expires unused — you were NOT charged.",
        },
        { type: "text", text: JSON.stringify(paid.body ?? {}, null, 2) },
      ],
      isError: true,
    };
  }

  return formatPaidResult(paid.body, walletDesc, balLine);
}

const SEVERITY_DOT: Record<string, string> = {
  info: "○",
  low: "◐",
  medium: "◑",
  high: "●",
};

function explorerTx(hash: string | null | undefined, base: string): string {
  if (!hash) return "(none)";
  const h = hash.startsWith("0x") ? hash : `0x${hash}`;
  return `${base}/${h}`;
}

/** Format the paid cross-chain envelope: safety signal + both receipts. */
function formatPaidResult(
  env: X402PaidEnvelope,
  walletDesc: string,
  balLine: string,
): ToolResult {
  const audit = env.audit ?? {};
  const x = env.x402 ?? ({} as X402PaidEnvelope["x402"]);
  const severity = (audit.severity ?? "?").toString();
  const dot = SEVERITY_DOT[severity] ?? "?";
  const guard =
    audit.hallucination_guard?.public_note ?? "hallucination guard: 0 masked";
  const findings = Array.isArray(audit.findings) ? audit.findings.length : 0;

  const lines = [
    `=== FRESH AUDIT GENERATED — agent paid for it ===`,
    `  paid from ${walletDesc}  (${balLine})`,
    `  payer     ${x.payer ?? "?"}`,
    "",
    `${dot} ${severity.toUpperCase()}  ${env.target}  tier=${audit.tier ?? "?"}  findings=${findings}`,
    `  rootHash  ${audit.root_hash ?? "?"}`,
    `  ipfs      ${audit.ipfs_uri ?? "?"}`,
    `  ${guard}`,
    "",
    `=== x402 RECEIPTS (cross-chain) ===`,
    `  payment   ${x.payment_tx ?? "(none)"}   ${fmtAmount(x.amount_base_units)} on ${x.payment_chain ?? "base"} (eip155:${x.payment_chain_id ?? 8453})`,
    `            ${explorerTx(x.payment_tx, "https://basescan.org/tx")}`,
    `  anchor    ${x.anchor_tx ?? "(none)"}   on ${x.anchor_chain ?? "mantle"} (eip155:${x.anchor_chain_id ?? "?"})`,
    `            ${explorerTx(x.anchor_tx, "https://mantlescan.xyz/tx")}`,
  ];
  if (x.settle_error) {
    lines.push(
      "",
      `  NOTE: audit IS anchored on Mantle, but Base settlement reported: ${x.settle_error}`,
    );
  }

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "text", text: JSON.stringify(env, null, 2) },
    ],
  };
}

function fmtAmount(baseUnits: string | undefined): string {
  if (!baseUnits) return "? USDC";
  try {
    return fmtUsdc(BigInt(baseUnits));
  } catch {
    return `${baseUnits} (base units)`;
  }
}
