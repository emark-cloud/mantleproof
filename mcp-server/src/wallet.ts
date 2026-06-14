/**
 * Payer-wallet helpers for the `payAndAudit` MCP tool (the doorway-4 flow).
 *
 * This is the ONE place in the MCP server that touches a private key — and it is
 * strictly the *agent's own payer wallet*, NEVER MantleProof's oracle-signer
 * key. The oracle signer (the only writer to MantleProofRegistry.submitAudit)
 * lives in the engine and is unreachable from here. The wallet below only signs
 * an EIP-3009 USDC `transferWithAuthorization` on Base to pay the 0.50 USDC
 * x402 fee; the tx hashes that come back are real settlements from the engine's
 * facilitator, never fabricated (CLAUDE.md honesty-label invariant).
 *
 * Wallet resolution (seamless, user-funded, reusable):
 *   1. MANTLEPROOF_PAYER_KEY set  → use it (explicit override / CI / demo)
 *   2. ~/.mantleproof/wallet.json → reuse the saved wallet (the normal path)
 *   3. neither                    → generate a wallet, PERSIST it (0600), reuse
 *                                   it forever after
 *
 * The user never passes a key. On first use the agent creates a reusable audit
 * wallet and persists it; because it starts at 0 USDC, `payAndAudit` reads the
 * Base balance and — instead of signing a doomed authorization — hands the user
 * the address to fund once. Every later audit reuses the same funded wallet.
 * The wire shapes mirror `agents/src/x402-audit.ts` and
 * `engine/mantleproof/x402/types.py` exactly.
 */
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createPublicClient, formatUnits, http } from "viem";
import { base } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { PrivateKeyAccount } from "viem/accounts";
import type { X402Requirements } from "./client.js";

// x402 network string -> EVM chainId, for the EIP-712 signing domain.
const CHAIN_IDS: Record<string, number> = { base: 8453, "base-sepolia": 84532 };

const BASE_RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

export type PayerSource = "env" | "file" | "generated";

export interface ResolvedPayer {
  account: PrivateKeyAccount;
  /** Where the key came from — surfaced honestly in the tool output. */
  source: PayerSource;
  /** Path of the persisted wallet file (for source "file"/"generated"). */
  path?: string;
  /** True only on the run that first created the wallet (so: definitely 0 USDC). */
  justCreated?: boolean;
}

/** USDC is 6-decimals; format base units as a human "1.50 USDC" string. */
export function fmtUsdc(baseUnits: bigint): string {
  return `${formatUnits(baseUnits, 6)} USDC`;
}

/** Where the reusable wallet is persisted (overridable for tests). */
export function walletPath(): string {
  return (
    process.env.MANTLEPROOF_WALLET_PATH ??
    join(homedir(), ".mantleproof", "wallet.json")
  );
}

function normalizeKey(k: string): `0x${string}` {
  return (k.startsWith("0x") ? k : `0x${k}`) as `0x${string}`;
}

/**
 * Resolve the agent's reusable payer wallet:
 *   1. MANTLEPROOF_PAYER_KEY (explicit override) → never persisted
 *   2. the saved wallet file → reuse it
 *   3. neither → generate + persist (0600), reuse forever after
 *
 * The key is the AGENT's spending money, never the oracle signer. A persist
 * failure (read-only FS) is non-fatal: the wallet still works for this run, it
 * just won't be reusable — the caller surfaces that to the user.
 */
export function resolvePayer(): ResolvedPayer {
  // 1. Explicit env override (power users / CI / a pre-funded demo wallet).
  const raw = process.env.MANTLEPROOF_PAYER_KEY;
  if (raw && raw.trim()) {
    return { account: privateKeyToAccount(normalizeKey(raw.trim())), source: "env" };
  }

  // 2. Reuse the persisted wallet if present.
  const path = walletPath();
  if (existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, "utf8")) as { privateKey?: string };
      if (data.privateKey) {
        return {
          account: privateKeyToAccount(normalizeKey(data.privateKey)),
          source: "file",
          path,
        };
      }
    } catch {
      // Corrupt file → fall through and regenerate.
    }
  }

  // 3. First run — generate a reusable wallet and persist it (best-effort, 0600).
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  let persisted = false;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify(
        {
          address: account.address,
          privateKey: pk,
          createdAt: new Date().toISOString(),
          note: "MantleProof agent audit-spending wallet — keep only small USDC amounts here.",
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    chmodSync(path, 0o600);
    persisted = true;
  } catch {
    // Read-only FS / no homedir — wallet still works this run, just not reusable.
  }
  return { account, source: "generated", path: persisted ? path : undefined, justCreated: true };
}

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Best-effort USDC balance read on Base. Returns null on any RPC failure — the
 * caller treats null as "unknown" and proceeds (settle becomes the source of
 * truth), so a flaky public RPC never blocks a genuinely funded wallet.
 */
export async function usdcBalance(
  asset: `0x${string}`,
  owner: `0x${string}`,
): Promise<bigint | null> {
  try {
    const client = createPublicClient({ chain: base, transport: http(BASE_RPC) });
    return (await client.readContract({
      address: asset,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [owner],
    })) as bigint;
  } catch {
    return null;
  }
}

export interface Eip3009Authorization {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
}

/**
 * Sign an EIP-3009 `transferWithAuthorization` for the exact x402 requirements
 * and return the base64-encoded X-PAYMENT header value the engine expects.
 */
export async function signXPayment(
  account: PrivateKeyAccount,
  req: X402Requirements,
): Promise<string> {
  const chainId = CHAIN_IDS[req.network];
  if (!chainId) throw new Error(`unsupported x402 payment network: ${req.network}`);
  if (!req.extra?.name || !req.extra?.version) {
    throw new Error("402 requirements missing EIP-712 domain (extra.name/version)");
  }

  const now = Math.floor(Date.now() / 1000);
  const authorization: Eip3009Authorization = {
    from: account.address,
    to: req.payTo as `0x${string}`,
    value: req.maxAmountRequired, // decimal string on the wire
    validAfter: "0",
    validBefore: String(now + 600), // 10-min window covers the Tier-2 pipeline
    nonce: `0x${randomBytes(32).toString("hex")}`,
  };

  const signature = await account.signTypedData({
    domain: {
      name: req.extra.name,
      version: req.extra.version,
      chainId,
      verifyingContract: req.asset as `0x${string}`,
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

  const paymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: req.network,
    payload: { signature, authorization },
  };
  return Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
}
