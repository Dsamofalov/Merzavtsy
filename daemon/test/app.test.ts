import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EventEmitter } from "node:events";
import { bindShutdownSignals, runDaemonLoop } from "../src/app.js";

class SignalBus extends EventEmitter {
  emitSignal(signal: "SIGINT" | "SIGTERM") {
    this.emit(signal);
  }
}

describe("daemon process lifecycle", () => {
  it("always closes the store when the service loop exits", async () => {
    const calls: string[] = [];
    await runDaemonLoop(
      { async runForever() { calls.push("run"); } },
      { close() { calls.push("close"); } },
      new AbortController().signal,
    );
    assert.deepEqual(calls, ["run", "close"]);
  });

  it("closes the store even when the service fails", async () => {
    let closed = 0;
    await assert.rejects(
      runDaemonLoop(
        { async runForever() { throw new Error("boom"); } },
        { close() { closed += 1; } },
        new AbortController().signal,
      ),
      /boom/,
    );
    assert.equal(closed, 1);
  });

  it("maps SIGINT/SIGTERM to one AbortController and can detach handlers", () => {
    const bus = new SignalBus();
    const controller = new AbortController();
    const cleanup = bindShutdownSignals(controller, bus);

    bus.emitSignal("SIGTERM");
    assert.equal(controller.signal.aborted, true);
    cleanup();
    assert.equal(bus.listenerCount("SIGINT"), 0);
    assert.equal(bus.listenerCount("SIGTERM"), 0);
  });
});
