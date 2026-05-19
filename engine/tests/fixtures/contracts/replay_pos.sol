// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// POSITIVE: EIP-712 domain separator built once with a typehash that omits
// chainId and never reads block.chainid; also a hardcoded 2300 gas refund.
contract ReplayPos {
    bytes32 public constant EIP712DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,address verifyingContract)");
    bytes32 public DOMAIN_SEPARATOR;

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(EIP712DOMAIN_TYPEHASH, keccak256("App"), keccak256("1"), address(this))
        );
    }

    function verify(bytes32 h, uint8 v, bytes32 r, bytes32 s, address signer)
        external
        view
        returns (bool)
    {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, h));
        return ecrecover(digest, v, r, s) == signer;
    }

    function refund(address payable to) external {
        (bool ok, ) = to.call{gas: 2300}("");
        require(ok, "send");
    }
}
