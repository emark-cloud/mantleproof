// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// NEGATIVE: OZ-style EIP-712 — typehash includes chainId, domain separator
// bound to block.chainid and rebuilt when the chain id changes.
contract ReplayNeg {
    bytes32 private constant EIP712DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    uint256 private immutable _cachedChainId;
    bytes32 private immutable _cachedDomainSeparator;

    constructor() {
        _cachedChainId = block.chainid;
        _cachedDomainSeparator = _buildDomainSeparator();
    }

    function _buildDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712DOMAIN_TYPEHASH,
                keccak256("App"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    function domainSeparator() public view returns (bytes32) {
        return block.chainid == _cachedChainId
            ? _cachedDomainSeparator
            : _buildDomainSeparator();
    }

    function verify(bytes32 h, uint8 v, bytes32 r, bytes32 s, address signer)
        external
        view
        returns (bool)
    {
        bytes32 digest = keccak256(abi.encodePacked(hex"1901", domainSeparator(), h));
        return ecrecover(digest, v, r, s) == signer;
    }
}
