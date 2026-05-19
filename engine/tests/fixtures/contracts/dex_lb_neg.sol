// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// NEGATIVE (Liquidity Book): validates target bin against active-bin bounds
// and reads the variable fee parameters (volatility-accumulator driven).
interface ILBPair {
    function getActiveId() external view returns (uint24);
    function getVariableFeeParameters() external view returns (uint256);
    function mint(address to, bytes32[] calldata amounts, address refund) external;
}

contract LbVaultNeg {
    ILBPair public lbPair;
    uint24 public minBinId;
    uint24 public maxBinId;

    function addLiquidity(address to, uint24 targetId, bytes32[] calldata amounts) external {
        uint24 activeId = lbPair.getActiveId();
        require(targetId >= minBinId && targetId <= maxBinId, "bin oob");
        require(activeId >= minBinId && activeId <= maxBinId, "active oob");
        uint256 fee = lbPair.getVariableFeeParameters();
        require(fee < 1e18, "fee");
        lbPair.mint(to, amounts, msg.sender);
    }
}
