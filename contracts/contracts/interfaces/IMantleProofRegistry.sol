// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IMantleProofRegistry
/// @notice Append-only audit registry. Public read, oracle-signed write.
/// @dev SCAFFOLD: signatures only, no logic. See docs/mantleproof.md §3.
interface IMantleProofRegistry {
    enum Severity {
        Info,
        Low,
        Medium,
        High
    }

    struct Report {
        bytes32 rootHash;
        Severity severity;
        string ipfsCID;
        uint64 timestamp;
        address submitter;
    }

    event AuditSubmitted(
        address indexed target,
        bytes32 indexed rootHash,
        Severity severity,
        string ipfsCID
    );

    /// @notice Anchor an audit result. Callable only by the oracle signer.
    function submitAudit(
        address target,
        Severity severity,
        bytes32 rootHash,
        string calldata ipfsCID
    ) external;

    /// @notice Latest audit for a target. Free, read-only.
    function getAudit(address target) external view returns (Report memory);
}
