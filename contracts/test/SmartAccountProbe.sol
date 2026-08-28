// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

interface IMerzavetsBirth {
    function birth() external returns (uint256 tokenId);
}

/// @notice Minimal contract-account caller used only to prove msg.sender-based ownership compatibility.
contract SmartAccountProbe {
    function birth(address identity) external returns (uint256 tokenId) {
        tokenId = IMerzavetsBirth(identity).birth();
    }
}
