// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IEIP8004 — EXTERNAL interfaces we CONSUME (Path A)
/// @notice Mantle issues every agent's ERC-8004 identity NFT automatically as an
///         integrated hackathon feature. We do NOT deploy these registries — these
///         are the interfaces of Mantle's *official* registries that
///         `MantleProofAgent` calls into. Addresses are supplied at deploy time
///         (env: MANTLE_IDENTITY_REGISTRY, MANTLE_REPUTATION_REGISTRY) and differ
///         per network (5000 / 5003). See docs/resources.md §3, CLAUDE.md.
interface IIdentityRegistry {
    /// @notice tokenURI of an agent's registration file (capabilities, endpoints).
    function agentURI(uint256 tokenId) external view returns (string memory);

    /// @notice Owner of an agent identity tokenId.
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IReputationRegistry {
    /// @notice Post a feedback signal about an agent (called per audit).
    function postFeedback(uint256 subjectTokenId, int256 score, string calldata reason)
        external;

    function reputationOf(uint256 tokenId) external view returns (int256);
}
