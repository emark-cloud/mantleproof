// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// POSITIVE (Liquidity Book): mints into bins with no active-bin / bin-step
// validation and reads a static fee (LB fees are variable).
interface ILBPair {
    function mint(address to, bytes32[] calldata amounts, address refund) external;
    function feeRate() external view returns (uint256);
}

contract LbVaultPos {
    ILBPair public lbPair;

    function addLiquidity(address to, bytes32[] calldata amounts) external {
        uint256 fee = lbPair.feeRate();
        require(fee < 1e18, "fee");
        lbPair.mint(to, amounts, msg.sender);
    }
}
