// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IIdentityRegistry} from "../interfaces/IEIP8004.sol";

/// @title MockIdentityRegistry
/// @notice Test-only stand-in for Mantle's official ERC-8004 Identity Registry.
contract MockIdentityRegistry is IIdentityRegistry {
    mapping(uint256 => address) private _owners;
    mapping(uint256 => string) private _uris;

    function setAgent(uint256 tokenId, address owner_, string calldata uri) external {
        _owners[tokenId] = owner_;
        _uris[tokenId] = uri;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _owners[tokenId];
    }

    function agentURI(uint256 tokenId) external view returns (string memory) {
        return _uris[tokenId];
    }
}
