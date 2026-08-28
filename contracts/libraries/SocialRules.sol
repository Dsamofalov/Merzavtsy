// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title SocialRules
/// @notice Pure social-action deltas influenced by the actor's personality.
library SocialRules {
    struct Deltas {
        int16 affinity;
        int16 trust;
        int16 fear;
        int16 respect;
        int16 envy;
        int16 rivalry;
    }

    function forAction(
        uint8 action,
        uint16 aggression,
        uint16 sociability,
        uint16 chaos
    ) internal pure returns (Deltas memory delta) {
        uint16 temper = uint16((uint256(aggression) + uint256(chaos)) / 200); // 0..100
        uint16 charm = uint16(uint256(sociability) / 200); // 0..50

        if (action == 0) {
            // GREET
            delta.affinity = int16(uint16(120 + charm));
            delta.trust = int16(uint16(80 + charm / 2));
            delta.respect = 20;
            delta.rivalry = -20;
            return delta;
        }
        if (action == 1) {
            // MOCK
            delta.affinity = -int16(uint16(250 + temper));
            delta.trust = -100;
            delta.envy = 80;
            delta.rivalry = int16(uint16(300 + temper));
            return delta;
        }
        if (action == 2) {
            // HELP
            delta.affinity = int16(uint16(300 + charm));
            delta.trust = 250;
            delta.respect = 100;
            delta.rivalry = -100;
            return delta;
        }

        // THREATEN
        delta.affinity = -int16(uint16(400 + temper));
        delta.trust = -200;
        delta.fear = int16(uint16(350 + temper));
        delta.rivalry = int16(uint16(250 + temper));
    }
}
