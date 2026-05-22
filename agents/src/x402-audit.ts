/**
 * x402-audit — the "real user" side of query surface #3.
 *
 * An agent that wants a fresh Tier-2 MantleProof audit of a contract POSTs to
 * the engine's x402 endpoint, receives a 402 with payment requirements, signs
 * an EIP-3009 `transferWithAuthorization` for USDC on Base, and retries with
 * the `X-PAYMENT` header. The engine verifies the payment with the CDP
 * facilitator, runs the audit pipeline, settles on Base, and returns the audit
 * plus both tx hashes (Base payment + Mantle anchor).
 *
 * Speaks x402 **v1** (`scheme=exact`, `network=base`) — confirmed in CDP's
 * /supported list. The wire shapes mirror the engine's `mantleproof/x402/
 * types.py` exactly (PaymentRequirements / Eip3009Authorization / PaymentPayload).
 *
 *   pnpm --filter @mantleproof/agents x402:audit <targetAddress> [payerKeyEnvName]
 *
 * `payerKeyEnvName` defaults to DEPLOYER_AGENT_PRIVATE_KEY. The payer wallet
 * needs only USDC on Base — EIP-3009 is gasless for the signer; the facilitator
 * broadcasts. It must NOT be the X402_PAYTO_ADDRESS wallet (paying yourself is
 * a degenerate transfer).
 */
import { randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { loadKey } from "./lib/wallets.js";

const ENGINE = process.env.MANTLEPROOF_API_BASE ?? "http://127.0.0.1:8000";

// x402 network string -> EVM chainId, for the EIP-712 signing domain.
const CHAIN_IDS: Record<string, number> = { base: 8453, "base-sepolia": 84532 };

/** One entry of the 402 body's `accepts` array — mirrors PaymentRequirements. */
interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string; // token base units (USDC: 6 decimals)
  resource: string;
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
  asset: `0x${string}`; // USDC contract on the payment chain
  extra: { name: string; version: string }; // EIP-712 domain pieces
}

const ex = (h: string | null | undefined, base: string) =>
  h ? `${base}/${h.startsWith("0x") ? h : "0x" + h}` : "(none)";

async function main(): Promise<void> {
  const target = process.argv[2];
  const payerKeyName = process.argv[3] ?? "DEPLOYER_AGENT_PRIVATE_KEY";
  if (!target || !/^0x[0-9a-fA-F]{40}$/.test(target)) {
    console.error("usage: x402:audit <targetAddress> [payerKeyEnvName]");
    process.exit(2);
  }

  const account = privateKeyToAccount(loadKey(payerKeyName));
  const url = `${ENGINE}/x402/audit/${target}`;
  console.log(`x402 audit   target = ${target}`);
  console.log(`             payer  = ${account.address}  (${payerKeyName})`);
  console.log(`             engine = ${url}\n`);

  // --- Step 1: unpaid POST -> expect 402 with payment requirements ----------
  const challenge = await fetch(url, { method: "POST" });
  if (challenge.status !== 402) {
    console.error(`expected HTTP 402, got ${challenge.status}:`);
    console.error(await challenge.text());
    process.exit(1);
  }
  const body = (await challenge.json()) as { accepts?: PaymentRequirements[] };
  const req = body.accepts?.[0];
  if (!req) {
    console.error("402 response had no accepts[] entry");
    process.exit(1);
  }
  const chainId = CHAIN_IDS[req.network];
  if (!chainId) {
    console.error(`unsupported x402 payment network: ${req.network}`);
    process.exit(1);
  }
  const usdc = (Number(req.maxAmountRequired) / 1e6).toFixed(2);
  console.log(`[402]  pay ${usdc} USDC  ->  ${req.payTo}`);
  console.log(`       asset ${req.asset}  on ${req.network} (eip155:${chainId})\n`);

  // --- Step 2: sign the EIP-3009 transferWithAuthorization -----------------
  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: account.address,
    to: req.payTo,
    value: req.maxAmountRequired, // decimal string on the wire
    validAfter: "0",
    validBefore: String(now + 600), // 10-min window — covers the Tier-2 pipeline
    nonce: ("0x" + randomBytes(32).toString("hex")) as `0x${string}`,
  };
  const signature = await account.signTypedData({
    domain: {
      name: req.extra.name,
      version: req.extra.version,
      chainId,
      verifyingContract: req.asset,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  });
  console.log(`[sign] EIP-3009 authorization signed  (nonce ${authorization.nonce.slice(0, 14)}…)\n`);

  // --- Step 3: encode X-PAYMENT and retry ----------------------------------
  const paymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: req.network,
    payload: { signature, authorization },
  };
  const xPayment = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

  console.log("[pay]  POST with X-PAYMENT — engine: facilitator verify -> audit pipeline -> settle …");
  console.log("       (Tier-2 + ProtonVPN hop — this can take a minute)\n");
  const paid = await fetch(url, { method: "POST", headers: { "X-PAYMENT": xPayment } });
  const paidBody: any = await paid.json();
  if (paid.status !== 200) {
    console.error(`payment leg failed (HTTP ${paid.status}):`);
    console.error(JSON.stringify(paidBody, null, 2));
    process.exit(1);
  }

  // --- Step 4: report ------------------------------------------------------
  const x = paidBody.x402 ?? {};
  const audit = paidBody.audit ?? {};
  const guard = audit.hallucination_guard ?? {};
  console.log("=== AUDIT COMPLETE ===");
  console.log(`  severity    ${audit.severity ?? "?"}   findings ${audit.summary?.total ?? "?"}   tier ${audit.tier ?? "?"}`);
  console.log(`  rootHash    ${audit.root_hash ?? "?"}`);
  console.log(`  IPFS        ${audit.ipfs_uri ?? "?"}`);
  console.log(`  guard       ${guard.public_note ?? "?"}`);
  console.log("=== x402 RECEIPTS (cross-chain) ===");
  console.log(`  payment     ${x.payment_tx ?? "(none)"}`);
  console.log(`              ${ex(x.payment_tx, "https://basescan.org/tx")}`);
  console.log(`  anchor      ${x.anchor_tx ?? "(none)"}`);
  console.log(`              ${ex(x.anchor_tx, "https://mantlescan.xyz/tx")}`);
  console.log(`  payer       ${x.payer ?? "?"}`);
  if (x.settle_error) console.log(`  settle_error: ${x.settle_error}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
