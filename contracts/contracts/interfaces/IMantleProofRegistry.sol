// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IMantleProofRegistry
/// @notice Append-only audit registry + dispute layer. Public read, oracle-signed
///         write. See docs/mantleproof.md §3 + docs/update.md §2.
interface IMantleProofRegistry {
    enum Severity {
        Info,
        Low,
        Medium,
        High
    }

    enum DisputeStatus {
        PENDING,
        DISMISSED,
        AMENDED,
        RETRACTED
    }

    struct Report {
        bytes32 rootHash;
        Severity severity;
        string ipfsCID;
        uint64 timestamp;
        address submitter;
        uint8 tier; // 1 or 2 (Tier 1 audits are NOT disputable per docs/update.md §8)
    }

    struct Dispute {
        bytes32 rootHash;
        uint256 findingIndex;
        address disputer;
        string counterClaimIpfs;
        uint256 counterStake;
        uint256 antiSpamFee; // off-chain x402 receipt; recorded informationally
        DisputeStatus status;
        uint64 submittedAt;
        uint64 resolvedAt;
        bytes32 reAuditRootHash;
    }

    event AuditSubmitted(
        address indexed target,
        bytes32 indexed rootHash,
        Severity severity,
        string ipfsCID,
        uint8 tier
    );

    event DisputeSubmitted(
        uint256 indexed disputeId,
        bytes32 indexed rootHash,
        uint256 findingIndex,
        address indexed disputer,
        string counterClaimIpfs,
        uint256 counterStake
    );

    event DisputeResolved(
        uint256 indexed disputeId,
        bytes32 indexed rootHash,
        DisputeStatus status,
        bytes32 reAuditRootHash
    );

    /// @notice Anchor an audit result. Callable only by the oracle signer.
    ///         Nonpayable for both tiers — audit staking is deactivated (roadmap),
    ///         so audits anchor for gas only.
    function submitAudit(
        address target,
        uint8 tier,
        Severity severity,
        bytes32 rootHash,
        string calldata ipfsCID
    ) external;

    /// @notice File a dispute against a finding in an existing Tier 2 audit.
    ///         Permissionless. Optional counter-stake via msg.value (MNT).
    function submitDispute(
        bytes32 rootHash,
        uint256 findingIndex,
        string calldata counterClaimIpfs
    ) external payable returns (uint256 disputeId);

    /// @notice Resolve a pending dispute. Oracle-only. Refunds the disputer's
    ///         counter-stake on RETRACTED/AMENDED (audit-stake slashing is roadmap).
    function resolveDispute(
        uint256 disputeId,
        DisputeStatus outcome,
        bytes32 reAuditRootHash
    ) external;

    function getAudit(address target) external view returns (Report memory);

    function getDispute(uint256 disputeId) external view returns (Dispute memory);

    function getDisputesForRoot(bytes32 rootHash) external view returns (uint256[] memory);
}
