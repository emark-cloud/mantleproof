// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IReputationRegistry} from "../interfaces/IEIP8004.sol";

/// @title MockReputationRegistry — test-only stand-in mirroring the real ERC-8004 v2 surface.
/// @notice Implements the subset of `ReputationRegistryUpgradeable` (canonical:
///         `github.com/erc-8004/erc-8004-contracts`) that our tests actually
///         drive. Simplifications vs the real contract — kept intentional and
///         documented so tests stay predictable:
///           - No anti-self-feedback gate (no identity registry wired in).
///             Tests that want to exercise that gate should do so against the
///             real Sepolia/mainnet deployment.
///           - `getSummary` uses raw arithmetic on `value`, ignoring
///             `valueDecimals` WAD scaling. Tests pass `valueDecimals=0` and
///             the mean comes out exact.
contract MockReputationRegistry is IReputationRegistry {
    int128 private constant MAX_ABS_VALUE = 1e38;

    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        bool isRevoked;
        string tag1;
        string tag2;
    }

    mapping(uint256 => mapping(address => mapping(uint64 => Feedback))) private _feedback;
    mapping(uint256 => mapping(address => uint64)) private _lastIndex;
    mapping(uint256 => address[]) private _clients;
    mapping(uint256 => mapping(address => bool)) private _clientExists;
    address private _identityRegistry;

    // Simplified vs the canonical NewFeedback (which has 11 fields and trips
    // solc's stack-too-deep without viaIR). Tests inspect storage via
    // getLastIndex/readFeedback/getSummary; the event here exists only for
    // log-traceability in hardhat console output.
    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value
    );
    event FeedbackRevoked(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 indexed feedbackIndex
    );
    event ResponseAppended(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        address indexed responder,
        string responseURI,
        bytes32 responseHash
    );

    /// @notice Test-only wiring (canonical contract is UUPS-upgradeable; mock
    ///         exposes a setter so tests can flip the linked identity registry
    ///         without redeploying).
    function setIdentityRegistry(address identityRegistry_) external {
        _identityRegistry = identityRegistry_;
    }

    function getIdentityRegistry() external view returns (address) {
        return _identityRegistry;
    }

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        require(valueDecimals <= 18, "too many decimals");
        require(value >= -MAX_ABS_VALUE && value <= MAX_ABS_VALUE, "value too large");

        uint64 idx = ++_lastIndex[agentId][msg.sender];
        _feedback[agentId][msg.sender][idx] = Feedback({
            value: value,
            valueDecimals: valueDecimals,
            isRevoked: false,
            tag1: tag1,
            tag2: tag2
        });

        if (!_clientExists[agentId][msg.sender]) {
            _clients[agentId].push(msg.sender);
            _clientExists[agentId][msg.sender] = true;
        }

        // tag1/tag2/endpoint/feedbackURI/feedbackHash deliberately not in the
        // mock event — see NewFeedback declaration comment above.
        emit NewFeedback(agentId, msg.sender, idx, value);
        // silence unused-param warnings without touching call sig.
        tag2; endpoint; feedbackURI; feedbackHash;
    }

    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        require(feedbackIndex > 0, "index must be > 0");
        require(feedbackIndex <= _lastIndex[agentId][msg.sender], "index out of bounds");
        require(!_feedback[agentId][msg.sender][feedbackIndex].isRevoked, "Already revoked");
        _feedback[agentId][msg.sender][feedbackIndex].isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external {
        require(feedbackIndex > 0, "index must be > 0");
        require(bytes(responseURI).length > 0, "Empty URI");
        require(feedbackIndex <= _lastIndex[agentId][clientAddress], "index out of bounds");
        emit ResponseAppended(agentId, clientAddress, feedbackIndex, msg.sender, responseURI, responseHash);
    }

    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals) {
        require(clientAddresses.length > 0, "clientAddresses required");

        bytes32 emptyHash = keccak256(bytes(""));
        bytes32 tag1Hash = keccak256(bytes(tag1));
        bytes32 tag2Hash = keccak256(bytes(tag2));
        int256 sum;

        for (uint256 i; i < clientAddresses.length; i++) {
            uint64 last = _lastIndex[agentId][clientAddresses[i]];
            for (uint64 j = 1; j <= last; j++) {
                Feedback storage fb = _feedback[agentId][clientAddresses[i]][j];
                if (fb.isRevoked) continue;
                if (emptyHash != tag1Hash && tag1Hash != keccak256(bytes(fb.tag1))) continue;
                if (emptyHash != tag2Hash && tag2Hash != keccak256(bytes(fb.tag2))) continue;
                sum += int256(fb.value);
                count++;
            }
        }

        if (count == 0) return (0, 0, 0);
        summaryValue = int128(sum / int256(uint256(count)));
        summaryValueDecimals = 0; // simplified — see contract docstring.
    }

    function readAllFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2,
        bool includeRevoked
    )
        external
        view
        returns (
            address[] memory clients,
            uint64[] memory feedbackIndexes,
            int128[] memory values,
            uint8[] memory valueDecimals,
            string[] memory tag1s,
            string[] memory tag2s,
            bool[] memory revokedStatuses
        )
    {
        address[] memory list = clientAddresses.length > 0 ? _toMemory(clientAddresses) : _clients[agentId];

        bytes32 emptyHash = keccak256(bytes(""));
        bytes32 tag1Hash = keccak256(bytes(tag1));
        bytes32 tag2Hash = keccak256(bytes(tag2));

        uint256 total;
        for (uint256 i; i < list.length; i++) {
            uint64 last = _lastIndex[agentId][list[i]];
            for (uint64 j = 1; j <= last; j++) {
                Feedback storage fb = _feedback[agentId][list[i]][j];
                if (!includeRevoked && fb.isRevoked) continue;
                if (emptyHash != tag1Hash && tag1Hash != keccak256(bytes(fb.tag1))) continue;
                if (emptyHash != tag2Hash && tag2Hash != keccak256(bytes(fb.tag2))) continue;
                total++;
            }
        }

        clients = new address[](total);
        feedbackIndexes = new uint64[](total);
        values = new int128[](total);
        valueDecimals = new uint8[](total);
        tag1s = new string[](total);
        tag2s = new string[](total);
        revokedStatuses = new bool[](total);

        uint256 k;
        for (uint256 i; i < list.length; i++) {
            uint64 last = _lastIndex[agentId][list[i]];
            for (uint64 j = 1; j <= last; j++) {
                Feedback storage fb = _feedback[agentId][list[i]][j];
                if (!includeRevoked && fb.isRevoked) continue;
                if (emptyHash != tag1Hash && tag1Hash != keccak256(bytes(fb.tag1))) continue;
                if (emptyHash != tag2Hash && tag2Hash != keccak256(bytes(fb.tag2))) continue;
                clients[k] = list[i];
                feedbackIndexes[k] = j;
                values[k] = fb.value;
                valueDecimals[k] = fb.valueDecimals;
                tag1s[k] = fb.tag1;
                tag2s[k] = fb.tag2;
                revokedStatuses[k] = fb.isRevoked;
                k++;
            }
        }
    }

    function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
        external
        view
        returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked)
    {
        require(feedbackIndex > 0, "index must be > 0");
        require(feedbackIndex <= _lastIndex[agentId][clientAddress], "index out of bounds");
        Feedback storage f = _feedback[agentId][clientAddress][feedbackIndex];
        return (f.value, f.valueDecimals, f.tag1, f.tag2, f.isRevoked);
    }

    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64) {
        return _lastIndex[agentId][clientAddress];
    }

    function getClients(uint256 agentId) external view returns (address[] memory) {
        return _clients[agentId];
    }

    function _toMemory(address[] calldata src) private pure returns (address[] memory dst) {
        dst = new address[](src.length);
        for (uint256 i; i < src.length; i++) {
            dst[i] = src[i];
        }
    }
}
