import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DaemonService, type ServicePhases } from "../src/service.js";

function phases(log: string[]): ServicePhases {
  return {
    async syncRegistryAndIndexer() { log.push("sync"); },
    async processFinalizedBlocks() { log.push("blocks"); },
    async persistEpochs() { log.push("persist"); },
    async submitEpochs() { log.push("submit"); },
    async runLifeKeeper() { log.push("life"); },
  };
}

describe("DaemonService", () => {
  it("runs the runtime phases in the required order", async () => {
    const log: string[] = [];
    const service = new DaemonService(phases(log), 1000);

    await service.runOnce();

    assert.deepEqual(log, ["sync", "blocks", "persist", "submit", "life"]);
  });

  it("rejects overlapping iterations", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const runtime = phases([]);
    runtime.syncRegistryAndIndexer = async () => gate;
    const service = new DaemonService(runtime, 1000);

    const first = service.runOnce();
    await assert.rejects(service.runOnce(), /already running/);
    release();
    await first;
  });

  it("stops its polling loop cleanly when aborted", async () => {
    let iterations = 0;
    const runtime = phases([]);
    runtime.syncRegistryAndIndexer = async () => { iterations += 1; };
    const controller = new AbortController();
    const service = new DaemonService(runtime, 1);

    const loop = service.runForever(controller.signal, async () => {
      controller.abort();
    });
    await loop;

    assert.equal(iterations, 1);
  });
});
