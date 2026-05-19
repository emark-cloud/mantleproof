// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// NEGATIVE: rate-aware mETH accounting (values via the exchange-rate Oracle,
// never balanceOf/totalSupply proportions), and cmETH is priced on its OWN
// oracle — never conflated with mETH.
interface IMethOracle { function mETHToETH(uint256) external view returns (uint256); }
interface ICmethOracle { function cmethToETH(uint256) external view returns (uint256); }
interface IMeth { function balanceOf(address) external view returns (uint256); }

contract MethVaultNeg {
    IMeth public meth;
    IMeth public cmeth;
    IMethOracle public oracle;
    ICmethOracle public cmethOracle;

    function methValue(address user) external view returns (uint256) {
        uint256 bal = meth.balanceOf(user);
        return oracle.mETHToETH(bal);
    }

    function cmethValue(address user) external view returns (uint256) {
        uint256 bal = cmeth.balanceOf(user);
        return cmethOracle.cmethToETH(bal);
    }

    function redeem(uint256 amount) external view returns (uint256) {
        return oracle.mETHToETH(amount);
    }
}
