export interface ServiceLoop {
  runForever(signal: AbortSignal): Promise<void>;
}

export interface CloseableStore {
  close(): void;
}

export interface ShutdownSignalSource {
  once(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  off(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
}

export async function runDaemonLoop(
  service: ServiceLoop,
  store: CloseableStore,
  signal: AbortSignal,
): Promise<void> {
  try {
    await service.runForever(signal);
  } finally {
    store.close();
  }
}

/**
 * Convert process termination signals into cooperative cancellation. The
 * returned cleanup removes both handlers so tests and embedders do not leak
 * listeners across daemon lifecycles.
 */
export function bindShutdownSignals(
  controller: AbortController,
  source: ShutdownSignalSource,
): () => void {
  const abort = () => controller.abort();
  source.once("SIGINT", abort);
  source.once("SIGTERM", abort);
  return () => {
    source.off("SIGINT", abort);
    source.off("SIGTERM", abort);
  };
}
