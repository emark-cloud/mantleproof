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

const DEFAULT_BASE = "http://localhost:8000";

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
