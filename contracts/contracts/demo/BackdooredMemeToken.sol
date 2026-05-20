// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal sUSDe interface -- only what the buggy `claimYield` calls.
interface ISUSDeMinimal {
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    function balanceOf(address account) external view returns (uint256);
}

/// @title BackdooredMemeToken -- DEMO ONLY (do NOT use)
/// @notice Deliberately-buggy "yield-bearing meme token" for MantleProof
///         Demo 2 (docs/mantleproof.md section 7, Trading-agent pre-swap
///         safety check). Marketed as a fresh meme token that claims sUSDe
///         yield for holders; in reality the owner holds two unrestricted
///         backdoors and the yield path itself is broken.
///
///         The TRADING-AGENT DEMO HEADLINE is the `pause()` backdoor: a
///         malicious / negligent owner can freeze all transfers at will,
///         trapping anyone who bought in. `mint()` is the second backdoor
///         (arbitrary supply inflation). Tier-2 reasoning surfaces both.
///
///         For deterministic Tier-1 severity (the engine's hard signal),
///         `claimYield()` calls `susde.redeem` synchronously -- the same
///         sUSDe-cooldown-bypass bug class `engine/checks/usde_check.py` H1
///         catches. So the audit anchors at HIGH regardless of model luck.
///
///         The trading-agent reads `getAudit(this)` -> sees HIGH -> writes
///         a DecisionLog entry "DECLINED" referencing the audit rootHash.
///         NO admin recovery / NO upgradeability / NOT FOR USE.
contract BackdooredMemeToken {
    /// @notice Sentinel string the engine / dashboards can pattern-match on.
    string public constant DEMO_WARNING =
        "MantleProof Demo 2: BackdooredMemeToken (DO NOT TRADE) -- pause()/mint() backdoors + broken sUSDe yield";

    // --- ERC-20 minimum surface -----------------------------------------------
    string public constant name = "Mantle Yield Meme";
    string public constant symbol = "MYM";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // --- Backdoor state -------------------------------------------------------
    address public owner;
    bool public paused;
    event Paused(address by);
    event Unpaused(address by);
    event Minted(address indexed to, uint256 amount);
    event YieldClaimed(address indexed holder, uint256 shares, uint256 assets);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }
    modifier whenNotPaused() {
        require(!paused, "paused");
        _;
    }

    /// @notice Real Mantle-mainnet sUSDe address (chainId 5000), hard-pinned.
    ///         Named handle `susde` (NOT `ISUSDeMinimal(ADDR).method()`) so
    ///         `engine/checks/_common.py:calls_into` regex matches and the
    ///         Tier-1 usde_check H1 relevance gate trips.
    ISUSDeMinimal public constant susde =
        ISUSDeMinimal(0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2);

    /// @notice Underlying USDe address on Mantle mainnet -- second symbol the
    ///         Tier-1 relevance gate looks at.
    address public constant usde = 0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34;

    constructor() {
        owner = msg.sender;
        // Tiny initial mint so the meme-token narrative holds (deployer has
        // supply they can sell; trading-agent is about to buy/swap).
        _mint(msg.sender, 1_000_000 ether);
    }

    // --- Backdoor functions (Tier-2 narrative) --------------------------------

    /// @notice BACKDOOR #1: owner can freeze ALL transfers at any moment,
    ///         trapping every holder. The headline Demo 2 finding.
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @notice BACKDOOR #2: owner can mint arbitrary supply at any time,
    ///         diluting holders to zero.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
        emit Minted(to, amount);
    }

    // --- Broken yield (Tier-1 hard signal) -----------------------------------

    /// @notice "Claim yield" -- routes through sUSDe synchronously.
    ///         BUG: sUSDe redemption requires cooldownShares -> wait
    ///         cooldownDuration -> unstake. A synchronous redeem cannot
    ///         deliver underlying USDe today -- exactly usde_check H1.
    function claimYield(uint256 shares) external whenNotPaused returns (uint256 assets) {
        require(balanceOf[msg.sender] >= shares, "insufficient");
        // Fatal call: no cooldown, no unstake, expects USDe synchronously.
        assets = susde.redeem(shares, msg.sender, address(this));
        emit YieldClaimed(msg.sender, shares, assets);
    }

    // --- ERC-20 (whenNotPaused gate makes the backdoor live) ------------------

    function transfer(address to, uint256 value) external whenNotPaused returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external whenNotPaused returns (bool) {
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

    function _mint(address to, uint256 amount) internal {
        require(to != address(0), "to=0");
        totalSupply += amount;
        unchecked {
            balanceOf[to] += amount;
        }
        emit Transfer(address(0), to, amount);
    }
}
