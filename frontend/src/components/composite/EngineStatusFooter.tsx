/**
 * EngineStatusFooter — docs/design.md §6.1 footer. Bottom strip on every page.
 *
 * Polls `/api/health` every 5s. Honest about `cache_freshness_s: null`
 * (the cache-warmer is T29 — not yet shipped — and the engine returns null
 * accordingly, per `engine/mantleproof/api/routes_health.py`).
 */
import { useQuery } from "@tanstack/react-query";
import { getHealth, type HealthResponse } from "../../lib/api";
import { StatusDot } from "../primitives/StatusDot";

function fmtFreshness(s: number | null): string {
  if (s === null) return "indexer: warming up";
  if (s < 60) return `cache: ${s}s`;
  if (s < 3600) return `cache: ${Math.floor(s / 60)}m`;
  return `cache: ${Math.floor(s / 3600)}h`;
}

export function EngineStatusFooter() {
  const { data, error, isLoading } = useQuery<HealthResponse>({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 5_000,
    retry: 1,
  });

  const status: "complete" | "pending" | "failed" = error
    ? "failed"
    : isLoading
      ? "pending"
      : data?.engine === "ok"
        ? "complete"
        : "failed";

  return (
    <footer className="border-t border-border-strong bg-panel px-4 py-1.5 font-mono text-[10px] text-text-muted flex items-center gap-4">
      <span className="flex items-center gap-1.5">
        <StatusDot status={status} size={6} />
        engine: {data?.engine ?? (error ? "unreachable" : "…")}
      </span>
      <span>Mantle mainnet</span>
      <span>
        block {data?.block_number ?? "?"}
        {typeof data?.rpc_latency_ms === "number" && (
          <> · rpc {Math.round(data.rpc_latency_ms)}ms</>
        )}
      </span>
      <span>{fmtFreshness(data?.cache_freshness_s ?? null)}</span>
      <span className="ml-auto">v{data?.version ?? "0.1"}</span>
    </footer>
  );
}
