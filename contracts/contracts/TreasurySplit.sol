// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TreasurySplit
/// @notice Receives the 20% treasury share. Any withdrawal is timelocked: the
///         owner (a multi-sig in production) proposes, waits TIMELOCK, then
///         executes. Minimal by design. (docs/mantleproof.md §3)
contract TreasurySplit is Ownable {
    uint64 public constant TIMELOCK = 2 days;

    struct Pending {
        address to;
        uint256 amount;
        uint64 eta;
        bool exists;
    }

    Pending public pending;

    event Received(address indexed from, uint256 amount);
    event WithdrawalProposed(address indexed to, uint256 amount, uint64 eta);
    event WithdrawalCancelled();
    event WithdrawalExecuted(address indexed to, uint256 amount);

    error NoPending();
    error Timelocked(uint64 eta);
    error TransferFailed();

    constructor(address owner_) Ownable(owner_) {}

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    function proposeWithdrawal(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "to=0");
        require(amount != 0 && amount <= address(this).balance, "bad amount");
        uint64 eta = uint64(block.timestamp) + TIMELOCK;
        pending = Pending({to: to, amount: amount, eta: eta, exists: true});
        emit WithdrawalProposed(to, amount, eta);
    }

    function cancelWithdrawal() external onlyOwner {
        if (!pending.exists) revert NoPending();
        delete pending;
        emit WithdrawalCancelled();
    }

    function executeWithdrawal() external onlyOwner {
        Pending memory p = pending;
        if (!p.exists) revert NoPending();
        if (block.timestamp < p.eta) revert Timelocked(p.eta);
        delete pending;
        (bool ok, ) = p.to.call{value: p.amount}("");
        if (!ok) revert TransferFailed();
        emit WithdrawalExecuted(p.to, p.amount);
    }
}
