// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IMantleProofAgent
/// @notice Minimal surface the registry uses to advance the agent's memoryRoot
///         on every anchored audit (Path A).
interface IMantleProofAgent {
    function updateMemoryRoot(bytes32 rootHash) external;
}
