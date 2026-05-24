// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IMantleProofRegistry} from "./interfaces/IMantleProofRegistry.sol";
import {IMantleProofAgent} from "./interfaces/IMantleProofAgent.sol";
import {IStakingPool} from "./interfaces/IStakingPool.sol";

/// @title MantleProofRegistry
/// @notice Append-only audit registry + dispute layer (docs/update.md §2).
///         `submitAudit` is callable only by the oracle signer; `getAudit` is
///         public read. Each anchored audit advances the linked agent's
///         compounding memoryRoot and (for Tier 2) locks a stake in the pool.
/// @dev Invariants (CLAUDE.md):
///        - the oracle signer is the ONLY writer to `submitAudit` and `resolveDispute`.
///        - the owner is an admin role that can only (re)point the agent link.
///        - `stakingPool` is immutable — set in constructor; reading and slashing
///          both flow through the same address for the lifetime of this registry.
contract MantleProofRegistry is IMantleProofRegistry, Ownable {
    /// @notice The sole address permitted to write audits and resolve disputes.
    address public immutable oracleSigner;

    /// @notice StakingPool that holds Tier 2 audit stakes (docs/update.md §3).
    IStakingPool public immutable stakingPool;

    /// @notice Optional MantleProofAgent; if set, advanced on every submitAudit.
    IMantleProofAgent public agent;

    /// @notice Latest audit per target (append-only: only the head is kept on-chain;
    ///         full history lives in IPFS + events).
    mapping(address => Report) private _latest;

    /// @notice Number of audits ever submitted for a target.
    mapping(address => uint256) public auditCount;

    /// @notice tier (1 or 2) keyed by rootHash — used to gate `submitDispute`.
    ///         Populated on every `submitAudit`.
    mapping(bytes32 => uint8) public auditTier;

    /// @notice target keyed by rootHash — used by the resolver to know which
    ///         audit a dispute belongs to without an extra arg.
    mapping(bytes32 => address) public auditTarget;

    /// @notice All disputes ever filed (1-indexed; id 0 is reserved).
    Dispute[] private _disputes;

    /// @notice Index of disputes by audit rootHash.
    mapping(bytes32 => uint256[]) private _disputesByRoot;

    event AgentLinked(address indexed agent);

    error NotOracleSigner();
    error UnknownTarget(address target);
    error UnknownAudit(bytes32 rootHash);
    error UnknownDispute(uint256 disputeId);
    error Tier1NotDisputable(bytes32 rootHash);
    error InvalidTier(uint8 tier);
    error InvalidStakeValue(uint256 expected, uint256 received);
    error DisputeNotPending(uint256 disputeId);
    error InvalidOutcome();

    /// @notice Required `msg.value` for Tier 2 `submitAudit` calls (2 MNT).
    ///         User-locked override of docs/update.md §3.1's 50 MNT default.
    uint256 public constant TIER2_STAKE = 2 ether;

    constructor(
        address oracleSigner_,
        address owner_,
        address stakingPool_
    ) Ownable(owner_) {
        require(oracleSigner_ != address(0), "oracleSigner=0");
        require(stakingPool_ != address(0), "stakingPool=0");
        oracleSigner = oracleSigner_;
        stakingPool = IStakingPool(stakingPool_);
        // Reserve dispute id 0 so callers can use 0 as "no dispute".
        _disputes.push();
    }

    modifier onlyOracle() {
        if (msg.sender != oracleSigner) revert NotOracleSigner();
        _;
    }

    /// @notice Link the MantleProofAgent advanced on each audit. Admin-only.
    function setAgent(address agent_) external onlyOwner {
        agent = IMantleProofAgent(agent_);
        emit AgentLinked(agent_);
    }

    /// @inheritdoc IMantleProofRegistry
    function submitAudit(
        address target,
        uint8 tier,
        Severity severity,
        bytes32 rootHash,
        string calldata ipfsCID
    ) external payable onlyOracle {
        require(target != address(0), "target=0");
        require(rootHash != bytes32(0), "rootHash=0");
        if (tier != 1 && tier != 2) revert InvalidTier(tier);

        _latest[target] = Report({
            rootHash: rootHash,
            severity: severity,
            ipfsCID: ipfsCID,
            timestamp: uint64(block.timestamp),
            submitter: msg.sender,
            tier: tier
        });
        auditTier[rootHash] = tier;
        auditTarget[rootHash] = target;
        unchecked {
            ++auditCount[target];
        }

        emit AuditSubmitted(target, rootHash, severity, ipfsCID, tier);

        if (address(agent) != address(0)) {
            agent.updateMemoryRoot(rootHash);
        }

        // Tier 2 audits stake 2 MNT into the pool, locked for 30 days.
        // Tier 1 audits MUST NOT forward value.
        if (tier == 2) {
            if (msg.value != TIER2_STAKE) revert InvalidStakeValue(TIER2_STAKE, msg.value);
            stakingPool.lockStake{value: TIER2_STAKE}(rootHash, TIER2_STAKE);
        } else {
            if (msg.value != 0) revert InvalidStakeValue(0, msg.value);
        }
    }

    /// @inheritdoc IMantleProofRegistry
    function submitDispute(
        bytes32 rootHash,
        uint256 findingIndex,
        string calldata counterClaimIpfs
    ) external payable returns (uint256 disputeId) {
        uint8 tier = auditTier[rootHash];
        if (tier == 0) revert UnknownAudit(rootHash);
        if (tier != 2) revert Tier1NotDisputable(rootHash);

        disputeId = _disputes.length;
        _disputes.push(
            Dispute({
                rootHash: rootHash,
                findingIndex: findingIndex,
                disputer: msg.sender,
                counterClaimIpfs: counterClaimIpfs,
                counterStake: msg.value,
                antiSpamFee: 0,
                status: DisputeStatus.PENDING,
                submittedAt: uint64(block.timestamp),
                resolvedAt: 0,
                reAuditRootHash: bytes32(0)
            })
        );
        _disputesByRoot[rootHash].push(disputeId);

        emit DisputeSubmitted(
            disputeId,
            rootHash,
            findingIndex,
            msg.sender,
            counterClaimIpfs,
            msg.value
        );
    }

    /// @inheritdoc IMantleProofRegistry
    function resolveDispute(
        uint256 disputeId,
        DisputeStatus outcome,
        bytes32 reAuditRootHash
    ) external onlyOracle {
        if (disputeId == 0 || disputeId >= _disputes.length) revert UnknownDispute(disputeId);
        if (outcome == DisputeStatus.PENDING) revert InvalidOutcome();

        Dispute storage d = _disputes[disputeId];
        if (d.status != DisputeStatus.PENDING) revert DisputeNotPending(disputeId);

        d.status = outcome;
        d.resolvedAt = uint64(block.timestamp);
        d.reAuditRootHash = reAuditRootHash;

        emit DisputeResolved(disputeId, d.rootHash, outcome, reAuditRootHash);

        // Counter-stake disposition + dispute-slash:
        //   RETRACTED  : counter-stake → disputer (refund); slash audit-stake to disputer.
        //   AMENDED    : counter-stake → disputer (refund); audit-stake stays locked.
        //                Honesty label drops one tier engine-side (off-chain).
        //   DISMISSED  : counter-stake forfeited (stays in registry, swept later).
        if (outcome == DisputeStatus.RETRACTED) {
            if (d.counterStake != 0) {
                (bool ok, ) = d.disputer.call{value: d.counterStake}("");
                if (!ok) revert();
            }
            // Slash full audit stake to the disputer.
            stakingPool.slashByDispute(d.rootHash, d.disputer, TIER2_STAKE);
        } else if (outcome == DisputeStatus.AMENDED) {
            if (d.counterStake != 0) {
                (bool ok, ) = d.disputer.call{value: d.counterStake}("");
                if (!ok) revert();
            }
        }
        // DISMISSED: counter-stake retained — owner can sweep via standard
        // treasury flow; left in registry for now to keep this contract simple.
    }

    /// @inheritdoc IMantleProofRegistry
    function getAudit(address target) external view returns (Report memory) {
        Report memory r = _latest[target];
        if (r.rootHash == bytes32(0)) revert UnknownTarget(target);
        return r;
    }

    /// @notice True if `target` has at least one anchored audit.
    function isAudited(address target) external view returns (bool) {
        return _latest[target].rootHash != bytes32(0);
    }

    /// @inheritdoc IMantleProofRegistry
    function getDispute(uint256 disputeId) external view returns (Dispute memory) {
        if (disputeId == 0 || disputeId >= _disputes.length) revert UnknownDispute(disputeId);
        return _disputes[disputeId];
    }

    /// @inheritdoc IMantleProofRegistry
    function getDisputesForRoot(bytes32 rootHash) external view returns (uint256[] memory) {
        return _disputesByRoot[rootHash];
    }

    function disputeCount() external view returns (uint256) {
        // -1 for the reserved id 0
        return _disputes.length - 1;
    }

    /// @notice Owner sweep for counter-stakes from DISMISSED disputes that were
    ///         forfeited. Pulls the contract's free MNT balance to treasury.
    /// @dev Leaves locked stakes alone — those live in StakingPool, not here.
    function sweepForfeited(address payable to) external onlyOwner {
        require(to != address(0), "to=0");
        uint256 bal = address(this).balance;
        require(bal != 0, "empty");
        (bool ok, ) = to.call{value: bal}("");
        if (!ok) revert();
    }

    // ─────────────────────────────────────────────────────────────────────
    // claimExploit: RESERVED, post-hackathon (docs/update.md §3.4)
    //
    // The exploit-slashing trigger requires off-chain LLM verification of an
    // exploit class against the audit's five-dimension scope, signed by the
    // oracle. Deferred per user-locked decision 2026-05-23. A future
    // `resolveExploitClaim(rootHash, beneficiary, portion)` mirroring
    // `resolveDispute` will be added behind `onlyOracle` once the engine-side
    // exploit classifier is built.
    // ─────────────────────────────────────────────────────────────────────
}
