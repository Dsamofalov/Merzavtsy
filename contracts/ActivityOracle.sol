// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IMerzavetsWorld} from "./interfaces/IMerzavetsWorld.sol";

interface IMerzavetsIdentity {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title ActivityOracle
/// @notice Verifies bounded EIP-712 observations of normal Ethereum account activity.
/// @dev Oracle authority is gameplay-only: this contract cannot move user assets.
contract ActivityOracle is EIP712, AccessControl, Pausable {
    error UnauthorizedSigner();
    error AttestationExpired();
    error WrongChain();
    error WalletTokenMismatch();
    error ActivityOutOfBounds();
    error DigestAlreadyProcessed();
    error EpochAlreadyProcessed();
    error InvalidNonce();
    error InvalidBlockRange();
    error BlockRangeOverlap();
    error InvalidAddress();

    bytes32 public constant ORACLE_SIGNER_ROLE = keccak256("ORACLE_SIGNER_ROLE");

    uint64 public constant MAX_XP_DELTA = 10_000;
    uint16 public constant MAX_PERSONALITY_DELTA = 1_000;
    uint16 public constant MAX_NEED_DELTA = 2_000;
    uint16 public constant MAX_CATEGORY_COUNTER = 1_000;

    bytes32 private constant ACTIVITY_TYPEHASH = keccak256(
        "ActivityAttestation(address wallet,uint256 tokenId,uint256 chainId,uint64 fromBlock,uint64 toBlock,bytes32 epochId,bytes32 activityDigest,uint64 xpDelta,int16[8] personalityDeltas,int16[5] needDeltas,uint16[10] categoryCounters,uint256 nonce,uint256 deadline)"
    );

    IMerzavetsWorld public immutable world;
    IMerzavetsIdentity public immutable identity;

    mapping(bytes32 digest => bool consumed) public processedDigest;
    mapping(uint256 tokenId => mapping(bytes32 epochId => bool consumed)) public processedEpoch;
    mapping(address wallet => uint256 nonce) public nonces;
    mapping(uint256 tokenId => uint64 toBlock) public lastToBlock;

    event ActivityAccepted(
        uint256 indexed tokenId,
        address indexed wallet,
        bytes32 indexed activityDigest,
        bytes32 epochId,
        uint64 fromBlock,
        uint64 toBlock,
        uint64 xpDelta
    );

    constructor(
        address world_,
        address identity_,
        address admin,
        address initialSigner
    ) EIP712("Merzavtsy Activity Oracle", "1") {
        if (
            world_ == address(0) || identity_ == address(0) || admin == address(0)
                || initialSigner == address(0)
        ) revert InvalidAddress();

        world = IMerzavetsWorld(world_);
        identity = IMerzavetsIdentity(identity_);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_SIGNER_ROLE, initialSigner);
    }

    function submit(
        IMerzavetsWorld.ActivityAttestation calldata attestation,
        bytes calldata signature
    ) external whenNotPaused {
        if (attestation.chainId != block.chainid) revert WrongChain();
        if (block.timestamp > attestation.deadline) revert AttestationExpired();
        if (identity.ownerOf(attestation.tokenId) != attestation.wallet) {
            revert WalletTokenMismatch();
        }
        if (!_withinBounds(attestation)) revert ActivityOutOfBounds();
        if (processedDigest[attestation.activityDigest]) revert DigestAlreadyProcessed();
        if (processedEpoch[attestation.tokenId][attestation.epochId]) {
            revert EpochAlreadyProcessed();
        }
        if (attestation.nonce != nonces[attestation.wallet]) revert InvalidNonce();
        if (attestation.fromBlock > attestation.toBlock) revert InvalidBlockRange();

        uint64 previousToBlock = lastToBlock[attestation.tokenId];
        if (previousToBlock != 0 && attestation.fromBlock <= previousToBlock) {
            revert BlockRangeOverlap();
        }

        bytes32 digest = _hashTypedDataV4(_structHash(attestation));
        address signer = ECDSA.recover(digest, signature);
        if (!hasRole(ORACLE_SIGNER_ROLE, signer)) revert UnauthorizedSigner();

        processedDigest[attestation.activityDigest] = true;
        processedEpoch[attestation.tokenId][attestation.epochId] = true;
        nonces[attestation.wallet] = attestation.nonce + 1;
        lastToBlock[attestation.tokenId] = attestation.toBlock;

        world.applyVerifiedActivity(attestation);

        emit ActivityAccepted(
            attestation.tokenId,
            attestation.wallet,
            attestation.activityDigest,
            attestation.epochId,
            attestation.fromBlock,
            attestation.toBlock,
            attestation.xpDelta
        );
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _structHash(IMerzavetsWorld.ActivityAttestation calldata attestation)
        private
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                ACTIVITY_TYPEHASH,
                attestation.wallet,
                attestation.tokenId,
                attestation.chainId,
                attestation.fromBlock,
                attestation.toBlock,
                attestation.epochId,
                attestation.activityDigest,
                attestation.xpDelta,
                keccak256(abi.encode(attestation.personalityDeltas)),
                keccak256(abi.encode(attestation.needDeltas)),
                keccak256(abi.encode(attestation.categoryCounters)),
                attestation.nonce,
                attestation.deadline
            )
        );
    }

    function _withinBounds(IMerzavetsWorld.ActivityAttestation calldata attestation)
        private
        pure
        returns (bool)
    {
        if (attestation.xpDelta > MAX_XP_DELTA) return false;

        for (uint256 i = 0; i < attestation.personalityDeltas.length; ++i) {
            if (!_absWithin(attestation.personalityDeltas[i], MAX_PERSONALITY_DELTA)) return false;
        }
        for (uint256 i = 0; i < attestation.needDeltas.length; ++i) {
            if (!_absWithin(attestation.needDeltas[i], MAX_NEED_DELTA)) return false;
        }
        for (uint256 i = 0; i < attestation.categoryCounters.length; ++i) {
            if (attestation.categoryCounters[i] > MAX_CATEGORY_COUNTER) return false;
        }

        return true;
    }

    function _absWithin(int16 value, uint16 maximum) private pure returns (bool) {
        int256 widened = int256(value);
        if (widened < 0) widened = -widened;
        return uint256(widened) <= uint256(maximum);
    }
}
