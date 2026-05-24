/**
 * StakeStatusBadge — small badge for an audit's Tier 2 stake state.
 *
 * Reads `StakingPool.stakeOf(rootHash)` directly (T43). Honest cold state:
 * shows nothing for Tier 1 audits (no stake exists), shows "no stake" if
 * `stakeOf` reverts. Color-coded per docs/update.md §3.6:
 *   - LOCKED            green  · "STAKED 2 MNT · Nd remaining"
 *   - LOCKED + DISPUTE  purple · "DISPUTED · Nd remaining"  (caller passes hasDispute)
 *   - RELEASED          grey   · "STAKE RELEASED"
 *   - SLASHED_DISPUTE   red    · "STAKE SLASHED"
 */
import { useReadContract } from "wagmi";
import {
  MANTLE_CHAIN_ID,
  STAKE_STATUS_BY_UINT,
  STAKING_POOL_ADDRESS,
  stakingPoolAbi,
} from "../../lib/contracts";
import { Tip } from "../primitives/Tip";

type Stake = {
  rootHash: `0x${string}`;
  auditor: `0x${string}`;
  amount: bigint;
  lockedAt: bigint;
  unlocksAt: bigint;
  status: number;
};

function formatMnt(wei: bigint): string {
  if (wei === 0n) return "0";
  const mnt = Number(wei) / 1e18;
  return mnt < 0.01 ? mnt.toExponential(2) : mnt.toFixed(2).replace(/\.?0+$/, "");
}

function daysRemaining(unlocksAt: bigint): number {
  const now = Math.floor(Date.now() / 1000);
  const dt = Number(unlocksAt) - now;
  if (dt <= 0) return 0;
  return Math.ceil(dt / 86400);
}

export function StakeStatusBadge({
  rootHash,
  tier,
  hasDispute = false,
}: {
  rootHash: `0x${string}`;
  /** Tier of the audit — Tier 1 audits carry no stake; we render nothing. */
  tier: number | undefined;
  /** True when at least one dispute is PENDING against this rootHash. */
  hasDispute?: boolean;
}) {
  const { data } = useReadContract({
    address: STAKING_POOL_ADDRESS,
    abi: stakingPoolAbi,
    functionName: "stakeOf",
    args: [rootHash],
    chainId: MANTLE_CHAIN_ID,
    query: {
      // Tier 1 audits have no stake; don't even ask.
      enabled: tier === 2 && STAKING_POOL_ADDRESS !== "0x0000000000000000000000000000000000000000",
      // Don't surface RPC errors as broken UI — render the honest cold state.
      retry: false,
    },
  });

  if (tier !== 2) return null;
  if (!data) {
    return (
      <Tip text="Tier 2 audits stake 2 MNT into the on-chain StakingPool for a 30-day dispute window. This audit's stake status is unavailable (pool unreachable or audit pre-T43).">
        <span className="font-mono text-[10px] text-text-muted">
          ◇ stake unknown
        </span>
      </Tip>
    );
  }

  const stake = data as Stake;
  const status = STAKE_STATUS_BY_UINT[stake.status] ?? "released";

  if (status === "locked") {
    if (hasDispute) {
      return (
        <Tip text="An on-chain dispute is currently PENDING against this audit. If upheld (RETRACTED), the stake transfers to the disputer.">
          <span
            className="font-mono text-[10px] inline-flex items-center gap-1"
            style={{ color: "var(--status-disputed-pending)" }}
          >
            ◆ DISPUTED · {daysRemaining(stake.unlocksAt)}d remaining ·{" "}
            {formatMnt(stake.amount)} MNT at risk
          </span>
        </Tip>
      );
    }
    return (
      <Tip text="Tier 2 audits stake 2 MNT into the on-chain StakingPool for a 30-day window. If a dispute is upheld (RETRACTED), the stake transfers to the disputer; otherwise it returns to MantleProof's treasury.">
        <span
          className="font-mono text-[10px] inline-flex items-center gap-1"
          style={{ color: "var(--status-staked-locked)" }}
        >
          ◆ STAKED {formatMnt(stake.amount)} MNT · {daysRemaining(stake.unlocksAt)}d remaining
        </span>
      </Tip>
    );
  }
  if (status === "released") {
    return (
      <Tip text="The 30-day stake window elapsed with no upheld dispute; 99% returned to treasury, 1% retained in the pool for ongoing capitalization.">
        <span
          className="font-mono text-[10px] inline-flex items-center gap-1"
          style={{ color: "var(--status-staked-released)" }}
        >
          ◇ STAKE RELEASED
        </span>
      </Tip>
    );
  }
  if (status === "slashed_dispute") {
    return (
      <Tip text="A dispute against this audit was upheld (RETRACTED). The 2 MNT stake transferred to the disputer on-chain.">
        <span
          className="font-mono text-[10px] inline-flex items-center gap-1 line-through"
          style={{ color: "var(--status-staked-slashed)" }}
        >
          ◆ STAKE SLASHED
        </span>
      </Tip>
    );
  }
  // SLASHED_EXPLOIT — reserved post-hackathon; should not appear in this UI.
  return null;
}
