export interface ServicePhases {
  syncRegistryAndIndexer(): Promise<void>;
  processFinalizedBlocks(): Promise<void>;
  persistEpochs(): Promise<void>;
  submitEpochs(): Promise<void>;
  runLifeKeeper(): Promise<void>;
}

export type SleepFunction = (milliseconds: number, signal: AbortSignal) => Promise<void>;

async function abortableSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * Small orchestration primitive that makes daemon phase ordering explicit and
 * forbids overlapping iterations even if a caller accidentally schedules a
 * second run before the first one has finished.
 */
export class DaemonService {
  #running = false;

  constructor(
    readonly phases: ServicePhases,
    readonly pollIntervalMs: number,
  ) {
    if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs <= 0) {
      throw new Error("pollIntervalMs must be a positive safe integer");
    }
  }

  async runOnce(): Promise<void> {
    if (this.#running) throw new Error("daemon iteration already running");
    this.#running = true;
    try {
      await this.phases.syncRegistryAndIndexer();
      await this.phases.processFinalizedBlocks();
      await this.phases.persistEpochs();
      await this.phases.submitEpochs();
      await this.phases.runLifeKeeper();
    } finally {
      this.#running = false;
    }
  }

  async runForever(
    signal: AbortSignal,
    sleep: SleepFunction = abortableSleep,
  ): Promise<void> {
    while (!signal.aborted) {
      await this.runOnce();
      if (signal.aborted) break;
      await sleep(this.pollIntervalMs, signal);
    }
  }
}
