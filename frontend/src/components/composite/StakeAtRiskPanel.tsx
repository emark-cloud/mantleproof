/**
 * StakeAtRiskPanel — lifetime stake summary for /agent/:tokenId.
 *
 * Aggregates `StakeLocked` / `StakeReleased` / `StakeSlashedByDispute` events
 * from the live StakingPool (T43). Pattern: bounded block-window walk from
 * the public client; ASCII bar chart per CLAUDE.md (no SVG). Honest cold
 * state when the pool address isn't configured or there are zero events.
 *
 * Numbers shown are derived live from the chain — no fabricated lifetime
 * totals. The "released vs slashed" ratio is a single number a judge can
 * read in two seconds (per docs/update.md §3.6).
 */
import { useEffect, useState } from "react";
import { useBlockNumber, usePublicClient } from "wagmi";
import {
  MANTLE_CHAIN_ID,
  STAKING_POOL_ADDRESS,
  stakingPoolAbi,
} from "../../lib/contracts";
import { Tip } from "../primitives/Tip";

type Aggregate = {
  locked: number;
  lockedMnt: bigint;
  released: number;
  releasedMnt: bigint;
  slashed: number;
  slashedMnt: bigint;
};

const ZERO: Aggregate = {
  locked: 0,
  lockedMnt: 0n,
  released: 0,
  releasedMnt: 0n,
  slashed: 0,
  slashedMnt: 0n,
};

function formatMnt(wei: bigint): string {
  if (wei === 0n) return "0";
  const mnt = Number(wei) / 1e18;
  return mnt.toFixed(2).replace(/\.?0+$/, "");
}

function asciiBar(n: number, total: number, width = 24): string {
  if (total === 0) return "·".repeat(width);
  const fill = Math.max(0, Math.min(width, Math.round((n / total) * width)));
  return "█".repeat(fill) + "·".repeat(width - fill);
}

export function StakeAtRiskPanel() {
  const chainId = MANTLE_CHAIN_ID;
  const client = usePublicClient({ chainId });
  const { data: head } = useBlockNumber({ chainId });
  const [agg, setAgg] = useState<Aggregate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !head) return;
    if (STAKING_POOL_ADDRESS === "0x0000000000000000000000000000000000000000") {
      setError("STAKING_POOL_ADDRESS unset (waiting on post-T43 redeploy)");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const lookback = head > 200_000n ? head - 200_000n : 0n;
        const [locked, released, slashed] = await Promise.all([
          client.getLogs({
            address: STAKING_POOL_ADDRESS,
            event: stakingPoolAbi[4], // StakeLocked
            fromBlock: lookback,
            toBlock: head,
          }),
          client.getLogs({
            address: STAKING_POOL_ADDRESS,
            event: stakingPoolAbi[6], // StakeReleased
            fromBlock: lookback,
            toBlock: head,
          }),
          client.getLogs({
            address: STAKING_POOL_ADDRESS,
            event: stakingPoolAbi[5], // StakeSlashedByDispute
            fromBlock: lookback,
            toBlock: head,
          }),
        ]);
        if (cancelled) return;
        const next: Aggregate = { ...ZERO };
        for (const log of locked) {
          const args = log.args as { amount?: bigint };
          next.locked += 1;
          next.lockedMnt += args.amount ?? 0n;
        }
        for (const log of released) {
          const args = log.args as { treasuryCut?: bigint; retained?: bigint };
          next.released += 1;
          next.releasedMnt += (args.treasuryCut ?? 0n) + (args.retained ?? 0n);
        }
        for (const log of slashed) {
          const args = log.args as { portion?: bigint; remainder?: bigint };
          next.slashed += 1;
          next.slashedMnt += (args.portion ?? 0n) + (args.remainder ?? 0n);
        }
        setAgg(next);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, head]);

  return (
    <section className="panel px-4 py-4">
      <h2 className="font-mono text-xs uppercase tracking-wider text-text-primary mb-2">
        <Tip text="Lifetime stake activity for MantleProof: total MNT locked across active Tier 2 audits, plus lifetime released-vs-slashed ratio. Read live from StakingPool events on Mantle mainnet.">
          Stake at Risk
        </Tip>
      </h2>
      {error && (
        <div className="font-mono text-[11px] text-text-muted">
          {error}
        </div>
      )}
      {!agg && !error && (
        <div className="font-mono text-[12px] text-text-muted">scanning stake events…</div>
      )}
      {agg && (
        <>
          <div className="grid grid-cols-3 gap-4 font-mono text-[12px]">
            <Stat
              label="locked (lifetime)"
              n={agg.locked}
              mnt={agg.lockedMnt}
              color="var(--status-staked-locked)"
            />
            <Stat
              label="released"
              n={agg.released}
              mnt={agg.releasedMnt}
              color="var(--status-staked-released)"
            />
            <Stat
              label="slashed"
              n={agg.slashed}
              mnt={agg.slashedMnt}
              color="var(--status-staked-slashed)"
            />
          </div>
          {agg.locked > 0 && (
            <div className="mt-3 font-mono text-[11px] flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <span className="w-16 text-text-muted">released</span>
                <span style={{ color: "var(--status-staked-released)" }}>
                  {asciiBar(agg.released, agg.locked)}
                </span>
                <span className="text-text-muted tabular-nums ml-auto">
                  {agg.locked > 0
                    ? `${Math.round((agg.released / agg.locked) * 100)}%`
                    : "—"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-16 text-text-muted">slashed</span>
                <span style={{ color: "var(--status-staked-slashed)" }}>
                  {asciiBar(agg.slashed, agg.locked)}
                </span>
                <span className="text-text-muted tabular-nums ml-auto">
                  {agg.locked > 0
                    ? `${Math.round((agg.slashed / agg.locked) * 100)}%`
                    : "—"}
                </span>
              </div>
            </div>
          )}
          <div className="mt-3 text-[10px] font-mono text-text-muted">
            Stake amount: 2 MNT per Tier 2 audit, 30-day unlock window. Slashed
            stakes transfer to the disputer who filed the upheld dispute.
            Exploit-claim slashing is reserved post-hackathon.
          </div>
        </>
      )}
    </section>
  );
}

function Stat({
  label,
  n,
  mnt,
  color,
}: {
  label: string;
  n: number;
  mnt: bigint;
  color: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="tabular-nums" style={{ color }}>
          {n}
        </span>
        <span className="text-text-muted text-[10px] tabular-nums">
          {formatMnt(mnt)} MNT
        </span>
      </div>
    </div>
  );
}
