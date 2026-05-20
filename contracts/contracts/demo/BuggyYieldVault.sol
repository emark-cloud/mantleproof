// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal sUSDe interface — only what the buggy vault calls.
interface ISUSDeMinimal {
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    function balanceOf(address account) external view returns (uint256);
}

/// @title BuggyYieldVault -- DEMO ONLY (do NOT use)
/// @notice Deliberately-buggy sUSDe yield vault for MantleProof Demo 1
///         (docs/mantleproof.md section 7, Deployer-agent pre-deploy audit).
///
///         BUG: deposits route into sUSDe and `withdraw` calls sUSDe.redeem
///         synchronously, expecting USDe back in the same tx. sUSDe enforces a
///         multi-day cooldown (cooldownShares / cooldownAssets then unstake);
///         a synchronous redeem cannot deliver underlying USDe today. This is
///         the exact bug class flagged by `engine/checks/usde_check.py` H1.
///
///         Deployed by the deployer-agent demo script as the audit target.
///         MantleProof catches this BEFORE the vault sees real user funds.
///         NO admin recovery / NO upgradeability / NOT FOR USE.
contract BuggyYieldVault {
    /// @notice Sentinel string the engine / dashboards can pattern-match on.
    string public constant DEMO_WARNING =
        "MantleProof Demo 1: BuggyYieldVault (DO NOT DEPOSIT) -- known-buggy sUSDe vault";

    /// @notice Real Mantle-mainnet sUSDe address (chainId 5000), hard-pinned --
    ///         the address the engine's usde_check `referenced(...)` keys on.
    ISUSDeMinimal public constant susde =
        ISUSDeMinimal(0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2);

    /// @notice Underlying USDe address on Mantle mainnet -- referenced for the
    ///         second symbol that the Tier-1 relevance gate looks at.
    address public constant usde = 0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34;

    /// @notice User share accounting (1:1 with sUSDe shares -- also wrong, but
    ///         not the headline finding; the cooldown miss is what the demo
    ///         turns on).
    mapping(address => uint256) public shareBalance;
    uint256 public totalShares;

    event Deposited(address indexed user, uint256 assets, uint256 shares);
    event Withdrawn(address indexed user, uint256 shares, uint256 assets);

    /// @notice Deposit USDe -> forward to sUSDe (caller pre-approves USDe).
    function deposit(uint256 assets) external returns (uint256 shares) {
        shares = susde.deposit(assets, address(this));
        shareBalance[msg.sender] += shares;
        totalShares += shares;
        emit Deposited(msg.sender, assets, shares);
    }

    /// @notice BUG: synchronous redeem. sUSDe redemption requires
    ///         `cooldownShares` -> wait `cooldownDuration` -> `unstake`.
    function withdraw(uint256 shares) external returns (uint256 assets) {
        require(shareBalance[msg.sender] >= shares, "insufficient shares");
        shareBalance[msg.sender] -= shares;
        totalShares -= shares;
        // The fatal call: no cooldown, no unstake, expects USDe synchronously.
        assets = susde.redeem(shares, msg.sender, address(this));
        emit Withdrawn(msg.sender, shares, assets);
    }

    /// @notice 1:1 sUSDe share read-through (also wrong -- sUSDe is ERC-4626).
    function balanceOfUnderlying(address user) external view returns (uint256) {
        return shareBalance[user];
    }
}
