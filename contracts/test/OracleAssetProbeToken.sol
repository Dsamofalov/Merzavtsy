// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only token used to prove ActivityOracle has no asset-transfer execution surface.
contract OracleAssetProbeToken is ERC20 {
    constructor(address initialHolder) ERC20("Oracle Asset Probe", "OAP") {
        _mint(initialHolder, 1_000_000 ether);
    }
}
