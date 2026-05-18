// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title MockUSDC
/// @notice Test-only 6-decimal ERC-20-ish mock for license/x402 tests.
/// @dev SCAFFOLD — minimal mint/transfer added in T3 test setup. Not deployed.
contract MockUSDC {
    string public constant name = "Mock USDC";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public balanceOf;

    function mint(address, uint256) external pure {
        revert("SCAFFOLD: not implemented");
    }

    function transfer(address, uint256) external pure returns (bool) {
        revert("SCAFFOLD: not implemented");
    }
}
