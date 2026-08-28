import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIFE_TICK_COOLDOWN_SECONDS, dueLifeTicks } from "../src/life-keeper.js";

const NOW = 2_000_000_000n;

describe("life keeper", () => {
  it("selects initialized creatures exactly at or beyond the cooldown boundary", () => {
    const due = dueLifeTicks(
      [
        { tokenId: 1n, initialized: true, lastLifeTickAt: NOW - LIFE_TICK_COOLDOWN_SECONDS },
        { tokenId: 2n, initialized: true, lastLifeTickAt: NOW - LIFE_TICK_COOLDOWN_SECONDS + 1n },
        { tokenId: 3n, initialized: true, lastLifeTickAt: NOW - LIFE_TICK_COOLDOWN_SECONDS - 1n },
        { tokenId: 4n, initialized: false, lastLifeTickAt: 0n },
      ],
      NOW,
    );

    assert.deepEqual(due, [1n, 3n]);
  });

  it("keeps hibernating creatures eligible because the contract suppresses social intent itself", () => {
    const due = dueLifeTicks(
      [
        {
          tokenId: 9n,
          initialized: true,
          lastLifeTickAt: NOW - LIFE_TICK_COOLDOWN_SECONDS - 10n,
          hibernating: true,
        },
      ],
      NOW,
    );
    assert.deepEqual(due, [9n]);
  });

  it("returns tokens in stable token-id order and rejects invalid time input", () => {
    const due = dueLifeTicks(
      [
        { tokenId: 8n, initialized: true, lastLifeTickAt: 0n },
        { tokenId: 2n, initialized: true, lastLifeTickAt: 0n },
        { tokenId: 5n, initialized: true, lastLifeTickAt: 0n },
      ],
      NOW,
    );
    assert.deepEqual(due, [2n, 5n, 8n]);
    assert.throws(() => dueLifeTicks([], -1n), /non-negative/i);
  });
});
