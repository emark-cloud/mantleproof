// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title DecisionLog
/// @notice Tiny on-chain log proving a demo agent's decision was made on MantleProof
///         data. Used by trading-agent (Demo 2) and yield-agent (Demo 3) to post a
///         verifiable receipt referencing an audit rootHash. (docs/mantleproof.md §7)
/// @dev SCAFFOLD — implement in T3. Deployed via contracts/scripts/deploy.ts;
///      agents/ only references the deployed address.
contract DecisionLog {
    event Decision(
        address indexed agent,
        address indexed target,
        bytes32 indexed auditRootHash,
        string action, // e.g. "DECLINED", "APPROVED"
        string reason
    );

    function logDecision(
        address, /* target */
        bytes32, /* auditRootHash */
        string calldata, /* action */
        string calldata /* reason */
    ) external pure {
        revert("SCAFFOLD: not implemented");
    }
}
