// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IReputationRegistry} from "../interfaces/IEIP8004.sol";

/// @title MockReputationRegistry
/// @notice Test-only stand-in for Mantle's official ERC-8004 Reputation Registry.
contract MockReputationRegistry is IReputationRegistry {
    mapping(uint256 => int256) private _rep;

    event FeedbackPosted(uint256 indexed subjectTokenId, int256 score, string reason);

    function postFeedback(uint256 subjectTokenId, int256 score, string calldata reason)
        external
    {
        _rep[subjectTokenId] += score;
        emit FeedbackPosted(subjectTokenId, score, reason);
    }

    function reputationOf(uint256 tokenId) external view returns (int256) {
        return _rep[tokenId];
    }
}
