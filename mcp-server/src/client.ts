/**
 * Thin HTTP client to the MantleProof engine API (T23).
 *
 * Mirrors the canonical JSON shape locked by T7 in
 *   engine/mantleproof/api/routes_audit.py :: build_audit_response()
 * and
 *   engine/mantleproof/api/routes_health.py :: build_health()
 *
 * Honest failure modes — these tools must never throw out of the MCP handler;
 * the agent should get a structured "no cached audit" / "engine unreachable"
 * answer it can reason about, not a tool-call exception.
 */

// Default to the hosted MantleProof engine so `npx -y mantleproof-mcp` works
// with zero config. Override with MANTLEPROOF_API_BASE (e.g. http://localhost:8000
// when running the engine locally).
const DEFAULT_BASE = "https://mantleproof-engine-production.up.railway.app";

/** All-in-one audit envelope returned by GET /api/audit/{address}. */
export interface AuditAnchor {
  root_hash: string;
  severity: "info" | "low" | "medium" | "high";
  severity_uint8: 0 | 1 | 2 | 3;
  ipfs_cid: string;
  ipfs_uri: string;
  timestamp: number;
  submitter: string;
  audit_count: number;
}

export interface AuditIntegrity {
  expected_root_hash: string;
  recomputed_root_hash: string | null;
  /** True iff IPFS report keccak matches the on-chain rootHash. */
  match: boolean | null;
}

/** Subset of the pipeline report we surface to MCP callers. */
export interface AuditReport {
  schema?: string;
  target?: string;
  chain_id?: number;
  tier?: number;
  severity?: string;
  contract_name?: string;
  summary?: string;
  findings?: unknown[];
  hallucination_guard?: {
    masked_count?: number;
    label_drops?: number;
    public_note?: string;
  };
  provider?: string;
  generated_at?: string;
  [k: string]: unknown;
}

export interface AuditOk {
  ok: true;
  audited: true;
  target: string;
  chain_id: number;
  anchor: AuditAnchor;
  integrity: AuditIntegrity;
  report: AuditReport | null;
  ipfs_error: string | null;
  explorer: { target: string };
}

export interface AuditNotFound {
  ok: true;
  audited: false;
  target: string;
  chain_id: number;
  reason: string;
}

export interface AuditError {
  ok: false;
  error: string;
  status?: number;
}

export type AuditResponse = AuditOk | AuditNotFound | AuditError;

export interface HealthResponse {
  engine: "ok" | "degraded";
  version: string;
  network: string;
  chain_id: number;
  registry_address: string | null;
  rpc: { block_number: number | null; latency_ms: number | null; error: string | null };
  oracle_signer: string | null;
  oracle_error: string | null;
  cache_freshness_s: number | null;
}

export type HealthResult =
  | ({ ok: true } & HealthResponse)
  | AuditError;

function apiBase(): string {
  return process.env.MANTLEPROOF_API_BASE ?? DEFAULT_BASE;
}

/**
 * GET /api/audit/{address}. Never throws — the MCP tool wants a structured
 * answer in every branch (200 ok, 404 not-audited, network failure).
 */
export async function fetchAudit(address: string): Promise<AuditResponse> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/audit/${address}`);
  } catch (e) {
    return { ok: false, error: `engine unreachable: ${(e as Error).message}` };
  }

  if (res.status === 200) {
    const body = (await res.json()) as Omit<AuditOk, "ok">;
    return { ok: true, ...body };
  }
  if (res.status === 404) {
    // FastAPI HTTPException puts the payload under `detail`.
    const body = (await res.json()) as { detail: Omit<AuditNotFound, "ok"> };
    return { ok: true, ...body.detail };
  }
  if (res.status === 400) {
    return { ok: false, error: `invalid address: ${address}`, status: 400 };
  }
  let text = "";
  try {
    text = await res.text();
  } catch {
    /* ignore */
  }
  return { ok: false, error: `engine ${res.status}: ${text.slice(0, 200)}`, status: res.status };
}

/** Body of the 402 response from POST /x402/audit/{address}. */
export interface X402Requirements {
  scheme: "exact";
  network: "base";
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: { name?: string; version?: string };
}

export interface X402Body {
  x402Version: number;
  error: string;
  accepts: X402Requirements[];
}

export type X402InitResult =
  | { ok: true; status: 402; body: X402Body }
  | { ok: true; status: 200; body: unknown }
  | { ok: false; error: string; status?: number; body?: unknown };

/**
 * POST /x402/audit/{address} WITHOUT an X-PAYMENT header — this is the first
 * leg of the dance: the server returns 402 with the payment requirements the
 * client must sign. Completing the dance (sign EIP-3009 + retry with the
 * X-PAYMENT header) is the responsibility of an x402-aware client, not the MCP
 * server (which has no access to the user's USDC key).
 */
export async function startX402Audit(address: string): Promise<X402InitResult> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/x402/audit/${address}`, { method: "POST" });
  } catch (e) {
    return { ok: false, error: `engine unreachable: ${(e as Error).message}` };
  }
  if (res.status === 402) {
    return { ok: true, status: 402, body: (await res.json()) as X402Body };
  }
  if (res.status === 200) {
    return { ok: true, status: 200, body: await res.json() };
  }
  let body: unknown = undefined;
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  return { ok: false, error: `engine ${res.status}`, status: res.status, body };
}

/** Cross-chain envelope from a *paid* POST /x402/audit/{address} (HTTP 200). */
export interface X402PaidEnvelope {
  audited: boolean;
  target: string;
  audit: AuditReport & {
    root_hash?: string;
    ipfs_uri?: string;
    chain_id?: number;
    anchor_tx?: string;
    severity?: string;
  };
  x402: {
    payment_chain: string;
    payment_chain_id: number;
    payment_tx: string | null;
    anchor_chain: string;
    anchor_chain_id: number | null;
    anchor_tx: string | null;
    amount_base_units: string;
    asset: string;
    payer: string | null;
    settle_error: string | null;
  };
}

export type X402PaidResult =
  | { ok: true; status: 200; body: X402PaidEnvelope }
  | { ok: false; error: string; status?: number; body?: unknown };

/**
 * Second leg of the dance: POST /x402/audit/{address} WITH a signed X-PAYMENT
 * header. The engine verifies with the facilitator, runs the audit pipeline,
 * anchors on Mantle, settles USDC on Base, and returns the cross-chain
 * envelope. Never throws — the tool wants a structured answer in every branch.
 */
export async function postX402WithPayment(
  address: string,
  xPayment: string,
): Promise<X402PaidResult> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/x402/audit/${address}`, {
      method: "POST",
      headers: { "X-PAYMENT": xPayment },
    });
  } catch (e) {
    return { ok: false, error: `engine unreachable: ${(e as Error).message}` };
  }
  let body: unknown = undefined;
  try {
    body = await res.json();
  } catch {
    /* ignore — non-JSON error body */
  }
  if (res.status === 200) {
    return { ok: true, status: 200, body: body as X402PaidEnvelope };
  }
  const detail =
    body && typeof body === "object" && "detail" in body
      ? JSON.stringify((body as { detail: unknown }).detail)
      : "";
  return {
    ok: false,
    error: `engine ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    status: res.status,
    body,
  };
}

export async function fetchHealth(): Promise<HealthResult> {
  try {
    const res = await fetch(`${apiBase()}/api/health`);
    if (!res.ok) return { ok: false, error: `engine ${res.status}`, status: res.status };
    const body = (await res.json()) as HealthResponse;
    return { ok: true, ...body };
  } catch (e) {
    return { ok: false, error: `engine unreachable: ${(e as Error).message}` };
  }
}
