# Merzavtsy — Design Specification

Date: 2026-08-28
Status: Approved by user on 2026-08-28

## 1. Product thesis

**Merzavtsy** is an Ethereum-native life simulation where an address has a non-transferable digital creature — a *merzavets* — whose personality, appearance, habits, relationships, mutations, and long-term biography emerge from the real activity of that address and from interactions with other registered addresses.

The product is deliberately **not** an NFT collection with a conventional XP bar. The creature is a persistent account-bound organism whose biography is derived from observable wallet behavior and a deterministic social simulation.

The core fantasy is:

> “My Ethereum address has a little bastard living inside it. It watches what I do, develops habits from it, remembers other bastards, and eventually behaves in ways I did not explicitly script.”

### Success criteria

A successful MVP must make a user able to:

1. Connect an Ethereum account and birth exactly one account-bound merzavets.
2. See a distinct deterministic genome and visible personality derived from that genome plus subsequent behavior.
3. Generate progression from real Ethereum account activity without routing every transaction through the game.
4. Have real interactions between registered Ethereum accounts influence relationships between their creatures.
5. Let creatures perform autonomous life actions through a deterministic simulation engine.
6. Accumulate irreversible biography: milestones, grudges, friendships, mutations, scars, sleep/wake history.
7. Reproduce the same canonical state from on-chain state plus accepted activity attestations.
8. Keep the first release non-financial: no project token, marketplace, yield, gambling, paid stat boosts, or custody of user assets.

## 2. Design principles

### 2.1 Biography over grind

Repeated identical behavior must have diminishing returns. A wallet should become interesting because of its behavioral pattern and history, not because the owner spammed the cheapest transaction.

### 2.2 Character over raw power

Progression should primarily unlock **different behavior, identity, mutation branches, social options, and appearance**, rather than simply increasing combat numbers.

### 2.3 Consequences over resets

The system should preserve meaningful history. Old relationships, betrayals, rare events, long sleep periods, and unusual activity can leave permanent marks.

### 2.4 Autonomous but legible

A merzavets may act without user input, but every meaningful action must be explainable from visible or inspectable causes: personality, need, relationship, memory, recent event, and randomness seed.

### 2.5 Canonical on-chain core, expressive off-chain shell

Canonical identity, accepted activity summaries, progression state, mutations, relationship scores, and significant life events are anchored on-chain. Rich text, long memories, rendered dialogue, searchable history, analytics, and visual generation are off-chain derivatives.

### 2.6 No financial coercion

The MVP must not make users spend more ETH to become “stronger.” Value comes from behavioral diversity, age, history, rarity of emergent traits, and social entanglement.

## 3. User and creature identity

### 3.1 One creature per account

Each EOA or supported smart account may birth at most one merzavets in the MVP.

The creature is represented by a non-transferable ERC-721-compatible token implementing an account-bound lock semantics compatible with ERC-5192.

The owner may not transfer the creature to another wallet.

### 3.2 Birth

Birth is permissionless. The user calls `birth()`.

Birth records:

- `tokenId`
- `owner`
- `birthBlock`
- `birthTimestamp`
- `genomeSeed`
- `genomeHash`
- initial lifecycle stage

The genome seed is produced from a deterministic mix of stable chain/account-specific inputs and contract-maintained entropy inputs. It must not expose economically exploitable randomness because the genome has no direct financial payout.

### 3.3 Smart accounts

The MVP should support normal EOAs first. Contract-account support is allowed where ownership can be established through the calling account itself. No generalized account-abstraction ownership registry is required for MVP.

## 4. Genome and personality

### 4.1 Hidden genome dimensions

Each merzavets has eight normalized hereditary tendencies in the range 0–10000:

- `aggression`
- `curiosity`
- `sociability`
- `greed`
- `stability`
- `chaos`
- `adaptability`
- `memoryBias`

These are **predispositions**, not the final visible personality.

### 4.2 Behavioral personality

Visible personality is derived from:

`genome predisposition + cumulative behavior deltas + age modifiers + permanent mutations`

The visible layer may expose labels such as:

- Любопытный
- Злопамятный
- Скряга
- Суетливый
- Прилипчивый
- Нелюдимый
- Истеричный
- Терпеливый
- Контрактный крысёныш
- ABI-нюхач

Labels are presentation-level projections of numeric state, not separate authoritative state unless a label itself unlocks a mutation or milestone.

### 4.3 Anti-min-maxing

A single activity category may not drive one personality axis without cap. Each epoch applies category-specific diminishing returns and a daily/epoch cap.

This prevents a trivial strategy such as sending 10,000 dust transactions to manufacture “sociability.”

## 5. Needs and temporary state

Each merzavets maintains temporary physiological/social state:

- `energy`
- `mood`
- `boredom`
- `stress`
- `socialNeed`
- `arousal`
- `stabilityState`

All are bounded integers.

These values decay or recover over time through `lifeTick()` and through accepted activity.

Example tendencies:

- high wallet activity reduces boredom but may increase stress;
- repeated social contact reduces social need;
- prolonged inactivity decreases energy demand and moves toward hibernation;
- a conflict raises stress and may lower mood;
- a positive encounter may raise mood but also create attachment.

The exact formulas must be integer-only, bounded, and deterministic.

## 6. Lifecycle and age

Lifecycle stages are separate from level:

1. `ZARODYSH` — initial state
2. `PAKOSTNIK`
3. `MERZAVETS`
4. `MATERYI`
5. `ARKHIMERZAVETS`

Advancement requires combinations of:

- minimum chronological age;
- minimum accumulated XP;
- number of meaningful life events;
- diversity of activity categories;
- optionally one or more developmental milestones.

This prevents a new account from reaching the final life stage through raw spam.

A creature never dies permanently in the MVP.

## 7. Hibernation and awakening

If an account has no accepted meaningful activity for a configured period, its creature may enter `HIBERNATING`.

Hibernation:

- slows life-state changes;
- suppresses most autonomous social actions;
- may accumulate a “mold/sleep” mutation path for very long inactivity;
- never burns or destroys the creature.

The next accepted wallet activity triggers `AWAKENED` and a life event.

Long hibernations may create irreversible scars or mutations.

## 8. Activity model

### 8.1 Why an oracle/watcher is required

A Solidity contract cannot independently observe arbitrary historical Ethereum transactions executed between an account and unrelated contracts. Therefore the system uses an off-chain watcher that observes Ethereum and submits signed, replay-protected activity attestations to the on-chain world contract.

### 8.2 Raw events observed by watcher

For registered addresses, the watcher observes:

- ETH sends and receives;
- contract calls;
- unique counterparties;
- unique contract destinations;
- contract deployments;
- gas usage;
- calldata selector diversity;
- repeated interaction patterns;
- transaction cadence;
- inactivity periods;
- direct interactions between two registered accounts;
- repeated co-occurrence with the same protocol contracts.

Protocol classification such as “DEX,” “bridge,” or “NFT marketplace” is optional metadata and must not be required for correctness in the first implementation.

### 8.3 Normalized activity categories

The watcher/classifier reduces raw blockchain data into bounded categories, for example:

- `TX_SENT`
- `TX_RECEIVED`
- `CONTRACT_CALL`
- `NEW_CONTRACT`
- `REPEAT_CONTRACT`
- `CONTRACT_DEPLOY`
- `UNIQUE_COUNTERPARTY`
- `REGISTERED_PEER_CONTACT`
- `HIGH_GAS_ACTIVITY`
- `SELECTOR_DIVERSITY`

Each epoch summary may contain category counters plus derived bounded deltas for:

- XP
- personality axes
- needs
- mutation counters

### 8.4 Epoch aggregation

The watcher does not submit one on-chain update per Ethereum transaction.

Instead it aggregates activity for a creature over a block range or time epoch and produces a single signed attestation.

An epoch has a stable ID derived from chain ID, wallet, and closed block range or equivalent deterministic sequence identifier.

### 8.5 Diminishing returns

Within one epoch the classifier applies diminishing returns to repeated identical categories.

The contract never trusts arbitrary unlimited oracle values. It enforces absolute per-attestation and per-epoch caps for every state delta.

## 9. Activity attestation

The watcher signs an EIP-712 typed structure containing at minimum:

- `wallet`
- `tokenId`
- `chainId`
- `fromBlock`
- `toBlock`
- `epochId`
- `activityDigest`
- `xpDelta`
- bounded personality deltas
- bounded needs deltas
- compact category counters
- `nonce`
- `deadline`

The contract verifies:

- authorized signer;
- domain separator / chain binding;
- matching wallet-token ownership;
- monotonic or unique nonce;
- non-overlapping/replay-protected epoch;
- deadline;
- all deltas within protocol-defined caps;
- activity digest not previously processed.

The oracle **cannot transfer user funds or move NFTs**. Its authority is restricted to gameplay facts.

## 10. Experience and levels

XP represents accumulated meaningful biography, not wealth.

Sources include:

- diverse Ethereum activity;
- meaningful social encounters;
- milestones;
- rare mutation triggers;
- awakening after long sleep;
- autonomous life events with cooldown.

Repeated same-category actions are capped.

The MVP may use a monotonic level curve, for example increasing thresholds via a compact formula or constant lookup table for levels 1–50.

Levels unlock:

- mutation eligibility;
- additional autonomous action types;
- greater memory capacity;
- additional visible traits;
- lifecycle-stage eligibility.

They must not directly multiply financial rewards because the MVP has none.

## 11. Specializations

Specializations are derived labels from long-term behavior rather than exclusive classes.

### 11.1 Contractnik

Driven by contract-call diversity and repeated contract interaction.

### 11.2 Brodyaga

Driven by unique counterparties and destinations.

### 11.3 Skryaga

Driven by long holding / low outgoing cadence patterns.

### 11.4 Suetolog

Driven by transaction cadence and repeated activity bursts.

### 11.5 Diplomat

Driven by persistent positive registered-peer relationships.

### 11.6 Parazit

Driven by repeated dependence on a narrow set of peers/contracts while personal activity diversity stays low.

## 12. Mutations

Mutations are irreversible phenotype flags unlocked by biography combinations, not purchased upgrades.

MVP examples:

- **Gas Gills** — sustained high gas usage
- **Contract Teeth** — extensive smart-contract usage
- **Third Calldata Eye** — selector diversity
- **Rusty Paw** — age/history milestone
- **Pimpled Brain** — repeated contract deployments
- **Network Scar** — bridge-like behavior reserved for richer classifier metadata
- **Wallet Mold** — long hibernation
- **Double Tongue** — maintains close relationships with two mutually hostile peers
- **Sticky Fingers** — repeatedly revisits the same small contract set
- **Crowded Whiskers** — unusually high peer diversity

### 12.1 Mutation rules

A mutation trigger consists of:

- threshold(s) on counters/state;
- minimum age/level where relevant;
- required or forbidden existing mutations;
- one-time bit in a mutation mask.

Mutation checks are deterministic and idempotent.

The contract emits `MutationUnlocked`.

## 13. Scars and irreversible biography

Scars are permanent biography marks with little or no direct stat power.

Examples:

- first contract deployment;
- awakening after prolonged hibernation;
- first rivalry threshold crossing;
- old-account milestone;
- rare mutation combination.

Scars are represented as compact flags/counters and significant events.

## 14. Relationships

For each interacting pair of creatures, store a compact bounded relationship record:

- `affinity`
- `trust`
- `fear`
- `respect`
- `envy`
- `rivalry`
- `interactionCount`
- `lastInteractionAt`

Relationship dimensions may be asymmetric.

### 14.1 Relationship creation

A relationship record is created lazily when two registered accounts first have a recognized encounter.

### 14.2 Encounter sources

MVP sources include:

- direct ETH/account interaction between two registered owners observed by watcher;
- explicit in-game social action;
- autonomous life action where rules select another creature.

### 14.3 Outcome

The same raw encounter can produce different relationship deltas because outcome depends on:

- actor personality;
- target personality;
- existing relationship;
- recent event history summary;
- deterministic randomness seed.

All deltas are bounded.

## 15. Memory

The canonical chain stores **structured significant events**, not prose.

Examples:

- `BORN`
- `MET`
- `HELPED`
- `MOCKED`
- `BETRAYED`
- `FRIENDSHIP_THRESHOLD`
- `RIVALRY_THRESHOLD`
- `MUTATED`
- `SCARRED`
- `HIBERNATED`
- `AWAKENED`
- `STAGE_ADVANCED`
- `LIFE_ACTION`

The contract emits compact event data.

An off-chain indexer reconstructs a long-form timeline and may render text descriptions.

`memoryBias` affects how strongly old events continue to influence autonomous decisions. The MVP may implement this through relationship decay/retention coefficients rather than storing an unbounded event list in contract storage.

## 16. Autonomous life engine

### 16.1 Goal

The creature should sometimes do something without a direct player instruction while remaining deterministic and auditable.

### 16.2 Deterministic intent selection

A life tick derives an intent from:

- current needs;
- personality;
- lifecycle stage;
- relationship graph summary;
- recent significant-event counters;
- timestamp/block bucket;
- token ID and immutable genome seed.

MVP intents:

- `REST`
- `WANDER`
- `SEEK_COMPANY`
- `MOCK_RIVAL`
- `GROOM`
- `HIDE`

Each intent has bounded state effects and cooldowns.

### 16.3 Who calls lifeTick

`lifeTick` is public and incentive-neutral in the MVP. A keeper calls it operationally, but any account may call it when cooldown conditions are satisfied.

No caller receives a financial reward.

### 16.4 No LLM authority

An LLM may render a selected structured action into dialogue, but it does not choose canonical stat deltas or modify state directly.

## 17. Gossip

Gossip is a post-core social extension but the MVP data model should not block it.

A creature with a relationship to A and B may transmit a compact opinion signal about A to B.

The chain would store only structured opinion/relationship effects, while rendered language remains off-chain.

## 18. Places and territories

Protocol contracts can later act as places:

- DEX -> market
- bridge -> port
- NFT venue -> gallery
- game contract -> den

MVP stores enough activity counters and contract addresses off-chain to support this future feature but does not require an on-chain territory registry.

## 19. Packs / social clusters

Packs are post-MVP emergent communities inferred from social/protocol co-occurrence rather than mandatory player-created guilds.

Possible future fields include pack name, reputation, territory affinity, internal cohesion, and rival-pack relations.

No pack registry is required for MVP.

## 20. Breeding / descendants

Breeding is explicitly post-MVP.

If introduced, offspring inherit a mixture of parental genome traits plus a mutation seed.

It must not become a paid scarcity pyramid or financial yield mechanic.

## 21. Contract architecture

### 21.1 `Merzavets.sol`

Responsibilities:

- ERC-721 identity compatibility;
- one creature per account;
- birth;
- ownership lookup;
- transfer prohibition / locked semantics;
- immutable birth metadata;
- world contract authorization for gameplay references if needed.

Non-responsibilities:

- no relationships;
- no XP formulas;
- no watcher signatures;
- no long-form metadata rendering.

### 21.2 `ActivityOracle.sol`

Responsibilities:

- EIP-712 domain;
- oracle signer authorization;
- signature verification;
- nonce/replay protection;
- epoch/digest consumption tracking;
- forwarding verified bounded activity packages to the world.

The contract uses role-based signer management controlled by project administration for MVP.

### 21.3 `MerzavetsWorld.sol`

Responsibilities:

- XP and level;
- lifecycle stage;
- personality state;
- needs;
- activity counters;
- hibernation;
- mutations;
- scars;
- relationships;
- explicit social actions;
- autonomous life tick;
- significant event emission.

### 21.4 Optional `MutationRules.sol`

If `MerzavetsWorld.sol` becomes too large for safe auditing, mutation checks should be isolated into a dedicated pure/view rule library or contract. The first implementation should prefer a Solidity library if no independent upgrade boundary is needed.

## 22. Suggested Solidity data shapes

Illustrative, not byte-for-byte final code:

```solidity
struct CreatureState {
    uint64 xp;
    uint32 level;
    uint40 lastActivityAt;
    uint40 lastLifeTickAt;
    uint8 stage;
    bool hibernating;

    uint16 aggression;
    uint16 curiosity;
    uint16 sociability;
    uint16 greed;
    uint16 stability;
    uint16 chaos;
    uint16 adaptability;
    uint16 memoryBias;

    uint16 energy;
    uint16 mood;
    uint16 boredom;
    uint16 stress;
    uint16 socialNeed;
}
```

Large counters and less frequently used values may live in separate mappings to reduce hot-path storage reads.

Relationship state:

```solidity
struct Relationship {
    int16 affinity;
    int16 trust;
    uint16 fear;
    uint16 respect;
    uint16 envy;
    uint16 rivalry;
    uint32 interactionCount;
    uint40 lastInteractionAt;
}
```

Canonical pair keys should normalize token IDs `(min(a,b), max(a,b))`, while directional fields that need asymmetry must be stored separately or keyed by ordered `(actor,target)`.

For MVP, prefer ordered directional mappings because affinity/trust/fear are naturally asymmetric.

## 23. Off-chain daemon architecture

One TypeScript service, organized as independent modules:

### 23.1 `registry`

Caches currently registered wallets/token IDs from contract events.

### 23.2 `chain-watcher`

Observes finalized Ethereum blocks and extracts transactions relevant to registered addresses.

### 23.3 `classifier`

Maps raw transactions into normalized activity categories.

### 23.4 `aggregator`

Builds per-wallet epoch summaries, caps repeats, and computes diminishing returns.

### 23.5 `attestation-signer`

Builds EIP-712 payloads and signs them with the configured oracle key.

### 23.6 `submitter`

Submits accepted attestations on-chain and retries safely using idempotent epoch IDs/digests.

### 23.7 `life-keeper`

Finds creatures whose public `lifeTick` cooldown has elapsed and invokes ticks.

### 23.8 `indexer`

Consumes Merzavtsy contract events into a local database or append-only store for profiles, timelines, social graph, and debugging.

MVP may use SQLite for local deployment simplicity; PostgreSQL is the production migration path.

## 24. Data flow

### Birth

1. User calls `Merzavets.birth()`.
2. Identity mints locked token and records birth metadata.
3. World initializes deterministic creature state.
4. `Born` and initialization events are emitted.
5. Daemon registry/indexer learns the wallet/token mapping.

### Wallet activity

1. Registered owner performs normal Ethereum transaction outside Merzavtsy.
2. Watcher observes finalized block.
3. Classifier maps transaction into normalized categories.
4. Aggregator folds activity into wallet epoch.
5. Signer signs EIP-712 activity attestation.
6. Submitter calls oracle contract.
7. Oracle validates signer, ownership, replay guards, bounds, and chain binding.
8. World applies bounded deltas and counters.
9. World checks level, hibernation, mutation and stage transitions.
10. Structured events are emitted and indexed.

### Social encounter

1. Watcher sees direct contact between two registered owners, or a game social action occurs.
2. Directional relationship outcome is derived from bounded rules.
3. Actor and target records are updated separately.
4. Interaction counters/cooldowns update.
5. Significant relationship transitions emit events.

### Autonomous life

1. Keeper or public caller invokes `lifeTick(tokenId)` after cooldown.
2. World deterministically selects one of six intents.
3. State and optional relationship update.
4. Structured `LIFE_ACTION` event emits.

## 25. Randomness

No economically valuable randomness is required in MVP.

Birth genome and autonomous intents may use deterministic pseudo-random mixing of chain/account state because users cannot win transferable financial value from rerolling.

Where manipulation would materially harm biography quality, include immutable genome seed, prior state, coarse time/block buckets, and token ID so one current block value is not the sole input.

## 26. Abuse resistance

### 26.1 Transaction spam

Mitigations:

- epoch aggregation;
- category caps;
- diminishing returns;
- unique-counterparty/contract diversity metrics;
- repeated-destination saturation;
- minimum meaningful value/gas thresholds where appropriate;
- chronological age gates for lifecycle.

### 26.2 Oracle compromise

Mitigations:

- oracle cannot transfer assets;
- per-attestation caps;
- signer rotation;
- pausability of ingestion;
- replay guards;
- public signed payloads/auditable event log.

Future versions can use multi-signer attestations.

### 26.3 Keeper spam

`lifeTick` enforces on-chain cooldowns, so arbitrary callers cannot accelerate autonomous evolution.

### 26.4 Sybil accounts

MVP does not attempt to solve identity uniqueness beyond one creature per Ethereum account. Creating many accounts may create many creatures, but age/history/relationship depth cannot be instantly forged without sustained activity.

### 26.5 Wash relationships

Repeated pair interactions saturate within epochs/cooldowns and do not scale linearly.

## 27. Administration and governance

Admin capabilities are intentionally narrow:

- manage authorized oracle signer(s);
- pause oracle ingestion in emergencies;
- configure world/oracle wiring during deployment;
- optionally adjust bounded operational parameters within hard-coded safe maxima if implementation includes configurable values.

Admin cannot transfer users’ creatures, burn them arbitrarily, withdraw user assets, or edit arbitrary biography values.

## 28. Metadata and visual layer

MVP metadata can be dynamic and derived off-chain:

- contract exposes canonical numeric/profile data;
- an indexer/API composes metadata JSON;
- visual renderer maps genome, mutations, scars, stage, mood and archetype into traits.

Visual traits can map mutations, scars, stage, mood, and archetype into body parts, textures, accessories, and expressions.

## 29. CLI / operator UX for MVP

The deployable repository should include CLI commands/scripts for:

- deploy contracts;
- birth a creature;
- show creature state;
- show relationship;
- manually build/sign a test activity attestation;
- submit attestation;
- run watcher;
- run keeper/daemon;
- inspect deployment addresses.

## 30. Repository layout

Target structure:

```text
merzavtsy/
  contracts/
    Merzavets.sol
    MerzavetsWorld.sol
    ActivityOracle.sol
    libraries/
      MutationRules.sol
      MerzavetsMath.sol
  test/
    Merzavets.t.sol or hardhat equivalents
    MerzavetsWorld.*
    ActivityOracle.*
    integration.*
  scripts/
    deploy.*
    birth.*
    show-state.*
  daemon/
    src/
      registry.ts
      watcher.ts
      classifier.ts
      aggregator.ts
      signer.ts
      submitter.ts
      keeper.ts
      indexer.ts
      config.ts
    test/
    Dockerfile
  docs/
    CONCEPT.md
    ARCHITECTURE.md
    superpowers/specs/
  .env.example
  docker-compose.yml
  README.md
```

The exact test extension depends on the selected Solidity toolchain in implementation planning.

## 31. Testing strategy

### 31.1 Contract unit tests

Must cover:

- exactly one creature per address;
- transfer always fails;
- birth state deterministic/bounded;
- unauthorized activity signature fails;
- expired attestation fails;
- replay fails;
- wrong chain/domain fails;
- wrong token-owner pair fails;
- delta cap violation fails;
- XP/level progression boundaries;
- hibernation and awakening;
- mutation one-time unlock;
- relationship clamping;
- lifeTick cooldown;
- autonomous intent cannot create unbounded state changes.

### 31.2 Fuzz/property tests

Properties:

- every bounded stat remains in range;
- XP never decreases unless explicitly designed otherwise;
- token ownership never changes after birth;
- a consumed activity digest cannot be consumed again;
- relationship values never overflow;
- repeated ticks before cooldown cannot change state;
- no oracle payload can transfer ETH/tokens from a user.

### 31.3 Daemon tests

Fixtures for:

- plain ETH transfer;
- contract call;
- deployment;
- repeated destination;
- registered-peer transfer;
- epoch rollover;
- crash/restart idempotency;
- reorg/finality handling;
- duplicate block observation;
- signer and submitter retry behavior.

### 31.4 Integration test

Local chain flow:

1. deploy contracts;
2. birth A and B;
3. perform test transactions;
4. watcher classifies;
5. signer creates attestation;
6. attestation accepted;
7. world stats update;
8. relationship A/B changes;
9. lifeTick produces structured event.

## 32. Ethereum finality / reorg policy

The watcher must not attest activity immediately from the chain tip.

It waits a configurable finality depth before closing an epoch. On local/test environments the depth may be low; production Ethereum uses a safer confirmation/finality policy.

Once an epoch is attested, its block range is immutable from the game’s perspective. Operational monitoring should alert on exceptional deep reorgs instead of silently rewriting biography.

## 33. Observability

Daemon logs must include:

- chain/block progress;
- registered wallet count;
- epoch opened/closed;
- activities classified;
- attestations signed;
- transaction hashes submitted;
- replay/idempotency skips;
- failed RPC requests;
- reorg detection;
- keeper tick results.

No private keys or complete secret values may be logged.

## 34. Secrets and deployment safety

Configuration via environment variables:

- RPC URL;
- deployer key;
- oracle signer key;
- contract addresses;
- chain ID;
- confirmation depth;
- database path/URL.

`.env` is gitignored. `.env.example` contains only placeholders.

Mainnet deployment script must print chain ID, deployer address, current balance, and require an explicit mainnet flag/confirmation variable to avoid accidental deployment.

## 35. Deployment targets

Required:

- local development chain;
- Sepolia testnet;
- Ethereum mainnet configuration.

The README must recommend proving the system on local + Sepolia before mainnet.

## 36. MVP content set

The first complete code implementation should include approximately:

- 8 genome/personality axes;
- 5 temporary needs/state axes actually used in formulas;
- 5 lifecycle stages;
- 10 normalized activity categories;
- 8–12 mutations;
- 6 autonomous intents;
- 6 relationship dimensions;
- 10–15 significant event kinds;
- 1 hibernation path;
- deterministic level curve;
- one oracle signer with rotation/admin support;
- one watcher daemon;
- one local index store;
- CLI scripts;
- full tests.

## 37. Explicit non-goals for MVP

The following are not required for the first deployable release:

- token economics;
- marketplace;
- custody or wallets holding assets for users;
- combat economy;
- on-chain LLM output;
- breeding;
- pack governance;
- territory ownership;
- bridge/protocol semantic registry;
- ZK proof system;
- decentralized oracle quorum;
- upgradeable proxies;
- polished consumer web UI.

## 38. Post-MVP roadmap

### Phase 2 — Social intelligence

- structured gossip;
- relationship decay/retention from memory bias;
- grudges and favors;
- relationship-derived mutations;
- dialogue renderer.

### Phase 3 — Places

- protocol contracts as locations;
- familiar places;
- territory affinity;
- co-occurrence-based meetings.

### Phase 4 — Packs

- cluster discovery;
- emergent pack names;
- pack reputation;
- rivalries and migrations.

### Phase 5 — Genealogy

- consensual breeding;
- inherited genomes;
- ancestry graph;
- rare inherited mutation combinations.

### Phase 6 — Decentralized observation

- multi-signer oracle;
- signed open activity feeds;
- challenge/audit tools;
- selective proof systems where cost/benefit warrants them.

## 39. Product tone

Merzavtsy should be weird, dirty, funny, and affectionate rather than generic fantasy RPG prose.

The comedy should come from state and biography rather than random disconnected jokes.

## 40. Acceptance criteria for implementation

The repository is considered a deployable MVP only when all of the following are true:

1. Clean install succeeds from lockfile.
2. Contracts compile.
3. Contract unit/property tests pass.
4. Daemon tests pass.
5. Local integration flow passes end-to-end.
6. Two local accounts can birth locked creatures.
7. A synthetic or local-chain wallet activity is observed and converted to a valid signed attestation.
8. Replay of the same attestation reverts.
9. Accepted activity changes XP/personality within caps.
10. Activity between two registered owners changes creature relationship state.
11. Hibernation/awakening can be demonstrated under test time manipulation.
12. At least one mutation can be unlocked by deterministic test conditions.
13. A `lifeTick` produces a deterministic bounded autonomous action.
14. README contains local, Sepolia, and guarded mainnet deployment instructions.
15. No source file contains real private keys or secrets.

## 41. Architecture decision summary

The chosen architecture is:

- Ethereum as canonical identity and gameplay state;
- one locked account-bound ERC-721-compatible creature per account;
- hybrid off-chain watcher + EIP-712 activity oracle;
- bounded on-chain application of activity deltas;
- deterministic autonomous life simulation;
- directional social relationships;
- structured on-chain biography events;
- off-chain indexing and narrative rendering;
- no financialized mechanics in MVP;
- no proxy upgrades in MVP;
- extensibility reserved for gossip, places, packs, breeding, and decentralized observation.

This is the smallest architecture that preserves the original product idea: **the creature genuinely grows out of the life of an ordinary Ethereum address instead of requiring the owner to perform all meaningful activity through a proprietary game contract.**
