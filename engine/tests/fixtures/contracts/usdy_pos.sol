// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// POSITIVE: caches a USDY balance into persistent storage (`snapshotBalance`)
// and reuses it for payouts — every rebase between snapshot and withdraw is
// dropped. Also prices via a generic spot feed (no RWADynamicRateOracle).
interface IERC20 { function balanceOf(address) external view returns (uint256); }
interface IFeed { function latestAnswer() external view returns (int256); }

contract UsdyVaultPos {
    IERC20 public usdy;
    IFeed public priceFeed;
    uint256 public snapshotBalance;

    function record() external {
        snapshotBalance = usdy.balanceOf(address(this));
    }

    function withdrawShare(address to, uint256 bps) external {
        uint256 amount = (snapshotBalance * bps) / 10_000;
        int256 px = priceFeed.latestAnswer();
        require(px > 0, "px");
        usdy.transfer(to, amount);
    }
}
