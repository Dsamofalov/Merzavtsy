// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerzavetsMath} from "./libraries/MerzavetsMath.sol";
import {MutationRules} from "./libraries/MutationRules.sol";
import {IMerzavetsWorld} from "./interfaces/IMerzavetsWorld.sol";

/// @title MerzavetsWorld
/// @notice Canonical bounded gameplay state for Merzavtsy.
contract MerzavetsWorld is Ownable, IMerzavetsWorld {
    error OnlyIdentity();
    error OnlyOracle();
    error AlreadyInitialized();
    error CreatureNotInitialized();
    error OracleAlreadyConfigured();
    error InvalidOracle();

    uint256 public constant HIBERNATION_DELAY = 14 days;
    uint256 public constant VERY_LONG_SLEEP = 30 days;

    uint256 public constant MUTATION_GAS_GILLS = 1 << 0;
    uint256 public constant MUTATION_CONTRACT_TEETH = 1 << 1;
    uint256 public constant MUTATION_CALLDATA_EYE = 1 << 2;
    uint256 public constant MUTATION_PIMPLED_BRAIN = 1 << 3;
    uint256 public constant MUTATION_WALLET_MOLD = 1 << 4;
    uint256 public constant MUTATION_STICKY_FINGERS = 1 << 5;
    uint256 public constant MUTATION_CROWDED_WHISKERS = 1 << 6;
    uint256 public constant MUTATION_ROAD_RASH = 1 << 7;

    uint256 public constant SCAR_FIRST_DEPLOYMENT = 1 << 0;
    uint256 public constant SCAR_LONG_SLEEP = 1 << 1;
    uint256 public constant SCAR_FIRST_MUTATION = 1 << 2;

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
    address public oracle;

    mapping(uint256 tokenId => CreatureState state) private _states;
    mapping(uint256 tokenId => bytes32 seed) public genomeSeedOf;
    mapping(uint256 tokenId => uint40 bornAt) public bornAt;
    mapping(uint256 tokenId => uint32[10] counters) private _activityCounters;
    mapping(uint256 tokenId => uint32 count) public meaningfulEventCount;
    mapping(uint256 tokenId => uint256 mask) public mutationMask;
    mapping(uint256 tokenId => uint256 mask) public scarMask;
    mapping(uint256 tokenId => uint32 count) public awakeningCount;

    event CreatureInitialized(uint256 indexed tokenId, address indexed owner, bytes32 indexed genomeSeed);
    event OracleConfigured(address indexed oracle);
    event ActivityApplied(
        uint256 indexed tokenId,
        bytes32 indexed activityDigest,
        uint64 xpDelta,
        uint16 level
    );
    event Hibernated(uint256 indexed tokenId, uint256 inactivity);
    event Awakened(uint256 indexed tokenId, uint32 awakeningCount);
    event MutationsUnlocked(uint256 indexed tokenId, uint256 newBits, uint256 fullMask);
    event Scarred(uint256 indexed tokenId, uint256 newBits, uint256 fullMask);
    event StageAdvanced(uint256 indexed tokenId, uint8 previousStage, uint8 newStage);

    constructor(address identity_, address initialOwner) Ownable(initialOwner) {
        identity = identity_;
    }

    function setOracle(address oracle_) external onlyOwner {
        if (oracle != address(0)) revert OracleAlreadyConfigured();
        if (oracle_ == address(0)) revert InvalidOracle();
        oracle = oracle_;
        emit OracleConfigured(oracle_);
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

    function applyVerifiedActivity(ActivityAttestation calldata attestation) external override {
        if (msg.sender != oracle) revert OnlyOracle();

        CreatureState storage state = _states[attestation.tokenId];
        if (state.level == 0) revert CreatureNotInitialized();

        uint256 inactivity = block.timestamp - uint256(state.lastActivityAt);
        bool meaningful = attestation.xpDelta != 0 || _hasActivity(attestation.categoryCounters);

        uint256 nextXp = uint256(state.xp) + uint256(attestation.xpDelta);
        state.xp = nextXp > type(uint64).max ? type(uint64).max : uint64(nextXp);
        state.level = MerzavetsMath.levelForXp(state.xp);

        state.aggression = MerzavetsMath.clampStat(
            int256(uint256(state.aggression)) + int256(attestation.personalityDeltas[0])
        );
        state.curiosity = MerzavetsMath.clampStat(
            int256(uint256(state.curiosity)) + int256(attestation.personalityDeltas[1])
        );
        state.sociability = MerzavetsMath.clampStat(
            int256(uint256(state.sociability)) + int256(attestation.personalityDeltas[2])
        );
        state.greed = MerzavetsMath.clampStat(
            int256(uint256(state.greed)) + int256(attestation.personalityDeltas[3])
        );
        state.stability = MerzavetsMath.clampStat(
            int256(uint256(state.stability)) + int256(attestation.personalityDeltas[4])
        );
        state.chaos = MerzavetsMath.clampStat(
            int256(uint256(state.chaos)) + int256(attestation.personalityDeltas[5])
        );
        state.adaptability = MerzavetsMath.clampStat(
            int256(uint256(state.adaptability)) + int256(attestation.personalityDeltas[6])
        );
        state.memoryBias = MerzavetsMath.clampStat(
            int256(uint256(state.memoryBias)) + int256(attestation.personalityDeltas[7])
        );

        state.energy = MerzavetsMath.clampStat(
            int256(uint256(state.energy)) + int256(attestation.needDeltas[0])
        );
        state.mood = MerzavetsMath.clampStat(
            int256(uint256(state.mood)) + int256(attestation.needDeltas[1])
        );
        state.boredom = MerzavetsMath.clampStat(
            int256(uint256(state.boredom)) + int256(attestation.needDeltas[2])
        );
        state.stress = MerzavetsMath.clampStat(
            int256(uint256(state.stress)) + int256(attestation.needDeltas[3])
        );
        state.socialNeed = MerzavetsMath.clampStat(
            int256(uint256(state.socialNeed)) + int256(attestation.needDeltas[4])
        );

        for (uint256 i = 0; i < attestation.categoryCounters.length; ++i) {
            uint256 nextCounter = uint256(_activityCounters[attestation.tokenId][i])
                + uint256(attestation.categoryCounters[i]);
            _activityCounters[attestation.tokenId][i] = nextCounter > type(uint32).max
                ? type(uint32).max
                : uint32(nextCounter);
        }

        if (meaningful) {
            state.lastActivityAt = uint40(block.timestamp);
            uint32 count = meaningfulEventCount[attestation.tokenId];
            if (count != type(uint32).max) {
                meaningfulEventCount[attestation.tokenId] = count + 1;
            }

            if (state.hibernating) {
                state.hibernating = false;
                uint32 wakes = awakeningCount[attestation.tokenId];
                if (wakes != type(uint32).max) {
                    awakeningCount[attestation.tokenId] = wakes + 1;
                }
                emit Awakened(attestation.tokenId, awakeningCount[attestation.tokenId]);
            }
        }

        _evaluateBiography(attestation.tokenId, inactivity);
        _advanceStage(attestation.tokenId, state);

        emit ActivityApplied(
            attestation.tokenId,
            attestation.activityDigest,
            attestation.xpDelta,
            state.level
        );
    }

    /// @notice Applies time-derived lifecycle changes without rewarding the caller.
    function syncLifecycle(uint256 tokenId) external {
        CreatureState storage state = _states[tokenId];
        if (state.level == 0) revert CreatureNotInitialized();

        uint256 inactivity = block.timestamp - uint256(state.lastActivityAt);
        if (!state.hibernating && inactivity >= HIBERNATION_DELAY) {
            state.hibernating = true;
            emit Hibernated(tokenId, inactivity);
        }

        _evaluateBiography(tokenId, inactivity);
        _advanceStage(tokenId, state);
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

    function _evaluateBiography(uint256 tokenId, uint256 inactivity) private {
        uint32[10] memory counters = _activityCounters[tokenId];
        uint256 previousMutations = mutationMask[tokenId];
        uint256 nextMutations = MutationRules.evaluate(previousMutations, counters, inactivity);

        if (nextMutations != previousMutations) {
            uint256 newBits = nextMutations & ~previousMutations;
            mutationMask[tokenId] = nextMutations;
            emit MutationsUnlocked(tokenId, newBits, nextMutations);

            if (previousMutations == 0) {
                _addScars(tokenId, SCAR_FIRST_MUTATION);
            }
        }

        uint256 scars;
        if (counters[5] != 0) scars |= SCAR_FIRST_DEPLOYMENT;
        if (inactivity >= VERY_LONG_SLEEP) scars |= SCAR_LONG_SLEEP;
        if (scars != 0) _addScars(tokenId, scars);
    }

    function _addScars(uint256 tokenId, uint256 bits) private {
        uint256 previous = scarMask[tokenId];
        uint256 next = previous | bits;
        if (next == previous) return;

        uint256 newBits = next & ~previous;
        scarMask[tokenId] = next;
        emit Scarred(tokenId, newBits, next);
    }

    function _advanceStage(uint256 tokenId, CreatureState storage state) private {
        uint256 age = block.timestamp - uint256(bornAt[tokenId]);
        uint256 diversity = _activityDiversity(tokenId);
        uint256 events = meaningfulEventCount[tokenId];

        while (state.stage < uint8(Stage.ARKHIMERZAVETS)) {
            uint8 next = state.stage + 1;
            if (!_meetsStageRequirements(next, age, state.xp, events, diversity)) break;

            uint8 previous = state.stage;
            state.stage = next;
            emit StageAdvanced(tokenId, previous, next);
        }
    }

    function _meetsStageRequirements(
        uint8 stage,
        uint256 age,
        uint64 xp,
        uint256 events,
        uint256 diversity
    ) private pure returns (bool) {
        if (stage == uint8(Stage.PAKOSTNIK)) {
            return age >= 1 days && xp >= 500 && events >= 1 && diversity >= 2;
        }
        if (stage == uint8(Stage.MERZAVETS)) {
            return age >= 7 days && xp >= 5_000 && events >= 5 && diversity >= 3;
        }
        if (stage == uint8(Stage.MATERYI)) {
            return age >= 30 days && xp >= 25_000 && events >= 20 && diversity >= 5;
        }
        if (stage == uint8(Stage.ARKHIMERZAVETS)) {
            return age >= 90 days && xp >= 100_000 && events >= 50 && diversity >= 7;
        }
        return false;
    }

    function _activityDiversity(uint256 tokenId) private view returns (uint256 count) {
        for (uint256 i = 0; i < _activityCounters[tokenId].length; ++i) {
            if (_activityCounters[tokenId][i] != 0) ++count;
        }
    }

    function _axis(bytes32 seed, uint8 index) private pure returns (uint16) {
        return uint16(uint256(keccak256(abi.encode(seed, index))) % 10_001);
    }

    function _hasActivity(uint16[10] calldata counters) private pure returns (bool) {
        for (uint256 i = 0; i < counters.length; ++i) {
            if (counters[i] != 0) return true;
        }
        return false;
    }
}
