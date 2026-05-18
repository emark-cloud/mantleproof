// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IReputationRegistry} from "../interfaces/IEIP8004.sol";

/// @title ReputationRegistry (EIP-8004)
/// @notice Standardized feedback signals between agents. LOC budget ~150.
/// @dev SCAFFOLD — implement in T3.
contract ReputationRegistry is IReputationRegistry {
    /// @inheritdoc IReputationRegistry
    function postFeedback(
        uint256, /* subjectTokenId */
        int256, /* score */
        string calldata /* reason */
    ) external pure {
        revert("SCAFFOLD: not implemented");
    }

    /// @inheritdoc IReputationRegistry
    function reputationOf(uint256 /* tokenId */) external pure returns (int256) {
        revert("SCAFFOLD: not implemented");
    }
}
