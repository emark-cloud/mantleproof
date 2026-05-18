// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IIdentityRegistry} from "../interfaces/IEIP8004.sol";

/// @title IdentityRegistry (EIP-8004)
/// @notice ERC-721 + URIStorage, one tokenId per agent. Open registration so other
///         Mantle teams register their agents here. LOC budget ~180.
/// @dev SCAFFOLD — will extend OpenZeppelin v5 ERC721URIStorage in T3.
contract IdentityRegistry is IIdentityRegistry {
    /// @inheritdoc IIdentityRegistry
    function registerAgent(string calldata /* tokenURI */) external pure returns (uint256) {
        revert("SCAFFOLD: not implemented");
    }

    /// @inheritdoc IIdentityRegistry
    function agentURI(uint256 /* tokenId */) external pure returns (string memory) {
        revert("SCAFFOLD: not implemented");
    }
}
