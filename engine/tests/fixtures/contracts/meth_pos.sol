// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// POSITIVE: prices mETH by balanceOf/totalSupply proportion with no
// exchange-rate read, conflates cmETH with mETH 1:1, and assumes the old
// Validator-Queue exit timing (no Liquidity Buffer / Aave route).
interface IMETH {
    function balanceOf(address) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

contract MethVaultPos {
    IMETH public meth;
    IMETH public cmeth;
    uint256 public validatorQueueExitDelay = 7 days;

    function shareValue(address user, uint256 pool) external view returns (uint256) {
        return (meth.balanceOf(user) * pool) / meth.totalSupply();
    }

    function acceptRestaked(uint256 cmethAmount) external pure returns (uint256) {
        uint256 methAmount = cmethAmount; // treat cmETH as mETH at par
        return methAmount;
    }

    function unstakeRequest(uint256 amount) external view returns (uint256) {
        return amount * validatorQueueExitDelay;
    }
}
