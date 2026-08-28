import { DaemonStore, type IndexedEvent } from "./store.js";

/**
 * Persists structured canonical contract events for timeline reconstruction.
 * Prose rendering remains off-chain and outside canonical authority.
 */
export class EventIndexer {
  constructor(readonly store: DaemonStore) {}

  recordEvent(event: IndexedEvent): boolean {
    return this.store.recordEvent(event);
  }
}
