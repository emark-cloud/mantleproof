// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IMantleProofRegistry} from "./interfaces/IMantleProofRegistry.sol";
import {IMantleProofAgent} from "./interfaces/IMantleProofAgent.sol";

/// @title MantleProofRegistry
/// @notice Append-only audit registry. `submitAudit` is callable only by the
///         oracle signer; `getAudit` is public read. Each anchored audit advances
///         the linked agent's compounding memoryRoot. (docs/mantleproof.md §3, Path A)
/// @dev Invariant (CLAUDE.md): the oracle signer is the ONLY writer. The owner is
///      an admin role that can only (re)point the agent link, never write audits.
contract MantleProofRegistry is IMantleProofRegistry, Ownable {
    /// @notice The sole address permitted to write audits.
    address public immutable oracleSigner;

    /// @notice Optional MantleProofAgent; if set, advanced on every submitAudit.
    IMantleProofAgent public agent;

    /// @notice Latest audit per target (append-only: only the head is kept on-chain;
    ///         full history lives in IPFS + events).
    mapping(address => Report) private _latest;

    /// @notice Number of audits ever submitted for a target.
    mapping(address => uint256) public auditCount;

    event AgentLinked(address indexed agent);

    error NotOracleSigner();
    error UnknownTarget(address target);

    constructor(address oracleSigner_, address owner_) Ownable(owner_) {
        require(oracleSigner_ != address(0), "oracleSigner=0");
        oracleSigner = oracleSigner_;
    }

    modifier onlyOracle() {
        if (msg.sender != oracleSigner) revert NotOracleSigner();
        _;
    }

    /// @notice Link the MantleProofAgent advanced on each audit. Admin-only.
    function setAgent(address agent_) external onlyOwner {
        agent = IMantleProofAgent(agent_);
        emit AgentLinked(agent_);
    }

    /// @inheritdoc IMantleProofRegistry
    function submitAudit(
        address target,
        Severity severity,
        bytes32 rootHash,
        string calldata ipfsCID
    ) external onlyOracle {
        require(target != address(0), "target=0");
        require(rootHash != bytes32(0), "rootHash=0");

        _latest[target] = Report({
            rootHash: rootHash,
            severity: severity,
            ipfsCID: ipfsCID,
            timestamp: uint64(block.timestamp),
            submitter: msg.sender
        });
        unchecked {
            ++auditCount[target];
        }

        emit AuditSubmitted(target, rootHash, severity, ipfsCID);

        if (address(agent) != address(0)) {
            agent.updateMemoryRoot(rootHash);
        }
    }

    /// @inheritdoc IMantleProofRegistry
    function getAudit(address target) external view returns (Report memory) {
        Report memory r = _latest[target];
        if (r.rootHash == bytes32(0)) revert UnknownTarget(target);
        return r;
    }

    /// @notice True if `target` has at least one anchored audit.
    function isAudited(address target) external view returns (bool) {
        return _latest[target].rootHash != bytes32(0);
    }
}
