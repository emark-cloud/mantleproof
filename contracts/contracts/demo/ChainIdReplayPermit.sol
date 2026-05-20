// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ChainIdReplayPermit -- DEMO BAIT (do NOT use)
/// @notice Deliberately-buggy EIP-2612 permit token for MantleProof bait
///         coverage of `engine/checks/replay_check.py` H1 (HIGH severity).
///
///         BUG: the contract was "copy-pasted from Ethereum mainnet" and the
///         EIP-712 domain separator hardcodes `chainId = 1` at construction.
///         `block.chainid` is NEVER read, so any permit signature is valid on
///         every chain that the bytecode is deployed to -- classic cross-chain
///         replay surface. The Tier-1 check's `_TYPEHASH` regex matches the
///         `EIP712Domain(... uint256 chainId, address verifyingContract)`
///         typehash, then notices `block.chainid` is absent from the source,
///         and fires H1 at HIGH/ESTIMATED.
///
///         NO admin / NO upgradeability / NOT FOR USE.
contract ChainIdReplayPermit {
    /// @notice Sentinel string the engine / dashboards can pattern-match on.
    string public constant DEMO_WARNING =
        "MantleProof bait: ChainIdReplayPermit (DO NOT USE) -- EIP-712 domain copy-pasted from Ethereum mainnet (chainId=1); permit signatures replay across chains";

    // --- EIP-712 surface ------------------------------------------------------

    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 public constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    /// @notice DOMAIN SEPARATOR — built once at construction with the chain id
    ///         BAKED IN AS A LITERAL. `block.chainid` does not appear anywhere
    ///         in this contract, so the separator never rebinds when this code
    ///         is deployed to a different chain.
    bytes32 public immutable DOMAIN_SEPARATOR;

    mapping(address => uint256) public nonces;

    // --- ERC-20 minimum surface (permit needs an allowance to act on) --------

    string public constant name = "Bait Permit Token";
    string public constant symbol = "BPT";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes(name)),
                keccak256(bytes("1")),
                uint256(1), // <-- BUG: hardcoded chainId 1; should be block.chainid
                address(this)
            )
        );
        totalSupply = 1_000_000 ether;
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }

    /// @notice EIP-2612 permit. The domain separator the digest binds against
    ///         was computed once at deploy time against chainId=1 -- the same
    ///         signature is therefore valid on every chain this bytecode is
    ///         redeployed to. A signature collected on Ethereum mainnet
    ///         spends the holder's allowance on Mantle as well.
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(block.timestamp <= deadline, "permit: expired");
        bytes32 structHash = keccak256(
            abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner]++, deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address signer = ecrecover(digest, v, r, s);
        require(signer == owner && signer != address(0), "permit: bad sig");
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= value, "allowance");
        unchecked {
            allowance[from][msg.sender] = a - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "to=0");
        uint256 b = balanceOf[from];
        require(b >= value, "balance");
        unchecked {
            balanceOf[from] = b - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }
}
