// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// NEGATIVE: cooldown-aware sUSDe redemption (cooldownShares then unstake),
// sUSDe↔USDe via ERC-4626 convertToAssets (not 1:1), USDe oracle-priced.
interface ISUSDe {
    function cooldownShares(uint256) external returns (uint256);
    function unstake(address) external;
    function convertToAssets(uint256) external view returns (uint256);
}
interface IOracle { function priceOf(address) external view returns (uint256); }

contract UsdeVaultNeg {
    ISUSDe public susde;
    IOracle public oracle;
    address public usde;

    function beginRedeem(uint256 shares) external returns (uint256) {
        return susde.cooldownShares(shares);
    }

    function completeRedeem() external {
        susde.unstake(msg.sender);
    }

    function usdeValue(uint256 shares) external view returns (uint256) {
        uint256 assets = susde.convertToAssets(shares);
        return (assets * oracle.priceOf(usde)) / 1e18;
    }
}
