// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// POSITIVE: the canonical forked-mainnet replay bug — the EIP712Domain
// typehash models `uint256 chainId`, but the domain separator is built once
// in the constructor with a HARDCODED chain id (1) and block.chainid is never
// read. Also a hardcoded 2300 gas refund.
contract ReplayPos {
    bytes32 public constant EIP712DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 public DOMAIN_SEPARATOR;

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                EIP712DOMAIN_TYPEHASH,
                keccak256("App"),
                keccak256("1"),
                uint256(1), // hardcoded mainnet chainId — copy-pasted, never block.chainid
                address(this)
            )
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
