// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IIdentityRegistry} from "../interfaces/IEIP8004.sol";

/// @title MockIdentityRegistry — test-only stand-in for Mantle's official ERC-8004 v2 Identity Registry.
/// @notice Implements the subset of `IdentityRegistryUpgradeable` (canonical:
///         `github.com/erc-8004/erc-8004-contracts`) that our tests + the
///         deployed wrapper consume. Test helpers (`setAgent`,
///         `approveFor`, `setApprovalForAll`) let specs drive ownership /
///         operator state directly without going through the full
///         ERC-721/EIP-712 registration flow.
contract MockIdentityRegistry is IIdentityRegistry {
    mapping(uint256 => address) private _owners;
    mapping(uint256 => string) private _uris;
    mapping(address => mapping(address => bool)) private _operators;
    mapping(uint256 => address) private _approvals;
    uint256 private _nextId;

    /// @notice Test helper — assign owner + tokenURI for a synthetic agentId.
    function setAgent(uint256 tokenId, address owner_, string calldata uri) external {
        _owners[tokenId] = owner_;
        _uris[tokenId] = uri;
    }

    /// @notice Test helper — set per-token approved address.
    function approveFor(uint256 tokenId, address spender) external {
        _approvals[tokenId] = spender;
    }

    /// @notice Mirror of ERC-721 `setApprovalForAll` so tests can exercise the
    ///         operator branch of `isAuthorizedOrOwner`.
    function setApprovalForAll(address operator, bool approved) external {
        _operators[msg.sender][operator] = approved;
    }

    function register() external returns (uint256 agentId) {
        agentId = _nextId++;
        _owners[agentId] = msg.sender;
    }

    function register(string memory uri) external returns (uint256 agentId) {
        agentId = _nextId++;
        _owners[agentId] = msg.sender;
        _uris[agentId] = uri;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address o = _owners[tokenId];
        require(o != address(0), "ERC721NonexistentToken");
        return o;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_owners[tokenId] != address(0), "ERC721NonexistentToken");
        return _uris[tokenId];
    }

    function isAuthorizedOrOwner(address spender, uint256 agentId) external view returns (bool) {
        address o = _owners[agentId];
        require(o != address(0), "ERC721NonexistentToken");
        if (spender == o) return true;
        if (_operators[o][spender]) return true;
        if (_approvals[agentId] == spender) return true;
        return false;
    }
}
