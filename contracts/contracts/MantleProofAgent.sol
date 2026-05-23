// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IIdentityRegistry, IReputationRegistry} from "./interfaces/IEIP8004.sol";
import {IMantleProofAgent} from "./interfaces/IMantleProofAgent.sol";

/// @title MantleProofAgent (Path A — thin wrapper)
/// @notice MantleProof's identity NFT is issued by Mantle's official ERC-8004
///         Identity Registry (automatic hackathon feature) — we do NOT deploy our
///         own registry. This wrapper references that external identity by tokenId,
///         maintains the compounding per-audit `memoryRoot` and `auditsPerformed`,
///         and exposes the iNFT owner / reputation read-through used by the license
///         split and the dashboard. (docs/mantleproof.md §3, Path A)
contract MantleProofAgent is IMantleProofAgent, Ownable {
    /// @notice Mantle-issued ERC-8004 identity tokenId for MantleProof (T5).
    uint256 public immutable agentTokenId;
    IIdentityRegistry public immutable identityRegistry;
    IReputationRegistry public immutable reputationRegistry;

    /// @notice compounding hash chain: keccak256(memoryRoot, rootHash) per audit.
    bytes32 public memoryRoot;
    uint256 public auditsPerformed;

    /// @notice The only address allowed to advance memoryRoot (the registry).
    address public auditor;

    event MemoryRootAdvanced(
        bytes32 indexed previous, bytes32 indexed next, uint256 auditsPerformed
    );
    event AuditorSet(address indexed auditor);

    error NotAuditor();

    constructor(
        address identityRegistry_,
        address reputationRegistry_,
        uint256 agentTokenId_,
        address owner_
    ) Ownable(owner_) {
        require(identityRegistry_ != address(0), "identityRegistry=0");
        require(reputationRegistry_ != address(0), "reputationRegistry=0");
        identityRegistry = IIdentityRegistry(identityRegistry_);
        reputationRegistry = IReputationRegistry(reputationRegistry_);
        agentTokenId = agentTokenId_;
    }

    /// @notice Set the address (MantleProofRegistry) allowed to advance memoryRoot.
    function setAuditor(address auditor_) external onlyOwner {
        auditor = auditor_;
        emit AuditorSet(auditor_);
    }

    /// @inheritdoc IMantleProofAgent
    function updateMemoryRoot(bytes32 rootHash) external {
        if (msg.sender != auditor) revert NotAuditor();
        bytes32 prev = memoryRoot;
        bytes32 next = keccak256(abi.encodePacked(prev, rootHash));
        memoryRoot = next;
        unchecked {
            ++auditsPerformed;
        }
        emit MemoryRootAdvanced(prev, next, auditsPerformed);
    }

    /// @notice Current owner of MantleProof's ERC-8004 identity (license split
    ///         beneficiary; follows iNFT transfers).
    function agentOwner() external view returns (address) {
        return identityRegistry.ownerOf(agentTokenId);
    }

    /// @notice DEFUNCT on-chain — reverts unconditionally.
    /// @dev The deployed implementation called `IReputationRegistry.reputationOf(uint256)`
    ///      against the official Mantle Reputation Registry. That selector is
    ///      FICTIONAL — it does not exist on the canonical v2 contract — so
    ///      every on-chain call to this view reverts at runtime. The interface
    ///      was rewritten 2026-05-23 (T38, see `IEIP8004.sol`); this view
    ///      now reverts in source as well so the source matches the
    ///      deployed reality and any future re-deploy can't silently
    ///      reintroduce the bug. Real reputation lives in the official
    ///      Reputation Registry — read it directly:
    ///        `IReputationRegistry(reputationRegistry).getSummary(
    ///            agentTokenId,
    ///            IReputationRegistry(reputationRegistry).getClients(agentTokenId),
    ///            "", ""
    ///        )`
    ///      The frontend reads `getSummary` from the official registry (T41).
    function reputation() external pure returns (int256) {
        revert(
            "MantleProofAgent.reputation: defunct on-chain (T38). Read getSummary(agentTokenId, getClients(agentTokenId), '', '') on the official Reputation Registry."
        );
    }

    /// @notice DEFUNCT on-chain — reverts unconditionally.
    /// @dev The deployed implementation called `IIdentityRegistry.agentURI(uint256)`.
    ///      That selector is FICTIONAL — the canonical name is ERC-721
    ///      `tokenURI(uint256)`. Same bug class as `reputation()` above;
    ///      same remediation: read `tokenURI(agentTokenId)` directly from
    ///      the official Identity Registry.
    function agentURI() external pure returns (string memory) {
        revert(
            "MantleProofAgent.agentURI: defunct on-chain (T38). Read tokenURI(agentTokenId) on the official Identity Registry."
        );
    }
}
