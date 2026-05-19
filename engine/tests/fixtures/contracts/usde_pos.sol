// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// POSITIVE: redeems sUSDe expecting immediate USDe (no cooldown), treats
// sUSDe/USDe 1:1, and uses USDe as collateral valued at $1 with no oracle.
interface ISUSDe { function redeem(uint256, address, address) external returns (uint256); }
interface IUSDe { function balanceOf(address) external view returns (uint256); }

contract UsdeVaultPos {
    ISUSDe public susde;
    IUSDe public usde;

    function instantWithdraw(uint256 shares, address to) external returns (uint256) {
        uint256 usdeAmount = susde.redeem(shares, to, address(this));
        uint256 collateralValue = usdeAmount;
        return collateralValue;
    }

    function par(uint256 a) external pure returns (uint256) {
        uint256 usdeAmt = a;
        uint256 susdeAmt = usdeAmt;
        return susdeAmt;
    }
}
