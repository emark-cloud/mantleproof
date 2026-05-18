// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IValidationRegistry} from "../interfaces/IEIP8004.sol";

/// @title ValidationRegistry (EIP-8004)
/// @notice Cryptographic/economic verification of agent work. Minimal v1,
///         designed for extensibility. LOC budget ~120.
/// @dev SCAFFOLD — implement in T3.
contract ValidationRegistry is IValidationRegistry {
    /// @inheritdoc IValidationRegistry
    function recordValidation(
        uint256, /* tokenId */
        bytes32, /* workHash */
        bool /* ok */
    ) external pure {
        revert("SCAFFOLD: not implemented");
    }
}
