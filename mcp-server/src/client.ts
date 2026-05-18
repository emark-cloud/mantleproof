/** Thin HTTP client to the MantleProof engine API. SCAFFOLD — T23. */
const BASE = process.env.MANTLEPROOF_API_BASE ?? "http://localhost:8000";

export async function callEngine(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`engine ${res.status}`);
  return res.json();
}
