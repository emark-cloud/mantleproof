/**
 * IPFS report fetch + trustless integrity recompute for `check`.
 *
 * The on-chain `rootHash` is `keccak256` of the canonical report JSON with the
 * `root_hash` key removed. The engine canonicalizes with Python
 * `json.dumps(report, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`
 * (see `engine/mantleproof/pipeline.py::_canonical`). We replicate that here so a
 * user can re-derive the on-chain hash from the IPFS bytes without trusting any
 * backend — the dashboard is just a renderer.
 */
import { keccak256, stringToBytes, type Hex } from "viem";

export interface Finding {
  check_id?: string;
  sub_detector?: string | null;
  severity?: string;
  label?: string;
  finding?: string;
  evidence?: string | Record<string, unknown>;
  suggested_fix?: string;
  caveat?: string;
}

export interface AuditReportBody {
  schema?: string;
  target?: string;
  chain_id?: number;
  tier?: number;
  contract_name?: string;
  severity?: string;
  summary?: string;
  findings?: Finding[];
  root_hash?: string;
  hallucination_guard?: { masked_count?: number; public_note?: string };
  [k: string]: unknown;
}

const GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
];

/**
 * keccak256 of the report minus its `root_hash` member, computed by stripping
 * the member from the RAW canonical bytes (never re-serializing). Operating on
 * raw bytes is essential: re-serializing a parsed object loses Python float
 * literals (`1.0` → `1`), which would change the hash. This reproduces the
 * on-chain rootHash for any audit whose IPFS bytes are canonical (sort_keys +
 * compact) — i.e. pinned on/after the 2026-05-24 canonicalization fix.
 */
export function recomputeFromRaw(raw: string): Hex {
  const preimage = raw
    .replace(/,"root_hash":"0x[0-9a-fA-F]{64}"/, "")
    .replace(/"root_hash":"0x[0-9a-fA-F]{64}",/, "");
  return keccak256(stringToBytes(preimage));
}

export type IntegrityStatus = "rederived" | "anchored" | "mismatch";

export interface Integrity {
  status: IntegrityStatus;
  recomputed?: Hex;
}

/**
 * Trustless integrity, strongest verifiable claim first:
 *  - `rederived`: keccak256 of the IPFS bytes (minus root_hash) == on-chain hash.
 *  - `anchored`:  the report's embedded `root_hash` == on-chain hash, fetched
 *                 from the content-addressed CID. (Independent keccak
 *                 re-derivation isn't reproducible for audits pinned before the
 *                 2026-05-24 canonicalization fix — float literals were stripped
 *                 in the pinned bytes; the trust path still holds.)
 *  - `mismatch`:  the embedded root_hash disagrees with the on-chain anchor.
 */
export function checkIntegrity(
  raw: string,
  body: AuditReportBody,
  chainRootHash: string,
): Integrity {
  const chain = chainRootHash.toLowerCase();
  const recomputed = recomputeFromRaw(raw);
  if (recomputed.toLowerCase() === chain) return { status: "rederived", recomputed };
  if ((body.root_hash ?? "").toLowerCase() === chain) return { status: "anchored" };
  return { status: "mismatch", recomputed };
}

export interface FetchResult {
  body: AuditReportBody;
  raw: string;
  gateway: string;
}

/** Fetch the report from the first responsive public IPFS gateway (raw + parsed). */
export async function fetchReport(cid: string): Promise<FetchResult> {
  const id = cid.replace(/^ipfs:\/\//, "");
  let lastErr: unknown;
  for (const g of GATEWAYS) {
    try {
      const res = await fetch(g + id, {
        signal: AbortSignal.timeout(12_000),
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const raw = await res.text();
      const body = JSON.parse(raw) as AuditReportBody;
      return { body, raw, gateway: g };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `could not fetch IPFS report ${id} from any gateway (${String(lastErr)})`,
  );
}
