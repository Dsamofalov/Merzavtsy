// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerzavetsMath} from "./libraries/MerzavetsMath.sol";
import {MutationRules} from "./libraries/MutationRules.sol";
import {SocialRules} from "./libraries/SocialRules.sol";
import {IMerzavetsWorld} from "./interfaces/IMerzavetsWorld.sol";

interface IMerzavetsIdentityOwner {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title MerzavetsWorld
/// @notice Canonical bounded gameplay state for Merzavtsy.
contract MerzavetsWorld is Ownable, IMerzavetsWorld {
    error OnlyIdentity();
    error OnlyOracle();
    error AlreadyInitialized();
    error CreatureNotInitialized();
    error OracleAlreadyConfigured();
    error InvalidOracle();
    error NotCreatureOwner();
    error InvalidPeer();
    error InvalidSocialAction();
    error SocialCooldown();
    error LifeTickCooldown();

    uint256 public constant HIBERNATION_DELAY = 14 days;
    uint256 public constant VERY_LONG_SLEEP = 30 days;
    uint256 public constant SOCIAL_COOLDOWN = 6 hours;
    uint256 public constant LIFE_TICK_COOLDOWN = 6 hours;

    uint64 public constant XP_AWAKENING = 25;
    uint64 public constant XP_MUTATION = 40;
    uint64 public constant XP_LIFE_ACTION = 2;

    uint256 public constant MUTATION_GAS_GILLS = 1 << 0;
    uint256 public constant MUTATION_CONTRACT_TEETH = 1 << 1;
    uint256 public constant MUTATION_CALLDATA_EYE = 1 << 2;
    uint256 public constant MUTATION_PIMPLED_BRAIN = 1 << 3;
    uint256 public constant MUTATION_WALLET_MOLD = 1 << 4;
    uint256 public constant MUTATION_STICKY_FINGERS = 1 << 5;
    uint256 public constant MUTATION_CROWDED_WHISKERS = 1 << 6;
    uint256 public constant MUTATION_ROAD_RASH = 1 << 7;
    uint256 public constant MUTATION_RUSTY_PAW = 1 << 8;
    uint256 public constant MUTATION_NETWORK_SCAR = 1 << 9;
    uint256 public constant MUTATION_DOUBLE_TONGUE = 1 << 10;

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

    enum SocialAction {
        GREET,
        MOCK,
        HELP,
        THREATEN
    }

    enum LifeIntent {
        REST,
        WANDER,
        SEEK_COMPANY,
        MOCK_RIVAL,
        GROOM,
        HIDE
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

    struct ExtendedNeeds {
        uint16 arousal;
        uint16 stabilityState;
    }

    struct Relationship {
        int16 affinity;
        int16 trust;
        uint16 fear;
        uint16 respect;
        uint16 envy;
        uint16 rivalry;
        uint32 interactionCount;
        uint40 lastInteractionAt;
    }

    address public immutable identity;
    address public oracle;

    mapping(uint256 tokenId => CreatureState state) private _states;
    mapping(uint256 tokenId => ExtendedNeeds needs) private _extendedNeeds;
    mapping(uint256 tokenId => bytes32 seed) public genomeSeedOf;
    mapping(uint256 tokenId => uint40 bornAt) public bornAt;
    mapping(uint256 tokenId => uint32[10] counters) private _activityCounters;
    mapping(uint256 tokenId => uint32[4] counters) private _mutationCounters;
    mapping(uint256 tokenId => uint32 count) public meaningfulEventCount;
    mapping(uint256 tokenId => uint256 mask) public mutationMask;
    mapping(uint256 tokenId => uint256 mask) public scarMask;
    mapping(uint256 tokenId => uint32 count) public awakeningCount;
    mapping(uint256 actor => mapping(uint256 target => Relationship relationship)) private _relationships;
    mapping(uint256 tokenId => uint256 peerTokenId) public preferredPeer;
    mapping(uint256 tokenId => uint8 intent) public lastLifeIntent;
    mapping(uint256 tokenId => uint32 count) public lifeActionCount;

    event CreatureInitialized(uint256 indexed tokenId, address indexed owner, bytes32 indexed genomeSeed);
    event OracleConfigured(address indexed oracle);
    event ActivityApplied(uint256 indexed tokenId, bytes32 indexed activityDigest, uint64 xpDelta, uint16 level);
    event MutationMetricsApplied(uint256 indexed tokenId, uint16[4] mutationCounters);
    event VerifiedPeerContact(
        uint256 indexed actorTokenId,
        uint256 indexed peerTokenId,
        bytes32 indexed encounterDigest,
        int16 affinity,
        int16 trust
    );
    event Hibernated(uint256 indexed tokenId, uint256 inactivity);
    event Awakened(uint256 indexed tokenId, uint32 awakeningCount);
    event MutationsUnlocked(uint256 indexed tokenId, uint256 newBits, uint256 fullMask);
    event Scarred(uint256 indexed tokenId, uint256 newBits, uint256 fullMask);
    event StageAdvanced(uint256 indexed tokenId, uint8 previousStage, uint8 newStage);
    event SocialActionTaken(
        uint256 indexed actorTokenId,
        uint256 indexed targetTokenId,
        uint8 indexed action,
        int16 affinity,
        int16 trust,
        uint16 rivalry
    );
    event LifeAction(uint256 indexed tokenId, uint8 indexed intent, uint32 actionCount);
    event BiographyXp(uint256 indexed tokenId, uint8 indexed source, uint64 amount, uint64 totalXp);

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

        ExtendedNeeds storage extended = _extendedNeeds[tokenId];
        extended.arousal = 2_500;
        extended.stabilityState = MerzavetsMath.clampStat(
            5_000 + (int256(uint256(state.stability)) - int256(uint256(state.chaos))) / 4
        );

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

        _grantXp(attestation.tokenId, attestation.xpDelta, 0);
        _applyPersonalityDeltas(state, attestation.personalityDeltas);
        _applyNeedDeltas(state, attestation.needDeltas);
        uint256 activityPulse = _accumulateActivity(attestation.tokenId, attestation.categoryCounters);
        _applyActivityPulse(attestation.tokenId, state, activityPulse, attestation.needDeltas[3]);

        if (meaningful) {
            state.lastActivityAt = uint40(block.timestamp);
            _incrementMeaningfulEvent(attestation.tokenId);
            if (state.hibernating) _awaken(attestation.tokenId, state);
        }

        _evaluateBiography(attestation.tokenId, inactivity);
        state.level = MerzavetsMath.levelForXp(state.xp);
        _advanceStage(attestation.tokenId, state);
        emit ActivityApplied(attestation.tokenId, attestation.activityDigest, attestation.xpDelta, state.level);
    }

    function applyVerifiedMutationMetrics(
        uint256 tokenId,
        uint16[4] calldata counters
    ) external override {
        if (msg.sender != oracle) revert OnlyOracle();
        CreatureState storage state = _states[tokenId];
        if (state.level == 0) revert CreatureNotInitialized();
        _accumulateMutationCounters(tokenId, counters);
        _evaluateBiography(tokenId, block.timestamp - uint256(state.lastActivityAt));
        state.level = MerzavetsMath.levelForXp(state.xp);
        _advanceStage(tokenId, state);
        emit MutationMetricsApplied(tokenId, counters);
    }

    function applyVerifiedPeerContact(
        uint256 actorTokenId,
        uint256 peerTokenId,
        bytes32 encounterDigest
    ) external override {
        if (msg.sender != oracle) revert OnlyOracle();
        CreatureState storage actor = _states[actorTokenId];
        if (actor.level == 0 || _states[peerTokenId].level == 0) revert CreatureNotInitialized();
        if (actorTokenId == peerTokenId) revert InvalidPeer();

        SocialRules.Deltas memory delta = SocialRules.forPeerContact(actor.sociability);
        Relationship storage relationship = _relationships[actorTokenId][peerTokenId];
        _applyRelationshipDelta(relationship, delta);

        preferredPeer[actorTokenId] = peerTokenId;
        actor.socialNeed = MerzavetsMath.clampStat(int256(uint256(actor.socialNeed)) - 100);
        actor.boredom = MerzavetsMath.clampStat(int256(uint256(actor.boredom)) - 40);
        ExtendedNeeds storage extended = _extendedNeeds[actorTokenId];
        extended.arousal = MerzavetsMath.clampStat(int256(uint256(extended.arousal)) + 60);
        _incrementMeaningfulEvent(actorTokenId);

        emit VerifiedPeerContact(
            actorTokenId,
            peerTokenId,
            encounterDigest,
            relationship.affinity,
            relationship.trust
        );
    }

    function socialize(uint256 actorTokenId, uint256 targetTokenId, uint8 action) external {
        CreatureState storage actor = _states[actorTokenId];
        if (actor.level == 0 || _states[targetTokenId].level == 0) revert CreatureNotInitialized();
        if (actorTokenId == targetTokenId) revert InvalidPeer();
        if (action > uint8(SocialAction.THREATEN)) revert InvalidSocialAction();
        if (IMerzavetsIdentityOwner(identity).ownerOf(actorTokenId) != msg.sender) revert NotCreatureOwner();

        Relationship storage relationship = _relationships[actorTokenId][targetTokenId];
        if (
            relationship.lastInteractionAt != 0
                && block.timestamp < uint256(relationship.lastInteractionAt) + SOCIAL_COOLDOWN
        ) revert SocialCooldown();

        _applySocialAction(actorTokenId, targetTokenId, action);
        preferredPeer[actorTokenId] = targetTokenId;
        actor.socialNeed = MerzavetsMath.clampStat(int256(uint256(actor.socialNeed)) - 250);
        actor.boredom = MerzavetsMath.clampStat(int256(uint256(actor.boredom)) - 100);
        ExtendedNeeds storage extended = _extendedNeeds[actorTokenId];
        extended.arousal = MerzavetsMath.clampStat(int256(uint256(extended.arousal)) + 100);
        _incrementMeaningfulEvent(actorTokenId);
    }

    function lifeTick(uint256 tokenId) external {
        CreatureState storage state = _states[tokenId];
        if (state.level == 0) revert CreatureNotInitialized();
        if (block.timestamp < uint256(state.lastLifeTickAt) + LIFE_TICK_COOLDOWN) revert LifeTickCooldown();

        uint8 intent = _selectLifeIntent(tokenId, state);
        _applyLifeIntent(tokenId, state, intent);

        state.lastLifeTickAt = uint40(block.timestamp);
        uint32 count = lifeActionCount[tokenId];
        if (count != type(uint32).max) lifeActionCount[tokenId] = count + 1;
        lastLifeIntent[tokenId] = intent;
        _grantXp(tokenId, XP_LIFE_ACTION, 3);
        emit LifeAction(tokenId, intent, lifeActionCount[tokenId]);
    }

    function syncLifecycle(uint256 tokenId) external {
        CreatureState storage state = _states[tokenId];
        if (state.level == 0) revert CreatureNotInitialized();

        uint256 inactivity = block.timestamp - uint256(state.lastActivityAt);
        if (!state.hibernating && inactivity >= HIBERNATION_DELAY) {
            state.hibernating = true;
            emit Hibernated(tokenId, inactivity);
        }

        _evaluateBiography(tokenId, inactivity);
        state.level = MerzavetsMath.levelForXp(state.xp);
        _advanceStage(tokenId, state);
    }

    function stateOf(uint256 tokenId) external view returns (CreatureState memory) {
        CreatureState memory state = _states[tokenId];
        if (state.level == 0) revert CreatureNotInitialized();
        return state;
    }

    function extendedNeedsOf(uint256 tokenId) external view returns (ExtendedNeeds memory) {
        if (_states[tokenId].level == 0) revert CreatureNotInitialized();
        return _extendedNeeds[tokenId];
    }

    function relationshipOf(uint256 actorTokenId, uint256 targetTokenId)
        external
        view
        returns (Relationship memory)
    {
        return _relationships[actorTokenId][targetTokenId];
    }

    function activityCounters(uint256 tokenId) external view returns (uint32[10] memory) {
        if (_states[tokenId].level == 0) revert CreatureNotInitialized();
        return _activityCounters[tokenId];
    }

    function mutationCounters(uint256 tokenId) external view returns (uint32[4] memory) {
        if (_states[tokenId].level == 0) revert CreatureNotInitialized();
        return _mutationCounters[tokenId];
    }

    function currentLevel(uint64 xp) external pure returns (uint16) {
        return MerzavetsMath.levelForXp(xp);
    }

    function memoryCapacity(uint256 level) external pure returns (uint256) {
        uint256 capacity = 4 + level * 2;
        return capacity > 64 ? 64 : capacity;
    }

    function visibleTraitSlots(uint256 level) external pure returns (uint256) {
        if (level >= 25) return 8;
        if (level >= 15) return 7;
        if (level >= 10) return 6;
        if (level >= 7) return 5;
        if (level >= 5) return 4;
        if (level >= 3) return 3;
        if (level >= 2) return 2;
        return 1;
    }

    function intentUnlocked(uint256 level, uint8 intent) public pure returns (bool) {
        if (intent > uint8(LifeIntent.HIDE)) return false;
        if (intent == uint8(LifeIntent.SEEK_COMPANY)) return level >= 2;
        if (intent == uint8(LifeIntent.MOCK_RIVAL)) return level >= 3;
        return level >= 1;
    }

    function _applyPersonalityDeltas(CreatureState storage state, int16[8] calldata deltas) private {
        state.aggression = MerzavetsMath.clampStat(int256(uint256(state.aggression)) + int256(deltas[0]));
        state.curiosity = MerzavetsMath.clampStat(int256(uint256(state.curiosity)) + int256(deltas[1]));
        state.sociability = MerzavetsMath.clampStat(int256(uint256(state.sociability)) + int256(deltas[2]));
        state.greed = MerzavetsMath.clampStat(int256(uint256(state.greed)) + int256(deltas[3]));
        state.stability = MerzavetsMath.clampStat(int256(uint256(state.stability)) + int256(deltas[4]));
        state.chaos = MerzavetsMath.clampStat(int256(uint256(state.chaos)) + int256(deltas[5]));
        state.adaptability = MerzavetsMath.clampStat(int256(uint256(state.adaptability)) + int256(deltas[6]));
        state.memoryBias = MerzavetsMath.clampStat(int256(uint256(state.memoryBias)) + int256(deltas[7]));
    }

    function _applyNeedDeltas(CreatureState storage state, int16[5] calldata deltas) private {
        state.energy = MerzavetsMath.clampStat(int256(uint256(state.energy)) + int256(deltas[0]));
        state.mood = MerzavetsMath.clampStat(int256(uint256(state.mood)) + int256(deltas[1]));
        state.boredom = MerzavetsMath.clampStat(int256(uint256(state.boredom)) + int256(deltas[2]));
        state.stress = MerzavetsMath.clampStat(int256(uint256(state.stress)) + int256(deltas[3]));
        state.socialNeed = MerzavetsMath.clampStat(int256(uint256(state.socialNeed)) + int256(deltas[4]));
    }

    function _accumulateActivity(uint256 tokenId, uint16[10] calldata counters) private returns (uint256 pulse) {
        for (uint256 i = 0; i < counters.length; ++i) {
            uint256 amount = uint256(counters[i]);
            pulse += amount;
            uint256 nextCounter = uint256(_activityCounters[tokenId][i]) + amount;
            _activityCounters[tokenId][i] = nextCounter > type(uint32).max ? type(uint32).max : uint32(nextCounter);
        }
    }

    function _accumulateMutationCounters(uint256 tokenId, uint16[4] calldata counters) private {
        for (uint256 i = 0; i < counters.length; ++i) {
            uint256 nextCounter = uint256(_mutationCounters[tokenId][i]) + uint256(counters[i]);
            _mutationCounters[tokenId][i] = nextCounter > type(uint32).max ? type(uint32).max : uint32(nextCounter);
        }
    }

    function _applyActivityPulse(
        uint256 tokenId,
        CreatureState storage state,
        uint256 pulse,
        int16 stressDelta
    ) private {
        ExtendedNeeds storage extended = _extendedNeeds[tokenId];
        int256 pulseDelta = int256(pulse > 500 ? 1_000 : pulse * 2);
        extended.arousal = MerzavetsMath.clampStat(int256(uint256(extended.arousal)) + pulseDelta - 25);
        extended.stabilityState = MerzavetsMath.clampStat(
            int256(uint256(extended.stabilityState))
                - int256(stressDelta) / 2
                + int256(uint256(state.adaptability)) / 100
                - int256(uint256(state.chaos)) / 200
        );
    }

    function _awaken(uint256 tokenId, CreatureState storage state) private {
        state.hibernating = false;
        uint32 wakes = awakeningCount[tokenId];
        if (wakes != type(uint32).max) awakeningCount[tokenId] = wakes + 1;
        _grantXp(tokenId, XP_AWAKENING, 1);
        emit Awakened(tokenId, awakeningCount[tokenId]);
    }

    function _applySocialAction(uint256 actorTokenId, uint256 targetTokenId, uint8 action) private {
        CreatureState storage actor = _states[actorTokenId];
        Relationship storage relationship = _relationships[actorTokenId][targetTokenId];
        SocialRules.Deltas memory delta = SocialRules.forAction(action, actor.aggression, actor.sociability, actor.chaos);
        _applyRelationshipDelta(relationship, delta);
        emit SocialActionTaken(
            actorTokenId,
            targetTokenId,
            action,
            relationship.affinity,
            relationship.trust,
            relationship.rivalry
        );
    }

    function _applyRelationshipDelta(Relationship storage relationship, SocialRules.Deltas memory delta) private {
        relationship.affinity = MerzavetsMath.clampSigned(int256(relationship.affinity) + int256(delta.affinity), -10_000, 10_000);
        relationship.trust = MerzavetsMath.clampSigned(int256(relationship.trust) + int256(delta.trust), -10_000, 10_000);
        relationship.fear = MerzavetsMath.clampStat(int256(uint256(relationship.fear)) + int256(delta.fear));
        relationship.respect = MerzavetsMath.clampStat(int256(uint256(relationship.respect)) + int256(delta.respect));
        relationship.envy = MerzavetsMath.clampStat(int256(uint256(relationship.envy)) + int256(delta.envy));
        relationship.rivalry = MerzavetsMath.clampStat(int256(uint256(relationship.rivalry)) + int256(delta.rivalry));
        if (relationship.interactionCount != type(uint32).max) relationship.interactionCount += 1;
        relationship.lastInteractionAt = uint40(block.timestamp);
    }

    function _selectLifeIntent(uint256 tokenId, CreatureState storage state) private view returns (uint8) {
        ExtendedNeeds storage extended = _extendedNeeds[tokenId];
        bytes32 personalityHash = keccak256(
            abi.encode(state.level, state.stage, state.aggression, state.curiosity, state.sociability, state.chaos)
        );
        bytes32 needsHash = keccak256(
            abi.encode(state.energy, state.boredom, state.stress, state.socialNeed, extended.arousal, extended.stabilityState)
        );
        bytes32 seed = keccak256(
            abi.encode(
                genomeSeedOf[tokenId],
                tokenId,
                block.timestamp / LIFE_TICK_COOLDOWN,
                personalityHash,
                needsHash,
                preferredPeer[tokenId],
                lifeActionCount[tokenId]
            )
        );

        if (state.hibernating) return uint8(uint256(seed) % 2 == 0 ? LifeIntent.REST : LifeIntent.HIDE);
        if (state.energy < 2_500) return uint8(LifeIntent.REST);
        if (state.stress > 7_000 || extended.stabilityState < 2_500) return uint8(LifeIntent.HIDE);
        if (state.boredom > 7_000 || extended.arousal > 8_000) return uint8(LifeIntent.WANDER);
        if (
            state.socialNeed > 7_000 && preferredPeer[tokenId] != 0
                && intentUnlocked(state.level, uint8(LifeIntent.SEEK_COMPANY))
        ) return uint8(LifeIntent.SEEK_COMPANY);
        if (
            preferredPeer[tokenId] != 0 && state.aggression > 7_500 && extended.arousal > 6_000
                && intentUnlocked(state.level, uint8(LifeIntent.MOCK_RIVAL))
        ) return uint8(LifeIntent.MOCK_RIVAL);

        uint8 candidate = uint8(uint256(seed) % 6);
        if (intentUnlocked(state.level, candidate)) return candidate;
        return uint8(uint256(seed) % 2 == 0 ? LifeIntent.WANDER : LifeIntent.GROOM);
    }

    function _applyLifeIntent(uint256 tokenId, CreatureState storage state, uint8 intent) private {
        if (intent == uint8(LifeIntent.REST)) {
            _adjustNeeds(tokenId, state, 700, 0, 100, -300, 50, -350, 300);
            return;
        }
        if (intent == uint8(LifeIntent.WANDER)) {
            _adjustNeeds(tokenId, state, -300, 100, -500, 50, 100, 250, -50);
            return;
        }
        if (intent == uint8(LifeIntent.SEEK_COMPANY)) {
            _adjustNeeds(tokenId, state, -200, 150, -200, -50, -700, 100, 100);
            uint256 peer = preferredPeer[tokenId];
            if (peer != 0 && _states[peer].level != 0) _applySocialAction(tokenId, peer, uint8(SocialAction.GREET));
            return;
        }
        if (intent == uint8(LifeIntent.MOCK_RIVAL)) {
            _adjustNeeds(tokenId, state, -150, 100, -150, 100, -200, 350, -200);
            uint256 peer = preferredPeer[tokenId];
            if (peer != 0 && _states[peer].level != 0) _applySocialAction(tokenId, peer, uint8(SocialAction.MOCK));
            return;
        }
        if (intent == uint8(LifeIntent.GROOM)) {
            _adjustNeeds(tokenId, state, -100, 200, -100, -200, 50, -100, 250);
            return;
        }
        _adjustNeeds(tokenId, state, 200, -50, 50, -500, 150, -250, 350);
    }

    function _adjustNeeds(
        uint256 tokenId,
        CreatureState storage state,
        int256 energyDelta,
        int256 moodDelta,
        int256 boredomDelta,
        int256 stressDelta,
        int256 socialDelta,
        int256 arousalDelta,
        int256 stabilityDelta
    ) private {
        state.energy = MerzavetsMath.clampStat(int256(uint256(state.energy)) + energyDelta);
        state.mood = MerzavetsMath.clampStat(int256(uint256(state.mood)) + moodDelta);
        state.boredom = MerzavetsMath.clampStat(int256(uint256(state.boredom)) + boredomDelta);
        state.stress = MerzavetsMath.clampStat(int256(uint256(state.stress)) + stressDelta);
        state.socialNeed = MerzavetsMath.clampStat(int256(uint256(state.socialNeed)) + socialDelta);
        ExtendedNeeds storage extended = _extendedNeeds[tokenId];
        extended.arousal = MerzavetsMath.clampStat(int256(uint256(extended.arousal)) + arousalDelta);
        extended.stabilityState = MerzavetsMath.clampStat(int256(uint256(extended.stabilityState)) + stabilityDelta);
    }

    function _evaluateBiography(uint256 tokenId, uint256 inactivity) private {
        uint32[10] memory counters = _activityCounters[tokenId];
        uint32[4] memory extraCounters = _mutationCounters[tokenId];
        CreatureState storage state = _states[tokenId];
        uint256 previousMutations = mutationMask[tokenId];
        uint256 nextMutations = MutationRules.evaluate(
            previousMutations,
            counters,
            extraCounters,
            inactivity,
            block.timestamp - uint256(bornAt[tokenId]),
            state.level
        );

        if (nextMutations != previousMutations) {
            uint256 newBits = nextMutations & ~previousMutations;
            mutationMask[tokenId] = nextMutations;
            uint256 bonus = _popcount(newBits) * uint256(XP_MUTATION);
            _grantXp(tokenId, bonus > type(uint64).max ? type(uint64).max : uint64(bonus), 2);
            emit MutationsUnlocked(tokenId, newBits, nextMutations);
            if (previousMutations == 0) _addScars(tokenId, SCAR_FIRST_MUTATION);
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
        scarMask[tokenId] = next;
        emit Scarred(tokenId, next & ~previous, next);
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
        if (stage == uint8(Stage.PAKOSTNIK)) return age >= 1 days && xp >= 500 && events >= 1 && diversity >= 2;
        if (stage == uint8(Stage.MERZAVETS)) return age >= 7 days && xp >= 5_000 && events >= 5 && diversity >= 3;
        if (stage == uint8(Stage.MATERYI)) return age >= 30 days && xp >= 25_000 && events >= 20 && diversity >= 5;
        if (stage == uint8(Stage.ARKHIMERZAVETS)) return age >= 90 days && xp >= 100_000 && events >= 50 && diversity >= 7;
        return false;
    }

    function _activityDiversity(uint256 tokenId) private view returns (uint256 count) {
        for (uint256 i = 0; i < _activityCounters[tokenId].length; ++i) {
            if (_activityCounters[tokenId][i] != 0) ++count;
        }
    }

    function _incrementMeaningfulEvent(uint256 tokenId) private {
        uint32 count = meaningfulEventCount[tokenId];
        if (count != type(uint32).max) meaningfulEventCount[tokenId] = count + 1;
    }

    function _grantXp(uint256 tokenId, uint64 amount, uint8 source) private {
        if (amount == 0) return;
        CreatureState storage state = _states[tokenId];
        uint256 next = uint256(state.xp) + uint256(amount);
        state.xp = next > type(uint64).max ? type(uint64).max : uint64(next);
        state.level = MerzavetsMath.levelForXp(state.xp);
        if (source != 0) emit BiographyXp(tokenId, source, amount, state.xp);
    }

    function _popcount(uint256 value) private pure returns (uint256 count) {
        while (value != 0) {
            value &= value - 1;
            ++count;
        }
    }

    function _axis(bytes32 seed, uint8 index) private pure returns (uint16) {
        return uint16(uint256(keccak256(abi.encode(seed, index))) % 10_001);
    }

    function _hasActivity(uint16[10] calldata counters) private pure returns (bool) {
        for (uint256 i = 0; i < counters.length; ++i) if (counters[i] != 0) return true;
        return false;
    }
}
