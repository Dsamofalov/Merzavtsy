import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

const { viem } = await network.create();

describe("smart-account compatibility", () => {
  it("lets a contract account birth and own exactly one locked Merzavets through msg.sender", async () => {
    const [admin] = await viem.getWalletClients();
    const identity = await viem.deployContract("Merzavets", [admin.account.address]);
    const world = await viem.deployContract("MerzavetsWorld", [identity.address, admin.account.address]);
    await identity.write.setWorld([world.address], { account: admin.account });
    const smart = await viem.deployContract("SmartAccountProbe");

    await smart.write.birth([identity.address], { account: admin.account });
    assert.equal(await identity.read.tokenOf([smart.address]), 1n);
    assert.equal((await identity.read.ownerOf([1n])).toLowerCase(), smart.address.toLowerCase());
    assert.equal(await identity.read.locked([1n]), true);
    await assert.rejects(
      smart.write.birth([identity.address], { account: admin.account }),
      /AlreadyBorn/,
    );
  });
});
