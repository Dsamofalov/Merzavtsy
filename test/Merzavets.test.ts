import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

const { viem, networkHelpers } = await network.create();

async function deployIdentityFixture() {
  const [admin, alice, bob] = await viem.getWalletClients();
  const merzavets = await viem.deployContract("Merzavets", [admin.account.address]);
  const world = await viem.deployContract("MerzavetsWorld", [
    merzavets.address,
    admin.account.address,
  ]);
  await merzavets.write.setWorld([world.address], { account: admin.account });
  return { admin, alice, bob, merzavets, world };
}

describe("Merzavets identity", function () {
  it("births exactly one locked creature per account", async function () {
    const { alice, merzavets } = await networkHelpers.loadFixture(deployIdentityFixture);

    await merzavets.write.birth({ account: alice.account });

    assert.equal(await merzavets.read.tokenOf([alice.account.address]), 1n);
    assert.equal(await merzavets.read.locked([1n]), true);

    await viem.assertions.revertWithCustomError(
      merzavets.write.birth({ account: alice.account }),
      merzavets,
      "AlreadyBorn",
    );
  });

  it("rejects every transfer of an existing creature", async function () {
    const { alice, bob, merzavets } = await networkHelpers.loadFixture(deployIdentityFixture);
    await merzavets.write.birth({ account: alice.account });

    await viem.assertions.revertWithCustomError(
      merzavets.write.transferFrom(
        [alice.account.address, bob.account.address, 1n],
        { account: alice.account },
      ),
      merzavets,
      "Soulbound",
    );
  });
});
