// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

library MerzavetsMath {
    uint16 internal constant MAX_STAT = 10_000;
    uint16 internal constant MAX_LEVEL = 50;

    function levelForXp(uint64 xp) internal pure returns (uint16 level) {
        level = 1;
        while (level < MAX_LEVEL) {
            uint256 threshold = 500 * uint256(level) * uint256(level);
            if (uint256(xp) < threshold) break;
            unchecked {
                ++level;
            }
        }
    }

    function clampStat(int256 value) internal pure returns (uint16) {
        if (value <= 0) return 0;
        if (value >= int256(uint256(MAX_STAT))) return MAX_STAT;
        return uint16(uint256(value));
    }

    function clampSigned(int256 value, int16 minValue, int16 maxValue) internal pure returns (int16) {
        if (value <= int256(minValue)) return minValue;
        if (value >= int256(maxValue)) return maxValue;
        return int16(value);
    }
}
