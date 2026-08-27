// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerzavetsMath} from "./libraries/MerzavetsMath.sol";

/// @title MerzavetsWorld
/// @notice Canonical bounded gameplay state for Merzavtsy.
contract MerzavetsWorld is Ownable {
    error OnlyIdentity();
    error AlreadyInitialized();
    error CreatureNotInitialized();

    enum Stage {
        ZARODYSH,
        PAKOSTNIK,
        MERZAVETS,
        MATERYI,
        ARKHIMERZAVETS
    }

    struct CreatureState {
        uint64 xp;
        uint16 level;
        uint40 lastActivityAt;
        uint40 lastLifeTickAt;
        uint8 stage;
        bool hibernating;

        uint16 aggression;
        uint16 curiosity;
        uint16 sociability;
        uint16 greed;
        uint16 stability;
        uint16 chaos;
        uint16 adaptability;
        uint16 memoryBias;

        uint16 energy;
        uint16 mood;
        uint16 boredom;
        uint16 stress;
        uint16 socialNeed;
    }

    address public immutable identity;

    mapping(uint256 tokenId => CreatureState state) private _states;
    mapping(uint256 tokenId => bytes32 seed) public genomeSeedOf;
    mapping(uint256 tokenId => uint40 bornAt) public bornAt;
    mapping(uint256 tokenId => uint32[10] counters) private _activityCounters;
    mapping(uint256 tokenId => uint32 count) public meaningfulEventCount;

    event CreatureInitialized(uint256 indexed tokenId, address indexed owner, bytes32 indexed genomeSeed);

    constructor(address identity_, address initialOwner) Ownable(initialOwner) {
        identity = identity_;
    }

    function initializeCreature(
        uint256 tokenId,
        address owner,
        bytes32 genomeSeed,
        uint64 birthTimestamp
    ) external {
        if (msg.sender != identity) revert OnlyIdentity();
        if (_states[tokenId].level != 0) revert AlreadyInitialized();

        CreatureState storage state = _states[tokenId];
        state.level = 1;
        state.lastActivityAt = uint40(birthTimestamp);
        state.lastLifeTickAt = uint40(birthTimestamp);
        state.stage = uint8(Stage.ZARODYSH);

        state.aggression = _axis(genomeSeed, 0);
        state.curiosity = _axis(genomeSeed, 1);
        state.sociability = _axis(genomeSeed, 2);
        state.greed = _axis(genomeSeed, 3);
        state.stability = _axis(genomeSeed, 4);
        state.chaos = _axis(genomeSeed, 5);
        state.adaptability = _axis(genomeSeed, 6);
        state.memoryBias = _axis(genomeSeed, 7);

        state.energy = 8_000;
        state.mood = 5_000;
        state.boredom = 2_500;
        state.stress = 1_000;
        state.socialNeed = 5_000;

        genomeSeedOf[tokenId] = genomeSeed;
        bornAt[tokenId] = uint40(birthTimestamp);

        emit CreatureInitialized(tokenId, owner, genomeSeed);
    }

    function stateOf(uint256 tokenId) external view returns (CreatureState memory) {
        CreatureState memory state = _states[tokenId];
        if (state.level == 0) revert CreatureNotInitialized();
        return state;
    }

    function activityCounters(uint256 tokenId) external view returns (uint32[10] memory) {
        if (_states[tokenId].level == 0) revert CreatureNotInitialized();
        return _activityCounters[tokenId];
    }

    function currentLevel(uint64 xp) external pure returns (uint16) {
        return MerzavetsMath.levelForXp(xp);
    }

    function _axis(bytes32 seed, uint8 index) private pure returns (uint16) {
        return uint16(uint256(keccak256(abi.encode(seed, index))) % 10_001);
    }
}
