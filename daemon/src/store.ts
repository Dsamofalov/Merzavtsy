import { DatabaseSync } from "node:sqlite";
import type { Address, Hex } from "viem";
import type { PeerObservation } from "./peer-attestation.js";
import type { EpochSummary } from "./types.js";

export interface StoredEpoch {
  summary: EpochSummary;
  broadcastTxHash: Hex | null;
  submittedTxHash: Hex | null;
  completed: boolean;
}

export interface StoredPeerEncounter {
  observation: PeerObservation;
  broadcastTxHash: Hex | null;
  submittedTxHash: Hex | null;
  completed: boolean;
}

export interface IndexedEvent {
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  address: Address;
  eventName: string;
  payload: Record<string, unknown>;
}

export interface RegisteredCreature {
  wallet: Address;
  tokenId: bigint;
  birthBlock: bigint;
}

function blockNumber(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("block number is outside safe SQLite integer range");
  }
  return Number(value);
}

function serializeJson(value: unknown): string {
  const serialized = JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item,
  );
  if (serialized === undefined) throw new Error("value is not JSON serializable");
  return serialized;
}

function serializeSummary(summary: EpochSummary): string {
  return serializeJson({
    wallet: summary.wallet.toLowerCase(),
    tokenId: summary.tokenId.toString(),
    chainId: summary.chainId.toString(),
    fromBlock: summary.fromBlock.toString(),
    toBlock: summary.toBlock.toString(),
    epochId: summary.epochId.toLowerCase(),
    activityDigest: summary.activityDigest.toLowerCase(),
    xpDelta: summary.xpDelta.toString(),
    personalityDeltas: summary.personalityDeltas,
    needDeltas: summary.needDeltas,
    categoryCounters: summary.categoryCounters,
  });
}

function deserializeSummary(serialized: string): EpochSummary {
  const value = JSON.parse(serialized) as {
    wallet: Address;
    tokenId: string;
    chainId: string;
    fromBlock: string;
    toBlock: string;
    epochId: Hex;
    activityDigest: Hex;
    xpDelta: string;
    personalityDeltas: EpochSummary["personalityDeltas"];
    needDeltas: EpochSummary["needDeltas"];
    categoryCounters: EpochSummary["categoryCounters"];
  };

  return {
    wallet: value.wallet,
    tokenId: BigInt(value.tokenId),
    chainId: BigInt(value.chainId),
    fromBlock: BigInt(value.fromBlock),
    toBlock: BigInt(value.toBlock),
    epochId: value.epochId,
    activityDigest: value.activityDigest,
    xpDelta: BigInt(value.xpDelta),
    personalityDeltas: value.personalityDeltas,
    needDeltas: value.needDeltas,
    categoryCounters: value.categoryCounters,
  };
}

function serializePeer(observation: PeerObservation): string {
  return serializeJson({
    actorWallet: observation.actorWallet.toLowerCase(),
    actorTokenId: observation.actorTokenId.toString(),
    peerWallet: observation.peerWallet.toLowerCase(),
    peerTokenId: observation.peerTokenId.toString(),
    chainId: observation.chainId.toString(),
    blockNumber: observation.blockNumber.toString(),
    encounterDigest: observation.encounterDigest.toLowerCase(),
  });
}

function deserializePeer(serialized: string): PeerObservation {
  const value = JSON.parse(serialized) as {
    actorWallet: Address;
    actorTokenId: string;
    peerWallet: Address;
    peerTokenId: string;
    chainId: string;
    blockNumber: string;
    encounterDigest: Hex;
  };
  return {
    actorWallet: value.actorWallet,
    actorTokenId: BigInt(value.actorTokenId),
    peerWallet: value.peerWallet,
    peerTokenId: BigInt(value.peerTokenId),
    chainId: BigInt(value.chainId),
    blockNumber: BigInt(value.blockNumber),
    encounterDigest: value.encounterDigest,
  };
}

function toStoredEpoch(row: {
  payload_json: string;
  broadcast_tx_hash: string | null;
  submitted_tx_hash: string | null;
  completed: number;
}): StoredEpoch {
  return {
    summary: deserializeSummary(row.payload_json),
    broadcastTxHash: row.broadcast_tx_hash as Hex | null,
    submittedTxHash: row.submitted_tx_hash as Hex | null,
    completed: row.completed !== 0,
  };
}

function toStoredPeer(row: {
  payload_json: string;
  broadcast_tx_hash: string | null;
  submitted_tx_hash: string | null;
  completed: number;
}): StoredPeerEncounter {
  return {
    observation: deserializePeer(row.payload_json),
    broadcastTxHash: row.broadcast_tx_hash as Hex | null,
    submittedTxHash: row.submitted_tx_hash as Hex | null,
    completed: row.completed !== 0,
  };
}

export class DaemonStore {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    this.#db = new DatabaseSync(path);
    this.#db.exec("PRAGMA foreign_keys = ON;");
    if (path !== ":memory:") this.#db.exec("PRAGMA journal_mode = WAL;");
    this.#migrate();
  }

  close(): void {
    this.#db.close();
  }

  transaction<T>(operation: () => T): T {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const result = operation();
      this.#db.exec("COMMIT;");
      return result;
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  recordProcessedBlock(number: bigint, hash: Hex, parentHash: Hex): boolean {
    const height = blockNumber(number);
    const existing = this.#db
      .prepare("SELECT hash, parent_hash FROM processed_blocks WHERE block_number = ?")
      .get(height) as { hash: string; parent_hash: string } | undefined;

    if (existing !== undefined) {
      if (
        existing.hash.toLowerCase() !== hash.toLowerCase()
        || existing.parent_hash.toLowerCase() !== parentHash.toLowerCase()
      ) {
        throw new Error(`conflicting processed block ${number}`);
      }
      return false;
    }

    this.#db
      .prepare(
        "INSERT INTO processed_blocks(block_number, hash, parent_hash) VALUES (?, ?, ?)",
      )
      .run(height, hash.toLowerCase(), parentHash.toLowerCase());
    return true;
  }

  lastProcessedBlock(): bigint {
    const row = this.#db
      .prepare("SELECT block_number FROM processed_blocks ORDER BY block_number DESC LIMIT 1")
      .get() as { block_number: number } | undefined;
    return row === undefined ? 0n : BigInt(row.block_number);
  }

  putEpoch(summary: EpochSummary): boolean {
    const serialized = serializeSummary(summary);
    const epochId = summary.epochId.toLowerCase();
    const existingById = this.#db
      .prepare("SELECT payload_json FROM epochs WHERE epoch_id = ?")
      .get(epochId) as { payload_json: string } | undefined;

    if (existingById !== undefined) {
      if (existingById.payload_json !== serialized) {
        throw new Error(`epoch id conflict for ${summary.epochId}`);
      }
      return false;
    }

    const rangeConflict = this.#db
      .prepare(
        `SELECT epoch_id FROM epochs
         WHERE chain_id = ? AND wallet = ? AND from_block = ? AND to_block = ?`,
      )
      .get(
        summary.chainId.toString(),
        summary.wallet.toLowerCase(),
        blockNumber(summary.fromBlock),
        blockNumber(summary.toBlock),
      ) as { epoch_id: string } | undefined;
    if (rangeConflict !== undefined) {
      throw new Error(`conflicting epoch range already stored as ${rangeConflict.epoch_id}`);
    }

    this.#db
      .prepare(
        `INSERT INTO epochs(
          epoch_id, chain_id, wallet, token_id, from_block, to_block,
          activity_digest, payload_json, broadcast_tx_hash, submitted_tx_hash, completed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)`,
      )
      .run(
        epochId,
        summary.chainId.toString(),
        summary.wallet.toLowerCase(),
        summary.tokenId.toString(),
        blockNumber(summary.fromBlock),
        blockNumber(summary.toBlock),
        summary.activityDigest.toLowerCase(),
        serialized,
      );
    return true;
  }

  getEpoch(epochId: Hex): StoredEpoch | null {
    const row = this.#db
      .prepare(
        `SELECT payload_json, broadcast_tx_hash, submitted_tx_hash, completed
         FROM epochs WHERE epoch_id = ?`,
      )
      .get(epochId.toLowerCase()) as
      | {
          payload_json: string;
          broadcast_tx_hash: string | null;
          submitted_tx_hash: string | null;
          completed: number;
        }
      | undefined;
    return row === undefined ? null : toStoredEpoch(row);
  }

  pendingEpochs(): StoredEpoch[] {
    const rows = this.#db
      .prepare(
        `SELECT payload_json, broadcast_tx_hash, submitted_tx_hash, completed
         FROM epochs WHERE completed = 0 ORDER BY from_block, wallet`,
      )
      .all() as Array<{
      payload_json: string;
      broadcast_tx_hash: string | null;
      submitted_tx_hash: string | null;
      completed: number;
    }>;
    return rows.map(toStoredEpoch);
  }

  markEpochBroadcast(epochId: Hex, txHash: Hex): boolean {
    return this.#markBroadcast("epochs", "epoch_id", epochId, txHash, "epoch");
  }

  clearEpochBroadcast(epochId: Hex, txHash: Hex): boolean {
    return this.#clearBroadcast("epochs", "epoch_id", epochId, txHash, "epoch");
  }

  markEpochSubmitted(epochId: Hex, txHash: Hex): boolean {
    return this.#markSubmitted("epochs", "epoch_id", epochId, txHash, "epoch");
  }

  markEpochConsumed(epochId: Hex): boolean {
    return this.#markConsumed("epochs", "epoch_id", epochId, "epoch");
  }

  putPeerEncounter(observation: PeerObservation): boolean {
    const serialized = serializePeer(observation);
    const key = observation.encounterDigest.toLowerCase();
    const existing = this.#db
      .prepare("SELECT payload_json FROM peer_encounters WHERE encounter_digest = ?")
      .get(key) as { payload_json: string } | undefined;
    if (existing !== undefined) {
      if (existing.payload_json !== serialized) {
        throw new Error(`peer encounter conflict for ${observation.encounterDigest}`);
      }
      return false;
    }

    this.#db
      .prepare(
        `INSERT INTO peer_encounters(
          encounter_digest, chain_id, actor_wallet, actor_token_id,
          peer_wallet, peer_token_id, block_number, payload_json,
          broadcast_tx_hash, submitted_tx_hash, completed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)`,
      )
      .run(
        key,
        observation.chainId.toString(),
        observation.actorWallet.toLowerCase(),
        observation.actorTokenId.toString(),
        observation.peerWallet.toLowerCase(),
        observation.peerTokenId.toString(),
        blockNumber(observation.blockNumber),
        serialized,
      );
    return true;
  }

  pendingPeerEncounters(): StoredPeerEncounter[] {
    const rows = this.#db
      .prepare(
        `SELECT payload_json, broadcast_tx_hash, submitted_tx_hash, completed
         FROM peer_encounters WHERE completed = 0 ORDER BY block_number, encounter_digest`,
      )
      .all() as Array<{
      payload_json: string;
      broadcast_tx_hash: string | null;
      submitted_tx_hash: string | null;
      completed: number;
    }>;
    return rows.map(toStoredPeer);
  }

  markPeerBroadcast(encounterDigest: Hex, txHash: Hex): boolean {
    return this.#markBroadcast(
      "peer_encounters",
      "encounter_digest",
      encounterDigest,
      txHash,
      "peer encounter",
    );
  }

  clearPeerBroadcast(encounterDigest: Hex, txHash: Hex): boolean {
    return this.#clearBroadcast(
      "peer_encounters",
      "encounter_digest",
      encounterDigest,
      txHash,
      "peer encounter",
    );
  }

  markPeerSubmitted(encounterDigest: Hex, txHash: Hex): boolean {
    return this.#markSubmitted(
      "peer_encounters",
      "encounter_digest",
      encounterDigest,
      txHash,
      "peer encounter",
    );
  }

  markPeerConsumed(encounterDigest: Hex): boolean {
    return this.#markConsumed(
      "peer_encounters",
      "encounter_digest",
      encounterDigest,
      "peer encounter",
    );
  }

  recordBirth(owner: Address, tokenId: bigint, birthBlock: bigint): boolean {
    const wallet = owner.toLowerCase();
    const token = tokenId.toString();
    const byWallet = this.#db
      .prepare("SELECT token_id FROM registry WHERE wallet = ?")
      .get(wallet) as { token_id: string } | undefined;
    if (byWallet !== undefined) {
      if (byWallet.token_id === token) return false;
      throw new Error(`registry conflict: wallet ${wallet} already maps to ${byWallet.token_id}`);
    }

    const byToken = this.#db
      .prepare("SELECT wallet FROM registry WHERE token_id = ?")
      .get(token) as { wallet: string } | undefined;
    if (byToken !== undefined) {
      if (byToken.wallet.toLowerCase() === wallet) return false;
      throw new Error(`registry conflict: token ${token} already maps to ${byToken.wallet}`);
    }

    this.#db
      .prepare("INSERT INTO registry(wallet, token_id, birth_block) VALUES (?, ?, ?)")
      .run(wallet, token, blockNumber(birthBlock));
    return true;
  }

  tokenForWallet(owner: Address): bigint | null {
    const row = this.#db
      .prepare("SELECT token_id FROM registry WHERE wallet = ?")
      .get(owner.toLowerCase()) as { token_id: string } | undefined;
    return row === undefined ? null : BigInt(row.token_id);
  }

  walletForToken(tokenId: bigint): string | null {
    const row = this.#db
      .prepare("SELECT wallet FROM registry WHERE token_id = ?")
      .get(tokenId.toString()) as { wallet: string } | undefined;
    return row?.wallet ?? null;
  }

  registeredCreatures(): RegisteredCreature[] {
    const rows = this.#db
      .prepare("SELECT wallet, token_id, birth_block FROM registry")
      .all() as Array<{ wallet: string; token_id: string; birth_block: number }>;
    return rows
      .map((row) => ({
        wallet: row.wallet as Address,
        tokenId: BigInt(row.token_id),
        birthBlock: BigInt(row.birth_block),
      }))
      .sort((a, b) => (a.tokenId < b.tokenId ? -1 : a.tokenId > b.tokenId ? 1 : 0));
  }

  recordContractDestination(wallet: Address, contract: Address, atBlock: bigint): boolean {
    return this.#recordSeen(
      "contract_destinations",
      "contract",
      wallet,
      contract,
      atBlock,
    );
  }

  recordSelector(wallet: Address, selector: Hex, atBlock: bigint): boolean {
    return this.#recordSeen("selectors", "selector", wallet, selector, atBlock);
  }

  recordCounterparty(wallet: Address, counterparty: Address, atBlock: bigint): boolean {
    return this.#recordSeen("counterparties", "counterparty", wallet, counterparty, atBlock);
  }

  contractDestinations(wallet: Address): ReadonlySet<string> {
    return this.#seenValues("contract_destinations", "contract", wallet);
  }

  selectorsForWallet(wallet: Address): ReadonlySet<string> {
    return this.#seenValues("selectors", "selector", wallet);
  }

  counterpartiesForWallet(wallet: Address): ReadonlySet<string> {
    return this.#seenValues("counterparties", "counterparty", wallet);
  }

  recordEvent(event: IndexedEvent): boolean {
    const existing = this.#db
      .prepare(
        `SELECT block_number, address, event_name, payload_json FROM events
         WHERE tx_hash = ? AND log_index = ?`,
      )
      .get(event.txHash.toLowerCase(), event.logIndex) as
      | { block_number: number; address: string; event_name: string; payload_json: string }
      | undefined;
    const payload = serializeJson(event.payload);

    if (existing !== undefined) {
      if (
        existing.block_number !== blockNumber(event.blockNumber)
        || existing.address.toLowerCase() !== event.address.toLowerCase()
        || existing.event_name !== event.eventName
        || existing.payload_json !== payload
      ) {
        throw new Error(`conflicting indexed event ${event.txHash}:${event.logIndex}`);
      }
      return false;
    }

    this.#db
      .prepare(
        `INSERT INTO events(tx_hash, log_index, block_number, address, event_name, payload_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.txHash.toLowerCase(),
        event.logIndex,
        blockNumber(event.blockNumber),
        event.address.toLowerCase(),
        event.eventName,
        payload,
      );
    return true;
  }

  eventsForTransaction(txHash: Hex): IndexedEvent[] {
    const rows = this.#db
      .prepare(
        `SELECT tx_hash, log_index, block_number, address, event_name, payload_json
         FROM events WHERE tx_hash = ? ORDER BY log_index`,
      )
      .all(txHash.toLowerCase()) as Array<{
      tx_hash: string;
      log_index: number;
      block_number: number;
      address: string;
      event_name: string;
      payload_json: string;
    }>;

    return rows.map((row) => ({
      txHash: row.tx_hash as Hex,
      logIndex: row.log_index,
      blockNumber: BigInt(row.block_number),
      address: row.address as Address,
      eventName: row.event_name,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    }));
  }

  #markBroadcast(
    table: "epochs" | "peer_encounters",
    keyColumn: "epoch_id" | "encounter_digest",
    keyValue: Hex,
    txHash: Hex,
    label: string,
  ): boolean {
    const key = keyValue.toLowerCase();
    const row = this.#db
      .prepare(
        `SELECT broadcast_tx_hash, submitted_tx_hash, completed FROM ${table} WHERE ${keyColumn} = ?`,
      )
      .get(key) as
      | { broadcast_tx_hash: string | null; submitted_tx_hash: string | null; completed: number }
      | undefined;
    if (row === undefined) throw new Error(`unknown ${label} ${keyValue}`);
    if (row.submitted_tx_hash !== null || row.completed !== 0) {
      if (row.submitted_tx_hash?.toLowerCase() === txHash.toLowerCase()) return false;
      throw new Error(`${label} ${keyValue} already completed`);
    }
    if (row.broadcast_tx_hash !== null) {
      if (row.broadcast_tx_hash.toLowerCase() === txHash.toLowerCase()) return false;
      throw new Error(`${label} ${keyValue} already broadcast as ${row.broadcast_tx_hash}`);
    }
    this.#db
      .prepare(`UPDATE ${table} SET broadcast_tx_hash = ? WHERE ${keyColumn} = ?`)
      .run(txHash.toLowerCase(), key);
    return true;
  }

  #clearBroadcast(
    table: "epochs" | "peer_encounters",
    keyColumn: "epoch_id" | "encounter_digest",
    keyValue: Hex,
    txHash: Hex,
    label: string,
  ): boolean {
    const key = keyValue.toLowerCase();
    const row = this.#db
      .prepare(`SELECT broadcast_tx_hash, completed FROM ${table} WHERE ${keyColumn} = ?`)
      .get(key) as { broadcast_tx_hash: string | null; completed: number } | undefined;
    if (row === undefined) throw new Error(`unknown ${label} ${keyValue}`);
    if (row.completed !== 0 || row.broadcast_tx_hash === null) return false;
    if (row.broadcast_tx_hash.toLowerCase() !== txHash.toLowerCase()) {
      throw new Error(`${label} ${keyValue} broadcast hash mismatch`);
    }
    this.#db
      .prepare(`UPDATE ${table} SET broadcast_tx_hash = NULL WHERE ${keyColumn} = ?`)
      .run(key);
    return true;
  }

  #markSubmitted(
    table: "epochs" | "peer_encounters",
    keyColumn: "epoch_id" | "encounter_digest",
    keyValue: Hex,
    txHash: Hex,
    label: string,
  ): boolean {
    const key = keyValue.toLowerCase();
    const row = this.#db
      .prepare(`SELECT submitted_tx_hash, completed FROM ${table} WHERE ${keyColumn} = ?`)
      .get(key) as { submitted_tx_hash: string | null; completed: number } | undefined;
    if (row === undefined) throw new Error(`unknown ${label} ${keyValue}`);
    if (row.submitted_tx_hash !== null) {
      if (row.submitted_tx_hash.toLowerCase() === txHash.toLowerCase()) return false;
      throw new Error(`${label} ${keyValue} already submitted as ${row.submitted_tx_hash}`);
    }
    if (row.completed !== 0) throw new Error(`${label} ${keyValue} already completed without tx hash`);
    this.#db
      .prepare(
        `UPDATE ${table}
         SET broadcast_tx_hash = ?, submitted_tx_hash = ?, completed = 1
         WHERE ${keyColumn} = ?`,
      )
      .run(txHash.toLowerCase(), txHash.toLowerCase(), key);
    return true;
  }

  #markConsumed(
    table: "epochs" | "peer_encounters",
    keyColumn: "epoch_id" | "encounter_digest",
    keyValue: Hex,
    label: string,
  ): boolean {
    const key = keyValue.toLowerCase();
    const row = this.#db
      .prepare(`SELECT completed FROM ${table} WHERE ${keyColumn} = ?`)
      .get(key) as { completed: number } | undefined;
    if (row === undefined) throw new Error(`unknown ${label} ${keyValue}`);
    if (row.completed !== 0) return false;
    this.#db
      .prepare(`UPDATE ${table} SET completed = 1 WHERE ${keyColumn} = ?`)
      .run(key);
    return true;
  }

  #recordSeen(
    table: "contract_destinations" | "selectors" | "counterparties",
    valueColumn: "contract" | "selector" | "counterparty",
    wallet: Address,
    value: string,
    atBlock: bigint,
  ): boolean {
    const normalizedWallet = wallet.toLowerCase();
    const normalizedValue = value.toLowerCase();
    const height = blockNumber(atBlock);
    const existing = this.#db
      .prepare(`SELECT interaction_count FROM ${table} WHERE wallet = ? AND ${valueColumn} = ?`)
      .get(normalizedWallet, normalizedValue) as { interaction_count: number } | undefined;

    if (existing === undefined) {
      this.#db
        .prepare(
          `INSERT INTO ${table}(wallet, ${valueColumn}, first_block, last_block, interaction_count)
           VALUES (?, ?, ?, ?, 1)`,
        )
        .run(normalizedWallet, normalizedValue, height, height);
      return true;
    }

    this.#db
      .prepare(
        `UPDATE ${table}
         SET last_block = ?, interaction_count = interaction_count + 1
         WHERE wallet = ? AND ${valueColumn} = ?`,
      )
      .run(height, normalizedWallet, normalizedValue);
    return false;
  }

  #seenValues(
    table: "contract_destinations" | "selectors" | "counterparties",
    valueColumn: "contract" | "selector" | "counterparty",
    wallet: Address,
  ): ReadonlySet<string> {
    const rows = this.#db
      .prepare(`SELECT ${valueColumn} AS value FROM ${table} WHERE wallet = ? ORDER BY ${valueColumn}`)
      .all(wallet.toLowerCase()) as Array<{ value: string }>;
    return new Set(rows.map((row) => row.value));
  }

  #migrate(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS meta(
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS processed_blocks(
        block_number INTEGER PRIMARY KEY,
        hash TEXT NOT NULL,
        parent_hash TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS registry(
        wallet TEXT PRIMARY KEY,
        token_id TEXT NOT NULL UNIQUE,
        birth_block INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS epochs(
        epoch_id TEXT PRIMARY KEY,
        chain_id TEXT NOT NULL,
        wallet TEXT NOT NULL,
        token_id TEXT NOT NULL,
        from_block INTEGER NOT NULL,
        to_block INTEGER NOT NULL,
        activity_digest TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        broadcast_tx_hash TEXT,
        submitted_tx_hash TEXT,
        completed INTEGER NOT NULL DEFAULT 0,
        UNIQUE(chain_id, wallet, from_block, to_block)
      );

      CREATE TABLE IF NOT EXISTS peer_encounters(
        encounter_digest TEXT PRIMARY KEY,
        chain_id TEXT NOT NULL,
        actor_wallet TEXT NOT NULL,
        actor_token_id TEXT NOT NULL,
        peer_wallet TEXT NOT NULL,
        peer_token_id TEXT NOT NULL,
        block_number INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        broadcast_tx_hash TEXT,
        submitted_tx_hash TEXT,
        completed INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS contract_destinations(
        wallet TEXT NOT NULL,
        contract TEXT NOT NULL,
        first_block INTEGER NOT NULL,
        last_block INTEGER NOT NULL,
        interaction_count INTEGER NOT NULL,
        PRIMARY KEY(wallet, contract)
      );

      CREATE TABLE IF NOT EXISTS selectors(
        wallet TEXT NOT NULL,
        selector TEXT NOT NULL,
        first_block INTEGER NOT NULL,
        last_block INTEGER NOT NULL,
        interaction_count INTEGER NOT NULL,
        PRIMARY KEY(wallet, selector)
      );

      CREATE TABLE IF NOT EXISTS counterparties(
        wallet TEXT NOT NULL,
        counterparty TEXT NOT NULL,
        first_block INTEGER NOT NULL,
        last_block INTEGER NOT NULL,
        interaction_count INTEGER NOT NULL,
        PRIMARY KEY(wallet, counterparty)
      );

      CREATE TABLE IF NOT EXISTS events(
        tx_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        block_number INTEGER NOT NULL,
        address TEXT NOT NULL,
        event_name TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY(tx_hash, log_index)
      );
    `);

    const columns = this.#db.prepare("PRAGMA table_info(epochs)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("broadcast_tx_hash")) {
      this.#db.exec("ALTER TABLE epochs ADD COLUMN broadcast_tx_hash TEXT;");
    }
    if (!names.has("completed")) {
      this.#db.exec("ALTER TABLE epochs ADD COLUMN completed INTEGER NOT NULL DEFAULT 0;");
      this.#db.exec("UPDATE epochs SET completed = 1 WHERE submitted_tx_hash IS NOT NULL;");
    }
  }
}
