// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IStakingPool
/// @notice Minimal surface MantleProofRegistry uses to lock + slash Tier 2
///         audit stakes. Full read surface (Stake struct, view fns) lives on
///         the concrete `StakingPool` contract.
/// @dev See `docs/update.md` §3 and the StakingPool source for full docs.
interface IStakingPool {
    function lockStake(bytes32 rootHash, uint256 amount) external payable;

    function slashByDispute(
        bytes32 rootHash,
        address beneficiary,
        uint256 portion
    ) external;
}
