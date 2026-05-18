// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMantleProofRegistry} from "./interfaces/IMantleProofRegistry.sol";

/// @title MantleProofRegistry
/// @notice Append-only audit registry. `submitAudit` callable only by the oracle
///         signer; `getAudit` is public read. LOC budget ~150 (docs/mantleproof.md §3).
/// @dev SCAFFOLD ONLY — no logic yet. Implement in T3.
///      Invariant: oracle-signer is the ONLY writer (CLAUDE.md do-not-touch list).
contract MantleProofRegistry is IMantleProofRegistry {
    address public immutable oracleSigner;

    constructor(address oracleSigner_) {
        oracleSigner = oracleSigner_;
    }

    /// @inheritdoc IMantleProofRegistry
    function submitAudit(
        address, /* target */
        Severity, /* severity */
        bytes32, /* rootHash */
        string calldata /* ipfsCID */
    ) external pure {
        revert("SCAFFOLD: not implemented");
    }

    /// @inheritdoc IMantleProofRegistry
    function getAudit(address /* target */) external pure returns (Report memory) {
        revert("SCAFFOLD: not implemented");
    }
}
