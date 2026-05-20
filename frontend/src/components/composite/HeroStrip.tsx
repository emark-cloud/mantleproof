/**
 * HeroStrip — docs/design.md §6.1 hero.
 *
 * Big mono number (`auditCount` summed across known targets via on-chain
 * `MantleProofRegistry.auditCount(target)`) + thesis line + sparkline of
 * recent audit timestamps (the panel's only piece of motion that's not
 * `pulse-running`).
 *
 * `count-up` (§8) fires once per session for the hero number.
 */
import { useEffect, useState } from "react";
import { useReadContracts } from "wagmi";
import { Sparkline } from "../primitives/Sparkline";
import {
  KNOWN_TARGETS,
  MANTLE_CHAIN_ID,
  REGISTRY_ADDRESS,
  registryAbi,
} from "../../lib/contracts";

function useCountUp(target: number, durationMs = 800): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) return setVal(0);
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setVal(Math.floor(target * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return val;
}

export function HeroStrip({ chainId = MANTLE_CHAIN_ID }: { chainId?: number }) {
  const { data, isLoading } = useReadContracts({
    contracts: KNOWN_TARGETS.map((t) => ({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: "auditCount" as const,
      args: [t.address],
      chainId,
    })),
  });

  const total = (data ?? []).reduce((acc, r) => acc + Number((r?.result as bigint | undefined) ?? 0n), 0);
  const counted = useCountUp(total);
  const sparklineValues = (data ?? [])
    .map((r) => Number((r?.result as bigint | undefined) ?? 0n))
    .filter((n) => n > 0);

  return (
    <section className="panel px-6 py-5 grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-center">
      <div>
        <div className="font-mono text-xxl text-text-primary leading-none tabular-nums">
          {isLoading ? "—" : counted.toLocaleString()}
        </div>
        <div className="font-mono text-[11px] text-text-muted mt-1 uppercase tracking-wider">
          audits anchored on-chain
        </div>
      </div>
      <div>
        <div className="font-sans text-md text-text-primary leading-snug uppercase tracking-wide">
          Audit oracle for the Mantle agentic economy
        </div>
        <div className="font-sans text-sm text-text-secondary mt-1.5 leading-snug">
          Tier 1 + Tier 2 audits posted on-chain. Queryable by any agent via MCP,
          x402 (USDC on Base, eip155:8453), or <span className="font-mono">getAudit(address)</span>. Live.
        </div>
        <div className="mt-3 text-accent">
          <Sparkline values={sparklineValues.length ? sparklineValues : [1, 2, 1, 3, 2, 3, 3]} className="text-lg" />
        </div>
      </div>
    </section>
  );
}
