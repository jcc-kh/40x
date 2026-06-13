// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @notice On-chain gate for attested tenant screening decisions from Chainlink CRE + Attester.
contract TenantCredentialGate is IReceiver {
    struct ScreeningDecision {
        string inferenceId;
        address tenant;
        bool verified;
        string reason;
        bytes32 transcriptHash;
        uint256 timestamp;
    }

    address public immutable forwarder;

    mapping(bytes32 => ScreeningDecision) public decisionsById;
    mapping(address => bytes32) public latestKeyByTenant;

    event ScreeningDecisionRecorded(
        bytes32 indexed inferenceIdHash, address indexed tenant, bool verified, bytes32 transcriptHash
    );

    error UnauthorizedForwarder(address caller);

    modifier onlyForwarder() {
        if (msg.sender != forwarder) {
            revert UnauthorizedForwarder(msg.sender);
        }
        _;
    }

    constructor(address forwarder_) {
        forwarder = forwarder_;
    }

    function onReport(bytes calldata, bytes calldata report) external onlyForwarder {
        (address tenant, bool verified, string memory reason, bytes32 transcriptHash, string memory inferenceId) =
            abi.decode(report, (address, bool, string, bytes32, string));

        bytes32 key = keccak256(bytes(inferenceId));
        decisionsById[key] = ScreeningDecision({
            inferenceId: inferenceId,
            tenant: tenant,
            verified: verified,
            reason: reason,
            transcriptHash: transcriptHash,
            timestamp: block.timestamp
        });
        latestKeyByTenant[tenant] = key;

        emit ScreeningDecisionRecorded(key, tenant, verified, transcriptHash);
    }

    function canScreen(address tenant) external view returns (bool) {
        return decisionsById[latestKeyByTenant[tenant]].verified;
    }

    function latestDecision(address tenant) external view returns (ScreeningDecision memory) {
        return decisionsById[latestKeyByTenant[tenant]];
    }

    function getDecisionById(string calldata inferenceId) external view returns (ScreeningDecision memory) {
        return decisionsById[keccak256(bytes(inferenceId))];
    }
}
