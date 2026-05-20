// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal mETH interface -- only what the buggy vault calls.
interface IMethMinimal {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @title MisaccountedMethVault -- DEMO BAIT (do NOT deposit)
/// @notice Deliberately-buggy mETH vault for MantleProof bait coverage of
///         `engine/checks/meth_check.py` H1 (HIGH severity).
///
///         BUG: shares are minted/burned against a balance-proportional
///         accounting model: `shares = assets * totalSupply / meth.balanceOf(this)`.
///         Mantle's bridged mETH accrues value via its exchange rate against
///         L1 ETH, NOT via balance growth -- so when the rate moves, this
///         vault under-counts yield in shares, silently diluting early
///         stakers' position value relative to the underlying. The Tier-1
///         check looks for `meth.balanceOf(` and `totalSupply` with NO
///         rate-aware keyword (no `exchangeRate`, `getRate`, `oracle`, etc.)
///         and fires H1 at HIGH/ESTIMATED.
///
///         NO admin / NO upgradeability / NOT FOR USE.
contract MisaccountedMethVault {
    /// @notice Sentinel string the engine / dashboards can pattern-match on.
    string public constant DEMO_WARNING =
        "MantleProof bait: MisaccountedMethVault (DO NOT DEPOSIT) -- mETH accounted by balanceOf proportion; ignores the L1 exchange rate; early stakers silently diluted";

    /// @notice Canonical Mantle-mainnet mETH_L2 address. Named handle `meth`
    ///         so `engine/checks/_common.py:calls_into` regex matches and the
    ///         Tier-1 meth_check H1 relevance gate trips.
    IMethMinimal public constant meth =
        IMethMinimal(0xcDA86A272531e8640cD7F1a92c01839911B90bb0);

    mapping(address => uint256) public shareBalance;
    uint256 public totalSupply;

    event Deposited(address indexed user, uint256 assets, uint256 shares);
    event Withdrawn(address indexed user, uint256 shares, uint256 assets);

    /// @notice Deposit mETH; mint shares = assets * totalSupply / vaultBalance.
    ///         BUG: vaultBalance is read via `meth.balanceOf(this)` -- a
    ///         strictly-monotonic view that does NOT reflect mETH's yield
    ///         (yield accrues via the L1 mETH exchange rate, not balance
    ///         growth on L2). Later deposits see a stale denominator; early
    ///         stakers' implied claim on the vault decays as the rate moves.
    function deposit(uint256 assets) external returns (uint256 shares) {
        require(meth.transferFrom(msg.sender, address(this), assets), "transfer in");
        uint256 vaultBalance = meth.balanceOf(address(this));
        if (totalSupply == 0) {
            shares = assets;
        } else {
            // CLASSIC balance-proportional shares math (no exchange-rate read).
            // (vaultBalance - assets) is the pre-deposit balance.
            shares = (assets * totalSupply) / (vaultBalance - assets);
        }
        shareBalance[msg.sender] += shares;
        totalSupply += shares;
        emit Deposited(msg.sender, assets, shares);
    }

    /// @notice Withdraw shares; payout = shares * vaultBalance / totalSupply.
    ///         Same balance-proportional bug on the exit leg.
    function withdraw(uint256 shares) external returns (uint256 assets) {
        require(shareBalance[msg.sender] >= shares, "insufficient");
        uint256 vaultBalance = meth.balanceOf(address(this));
        assets = (shares * vaultBalance) / totalSupply;
        shareBalance[msg.sender] -= shares;
        totalSupply -= shares;
        require(meth.transfer(msg.sender, assets), "transfer out");
        emit Withdrawn(msg.sender, shares, assets);
    }
}
