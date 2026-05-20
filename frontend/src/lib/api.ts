/**
 * Engine REST client (T7 — `/api/audit/{address}`, `/api/health`).
 *
 * Mirrors the locked JSON envelope from `engine/mantleproof/api/routes_audit.py`
 * exactly so a single typed surface drives the UI. Honest about every failure
 * branch (the engine ships `audited:false`, `ipfs_error`, `integrity.match:false`
 * — the UI must surface each, never paper over).
 */

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

/* --------------------------------- types --------------------------------- */

export type Severity = "info" | "low" | "medium" | "high";

export interface AnchorInfo {
  root_hash: string;
  severity: Severity;
  severity_uint8: number;
  ipfs_cid: string;
  ipfs_uri: string;
  timestamp: number;
  submitter: string;
  audit_count: number;
}

export interface IntegrityInfo {
  expected_root_hash: string;
  recomputed_root_hash: string | null;
  match: boolean | null;
}

export interface Finding {
  // Engine field names mirror `engine/mantleproof/checks/_common.py:CheckResult`.
  check?: string;
  severity?: Severity;
  label?: string;
  finding?: string;
  suggested_fix?: string;
  evidence?: Record<string, unknown> | null;
  // Tier-2 emits these via `tier2/prompt.py`; Tier-1 may not.
  source_lines?: string[];
  bytecode_offset?: string;
  matched_pattern?: string;
}

export interface ReportEnvelope {
  tier?: 1 | 2;
  provider?: string;
  contract_name?: string;
  summary?: string;
  findings?: Finding[];
  hallucination_guard?: { masked_count?: number; public_note?: string };
  [k: string]: unknown;
}

export interface AuditAuditedResponse {
  audited: true;
  target: string;
  chain_id: number;
  anchor: AnchorInfo;
  integrity: IntegrityInfo;
  report: ReportEnvelope | null;
  ipfs_error: string | null;
  explorer: { target: string };
}

export interface AuditUnauditedResponse {
  audited: false;
  target: string;
  chain_id: number;
  explorer: { target: string };
}

export type AuditResponse = AuditAuditedResponse | AuditUnauditedResponse;

export interface HealthResponse {
  engine: "ok" | "degraded" | "down";
  chain_id: number;
  block_number: number | null;
  rpc_latency_ms: number | null;
  oracle_signer: string | null;
  cache_freshness_s: number | null;
  version: string;
}

/* ---------------------------------- impl --------------------------------- */

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`engine ${res.status}: ${text.slice(0, 200) || path}`);
  }
  return (await res.json()) as T;
}

export function getAudit(address: string): Promise<AuditResponse> {
  return fetchJson<AuditResponse>(`/api/audit/${address}`);
}

export function getHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>(`/api/health`);
}

/* --------------------------------- T29 ----------------------------------- */

/** A row in `/api/feed` — one contract creation observed by the walker. */
export interface FeedItem {
  address: string;
  deployer: string;
  block_number: number;
  tx_hash: string;
  timestamp: number;
  classification:
    | "audited"
    | "queued"
    | "skipped:template"
    | "skipped:factory"
    | "unknown";
  bytecode_hash: string | null;
  notes: string | null;
}

export interface FeedResponse {
  chain_id: number | null;
  last_block: number | null;
  freshness_s: number | null;
  filter: { classification: string | null; limit: number };
  items: FeedItem[];
}

/** A row in `/api/cache` — one anchored audit head. */
export interface CacheItem {
  target: string;
  root_hash: string;
  severity: Severity;
  severity_uint8: number;
  ipfs_cid: string;
  timestamp: number;
  submitter: string;
  audit_count: number;
  block_number: number;
  tx_hash: string;
}

export interface CacheResponse {
  chain_id: number | null;
  last_block: number | null;
  freshness_s: number | null;
  filter: { severity: string | null; limit: number };
  items: CacheItem[];
}

export function getFeed(limit = 50, classification?: string): Promise<FeedResponse> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (classification) q.set("classification", classification);
  return fetchJson<FeedResponse>(`/api/feed?${q.toString()}`);
}

export function getCacheFeed(limit = 50, severity?: string): Promise<CacheResponse> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (severity) q.set("severity", severity);
  return fetchJson<CacheResponse>(`/api/cache?${q.toString()}`);
}
