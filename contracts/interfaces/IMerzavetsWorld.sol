// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

interface IMerzavetsWorld {
    struct ActivityAttestation {
        address wallet;
        uint256 tokenId;
        uint256 chainId;
        uint64 fromBlock;
        uint64 toBlock;
        bytes32 epochId;
        bytes32 activityDigest;
        uint64 xpDelta;
        int16[8] personalityDeltas;
        int16[5] needDeltas;
        uint16[10] categoryCounters;
        uint256 nonce;
        uint256 deadline;
    }

    struct PeerAttestation {
        address actorWallet;
        uint256 actorTokenId;
        address peerWallet;
        uint256 peerTokenId;
        uint256 chainId;
        uint64 blockNumber;
        bytes32 encounterDigest;
        uint256 nonce;
        uint256 deadline;
    }

    function applyVerifiedActivity(ActivityAttestation calldata attestation) external;

    function applyVerifiedPeerContact(
        uint256 actorTokenId,
        uint256 peerTokenId,
        bytes32 encounterDigest
    ) external;
}
