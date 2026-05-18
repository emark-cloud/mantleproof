// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IEIP8004
/// @notice Minimal EIP-8004 registry interfaces (Identity / Reputation / Validation).
/// @dev SCAFFOLD: signatures only. Written to match the EIP-8004 draft so other
///      Mantle teams can register against our deployment. See docs/resources.md §3.
interface IIdentityRegistry {
    event AgentRegistered(uint256 indexed tokenId, address indexed owner, string tokenURI);

    /// @notice Register an agent; mints an ERC-721 identity with URIStorage.
    function registerAgent(string calldata tokenURI) external returns (uint256 tokenId);

    function agentURI(uint256 tokenId) external view returns (string memory);
}

interface IReputationRegistry {
    event FeedbackPosted(
        uint256 indexed subjectTokenId,
        uint256 indexed authorTokenId,
        int256 score,
        string reason
    );

    function postFeedback(uint256 subjectTokenId, int256 score, string calldata reason) external;

    function reputationOf(uint256 tokenId) external view returns (int256);
}

interface IValidationRegistry {
    event WorkValidated(uint256 indexed tokenId, bytes32 indexed workHash, bool ok);

    function recordValidation(uint256 tokenId, bytes32 workHash, bool ok) external;
}
