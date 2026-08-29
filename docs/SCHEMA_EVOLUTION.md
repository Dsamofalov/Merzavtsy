# Schema evolution

Merzavtsy keeps protocol-critical fixed tuples narrow, while indexed biography history uses generic JSON payloads so future social/gossip projections can be added without rewriting canonical tables.

## Stable protocol boundaries

The following are versioned compatibility surfaces and must not be silently reordered:

- `ActivityAttestation` EIP-712 fields;
- activity category indexes `0..9`;
- mutation metric indexes `0..3`;
- canonical memory kind IDs;
- deployment metadata addresses and chain id.

Breaking one of these requires an explicit protocol-version decision rather than a SQLite migration hidden inside the daemon.

## Extensible indexed history

`DaemonStore.recordEvent` stores `eventName + JSON payload` without a fixed per-event column schema. New projections may therefore add structured fields such as `subjectTokenId`, `opinion`, provenance, confidence or gossip tags while old readers continue to preserve the complete payload.

A regression test persists a future `GOSSIP_OPINION`-style payload with nested arrays/objects and reads it back byte-for-structure without a database migration.

## Compatibility rule

Readers should:

1. require fields needed for the feature they implement;
2. ignore unknown fields rather than deleting them;
3. retain `schemaVersion` when a future projection needs version-specific interpretation;
4. keep canonical on-chain truth separate from optional presentation/narrative projections.

This is deliberate preparation for post-MVP gossip/opinion mechanics, not an implementation of those mechanics.
