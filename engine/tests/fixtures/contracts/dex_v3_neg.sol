// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// NEGATIVE (Uniswap V3): mints with explicit amount0Min/amount1Min slippage
// bounds and a deadline.
interface INonfungiblePositionManager {
    function mint(
        int24 tickLower,
        int24 tickUpper,
        uint256 a0,
        uint256 a1,
        uint256 amount0Min,
        uint256 amount1Min,
        uint256 deadline
    ) external returns (uint256 tokenId);
}

contract V3VaultNeg {
    INonfungiblePositionManager public npm;

    function provide(
        int24 tickLower,
        int24 tickUpper,
        uint256 a0,
        uint256 a1,
        uint256 amount0Min,
        uint256 amount1Min,
        uint256 deadline
    ) external returns (uint256) {
        require(block.timestamp <= deadline, "expired");
        return npm.mint(tickLower, tickUpper, a0, a1, amount0Min, amount1Min, deadline);
    }
}
