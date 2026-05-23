// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IEIP8004 — EXTERNAL interfaces we CONSUME from the canonical ERC-8004 v2
///         registries (`erc8004.identity.registry` / `erc8004.reputation.registry.2`).
/// @notice Verified 2026-05-23 against the deployed bytecode on Mantle mainnet
///         (chainId 5000) and the canonical source at
///         `github.com/erc-8004/erc-8004-contracts` @ master. Full verification
///         log: `docs/erc8004-abi-notes.md` (T37).
///
///         **WARNING — interface was rewritten 2026-05-23 (T38).** The prior
///         version declared FICTIONAL functions that do not exist on the
///         deployed v2 registries (`reputationOf`, `postFeedback`,
///         `agentURI(uint256)`). The deployed `MantleProofAgent` was
///         compiled against that fictional interface — its `reputation()` and
///         `agentURI()` views revert on-chain at runtime. Those views are
///         now marked defunct in `MantleProofAgent.sol`; readers must call
///         the official registries directly using this corrected interface.
///
///         We do NOT deploy these registries — Mantle issues every agent's
///         identity NFT automatically as an integrated hackathon feature.
///         Canonical addresses are pinned in `contracts/config/registries.ts`
///         and overridable per network via `MANTLE_IDENTITY_REGISTRY` /
///         `MANTLE_REPUTATION_REGISTRY` env (CLAUDE.md "Path A").

/// @notice ERC-8004 v2 Identity Registry — `ERC721URIStorageUpgradeable` plus
///         agent-wallet metadata. We declare only the surface our wrapper +
///         mocks consume.
interface IIdentityRegistry {
    /// @notice Permissionless self-registration. Mints a new agentId NFT to
    ///         `msg.sender`. The two-arg overload sets the ERC-721 tokenURI in
    ///         the same call.
    function register() external returns (uint256 agentId);
    function register(string memory agentURI) external returns (uint256 agentId);

    /// @notice ERC-721 owner of an agent identity tokenId. Reverts with
    ///         `ERC721NonexistentToken(tokenId)` if unregistered.
    function ownerOf(uint256 tokenId) external view returns (address);

    /// @notice ERC-721 tokenURI for an agent's registration card / capability
    ///         manifest. The legacy `agentURI(uint256)` selector this file
    ///         previously declared is FICTIONAL — the canonical name is
    ///         `tokenURI`. Reverts with `ERC721NonexistentToken(tokenId)` for
    ///         unregistered tokens.
    function tokenURI(uint256 tokenId) external view returns (string memory);

    /// @notice True iff `spender` is the owner of `agentId`, an
    ///         `setApprovalForAll`-approved operator, or the per-token
    ///         approved address. Reverts `ERC721NonexistentToken(agentId)` if
    ///         the agent doesn't exist. Drives the Reputation Registry's
    ///         anti-self-feedback gate; useful as a pre-flight check before
    ///         calling `giveFeedback`.
    function isAuthorizedOrOwner(address spender, uint256 agentId)
        external view returns (bool);
}

/// @notice ERC-8004 v2 Reputation Registry. The interaction model is strictly
///         client → server-agent: any address that is NOT the agent's
///         owner/operator/approved-address may leave feedback via
///         `giveFeedback`. **There is no signed-auth (`feedbackAuth`)
///         requirement on the deployed v2 contract** — the only gate is the
///         anti-self-feedback check
///         `!isAuthorizedOrOwner(msg.sender, agentId)`. The
///         scope-doc assumption to the contrary was verified wrong on
///         2026-05-23 (T37); see `docs/erc8004-abi-notes.md`.
interface IReputationRegistry {
    /// @notice Post feedback about `agentId`. `value` is bounded to ±1e38;
    ///         `valueDecimals` ≤ 18. Reverts `"Self-feedback not allowed"`
    ///         if `msg.sender` is owner/operator/approved for `agentId`.
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;

    /// @notice Revoke a previously-posted feedback (only the original
    ///         `clientAddress = msg.sender` may revoke their own).
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external;

    /// @notice Append a response (e.g. dispute / acknowledgement) to a
    ///         feedback entry. Open to any responder.
    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external;

    /// @notice Aggregate feedback across `clientAddresses` (**REQUIRED
    ///         non-empty** — the v2 contract reverts `"clientAddresses
    ///         required"` if empty). Tag filters are optional (empty string =
    ///         no filter). Returns count + WAD-normalised mean rescaled to
    ///         the modal `valueDecimals`.
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals);

    /// @notice Bulk-read all feedback for `agentId`. Unlike `getSummary`, an
    ///         empty `clientAddresses` falls back to "all stored clients" via
    ///         the contract's internal client list.
    function readAllFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2,
        bool includeRevoked
    ) external view returns (
        address[] memory clients,
        uint64[] memory feedbackIndexes,
        int128[] memory values,
        uint8[] memory valueDecimals,
        string[] memory tag1s,
        string[] memory tag2s,
        bool[] memory revokedStatuses
    );

    /// @notice Read a single feedback entry by client + 1-based index.
    function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
        external
        view
        returns (
            int128 value,
            uint8 valueDecimals,
            string memory tag1,
            string memory tag2,
            bool isRevoked
        );

    /// @notice Last feedback index `clientAddress` has posted about `agentId`
    ///         (0 if none).
    function getLastIndex(uint256 agentId, address clientAddress)
        external view returns (uint64);

    /// @notice All addresses that have ever posted feedback about `agentId`.
    function getClients(uint256 agentId) external view returns (address[] memory);

    /// @notice Address of the Identity Registry this Reputation Registry was
    ///         initialised against — used to enforce the anti-self-feedback
    ///         check. Should equal the canonical IdentityRegistry address.
    function getIdentityRegistry() external view returns (address);
}
