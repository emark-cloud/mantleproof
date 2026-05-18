/** Engine API client. SCAFFOLD — wired in Week 6. */
const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`api ${res.status}`);
  return res.json() as Promise<T>;
}
