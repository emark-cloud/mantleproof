// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title DecisionLog
/// @notice On-chain proof that a demo agent's decision was made on MantleProof
///         data. trading-agent (Demo 2) and yield-agent (Demo 3) post a
///         verifiable receipt referencing an audit rootHash. Open by design —
///         any agent may log its own decision. (docs/mantleproof.md §7)
contract DecisionLog {
    event Decision(
        address indexed agent,
        address indexed target,
        bytes32 indexed auditRootHash,
        string action, // e.g. "DECLINED", "APPROVED"
        string reason
    );

    uint256 public count;

    function logDecision(
        address target,
        bytes32 auditRootHash,
        string calldata action,
        string calldata reason
    ) external {
        require(target != address(0), "target=0");
        require(bytes(action).length != 0, "action empty");
        unchecked {
            ++count;
        }
        emit Decision(msg.sender, target, auditRootHash, action, reason);
    }
}
