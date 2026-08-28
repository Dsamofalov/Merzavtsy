import { defineConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    version: "0.8.34",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      // MerzavetsWorld intentionally hashes a rich autonomous-life context.
      // viaIR avoids legacy stack-slot exhaustion without changing source-level rules.
      viaIR: true,
    },
  },
});
