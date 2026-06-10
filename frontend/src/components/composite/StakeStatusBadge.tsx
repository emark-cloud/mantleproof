/**
 * StakeStatusBadge — per-audit stake indicator.
 *
 * Staking deactivated (roadmap, 2026-06-10): audits now anchor for gas only on
 * the staking-free registry, so there is no per-audit stake to display. The
 * component is kept (callers on Agent/Contract/Audit pages still render it) but
 * renders nothing — an audit's credibility comes from `integrity.match`, not a
 * stake. The 2 MNT Tier-2 stake + dispute-slashing ship post-hackathon; when
 * they do, restore the StakingPool.stakeOf read here.
 */
export function StakeStatusBadge(_props: {
  rootHash: `0x${string}`;
  tier: number | undefined;
  hasDispute?: boolean;
}) {
  return null;
}
