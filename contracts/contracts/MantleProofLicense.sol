// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMantleProofAgent} from "./interfaces/IMantleProofAgent.sol";

/// @notice Owner of MantleProof's ERC-8004 iNFT — the 80% split beneficiary.
interface IAgentOwner {
    function agentOwner() external view returns (address);
}

/// @title MantleProofLicense
/// @notice Pay-per-audit + subscription licenses. Every payment auto-splits
///         80/20 to the iNFT owner / treasury. Native-MNT settlement on Mantle;
///         the x402/USDC-on-Base surface is separate (Week 4, off-chain).
///         (docs/mantleproof.md §3)
contract MantleProofLicense is Ownable, ReentrancyGuard {
    uint16 public constant OWNER_BPS = 8000; // 80% -> iNFT owner
    uint16 public constant TREASURY_BPS = 2000; // 20% -> treasury
    uint16 private constant BPS = 10_000;

    IAgentOwner public immutable agent; // MantleProofAgent (iNFT-owner source)
    address payable public immutable treasury; // TreasurySplit

    uint256 public auditPrice;
    uint256 public subscriptionPrice;
    uint64 public subscriptionPeriod = 30 days;

    mapping(address => uint64) public licenseExpiry;

    event AuditPaid(address indexed payer, address indexed target, uint256 amount);
    event Subscribed(address indexed licensee, uint64 expiresAt, uint256 amount);
    event LicenseMinted(address indexed licensee, uint64 expiresAt);
    event Split(address indexed beneficiary, uint256 ownerCut, uint256 treasuryCut);
    event PricesSet(uint256 auditPrice, uint256 subscriptionPrice);

    error InsufficientPayment(uint256 required);
    error TransferFailed();

    constructor(
        address agent_,
        address payable treasury_,
        uint256 auditPrice_,
        uint256 subscriptionPrice_,
        address owner_
    ) Ownable(owner_) {
        require(agent_ != address(0) && treasury_ != address(0), "zero addr");
        agent = IAgentOwner(agent_);
        treasury = treasury_;
        auditPrice = auditPrice_;
        subscriptionPrice = subscriptionPrice_;
    }

    function setPrices(uint256 auditPrice_, uint256 subscriptionPrice_) external onlyOwner {
        auditPrice = auditPrice_;
        subscriptionPrice = subscriptionPrice_;
        emit PricesSet(auditPrice_, subscriptionPrice_);
    }

    /// @notice Pay for a one-off audit of `target`. 80/20 split.
    function payForAudit(address target) external payable nonReentrant {
        if (msg.value < auditPrice) revert InsufficientPayment(auditPrice);
        _split(msg.value);
        emit AuditPaid(msg.sender, target, msg.value);
    }

    /// @notice Buy/extend a subscription license for the caller. 80/20 split.
    function subscribe() external payable nonReentrant {
        if (msg.value < subscriptionPrice) revert InsufficientPayment(subscriptionPrice);
        uint64 base = licenseExpiry[msg.sender] > block.timestamp
            ? licenseExpiry[msg.sender]
            : uint64(block.timestamp);
        uint64 expiresAt = base + subscriptionPeriod;
        licenseExpiry[msg.sender] = expiresAt;
        _split(msg.value);
        emit Subscribed(msg.sender, expiresAt, msg.value);
    }

    /// @notice Comp-issue a license (no payment). Admin-only.
    function mintLicense(address licensee, uint64 expiresAt) external onlyOwner {
        require(licensee != address(0), "licensee=0");
        licenseExpiry[licensee] = expiresAt;
        emit LicenseMinted(licensee, expiresAt);
    }

    function isLicensed(address account) external view returns (bool) {
        return licenseExpiry[account] >= block.timestamp;
    }

    function _split(uint256 amount) private {
        uint256 ownerCut = (amount * OWNER_BPS) / BPS;
        uint256 treasuryCut = amount - ownerCut; // remainder -> treasury (no dust)
        address beneficiary = agent.agentOwner();
        require(beneficiary != address(0), "beneficiary=0");

        (bool ok1, ) = beneficiary.call{value: ownerCut}("");
        if (!ok1) revert TransferFailed();
        (bool ok2, ) = treasury.call{value: treasuryCut}("");
        if (!ok2) revert TransferFailed();

        emit Split(beneficiary, ownerCut, treasuryCut);
    }
}
