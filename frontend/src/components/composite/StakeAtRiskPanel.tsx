/**
 * StakeAtRiskPanel — economic-staking status for /agent/:tokenId.
 *
 * Staking deactivated (roadmap, 2026-06-10): audits anchor for gas only on the
 * staking-free registry. The StakingPool (2 MNT Tier-2 stake, 30-day window,
 * dispute-slashing) is the future economic-security layer and is not part of the
 * current deployment, so this panel shows the roadmap state rather than reading
 * stale events from the retired pool. When staking ships, restore the live
 * StakeLocked/Released/SlashedByDispute aggregation here.
 */
import { Tip } from "../primitives/Tip";

export function StakeAtRiskPanel() {
  return (
    <section className="panel px-4 py-4">
      <h2 className="font-mono text-xs uppercase tracking-wider text-text-primary mb-2">
        <Tip text="Economic staking (2 MNT per Tier 2 audit, slashed to a disputer on an upheld dispute) is on the MantleProof roadmap. Audits currently anchor for gas only; credibility is enforced by the IPFS↔on-chain rootHash integrity check, not a bond.">
          Stake at Risk
        </Tip>
      </h2>
      <div className="font-mono text-[12px] text-text-muted leading-relaxed">
        <span style={{ color: "var(--status-staked-released)" }}>◇ roadmap</span>{" "}
        — audits currently anchor for gas only.
      </div>
      <div className="mt-3 text-[10px] font-mono text-text-muted leading-relaxed">
        Economic security (2 MNT Tier-2 stake, 30-day unlock window, slash-to-disputer
        on an upheld dispute, exploit-claim slashing) ships post-hackathon. Audit
        credibility today rests on the independently recomputable rootHash
        (<span className="text-text-primary">integrity.match</span>), not a bond.
      </div>
    </section>
  );
}
