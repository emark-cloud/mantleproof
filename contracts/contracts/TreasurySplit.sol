// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title TreasurySplit
/// @notice Receives the 20% treasury share. Multi-sig timelock for any withdrawal.
///         Minimal. LOC budget ~80 (docs/mantleproof.md §3).
/// @dev SCAFFOLD — implement in T3.
contract TreasurySplit {
    event Withdrawn(address indexed to, uint256 amount);

    receive() external payable {}

    function withdraw(address /* to */, uint256 /* amount */) external pure {
        revert("SCAFFOLD: not implemented");
    }
}
