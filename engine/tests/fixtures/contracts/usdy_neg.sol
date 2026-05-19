// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// NEGATIVE: integrates USDY correctly — reads balanceOf live at point of use
// (never persisted), prices through Ondo's RWADynamicRateOracle, and guards
// the blocklist beforeTransfer revert with try/catch.
interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}
interface IRWADynamicRateOracle { function getPrice() external view returns (uint256); }

contract UsdyVaultNeg {
    IERC20 public usdy;
    IRWADynamicRateOracle public rwaDynamicRateOracle;

    function valueOf(address user) external view returns (uint256) {
        uint256 bal = usdy.balanceOf(user);            // live, not stored
        return (bal * rwaDynamicRateOracle.getPrice()) / 1e18;
    }

    function payout(address to, uint256 amount) external {
        try usdy.transfer(to, amount) returns (bool ok) {
            require(ok, "transfer failed");
        } catch {
            revert("usdy blocklist hit");
        }
    }
}
