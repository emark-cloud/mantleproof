// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IStakingPool} from "./interfaces/IStakingPool.sol";

/// @title StakingPool
/// @notice Holds locked MNT for active Tier 2 audits. Released to treasury after
///         a 30-day window, or slashed to the disputer if a finding is RETRACTED.
///         (docs/update.md §3)
/// @dev Trust model invariants:
///        - Only `registry` may `lockStake` and `slashByDispute`. Public read,
///          oracle-routed write.
///        - `unlock` is permissionless after `unlocksAt` — anyone can call to
///          settle a stake (99% -> treasury, 1% -> pool).
///        - Status guard prevents double-slash + double-release.
///        - `claimExploit` is RESERVED, post-hackathon (see comment block).
contract StakingPool is IStakingPool {
    enum Status {
        LOCKED,
        RELEASED,
        SLASHED_DISPUTE,
        SLASHED_EXPLOIT // reserved, post-hackathon
    }

    struct Stake {
        bytes32 rootHash;
        address auditor;
        uint256 amount;
        uint64 lockedAt;
        uint64 unlocksAt;
        Status status;
    }

    uint64 public constant UNLOCK_WINDOW = 30 days;
    uint16 public constant TREASURY_BPS = 9900; // 99% -> treasury on unlock
    uint16 private constant BPS = 10_000;

    address public immutable registry;
    address payable public immutable treasury;

    mapping(bytes32 => Stake) private _stakes;

    event StakeLocked(
        bytes32 indexed rootHash,
        address indexed auditor,
        uint256 amount,
        uint64 unlocksAt
    );
    event StakeSlashedByDispute(
        bytes32 indexed rootHash,
        address indexed beneficiary,
        uint256 portion,
        uint256 remainder
    );
    event StakeReleased(
        bytes32 indexed rootHash,
        uint256 treasuryCut,
        uint256 retained
    );

    error NotRegistry();
    error UnknownStake(bytes32 rootHash);
    error StakeNotLocked(bytes32 rootHash);
    error WrongValue(uint256 expected, uint256 received);
    error InvalidParams();
    error StillLocked(uint64 unlocksAt);
    error TransferFailed();

    constructor(address registry_, address payable treasury_) {
        require(registry_ != address(0) && treasury_ != address(0), "zero addr");
        registry = registry_;
        treasury = treasury_;
    }

    modifier onlyRegistry() {
        if (msg.sender != registry) revert NotRegistry();
        _;
    }

    /// @inheritdoc IStakingPool
    function lockStake(bytes32 rootHash, uint256 amount) external payable onlyRegistry {
        if (rootHash == bytes32(0) || amount == 0) revert InvalidParams();
        if (msg.value != amount) revert WrongValue(amount, msg.value);
        if (_stakes[rootHash].rootHash != bytes32(0)) revert InvalidParams(); // no overwrite

        uint64 now64 = uint64(block.timestamp);
        uint64 unlocksAt = now64 + UNLOCK_WINDOW;
        // The "auditor" is `tx.origin` only metadata — in practice the
        // registry's oracle signer pays the gas + value, but we record the
        // beneficiary as the oracle signer (msg.sender of the parent call).
        // For trust: only `registry` ever invokes this, and the registry
        // requires `msg.sender == oracleSigner`. Recording it is informational.
        _stakes[rootHash] = Stake({
            rootHash: rootHash,
            auditor: tx.origin,
            amount: amount,
            lockedAt: now64,
            unlocksAt: unlocksAt,
            status: Status.LOCKED
        });
        emit StakeLocked(rootHash, tx.origin, amount, unlocksAt);
    }

    /// @inheritdoc IStakingPool
    function slashByDispute(
        bytes32 rootHash,
        address beneficiary,
        uint256 portion
    ) external onlyRegistry {
        Stake storage s = _stakes[rootHash];
        if (s.rootHash == bytes32(0)) revert UnknownStake(rootHash);
        if (s.status != Status.LOCKED) revert StakeNotLocked(rootHash);
        if (beneficiary == address(0) || portion == 0 || portion > s.amount) {
            revert InvalidParams();
        }
        uint256 remainder = s.amount - portion;
        s.status = Status.SLASHED_DISPUTE;
        s.amount = 0;

        (bool ok1, ) = beneficiary.call{value: portion}("");
        if (!ok1) revert TransferFailed();
        if (remainder != 0) {
            (bool ok2, ) = treasury.call{value: remainder}("");
            if (!ok2) revert TransferFailed();
        }
        emit StakeSlashedByDispute(rootHash, beneficiary, portion, remainder);
    }

    /// @notice Permissionless: release a stake past its unlock window.
    ///         99% -> treasury, 1% retained in pool for ongoing capitalization.
    function unlock(bytes32 rootHash) external {
        Stake storage s = _stakes[rootHash];
        if (s.rootHash == bytes32(0)) revert UnknownStake(rootHash);
        if (s.status != Status.LOCKED) revert StakeNotLocked(rootHash);
        if (block.timestamp < s.unlocksAt) revert StillLocked(s.unlocksAt);

        uint256 amount = s.amount;
        uint256 treasuryCut = (amount * TREASURY_BPS) / BPS;
        uint256 retained = amount - treasuryCut;
        s.status = Status.RELEASED;
        s.amount = 0;

        (bool ok, ) = treasury.call{value: treasuryCut}("");
        if (!ok) revert TransferFailed();
        // `retained` stays in this contract — no transfer needed.
        emit StakeReleased(rootHash, treasuryCut, retained);
    }

    function stakeOf(bytes32 rootHash) external view returns (Stake memory) {
        Stake memory s = _stakes[rootHash];
        if (s.rootHash == bytes32(0)) revert UnknownStake(rootHash);
        return s;
    }

    function isLocked(bytes32 rootHash) external view returns (bool) {
        return _stakes[rootHash].status == Status.LOCKED
            && _stakes[rootHash].rootHash != bytes32(0);
    }

    // ─────────────────────────────────────────────────────────────────────
    // claimExploit: RESERVED, post-hackathon (docs/update.md §3.4)
    //
    // The exploit-slashing path requires off-chain LLM verification of an
    // exploit class against the audit's five-dimension scope, signed by the
    // oracle. Deferring per user-locked decision 2026-05-23:
    //   - Only dispute-slashing ships in this pass.
    //   - `Status.SLASHED_EXPLOIT` is enumerated but unreachable in this
    //     contract; a future `slashByExploit(rootHash, beneficiary, portion)`
    //     mirroring `slashByDispute` will be added behind the same
    //     `onlyRegistry` modifier when the exploit classifier is built.
    // ─────────────────────────────────────────────────────────────────────
}
