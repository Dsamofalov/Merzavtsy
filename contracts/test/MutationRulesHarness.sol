// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {MutationRules} from "../libraries/MutationRules.sol";

contract MutationRulesHarness {
    function evaluate(
        uint256 currentMask,
        uint32[10] calldata counters,
        uint32[4] calldata mutationCounters,
        uint256 inactivity,
        uint256 age,
        uint16 level
    ) external pure returns (uint256) {
        uint32[10] memory activity = counters;
        uint32[4] memory mutations = mutationCounters;
        return MutationRules.evaluate(currentMask, activity, mutations, inactivity, age, level);
    }
}
