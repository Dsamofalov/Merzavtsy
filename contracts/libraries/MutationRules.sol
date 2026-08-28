// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title MutationRules
/// @notice Pure, deterministic biography-to-mutation rules.
library MutationRules {
    uint256 internal constant GAS_GILLS = 1 << 0;
    uint256 internal constant CONTRACT_TEETH = 1 << 1;
    uint256 internal constant CALLDATA_EYE = 1 << 2;
    uint256 internal constant PIMPLED_BRAIN = 1 << 3;
    uint256 internal constant WALLET_MOLD = 1 << 4;
    uint256 internal constant STICKY_FINGERS = 1 << 5;
    uint256 internal constant CROWDED_WHISKERS = 1 << 6;
    uint256 internal constant ROAD_RASH = 1 << 7;
    uint256 internal constant RUSTY_PAW = 1 << 8;
    uint256 internal constant NETWORK_SCAR = 1 << 9;
    uint256 internal constant DOUBLE_TONGUE = 1 << 10;

    uint256 internal constant VERY_LONG_SLEEP = 30 days;

    /// @dev mutationCounters layout is deliberately separate from the stable activity category layout:
    /// 0 cadence bursts, 1 bridge/network-like activity, 2 hostile social history, 3 protocol co-occurrence.
    function evaluate(
        uint256 currentMask,
        uint32[10] memory counters,
        uint32[4] memory mutationCounters,
        uint256 inactivity,
        uint256 age,
        uint16 level
    ) internal pure returns (uint256 mask) {
        mask = currentMask;

        // Stable activity category layout:
        // 0 TX_SENT, 1 TX_RECEIVED, 2 CONTRACT_CALL, 3 NEW_CONTRACT,
        // 4 REPEAT_CONTRACT, 5 CONTRACT_DEPLOY, 6 UNIQUE_COUNTERPARTY,
        // 7 REGISTERED_PEER_CONTACT, 8 HIGH_GAS_ACTIVITY, 9 SELECTOR_DIVERSITY.
        if (counters[8] >= 5) mask |= GAS_GILLS;
        if (counters[2] >= 20) mask |= CONTRACT_TEETH;
        if (counters[9] >= 10) mask |= CALLDATA_EYE;
        if (counters[5] >= 3) mask |= PIMPLED_BRAIN;
        if (inactivity >= VERY_LONG_SLEEP) mask |= WALLET_MOLD;
        if (counters[4] >= 20) mask |= STICKY_FINGERS;
        if (counters[6] >= 20) mask |= CROWDED_WHISKERS;
        if (counters[3] >= 20) mask |= ROAD_RASH;

        // Advanced biography mutations intentionally require time + progression + prerequisites.
        bool hasContractTeeth = (mask & CONTRACT_TEETH) != 0;
        if (
            age >= 7 days && level >= 3 && hasContractTeeth
                && (counters[4] >= 20 || mutationCounters[0] >= 5)
        ) {
            mask |= RUSTY_PAW;
        }

        bool hasRustyPaw = (mask & RUSTY_PAW) != 0;
        if (age >= 7 days && level >= 4 && hasRustyPaw && mutationCounters[1] >= 5) {
            mask |= NETWORK_SCAR;
        }

        // DOUBLE_TONGUE is evaluated by World from canonical hostile-social history.
        // Keeping its bit in the shared namespace prevents collisions with off-chain metadata.
    }
}
