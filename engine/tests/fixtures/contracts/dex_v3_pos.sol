// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// POSITIVE (Uniswap V3): mints an LP position with no slippage (amountMin)
// or deadline bounds — frontrun-mintable.
interface INonfungiblePositionManager {
    function mint(int24 tickLower, int24 tickUpper, uint256 a0, uint256 a1)
        external
        returns (uint256 tokenId);
}

contract V3VaultPos {
    INonfungiblePositionManager public npm;

    function provide(int24 tickLower, int24 tickUpper, uint256 a0, uint256 a1)
        external
        returns (uint256)
    {
        return npm.mint(tickLower, tickUpper, a0, a1);
    }
}
