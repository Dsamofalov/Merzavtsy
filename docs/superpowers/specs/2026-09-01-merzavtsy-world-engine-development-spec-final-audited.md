# Merzavtsy — полное техническое задание на разработку World Engine

**Дата:** 2026-09-01  
**Статус:** основной самостоятельный технический spec для разработки продукта

---

## 0. Назначение документа

Этот документ является самодостаточным источником требований для разработки Merzavtsy World Engine и продукта вокруг него.

Разработчик должен иметь возможность реализовать систему по этому spec без самостоятельного выбора базовой архитектуры. Допускаются локальные инженерные решения внутри описанных границ. Если обнаруживается техническая невозможность, конфликт требований или необходимость изменить архитектурный инвариант, разработчик обязан сначала зафиксировать проблему отдельным design note/issue и получить решение, а не молча заменять описанную архитектуру.

Ключевая цель продукта — создать **детерминированную симуляцию искусственного общества**, в которой сложное поведение, технологии, экономика, культура, объединения и преобразование мира возникают из небольшого набора универсальных законов, примитивов и взаимодействий, а не из каталога заранее написанных сценариев.

Текущая версия:

- не использует LLM в канонической логике;
- начинает с полностью графового мира;
- должна позволять позднее перейти к hybrid-модели `graph + spatial chunks/cells`;
- должна позволять позднее подключить LLM как non-canonical слой языка, рефлексии и нарратива;
- должна позволять позднее подключить blockchain/Ethereum как внешний источник подтверждённых воздействий на состояние;
- должна позволять добавлять новые состояния, сущности, материалы, отношения, действия и большие общественные подсистемы без переписывания ядра World Engine;
- product-v1 мир стартует из детерминированной Genesis population ровно из 1000 мерзавцев;
- после Genesis новые мерзавцы появляются через правила самого мира, а не через автоматический random spawn;
- для разработки и тестов WorldRunner поддерживает pause/`1x`/`10x`/`100x` без изменения законов симуляции.

Основной архитектурный критерий: **новое понятие мира не должно автоматически означать изменение world-core**.

---

# 1. Продуктовая концепция

## 1.1. Основной тезис

Merzavtsy — постоянно живущий искусственный мир, состоящий из автономных существ, ресурсов, предметов, мест, отношений, знаний, технологий, культурных представлений и социальных структур.

Система должна создавать ощущение, что разработчик определил **законы мира**, а не написал его историю.

Высокоуровневые явления не должны существовать в engine как сюжетные команды:

- не должно быть `FOUND_CITY`;
- не должно быть `CREATE_RELIGION`;
- не должно быть `INVENT_SPEAR`;
- не должно быть `BECOME_DICTATOR`;
- не должно быть `START_WAR_FOR_FOOD`;
- не должно быть `CREATE_MARKET`;
- не должно быть `FORM_STATE` как фундаментального primitive action.

Вместо этого высокоуровневые явления возникают из универсальных механизмов.

Пример:

```text
дефицит пищи
→ рост субъективной ценности еды
→ изменение стратегий добычи/обмена
→ рост конфликтов
→ повторяющаяся кооперация группы
→ общий ресурсный пул
→ нормы распределения
→ лидерство/санкции
→ устойчивое коллективное образование
```

Ни один этап этой цепочки не должен требовать заранее написанного сценария «создать общество из-за голода».

## 1.2. Целевое ощущение

Пользователь может не открывать проект несколько дней и после возвращения обнаружить, что:

- конкретные мерзавчики изменили отношения;
- появились новые стратегии поведения;
- часть стратегий распространилась через имитацию;
- появились и исчезли объединения;
- кто-то обнаружил новый полезный способ обработки материала;
- технология была скопирована, украдена, улучшена или забыта;
- изменились торговые потоки;
- возник устойчивый маршрут;
- инфраструктура изменила доступность ресурсов;
- ложное убеждение распространилось по группе;
- норма укрепилась или исчезла;
- возник конфликт из-за ресурса, статуса, страха или обязательств;
- последствия конфликта изменили последующую историю;
- одинаковые по стартовым правилам, но разные по seed сообщества пошли по разным траекториям.

История должна быть следствием симуляции, а не выбором строки из пула событий.

## 1.3. Детерминированность

Для одинаковых:

- `engine_protocol_version`;
- набора и версий доменных модулей;
- набора и хэшей content packs;
- `world_seed`;
- genesis-конфигурации;
- последовательности canonical external inputs;
- целевого `WorldTime`;

результат должен быть **бит-в-бит одинаковым** на всех поддерживаемых машинах.

Практическая непредсказуемость достигается не недетерминированностью, а:

- большим causal graph;
- локальной информацией агентов;
- ограниченной памятью;
- ошибочными beliefs;
- детерминированной exploration;
- обучением на результатах;
- имитацией;
- культурной передачей;
- изменением среды;
- экономическими feedback loops;
- технологическими мутациями;
- социальными feedback loops.

## 1.4. Что не входит в текущую фазу

Не требуется:

- LLM;
- генеративная речь нейросетью;
- настоящий particle physics simulator;
- Navier–Stokes;
- полноценный 3D-мир;
- клеточная карта как primary topology;
- on-chain канонический world state;
- production-чтение Ethereum-транзакций;
- project token;
- marketplace;
- staking/yield;
- NFT-экономика;
- платные stat boosts;
- gambling mechanics.

---

# 2. Неподвижные архитектурные принципы

## 2.1. World Engine — единственный автор канонического состояния

Канонические изменения проходят только через один deterministic command/reducer path.

API, frontend, admin tools, cron, future blockchain adapter, import tools и другие интеграции не имеют права напрямую менять канонические таблицы или component stores.

Любое изменение должно стать типизированной командой и пройти:

```text
source
→ normalized input / internal intent
→ typed WorldCommand
→ validation
→ deterministic reducer
→ atomic canonical commit
→ derived notifications/read models
```

## 2.2. Один канонический writer

Первая версия использует один логический canonical writer.

Допускается многопоточность для:

- HTTP;
- read API;
- snapshot compression;
- сериализации;
- read-model rebuild;
- чистых предварительных расчётов;
- metrics;
- frontend transport.

Запрещён параллельный mutation канонического состояния, способный менять порядок событий.

## 2.3. Integer/fixed-point only

В канонической логике запрещены `f32`/`f64`, если результат влияет на state, branching, ordering или hash.

Нормализованные параметры используют fixed-point integer типы. Default scale: `0..=10_000`.

## 2.4. Engine не читает wall clock

Domain engine работает только с `WorldTime`.

Системное время читает `WorldRunner`, который определяет target time и вызывает `advance_to(target)`.

## 2.5. Keyed deterministic randomness

Запрещён один глобальный sequential PRNG, где новый random call сдвигает всё будущее.

Random вычисляется по стабильному scope:

```text
hash(
  world_seed,
  subsystem_id,
  subject_id,
  subject_local_sequence,
  purpose_tag
)
```

Новая read-only функция, API request или логирование не должны менять random outcome.

## 2.6. Никакого произвольного исполняемого кода из мира

Recipes, strategies, memes, norms, organization policies и blueprints являются данными.

Agent не может создать и исполнить:

- JavaScript;
- WASM;
- Lua;
- Python;
- shell;
- native plugin;
- arbitrary bytecode.

Rule interpreters работают только с ограниченным, типизированным набором predicates/effects.

## 2.7. Event-driven simulation

Запрещён глобальный цикл:

```text
for every agent every second -> tick()
```

Использовать:

- scheduled events;
- lazy materialization;
- threshold scheduling;
- jump-to-next-event;
- local graph recalculation;
- analytic time jumps.

## 2.8. Fail closed для неизвестного canonical schema

Если engine при replay/snapshot load встречает неизвестный:

- component type;
- module;
- command/event schema;
- persisted relation schema;

он обязан остановиться с явной ошибкой, а не игнорировать данные.

---

# 3. Расширяемая архитектура мира

## 3.1. Цель расширяемости

Архитектура обязана позволять после запуска продукта добавлять:

- новые состояния мерзавчика;
- новые потребности;
- новые виды отношений;
- новые материалы;
- новые ресурсы;
- новые предметные prototypes;
- новые affordances/capabilities;
- новые primitive actions;
- новые goals;
- новые производственные процессы;
- новые типы collective behavior;
- новые институты;
- локальные сообщества;
- поселения;
- политические образования;
- иные будущие подсистемы,

без переписывания scheduler, canonical commit loop, RNG, snapshot engine, replay engine, storage transaction core и базовой entity model.

## 3.2. Два класса расширений

### 3.2.1. Content extension

Content extension использует уже существующие законы.

Примеры:

- новый материал;
- новый ресурс;
- новый object prototype;
- новая species/resource definition;
- новый набор коэффициентов;
- новый affordance, уже понимаемый generic action provider;
- новый genesis template.

Такие расширения должны по возможности добавляться через versioned content packs/registries без изменения Rust-кода engine core.

### 3.2.2. Rule extension

Rule extension вводит новый causal mechanism.

Примеры:

- локальные сообщества;
- поселения;
- государства/политические объединения;
- эпидемии;
- образование;
- наследственное право;
- новая модель собственности;
- новая форма коллективного принятия решений.

Rule extension реализуется отдельным compile-time domain module с собственными:

- components;
- commands;
- validators;
- reducers;
- scheduled handlers;
- action/goal providers;
- derived projections;
- migrations;
- tests.

## 3.3. Entity + Components вместо giant state struct

Запрещено строить мир вокруг одного постоянно растущего `MerzavetsState` или `WorldState`, в который добавляется каждое новое поле.

Базовая модель:

```text
EntityId
  ├─ IdentityComponent
  ├─ AgentCoreComponent
  ├─ GenomeComponent
  ├─ TraitComponent
  ├─ NeedComponent(s)
  ├─ InventoryComponent
  ├─ SocialComponent
  ├─ MemoryComponent
  ├─ KnowledgeComponent
  └─ future module components
```

Не требуется использовать стороннюю ECS-библиотеку. Допустим собственный typed component store.

Критерий: добавление нового состояния не должно требовать добавления поля в десятки общих DTO/structs.

## 3.4. Stable type identifiers

Persisted type identity должна быть explicit и version-stable.

Создать newtypes/IDs минимум для:

- `EntityId`;
- `AgentId` или typed view над EntityId;
- `PlaceId`;
- `RouteId`;
- `ObjectId`;
- `PartId`;
- `StructureId`;
- `EventId`;
- `ScheduleId`;
- `ModuleId`;
- `ComponentTypeId`;
- `CommandTypeId`;
- `EventTypeId`;
- `ActionTypeId`;
- `GoalTypeId`;
- `CapabilityId`;
- `RelationTypeId`;
- `MaterialTypeId`;
- `ResourceTypeId`;
- `NeedTypeId`;
- `BeliefTypeId`;
- `ContentPackId`;
- `SchemaVersion`.

Запрещено использовать порядковый номер enum как persisted identity, если добавление элемента способно изменить существующие значения.

## 3.5. ComponentRegistry

Composition root обязан создавать `ComponentRegistry`.

Registry должен:

1. регистрировать canonical component type;
2. запрещать collision IDs;
3. хранить owner module;
4. хранить schema version;
5. знать canonical serialization codec;
6. знать migration path;
7. предоставлять metadata snapshot/replay;
8. предоставлять descriptors read-model/debug слоям;
9. fail closed при неизвестном persisted component.

## 3.6. ModuleRegistry

Rule extensions подключаются через `ModuleRegistry`.

Концептуальный contract:

```text
WorldModule
  module_id()
  module_version()
  register_components()
  register_commands()
  register_events()
  register_scheduled_handlers()
  register_action_providers()
  register_goal_providers()
  register_validators()
  register_derived_views()
  register_migrations()
```

Конкретный Rust API может отличаться, но semantics обязательна.

Первая версия использует compile-time modules. Runtime loading неизвестных `.so`/WASM/plugins запрещён.

Порядок регистрации модулей не должен влиять на outcome.

## 3.7. Capability-based design

Planner и action framework не должны зависеть от большого числа item-name checks.

Сущности/объекты экспонируют capabilities, например:

```text
EDIBLE
PORTABLE
CONTAINER
CUTTING_EDGE
PIERCING_POINT
HEAT_SOURCE
COMBUSTIBLE
LOAD_BEARING
SHELTER
TRADEABLE
OWNABLE
COMMUNICATIVE
CAN_JOIN_COLLECTIVE
CAN_HOLD_RESOURCE_POOL
```

Action provider ищет объект по capability и constraints, а не по названию `APPLE`, `SPEAR`, `HOUSE`.

## 3.8. Prototype и ContentPack registry

Базовые материалы, ресурсы и object prototypes описываются versioned content packs.

Prototype содержит:

- stable prototype ID;
- initial components;
- capabilities;
- physical/material constraints;
- affordances;
- optional presentation metadata.

Canonical identity мира фиксирует:

- content pack IDs;
- versions;
- hashes;
- dependency hashes.

Изменение content pack без смены version/hash запрещено.

## 3.9. Domain modules не импортируются world-core

Dependency direction:

```text
domain modules
      ↓
stable engine interfaces
      ↓
world-core
```

`world-core` не должен знать о религии, государстве, поселении, школе, эпидемии и других высокоуровневых понятиях.

## 3.10. Generic graph substrate

Graph core хранит узлы, связи и generic component associations.

Он не должен иметь неизменяемый high-level enum:

```text
HOUSE
CITY
CHURCH
STATE
```

Высокоуровневые классификации создаются модулями и read-model analysis.

## 3.11. Новое состояние мерзавчика

Добавление нового canonical состояния должно сводиться к:

1. определить owning module;
2. создать новый component или versioned расширение module-owned component;
3. назначить explicit stable ID;
4. определить deterministic default для существующих entities;
5. определить migration при необходимости;
6. зарегистрировать component;
7. зарегистрировать typed commands, способные его менять;
8. написать validators/reducers;
9. добавить read projection;
10. добавить tests.

Не должно требоваться менять:

- scheduler internals;
- event queue;
- replay algorithm;
- snapshot framework;
- generic entity representation;
- HTTP transport core.

## 3.12. Canonical vs derived state

Перед добавлением нового состояния разработчик обязан определить его класс:

1. canonical persisted;
2. scheduled/transient canonical;
3. deterministic derived;
4. read-model/cache only.

Если значение можно однозначно вывести из canonical state, предпочтительно не хранить его канонически.

Например `"это поселение"` может быть derived classification, а не persisted boolean.

## 3.13. Extensible needs

Need storage должен поддерживать `NeedTypeId`.

Need definition задаёт:

- bounds;
- initial value;
- lazy time function;
- utility pressure;
- threshold events;
- visibility;
- owner module.

Это позволяет позднее добавить, например, ideological belonging или territorial security без изменения scheduler.

## 3.14. Extensible relations

Social/collective graph должен поддерживать versioned relation types.

Возможные relation components:

- affinity;
- trust;
- fear;
- kinship;
- debt;
- obligation;
- mentorship;
- authority;
- membership;
- ideological affinity;
- citizenship;
- vassalage.

Не все перечисленные relations реализуются в v1. Storage boundary обязан их допускать.

## 3.15. ActionProvider registry

Центральный planner не должен содержать огромный `match` по всем будущим action types.

Каждый domain module может зарегистрировать `ActionProvider`.

Planner:

1. собирает providers в стабильном порядке;
2. запрашивает local candidates;
3. объединяет и стабильно сортирует candidates;
4. применяет budget;
5. оценивает utility/cost/risk;
6. выбирает action/plan;
7. отправляет typed command.

## 3.16. GoalProvider registry

Аналогично goals предоставляются providers.

Будущий community module должен иметь возможность добавить goals вроде:

- protect_collective;
- improve_collective_resources;
- preserve_shared_norm;

без изменения agent core.

## 3.17. Generic CollectiveEntity

Необходимо реализовать фундаментальный `CollectiveEntity` substrate, не привязанный к конкретному смыслу группы.

Collective может иметь:

- stable EntityId;
- members;
- membership relations;
- roles;
- shared resource pool;
- shared knowledge refs;
- shared norms/memes;
- internal relationship graph;
- external relationships;
- optional anchor to world graph;
- decision policy component;
- claim/control/influence relations;
- lifecycle state.

`CollectiveEntity` не означает автоматически клан, религию, поселение или государство.

## 3.18. Future community module

Архитектура должна позволять позднее добавить `communities` module, который обнаруживает устойчивые social clusters и при выполнении rules materializes persistent `CollectiveEntity`.

Возможные будущие inputs:

- стабильное ядро взаимодействий;
- shared place usage;
- shared resources;
- common norms;
- duration;
- kinship/social density.

Сейчас конкретный formation algorithm не требуется.

## 3.19. Future settlement module

`settlements` module должен в будущем иметь возможность связывать collective с subgraph мира и инфраструктурой.

Нужные generic concepts должны быть доступны заранее:

- usage relation;
- claim relation;
- influence relation;
- control relation;
- access relation;
- shared infrastructure refs;
- population aggregation;
- persistent place anchoring.

`Location/Place` не должен предполагать одного владельца или один фиксированный политический смысл.

## 3.20. Future polity/state module

Архитектура должна позволять создать module, в котором:

```text
individuals
→ local community
→ settlement
→ union of settlements
→ polity
```

Для этого:

- collective может быть member другого collective;
- collective может состоять из collectives;
- relations существуют между collectives;
- resource pool принадлежит collective entity;
- authority/delegation являются typed relations/components;
- rules могут распространяться на nested membership;
- claims/influence не находятся внутри AgentCore.

Это должно позволить позднее реализовать государства, федерации, конфедерации, империи и иные формы без изменения world-core.

## 3.21. Rules/norms as data

Norms и organization policies описываются ограниченными typed rule structures.

Rule может ссылаться на:

- event type;
- component predicate;
- relation predicate;
- threshold;
- predefined typed effect;
- utility modifier;
- sanction/reward declaration.

Arbitrary scripts запрещены.

## 3.22. Schema evolution

Каждый persisted component имеет schema version.

Требуются:

- explicit migrations;
- deterministic migration order;
- migration fixtures;
- migration invariant tests;
- state-hash test после migration.

## 3.23. Snapshot extensibility

Snapshot subsystem не должен периодически переписывать один giant Rust struct целиком.

Использовать **content-addressed chunk store + immutable snapshot manifests + delta snapshots**.

Логически состояние snapshot состоит из versioned sections:

```text
Snapshot State
  world metadata
  engine protocol version
  module manifest
  content manifest
  entity/component sections
  graph sections
  scheduler state
  external-input cursor/dedupe state
  state hash
```

Физически sections разбиваются на стабильные chunks/shards.

Каждый chunk имеет:

- stable section/shard identity;
- schema version;
- hash canonical uncompressed bytes;
- uncompressed length;
- compressed length;
- codec metadata;
- optional checksum compressed payload.

Неизменившийся chunk между snapshot points физически повторно не записывается.

Snapshot manifest ссылается на chunk hashes и/или на parent delta.

Snapshot subsystem должен оставаться module-aware: добавление нового component section не требует изменения snapshot engine core.

## 3.24. Canonical event/command envelopes

Persisted typed envelope обязан содержать минимум:

```text
module_id
schema_version
type_id
sequence/world_time
subject refs
payload
```

Unknown event/command при replay — fail closed.

## 3.25. Extensibility acceptance gates

Расширяемость проверяется **до** наращивания domain complexity, а не после реализации gameplay.

Используются два обязательных gate.

### Gate A — Structural Extensibility

Gate A выполняется сразу после завершения engine/storage/replay/external-input foundation и **до topology/environment/materials/agents и других gameplay-модулей**.

Test-only module обязан добавить:

- новый component;
- новый command;
- новый canonical event;
- новый scheduled handler;
- новый relation type;
- новый derived projection;
- test `ActionProvider`;
- test `GoalProvider`;
- test-only collective entity;
- fake external input effect.

На Gate A требуется доказать:

- component snapshot/restore/replay;
- schema migration;
- stable state hash;
- relation persistence;
- nested entity/collective relation;
- external-input dedupe/replay;
- scheduler handler registration;
- action/goal provider registration через registry;
- отсутствие изменений scheduler core, RNG core, canonical serialization core, storage transaction core, snapshot/replay core и generic Entity representation.

Gate A **не обязан** доказывать, что реальный planner уже умеет использовать новый material/object: planner и symbolic physics ещё не существуют.

### Gate B — Behavioral Extensibility

Gate B выполняется после минимальных:

- topology;
- materials;
- objects/affordances;
- primitive action framework;
- agent/needs;
- goals;
- planner;

и **до society gameplay-модулей**.

Gate B обязан доказать:

1. content-only pack добавляет material + object prototype без изменения planner;
2. новый capability обнаруживается generic affordance query;
3. новый `ActionProvider` даёт planner новый допустимый primitive action без изменения planner source;
4. новый `GoalProvider` даёт agent новый candidate goal без изменения goal selector source;
5. новый component из extension module участвует в decision context только через объявленный interface;
6. одинаковый seed/inputs дают одинаковый hash с extension module на поддерживаемых платформах.

Только после Gate B разрешается переходить к memory/social/culture/economy/technology/organizations и другим сложным gameplay-модулям.

---

# 4. Выбранный технологический стек

## 4.1. Канонический World Engine

Использовать **Rust stable**.

Причины:

- predictable memory use;
- высокая CPU-производительность;
- strong typing;
- удобные typed domain boundaries;
- отсутствие GC pauses;
- возможность экспортировать чистые части в WASM;
- property testing/benchmarking.

## 4.2. Web/API

Backend API: Rust + `axum` + `tokio`.

Mutation endpoint отправляет command в canonical writer queue и не меняет storage напрямую.

## 4.3. Persistence

Первая production-реализация:

- SQLite;
- WAL;
- `sqlx`;
- versioned migrations;
- content-addressed snapshot chunk store;
- immutable base/delta snapshot manifests;
- Zstd-compressed chunk payloads;
- read models в SQLite.

SQLite хранит metadata, manifests, indexes, pins и operational journal.

Крупные snapshot chunks хранятся отдельными файлами на persistent volume:

```text
data/
  world.sqlite
  snapshots/
    chunks/
      <blake3>.zst
    staging/
```

Причина: один canonical writer естественно соответствует SQLite, а content-addressed chunks не дублируют неизменившиеся части мира между snapshot points.

Storage boundary должен позволять позднее заменить metadata DB или object/blob store без изменения domain logic и snapshot semantics.

## 4.4. Frontend

- Next.js;
- React;
- TypeScript;
- WebGL graph renderer через Sigma.js или эквивалент;
- REST;
- SSE/WebSocket для live derived feed.

Frontend никогда не является источником canonical truth.

## 4.5. Тестирование

Rust:

- built-in tests;
- `proptest`;
- `criterion`;
- snapshot/golden tests;
- deterministic scenario tests.

Frontend:

- unit/component tests;
- Playwright.

## 4.6. Ops

- Docker;
- Docker Compose;
- persistent volumes;
- JSON structured logs;
- Prometheus-compatible metrics;
- health/readiness endpoints.

---

# 5. Структура репозитория

Рекомендуемая структура:

```text
/
├─ Cargo.toml
├─ rust-toolchain.toml
├─ crates/
│  ├─ world-core/
│  ├─ world-model/
│  ├─ component-registry/
│  ├─ module-registry/
│  ├─ scheduler/
│  ├─ topology/
│  ├─ physics/
│  ├─ objects/
│  ├─ content/
│  ├─ persistence/
│  ├─ replay/
│  ├─ external-input/
│  ├─ api-types/
│  └─ modules/
│     ├─ agents/
│     ├─ needs/
│     ├─ cognition/
│     ├─ memory/
│     ├─ social/
│     ├─ economy/
│     ├─ technology/
│     ├─ culture/
│     ├─ collectives/
│     ├─ institutions/
│     └─ narrative/
├─ apps/
│  ├─ worldd/
│  └─ simctl/
├─ web/
├─ migrations/
├─ content/
├─ scenarios/
├─ benches/
├─ docs/
│  ├─ architecture/
│  ├─ operations/
│  └─ superpowers/specs/
└─ compose.yaml
```

Точное количество crates может быть оптимизировано, но обязательны границы ответственности и отсутствие cyclic domain dependencies.

`world-core` не импортирует high-level modules.

---

# 6. Канонические идентификаторы и контейнеры

## 6.1. EntityId как фундамент

Любая долгоживущая сущность имеет стабильный `EntityId(u64)`.

Typed IDs могут быть newtype-обёртками или validated refs:

- `AgentId`;
- `PlaceId`;
- `ObjectId`;
- `CollectiveId`;
- и т.д.

## 6.2. ID allocation

IDs выдаются монотонно.

Удалённые IDs не переиспользуются.

UUID не используется как canonical ordering key.

## 6.3. StableArena

Для dense entity stores реализовать `StableArena<T>`:

- `Vec<Option<T>>` или эквивалент;
- tombstone;
- monotonic allocation;
- ascending iteration.

## 6.4. Component stores

Components хранятся в typed stores по `ComponentTypeId` и `EntityId`.

Запрещено canonical iteration по unordered map без stable sort.

---

# 7. Детерминированная математика и random

## 7.1. Fixed-point types

Минимум:

- `NormU16 = 0..=10000`;
- `NormI16 = -10000..=10000`;
- explicit saturating/clamp operations.

## 7.2. Random API

Создать:

```text
random_u64(scope)
random_range(scope, max_exclusive)
chance(scope, probability_0_10000)
weighted_choice(scope, candidates)
```

Candidates всегда имеют stable tie-break ID.

## 7.3. HashMap restriction

`HashMap` допускается для non-canonical caches, если iteration order не влияет на state.

В canonical paths требуется sorted iteration или ordered storage.

## 7.4. Cross-platform golden

CI Linux + Windows считает один fixture. State hash должен совпадать.

---

# 8. WorldTime и Scheduler

## 8.1. WorldTime

`WorldTime(u64)` измеряет целые simulation seconds.

## 8.2. ScheduledEvent ordering

Строгий порядок:

1. `scheduled_at`;
2. `priority`;
3. `subject_id`;
4. `schedule_id`.

## 8.3. Event handler registry

Scheduled event содержит stable handler type ID/module ID и typed payload.

Новый module может зарегистрировать handler без изменения scheduler internals.

## 8.4. Jump scheduling

Engine прыгает к следующему событию, а не тикает пустое время.

## 8.5. Lazy continuous state

Для hunger, energy, decay, growth и других непрерывных величин хранить:

- base value;
- last materialized time;
- deterministic curve/rate parameters.

## 8.6. Catch-up

После downtime:

1. load snapshot;
2. validate module/content manifest;
3. replay canonical inputs;
4. загрузить persisted `PacingState`;
5. определить target `WorldTime` из последнего world-time anchor, wall-clock anchor и текущего speed factor;
6. `advance_to(target)` без artificial sleeps;
7. не пропускать ни одного state-changing scheduled event;
8. suppress excessive live notifications;
9. после догоняния resume pacing с сохранённым speed factor.

Если CPU не успевает за целевым ускорением, runner не имеет права пропускать события или упрощать симуляцию. Он накапливает `pacing_lag` и обрабатывает мир максимально быстро до восстановления требуемого темпа.

## 8.7. Управляемое ускорение времени v1

Версия 1.0 обязана поддерживать runtime pacing factors:

- `1x` — один world second на одну real second;
- `10x` — десять world seconds на одну real second;
- `100x` — сто world seconds на одну real second.

Также `pause` останавливает продвижение target `WorldTime`, но не удаляет scheduled events.

Ускорение предназначено для разработки, soak-тестов и наблюдения долгосрочной эмерджентности без ожидания реальных дней.

Пример:

```text
3 real days at 1x    = 3 world days
3 real days at 10x   = 30 world days
43.2 real minutes at 100x ≈ 3 world days
```

## 8.8. Speed factor меняет только pacing

`speed_factor` не является множителем физических формул.

Запрещено реализовывать `100x` как:

```text
hunger_delta *= 100
production *= 100
random_events *= 100
```

Правильная модель:

```text
real elapsed time
      × speed factor
          ↓
target WorldTime
          ↓
engine.advance_to(target WorldTime)
```

Все agents, needs, production, scheduler, relationships, physics и random продолжают работать в тех же world-time единицах.

Если один и тот же мир довести до одинакового `WorldTime` при `1x`, `10x` и `100x`, canonical state hash обязан совпасть.

## 8.9. `PacingState`

`WorldRunner` хранит отдельно от domain state:

```text
PacingState {
    speed_factor,
    anchor_real_time,
    anchor_world_time,
    last_observed_real_time,
    pacing_lag
}
```

Допускается более точная структура, но вычисление target time должно использовать integer arithmetic. Floating-point pacing, способный создавать разные rounding outcomes на разных платформах, запрещён.

`PacingState` является operational runtime metadata, а не частью биологии, экономики или другого domain state.

Он не обязан входить в canonical world state hash, но обязан быть durability-safe для корректного restart поведения.

## 8.10. Изменение скорости

При `set-speed` runner обязан:

1. прочитать текущее real time;
2. вычислить target `WorldTime` по старому factor;
3. довести engine до этого target;
4. зафиксировать новый anchor;
5. сохранить новый speed factor;
6. продолжить pacing.

Нельзя просто менять multiplier относительно старого anchor — это создаёт скачок или потерю времени.

Допустимые product-v1 значения: `1`, `10`, `100`.

Другие значения отклоняются validation error, пока policy явно не расширена.

## 8.11. Speed factor и replay

Replay по `genesis + canonical inputs + target WorldTime` не зависит от истории speed changes.

Speed-change history нужна operations/debug слою для объяснения соответствия wall time ↔ world time, но не должна менять решения агентов при одинаковом target `WorldTime`.

Обязательный тест:

```text
same genesis
same canonical inputs
advance to T at 1x   -> H1
advance to T at 10x  -> H2
advance to T at 100x -> H3

assert H1 == H2 == H3
```

## 8.12. Headless accelerated mode

Для ускоренных тестов должен существовать headless режим, в котором отключаются/снижаются:

- UI live rendering;
- лишние live-feed notifications;
- presentation-only read projections с высокой частотой;
- debug trace verbosity.

Нельзя отключать:

- planner;
- physics;
- needs;
- social/economic rules;
- scheduled events;
- canonical mutations;
- deterministic random;
- invariants.

Headless acceleration ускоряет выполнение, а не упрощает законы мира.

## 8.13. Нагрузка при `100x`

`100x` является целевым тестовым режимом, а не разрешением терять корректность.

Для исходного Genesis-world из 1000 агентов reference hardware должен проходить отдельный benchmark/soak accelerated mode.

Если позднее мир вырос настолько, что sustained `100x` недостижим, runner обязан:

- продолжать без пропуска событий;
- показывать фактический effective speed;
- экспортировать pacing lag;
- позволять вернуть `10x` или `1x`.

Корректность всегда приоритетнее nominal speed.

---

# 9. Genesis Protocol: первое поколение мира

## 9.1. Product-v1 Genesis population

Первый production-мир версии 1.0 создаётся с **ровно 1000 Genesis-мерзавцами**.

Это protocol-level правило v1.

Поле `genesis_population` может существовать в config/fixtures, но для product-v1 world initialization validator обязан требовать:

```text
genesis_population == 1000
```

Test-only scenarios могут создавать меньшие synthetic populations, однако такие scenarios обязаны быть явно помечены как test fixtures и не должны приниматься за production genesis.

Будущая protocol version может изменить правило 1000, но существующий мир после Genesis не пересоздаётся.

## 9.2. Первый запуск — явная initialization procedure

Пустой `worldd` не должен молча создавать новый мир.

Первичный запуск состоит из двух шагов:

```text
simctl init-world --config <genesis-config>
worldd
```

`simctl init-world` обязан:

1. проверить, что canonical world ещё не существует;
2. загрузить и validate `engine_protocol_version`;
3. validate module manifest;
4. validate content manifest и hashes;
5. validate genesis config;
6. validate `genesis_population == 1000`;
7. создать deterministic initial topology;
8. создать initial environment/resources/material instances согласно genesis/content rules;
9. создать 1000 Genesis agents;
10. распределить их по допустимым местам;
11. создать initial scheduler entries;
12. вычислить initial canonical state hash;
13. создать immutable Genesis **base snapshot manifest** при `WorldTime = 0` и записать его content-addressed chunks;
14. записать immutable Genesis manifest;
15. atomic commit initialization.

Если любой шаг падает, мир не должен оставаться частично инициализированным.

Повторный `init-world` для уже созданного мира возвращает ошибку и ничего не меняет.

## 9.3. `GenesisManifest`

Genesis identity мира обязана включать минимум:

- `engine_protocol_version`;
- `world_seed`;
- genesis config hash;
- module manifest + versions;
- content manifest + hashes;
- canonical initial population count = 1000;
- initial topology/environment generation parameters;
- initial decision spread parameters;
- initial state hash;
- initialization schema version.

Genesis manifest хранится бессрочно и является частью replay identity мира.

## 9.4. Deterministic создание Genesis-мерзавца

Каждый Genesis agent создаётся только из stable canonical inputs.

Концептуальный random scope:

```text
hash(
  world_seed,
  "GENESIS_AGENT",
  stable_genesis_agent_index,
  property_tag
)
```

Из этого детерминированно выводятся:

- genome;
- personality predispositions;
- bounded trait variation;
- initial body state;
- initial need values;
- initial biological age;
- initial placement candidate weights;
- first-decision offset.

Нельзя использовать OS RNG, current wall time, thread scheduling или unordered iteration.

## 9.5. Origin model

Genesis agents не должны притворяться существами, реально прожившими историю до `WorldTime = 0`.

В `AgentCoreComponent`/lifecycle module необходимо различать происхождение:

```text
AgentOrigin =
    Genesis {
        initial_biological_age
    }
  | WorldBorn {
        birth_world_time,
        parent_refs
    }
```

У Genesis agent может быть ненулевой биологический возраст, но у него нет выдуманного pre-genesis event log.

## 9.6. Возрастное распределение Genesis population

Чтобы общество могло сразу иметь разные lifecycle pressures и не состояло из 1000 существ одного возраста, product-v1 Genesis использует четыре cohorts:

- 150 молодых;
- 600 взрослых;
- 200 старших взрослых;
- 50 старых.

Конкретный `initial_biological_age` внутри cohort определяется keyed deterministic random в пределах lifecycle ranges, заданных canonical species/lifecycle config.

Cohort assignment также детерминирован и не зависит от iteration order.

Если lifecycle ranges позднее меняются protocol migration, старый Genesis не пересэмплируется.

## 9.7. Что Genesis agents умеют изначально

Genesis не должен бесплатно давать цивилизацию.

Допускаются только врождённые/базовые species capabilities, необходимые для запуска поведения:

- perception/observe;
- movement;
- rest;
- consume подходящего ресурса;
- take/place/drop;
- simple avoidance/defense;
- primitive social contact;
- imitation capability;
- structured communication primitives;
- использование базовых affordances, которые species способен непосредственно распознать.

Это innate capability, а не культурная технология.

## 9.8. Что Genesis agents не получают

По умолчанию Genesis agents не получают:

- прошлых episodic memories;
- заранее созданных friendships/rivalries;
- organizations;
- religions;
- settlements;
- states;
- markets;
- learned ProcessRecipes;
- learned ObjectDesigns;
- learned StructureBlueprints;
- learned macro strategies;
- культурные memes;
- ложные beliefs;
- historical reputation;
- искусственно созданный tech tree progress.

Product-v1 default — **нулевое общество без готовой цивилизации**.

## 9.9. Начальные beliefs и perception priors

Разрешены только минимальные species priors, без которых agent не способен выжить или интерпретировать непосредственные affordances.

Например допустимо врождённо различать:

- потенциально edible;
- явно damaging/hazardous;
- переносимый объект;
- доступный route.

Нельзя врождённо знать:

- рецепт керамики;
- металлургию;
- сельское хозяйство;
- государственное управление;
- рыночные правила;
- конкретный технологический design.

## 9.10. Начальные relationships

Между Genesis agents не создаются готовые social relationship edges, кроме связей, прямо необходимых lifecycle model и явно заданных Genesis protocol.

Product-v1 default:

```text
no pre-existing friendship
no pre-existing rivalry
no pre-existing obligation
no pre-existing authority
```

Первые relationships возникают из реальных контактов после `WorldTime = 0`.

## 9.11. Начальное размещение 1000 агентов

Placement выполняется детерминированно по уже созданному place graph.

Алгоритм обязан:

1. выбирать только places, допускающие присутствие agents;
2. учитывать carrying/capacity/environment suitability;
3. не помещать всех agents в один node при наличии множества подходящих областей;
4. использовать stable weighted selection;
5. применять deterministic tie-break;
6. гарантировать, что каждый из 1000 агентов имеет валидный location;
7. не создавать social edges только из факта Genesis placement.

Точная weighting formula является canonical rule и покрывается golden tests.

## 9.12. Staggered first decisions

Чтобы после старта не возникал artificial thundering herd из 1000 одновременных planner calls, первая decision event каждого Genesis agent распределяется по каноническому окну.

Default product-v1:

```text
genesis_initial_decision_spread = 300 world seconds
```

Для agent:

```text
first_decision_at =
    deterministic_random(
        world_seed,
        agent_id,
        "GENESIS_FIRST_DECISION"
    ) % 301
```

Дальнейшее расписание определяется обычными правилами scheduler/agent modules.

Staggering является частью canonical Genesis behavior и одинаково воспроизводится при replay.

## 9.13. Начало истории

После atomic Genesis commit:

```text
WorldTime = 0
Population = 1000
Organizations = 0
Learned technologies = 0
Historical events before Genesis = 0
```

Далее `WorldRunner` начинает продвижение времени.

Первые события должны возникать из:

- needs;
- exploration;
- local resources;
- local hazards;
- social contact;
- imitation;
- experiments;
- movement;
- scarcity;
- personality differences.

Культурная, технологическая и социальная история начинается только после Genesis.

## 9.14. Запрет произвольного production spawn после Genesis

После Genesis запрещён механизм:

```text
if population < target:
    spawn_random_agent()
```

Запрещён и production admin endpoint вида:

```text
POST /spawn-agent
```

для обычной эксплуатации мира.

Новые world-native agents появляются только через действующие lifecycle/reproduction rules мира.

Test harness/scenario builder может создавать synthetic agents в изолированных test worlds, но этот API не должен быть доступен как production canonical mutation.

## 9.15. World-born поколения

Agent, родившийся после Genesis, получает:

```text
AgentOrigin::WorldBorn
```

и имеет:

- actual `birth_world_time`;
- parent refs по правилам reproduction module;
- deterministic biological inheritance;
- bounded mutation;
- отдельное cultural inheritance;
- пустую собственную episodic history на момент рождения.

Genesis agents являются Generation 0.

Их потомки формируют Generation 1+.

## 9.16. Genesis и будущий blockchain binding

Genesis agents не создаются из Ethereum addresses.

`EntityId`/Agent identity остаются blockchain-agnostic.

Позднее `ExternalIdentityLink` сможет связать external identity с существующим agent или lineage по отдельной product policy.

Ни Genesis algorithm, ни reproduction engine не должны зависеть от наличия кошелька.

## 9.17. Genesis replay test

Обязательный golden test:

1. удалить runtime DB;
2. выполнить `init-world` с fixture config/seed;
3. получить Genesis state hash;
4. удалить state;
5. повторить initialization на другой поддерживаемой платформе;
6. assert identical Genesis manifest;
7. assert identical entity/component counts;
8. assert identical placements;
9. assert identical first scheduled decisions;
10. assert identical canonical state hash.

## 9.18. Development Genesis vs Production Genesis Freeze

Механизм Genesis реализуется до большинства society modules, чтобы ранние integration/accelerated tests могли стартовать полноценный мир из 1000 agents.

Однако **production-v1 Genesis manifest/hash нельзя окончательно фиксировать на этом раннем этапе**.

До завершения Production Genesis Freeze разрешён только:

```text
development genesis fixture
```

Он проверяет initialization protocol, deterministic creation, placement, scheduling, base snapshot и pacing.

Production Genesis Freeze выполняется только после завершения всех v1 canonical modules и content packs, включая как минимум:

- lifecycle/demography schema;
- final built-in needs/traits;
- social/culture/economy canonical components;
- structures/technology canonical components;
- collective/organization canonical components;
- final module manifest;
- final content manifest.

На Production Genesis Freeze:

1. фиксируется `engine_protocol_version`;
2. фиксируются module/content manifests;
3. фиксируется production genesis config;
4. выполняется clean initialization 1000 agents;
5. вычисляется production Genesis state hash;
6. golden fixture проверяется Linux/Windows;
7. hash и manifest становятся release evidence.

Добавление нового canonical module после Production Genesis Freeze требует новой protocol version/migration decision и не может молча менять Genesis v1.


---

# 10. Полностью графовая модель мира v1

## 10.1. Place graph

Мир v1 состоит из `PlaceNode` и `RouteEdge`.

Place — абстрактная область, а не hardcoded город/дом.

## 10.2. PlaceNode

Core physical/environment fields:

- id;
- parent place optional;
- scale class;
- environment refs/components;
- capacity;
- occupancy summary;
- resource refs;
- contained entities;
- route refs;
- physical/environment tags.

High-level social labels не входят в topology core.

## 10.3. RouteEdge

Поля:

- from/to;
- directionality;
- length;
- travel cost;
- surface quality;
- capacity;
- hazard;
- maintenance;
- visibility;
- enabled;
- infrastructure refs;
- optional claim/access relation refs.

## 10.4. Graph layers

Разделить:

1. movement/place graph;
2. resource/infrastructure flow graph;
3. social/collective graph;
4. object/part graph.

## 10.5. Derived labels

`Village`, `City`, `MarketDistrict` и аналогичные ярлыки являются derived projections, если соответствующий будущий module не требует materialized collective entity.

---

# 11. Готовность к будущему hybrid world

## 11.1. TopologyBackend

Domain systems работают через interface:

```text
neighbors(place)
travel_cost(a,b,agent)
reachable(origin,budget)
local_environment(place)
create_connection(spec)
modify_connection(id,delta)
create_place(spec)
place_entities(place)
```

## 11.2. No graph internals leakage

Cognition/social/economy/technology modules не импортируют concrete graph storage.

## 11.3. Migration path

Будущий `HybridTopology` должен сохранить macro IDs и high-level APIs, добавив chunks/cells/coordinates как backend detail.

---

# 12. Среда и ресурсы

## 12.1. Environment components

Place environment содержит целочисленные параметры:

- temperature baseline;
- seasonal amplitude;
- moisture;
- fertility;
- water availability;
- shelter exposure;
- hazard;
- biome/resource profile.

## 12.2. Seasons

Season function зависит только от WorldTime/config.

## 12.3. Weather anomalies

Deterministic keyed-random по region/time epoch.

## 12.4. ResourceDeposit

- resource/material type;
- quantity;
- accessibility;
- extraction difficulty;
- renewable flag;
- regeneration model;
- carrying capacity.

## 12.5. Lazy growth/depletion

Не обновлять ресурс каждую секунду.

---

# 13. Символическая физика материалов

## 13.1. MaterialDefinition

Минимальные свойства `0..10000`:

- hardness;
- toughness;
- elasticity;
- density;
- brittleness;
- friction;
- flammability;
- heat resistance;
- thermal conductivity;
- plasticity;
- absorbency;
- corrosion resistance;
- binding affinity.

Также thresholds/material family/origin.

## 13.2. Generic transformations

- heat;
- cool;
- burn;
- dry;
- wet;
- crush;
- grind;
- mix;
- compress;
- shape.

## 13.3. No item-name physics

Нельзя давать физический bonus по имени типа предмета.

---

# 14. Объекты, части и конструкции

## 14.1. ObjectEntity

Object — entity с composition component.

Хранит:

- owner relation optional;
- location/carrier/container relation;
- part refs;
- condition;
- revision;
- derived affordance cache.

## 14.2. Part

- material;
- quantity/mass;
- length/thickness class;
- shape;
- edge/point sharpness;
- condition;
- temperature;
- connector capabilities.

## 14.3. Part relations

Typed connector IDs минимум для:

- FIXED;
- BOUND;
- HINGE;
- AXLE;
- SLIDER;
- ROPE_LINK;
- RESTS_ON;
- SUPPORTS;
- COVERS.

## 14.4. Derived affordances

- graspability;
- carrying capacity;
- container capacity;
- cutting/piercing/impact;
- reach;
- durability;
- insulation;
- shelter contribution;
- structural support;
- rotation/rolling;
- heat retention.

## 14.5. Cache revision

Мутация composition graph invalidates cache.

---

# 15. Content, capabilities и affordances

## 15.1. Content packs

Материалы, базовые resource definitions и prototypes находятся в `content/` и загружаются через versioned registry.

## 15.2. Capability contracts

Capabilities имеют stable IDs и typed parameters при необходимости.

## 15.3. Affordance discovery

Action providers получают affordances из current components/capabilities.

Новый edible prototype автоматически становится candidate для consume action без изменения consume provider.

## 15.4. Content validation

Startup обязан проверить:

- duplicate IDs;
- missing dependencies;
- invalid ranges;
- content hash;
- schema version.

---

# 16. Универсальные primitive actions

Минимальный набор providers/schemas:

- MOVE;
- TAKE;
- PLACE;
- DROP;
- GIVE;
- STORE;
- REMOVE_FROM_CONTAINER;
- CONSUME;
- OBSERVE;
- REST;
- WAIT;
- STRIKE;
- CUT;
- SCRAPE;
- BREAK;
- GRIND;
- SHAPE;
- ATTACH;
- DETACH;
- BIND;
- STACK;
- MIX;
- HEAT;
- COOL;
- BURN;
- DRY;
- WET;
- EXTRACT;
- POUR;
- COMPRESS;
- PUSH;
- PULL;
- ROTATE;
- PLANT;
- HARVEST;
- OFFER;
- ACCEPT;
- REFUSE;
- TRADE;
- BORROW;
- STEAL;
- THREATEN;
- ATTACK;
- DEFEND;
- FLEE;
- HELP;
- FOLLOW;
- TEACH;
- IMITATE;
- GOSSIP;
- JOIN_COLLECTIVE;
- LEAVE_COLLECTIVE;
- CLAIM;
- RELINQUISH_CLAIM.

Каждый action type имеет:

- stable ActionTypeId;
- owner module;
- typed args;
- preconditions;
- candidate generator;
- estimated cost;
- symbolic effects for planner;
- actual command mapping;
- deterministic failure reasons;
- observable outcome;
- memory signal;
- knowledge/skill gates.

Новый module может зарегистрировать action provider без изменения planner core.

---

# 17. Изменение мира существами

## 17.1. Общий принцип

Агенты преобразуют объекты, ресурсы, structures и graph links.

Нет `BUILD_HOUSE` как primitive.

## 17.2. Structure

Structure — composition/part graph, anchored к Place или Route.

Derived свойства:

- shelter;
- storage;
- security;
- workspace;
- heat;
- production capacity;
- route support.

## 17.3. Interior place

При достаточном enclosure/access engine может materialize child PlaceNode как физическое внутреннее пространство.

## 17.4. Roads

Traffic/compaction/surface improvement меняют route cost/quality.

## 17.5. Bridges/tunnels

Infrastructure может enable route. Destruction может disable route.

## 17.6. Water graph

`WaterFlowEdge` с symbolic hydraulic head/capacity/leakage.

Пересчитывать affected connected component.

## 17.7. Cultivation

PLANT создаёт renewable population. Growth зависит от environment/species/harvesting pressure.

---

# 18. Модель мерзавчика через components

## 18.1. AgentCoreComponent

Минимально стабильные core refs:

- entity/agent ID;
- `AgentOrigin`;
- alive/dead lifecycle;
- location relation;
- local decision sequence.

`AgentOrigin` различает минимум:

```text
Genesis { initial_biological_age }
WorldBorn { birth_world_time, parent_refs }
```

Не помещать в AgentCore все будущие состояния.

Genesis agent не должен получать fake `birth_world_time` до нуля или выдуманную pre-genesis biography.

## 18.2. Built-in modules/components

V1 может иметь:

- GenomeComponent;
- TraitComponent;
- NeedsComponent;
- BodyComponent;
- InventoryComponent;
- GoalStateComponent;
- PlanStateComponent;
- MemoryIndexComponent;
- BeliefIndexComponent;
- KnowledgeIndexComponent;
- SocialIndexComponent;
- CollectiveMembershipComponent;
- ValueModelComponent.

## 18.3. External identity

Blockchain/wallet identity не является AgentId.

Использовать отдельный `ExternalIdentityLink` component/module.

---

# 19. Traits и Needs

## 19.1. Built-in personality traits

Стартовый набор `0..10000`:

- aggression;
- curiosity;
- sociability;
- greed;
- stability;
- chaos;
- adaptability;
- memory_bias;
- risk_tolerance;
- empathy;
- conformity;
- dominance;
- patience;
- industriousness;
- novelty_seeking;
- loyalty_bias.

## 19.2. Built-in needs

- energy;
- hunger;
- safety;
- social;
- status;
- novelty;
- comfort;
- attachment/reproduction drive по lifecycle policy.

## 19.3. Need registry

Built-in needs используют тот же NeedTypeId/definition path, что future needs.

## 19.4. Lazy dynamics

Needs материализуются по времени, не тикают каждую секунду.

---

# 20. Goals и Utility System

## 20.1. Built-in goal providers

- restore_need;
- acquire_resource;
- avoid_threat;
- improve_relationship;
- harm_rival;
- increase_status;
- gain_knowledge;
- reduce_uncertainty;
- improve_shelter;
- increase_future_resource_security;
- assist_collective;
- reproduce/attach;
- explore.

## 20.2. Goal collection

На decision event:

1. materialize relevant state;
2. collect local threats/opportunities;
3. collect social obligations;
4. collect active collective rules;
5. collect unfinished goals;
6. query GoalProviders;
7. apply bounded candidate budget;
8. compute integer utility.

## 20.3. Utility factors

- need pressure;
- personality;
- resource benefit;
- social cost/benefit;
- risk;
- familiarity;
- novelty;
- norms;
- relation state;
- time cost;
- uncertainty.

## 20.4. Controlled exploration

Top-K deterministic weighted choice, а не всегда top-1.

---

# 21. Planner

## 21.1. Approach

Bounded GOAP-like planner + learned macro strategies.

## 21.2. Default budgets

- primitive depth <= 6;
- beam width <= 8;
- expansions <= 128;
- bounded local target top-N;
- stable ordering.

## 21.3. Symbolic state

Planner не клонирует весь WorldState.

## 21.4. Strategy first

Проверять learned macros перед search.

## 21.5. Fallback

REST/WAIT/MOVE_TO_SAFE/OBSERVE или module-provided safe fallback.

---

# 22. Обучение без нейросетей

## 22.1. OutcomeRecord

- context features;
- plan/action sequence;
- expected utility;
- actual utility delta;
- resource delta;
- safety delta;
- social delta;
- duration;
- success/failure.

## 22.2. Strategy scoring

Integer EMA/score.

## 22.3. Macro extraction

Успешная повторяющаяся sequence может стать Strategy entity/knowledge.

## 22.4. Mutation

Ограниченные mutations:

- target policy;
- resource/material;
- one primitive replacement;
- insertion/removal;
- threshold;
- local reorder.

## 22.5. Imitation

Передаётся observable abstraction, а не hidden state.

---

# 23. Память

## 23.1. Types

- episodic;
- relationship;
- procedural;
- semantic/belief;
- institutional/cultural.

## 23.2. Episode

- time;
- place;
- participants;
- category;
- observed facts;
- valence;
- importance;
- confidence.

## 23.3. Finite memory

Importance + recency + memory_bias. Consolidation обязательна.

## 23.4. No prose canonical memory

Canonical memory structured only.

---

# 24. Beliefs и ошибочные убеждения

## 24.1. Belief

- proposition type/key;
- subject/object refs;
- confidence;
- evidence counters;
- source;
- last update;
- social origin optional.

## 24.2. Partial knowledge

Agent не видит глобальную истину.

## 24.3. False causality

Повторяющаяся correlation может породить неверный causal belief.

## 24.4. Planner impact

Belief влияет на expected outcome/utility.

---

# 25. Отношения и social graph

## 25.1. Directional relation

A→B != B→A.

V1 dimensions:

- affinity;
- trust;
- fear;
- respect;
- envy;
- rivalry;
- obligation;
- familiarity.

## 25.2. Lazy creation

Relation создаётся после meaningful contact.

## 25.3. Extensible relation storage

Future module может добавлять relation components без изменения generic graph store.

## 25.4. Local candidate selection

No all-pairs scans.

---

# 26. Коммуникация без LLM

## 26.1. SpeechAct

- request;
- offer;
- accept;
- refuse;
- threaten;
- warn;
- praise;
- insult;
- teach;
- gossip;
- promise;
- claim;
- command;
- negotiate.

## 26.2. Structured payload

Typed refs/propositions/actions, не natural-language canonical strings.

## 26.3. Renderer

Pure procedural text renderer.

## 26.4. LLM seam

Future LLM получает SpeechAct и context, но не меняет state напрямую.

---

# 27. Gossip, memes и культура

## 27.1. Gossip payload

- belief;
- opinion;
- event claim;
- strategy rumor;
- technology claim.

## 27.2. Distortion

Deterministic bounded mutation.

## 27.3. CulturalMeme

Категории:

- belief;
- taboo;
- preference;
- norm;
- ritualized procedure;
- strategy;
- symbol association;
- out-group attitude.

## 27.4. Meme lineage

Origin, parent, generation, adoption strength, transmission stats.

---

# 28. Экономика

## 28.1. Ownership as relation/component

Ownership не должен быть hardcoded только в Object struct; нужен generic ownership relation, пригодный также для collectives.

## 28.2. Subjective value

No fixed global price.

Depends on need, scarcity, usefulness, local availability, risk, obligation, remembered trades.

## 28.3. Barter first

Offer bundles.

## 28.4. Market derived

Market — high trade flow pattern, а не mandatory canonical entity.

## 28.5. Scarcity feedback

Consumption/production influence future behavior.

---

# 29. Технологии и изобретения

## 29.1. No full tech tree

Technology emerges from operations + materials + designs + knowledge.

## 29.2. ProcessRecipe

- operation graph/sequence;
- input constraints;
- parameters;
- observed output descriptors;
- success stats;
- discoverer;
- parent lineage;
- creation time.

## 29.3. ObjectDesign

Part graph template + constraints.

## 29.4. StructureBlueprint

Composition, connectors, relative geometry, material constraints, build sequence.

## 29.5. Experiment mutations

Local bounded edits.

## 29.6. Discovery acceptance

Valid physical outcome + utility/novelty + observable result + non-duplicate.

## 29.7. Diffusion

Observation/teaching/trade/imitation/theft/migration/collective knowledge.

## 29.8. Forgetting

Technology may disappear from living knowledge while remaining historical.

---

# 30. Collectives, organizations и future communities/settlements/polities

## 30.1. Generic collective foundation

V1 реализует `CollectiveEntity` substrate и generic Organization behavior поверх него.

Не создавать отдельные foundational classes для Religion/State/Gang/Corporation.

## 30.2. Organization components

V1 может включать:

- membership rules;
- roles;
- leadership selection;
- succession;
- shared resource pool;
- contribution rule;
- redistribution rule;
- punishment rule;
- conflict rule;
- secrecy;
- claims;
- knowledge pool;
- shared memes;
- allies/enemies;
- cohesion.

## 30.3. Emergent formation

Formation only due to motives:

- repeated cooperation;
- shared threat;
- resource coordination;
- kinship/social cluster;
- shared belief;
- specialization.

## 30.4. Policy mutation

Policies can change through module-defined decision rules.

## 30.5. Derived labels

UI can classify a collective as clan/cult/trade league/etc. Label is not canonical authority unless a module explicitly materializes a typed institution component.

## 30.6. Future local communities

Architecture reserve described in section 3 is mandatory. Community support can be added as module without world-core refactor.

## 30.7. Future settlements

Settlement module can bind collective + physical place/infrastructure graph.

## 30.8. Future states/polities

Nested collectives and authority/claim relations must permit multi-settlement political entities.

---

# 31. Демография, наследование и поколения

## 31.1. Birth

После завершения Genesis новые world-native agents появляются только через lifecycle/reproduction rules.

Автоматическое пополнение population до target value запрещено.

Production admin/API не имеет generic `spawn agent` mutation.

## 31.2. Biological inheritance

Deterministic crossover + bounded mutation.

## 31.3. Cultural inheritance

Memes, beliefs, recipes, priors, memberships may transfer independently of genetics.

## 31.4. Death

Dead entity remains historical/tombstoned; ID not reused.

## 31.5. External owner link separate

Future blockchain owner binding не определяет biological identity автоматически.

---

# 32. Процедурная история без LLM

## 32.1. SignificantEvent

Отделить technical actions от historical events.

## 32.2. Significance scoring

- affected entities;
- permanent state change;
- rarity;
- economic impact;
- social threshold;
- collective/technology impact;
- infrastructure impact;
- birth/death;
- causal consequences.

## 32.3. Chronicle

Derived, replayable, template-rendered.

---

# 33. Canonical input log, delta snapshots и persistence model

## 33.1. Replay basis

Replay основывается на:

- engine protocol version;
- module manifest;
- content manifest;
- genesis;
- world seed;
- canonical external/admin inputs.

Внутренние decisions пересчитываются детерминированно.

Snapshot subsystem является ускорителем восстановления, а не единственным источником истины.

## 33.2. Storage classes

### `canonical_inputs`

Неперестраиваемые внешние факты и versioned admin changes.

Хранить бессрочно.

### `derived_history`

Перестраиваемые significant events/read history.

Может быть rebuilt из canonical replay.

### snapshot repository

Состоит из:

- immutable snapshot manifests;
- content-addressed compressed chunks;
- snapshot pins/retention metadata;
- compaction/rebase metadata;
- GC journal.

## 33.3. Genesis base snapshot

Первый snapshot мира — Genesis base snapshot.

Он создаётся один раз при `WorldTime = 0`.

Genesis base snapshot:

- не имеет parent snapshot;
- содержит логически полное состояние мира;
- физически состоит из content-addressed chunks;
- хранится бессрочно;
- никогда не удаляется retention/GC;
- участвует в cross-platform Genesis golden tests.

## 33.4. Delta snapshot

После Genesis обычный snapshot point является **delta snapshot**.

Delta snapshot не содержит полную копию всего мира.

Он содержит manifest с:

- `snapshot_id`;
- `parent_snapshot_id`;
- `world_time`;
- `state_revision`;
- `canonical_input_sequence`;
- engine/module/content manifest hashes;
- resulting canonical state hash;
- changed chunk references;
- removed/tombstoned section/shard references;
- scheduler/external cursor changes;
- delta format/schema version.

Delta snapshot обязан описывать только изменения относительно parent.

Если state revision не изменился, новый delta snapshot не создаётся.

## 33.5. Stable chunking

Дедупликация требует стабильных границ chunks.

Запрещено chunking, при котором вставка одной entity в начале сериализации сдвигает bytes всего последующего мира и уничтожает дедупликацию.

Chunk identity должен определяться логически.

Примеры:

```text
component_type + entity_id_range
graph_type + node_id_range
scheduler_bucket/range
relation_type + source_id_range
object_parts + object_id_range
```

Размер shard/range фиксируется protocol/storage format version.

Допускается adaptive subdivision только если algorithm полностью deterministic и versioned.

## 33.6. Chunk content address

Canonical content hash chunk вычисляется по **uncompressed canonical bytes**.

Default:

```text
chunk_id = BLAKE3(
    snapshot_chunk_domain
    || section_type_id
    || schema_version
    || shard_key
    || canonical_uncompressed_bytes
)
```

Причина: изменение Zstd version/level не должно менять semantic chunk identity.

Для future Ethereum commitment при необходимости вычисляется отдельный Keccak commitment.

## 33.7. Chunk file

Физический chunk payload:

```text
ChunkFile {
  magic
  storage_format_version
  section_type_id
  schema_version
  shard_key
  uncompressed_length
  compression_codec
  compressed_length
  canonical_content_hash
  compressed_payload_checksum
  compressed_payload
}
```

Default codec — Zstd.

При чтении обязательно проверять:

1. header;
2. compressed checksum;
3. decompress success;
4. uncompressed length;
5. canonical content hash.

Любое несоответствие делает chunk corrupt.

## 33.8. Dirty tracking

Canonical mutation path обязан помечать затронутые logical shards/components dirty.

Snapshot writer не должен для каждого snapshot сериализовать весь мир только затем, чтобы сравнить hashes.

Минимально отслеживать dirty state для:

- entity/component shards;
- relation shards;
- topology shards;
- object/part shards;
- scheduler shards;
- external dedupe/cursor section;
- module-owned canonical sections.

Dirty marker — optimization metadata и не влияет на simulation semantics.

После crash его можно безопасно восстановить более консервативным способом.

## 33.9. Создание delta snapshot

Snapshot creation procedure:

1. freeze/read canonical revision boundary без длительной остановки world logic;
2. получить exact `world_time`, revision и input sequence;
3. определить dirty logical shards;
4. canonical serialize каждый dirty shard;
5. вычислить content hash;
6. если chunk с таким hash уже существует — reuse;
7. иначе compress и write chunk в staging;
8. fsync chunk;
9. atomic rename в content-addressed chunk path;
10. сформировать immutable delta manifest;
11. проверить resulting state hash;
12. atomically commit manifest metadata + HEAD pointer;
13. только после commit очистить соответствующие dirty markers.

Crash до пункта 12 может оставить orphan chunks; GC удалит их позднее.

Crash после пункта 12 не должен оставлять manifest, ссылающийся на отсутствующий durable chunk.

## 33.10. Snapshot cadence

Default snapshot point:

- каждые 6 world hours;
- **или** после configurable `N` canonical state changes;
- что наступит раньше.

Snapshot cadence является operational persistence policy и не меняет canonical world outcome.

При `100x` snapshot subsystem не обязан создавать snapshot каждые несколько real minutes синхронно с UI; он создаёт snapshots по world-time/state-change policy и обязан применять backpressure/queueing без потери canonical state.

## 33.11. Delta chain depth

Бесконечная цепочка delta manifests запрещена.

Default:

```text
max_delta_chain_depth = 128
```

Когда chain достигает limit, запускается rebase/compaction.

Также rebase может выполняться по:

- world-time interval;
- accumulated delta bytes;
- restore-cost threshold;
- manual operator command.

## 33.12. Rebase snapshot

Rebase создаёт новый **logical base manifest** для текущего state.

Важно: rebase не обязан физически переписывать всё состояние.

Он:

1. разрешает base + delta chain до текущей полной chunk map;
2. создаёт новый immutable base manifest, который напрямую ссылается на уже существующие content-addressed chunks;
3. записывает только те chunk payloads, которых ещё нет в store;
4. подтверждает тот же canonical state hash;
5. делает новый base точкой для следующих deltas.

Таким образом rebase сокращает restore chain, но не создаёт вторую полную копию неизменившихся данных.

## 33.13. Snapshot manifests immutable

После commit snapshot manifest никогда не редактируется.

Любая compaction/rebase создаёт новый manifest.

HEAD — отдельный mutable pointer на последний committed snapshot.

Это упрощает:

- crash safety;
- audit;
- corruption diagnosis;
- GC;
- future remote replication.

## 33.14. Restore algorithm

Startup restore:

1. выбрать newest valid snapshot manifest, совместимый с installed engine/module/content schemas;
2. найти nearest base ancestor;
3. загрузить base chunk map;
4. проверить все required chunks;
5. последовательно применить delta manifests до выбранного snapshot;
6. materialize canonical in-memory state;
7. вычислить state hash;
8. сравнить с snapshot manifest;
9. replay canonical inputs после snapshot input sequence;
10. продолжить world runner.

При invalid/corrupt latest delta:

- не использовать частично восстановленное состояние;
- откатиться к предыдущему valid retained snapshot;
- replay inputs;
- записать operational incident.

## 33.15. Retention — pins, а не копирование

Retention policy хранит **snapshot manifests/pins**, а не новые физические копии state.

Default:

- Genesis base — forever;
- все 6-hour snapshot points последних 7 world days;
- один daily snapshot point последних 90 world days;
- один weekly snapshot point далее;
- latest valid base/rebase ancestors, необходимые retained deltas;
- operator/manual pins — пока явно не сняты.

Если daily/weekly point уже соответствует существующему delta snapshot, retention просто pin'ит его manifest.

Никакой `copy snapshot to daily folder` не допускается.

## 33.16. Content-addressed deduplication

Один физический chunk хранится один раз независимо от количества manifests, которые на него ссылаются.

Пример:

```text
Base A
 ├─ agent shard #0 -> hash X
 ├─ agent shard #1 -> hash Y
 └─ topology      -> hash Z

Delta B
 └─ agent shard #1 -> hash Q

Rebase C
 ├─ agent shard #0 -> hash X   (reuse)
 ├─ agent shard #1 -> hash Q   (reuse)
 └─ topology      -> hash Z    (reuse)
```

Rebase C физически не создаёт копии X/Q/Z.

## 33.17. Garbage collection

Удаление старого manifest не должно немедленно удалять chunks.

Использовать crash-safe mark-and-sweep GC.

Mark roots:

- Genesis manifest;
- HEAD;
- retained/pinned manifests;
- required ancestor manifests;
- manifests protected during backup/replication;
- in-progress committed compaction roots.

Mark phase проходит все reachable chunk hashes.

Sweep удаляет только unreferenced chunks старше `gc_grace_period`.

Default:

```text
gc_grace_period = 24 real hours
```

Перед production delete обязателен dry-run/report mode.

Reference counting может существовать как optimization, но не является единственным correctness mechanism.

## 33.18. Orphan chunks

Chunk, записанный до manifest commit и оставшийся после crash, считается orphan.

Он:

- не влияет на restore;
- не считается canonical state;
- может быть удалён GC после grace period.

Startup не должен считать наличие неизвестного chunk ошибкой.

## 33.19. Snapshot migration

Schema migration не должна in-place переписывать старые chunks/manifests.

Migration procedure:

1. pin source snapshot;
2. restore source state;
3. deterministic migrate in memory;
4. canonical serialize migrated logical shards;
5. reuse identical chunks where hash/schema allow;
6. write missing chunks;
7. create new migrated base manifest;
8. verify migrated state hash/invariants;
9. сохранить provenance `migrated_from_snapshot_id`.

Старый snapshot остаётся immutable до обычного retention/GC policy.

## 33.20. Backup model

Backup должен различать:

### Critical immutable truth
- DB metadata/manifests;
- canonical inputs;
- Genesis manifest/config;
- content/module manifests.

### Rebuildable acceleration data
- chunk store;
- derived history/read models.

Практический production backup рекомендуется делать как consistent set:

```text
SQLite backup
+ reachable snapshot chunks
+ configuration/content manifests
```

Remote backup может дедуплицировать chunks по content hash.

## 33.21. Snapshot storage budget

Snapshot repository должен расти приблизительно пропорционально объёму **изменённых retained shards**, а не `full_world_size × snapshot_count`.

Для reference workload benchmark обязан публиковать:

- logical snapshot bytes;
- physical chunk-store bytes;
- unique chunk count;
- dedupe ratio;
- average delta bytes;
- p95 delta bytes;
- max delta chain depth;
- rebase duration;
- restore duration;
- GC reclaimed bytes.

Если physical snapshot storage приближается к logical full-copy storage, это считается сигналом неправильного chunking/dirty tracking и требует profiling.

## 33.22. Snapshot format versioning

Отдельно versioned:

- manifest format;
- chunk file format;
- section/component schemas;
- compression metadata.

Compression codec/level не является canonical simulation protocol.

Canonical chunk content hash определяется uncompressed canonical bytes.

## 33.23. Module manifests

Каждый base/delta manifest фиксирует:

- engine protocol version;
- module IDs/versions/schema hashes;
- content manifest hash;
- snapshot storage format versions.

Unknown required module/component/schema при restore — fail closed.

## 33.24. Delta snapshot acceptance tests

Обязательны:

1. unchanged world -> no new snapshot payload;
2. one changed component shard -> один/минимальный набор новых chunks;
3. unchanged chunks reused по hash;
4. base + deltas restore -> exact state hash;
5. rebase -> exact same state hash;
6. rebase physically reuses existing chunks;
7. crash before manifest commit -> orphan chunks safe;
8. crash after manifest commit -> all referenced chunks durable;
9. corrupt latest chunk -> fallback/replay;
10. GC never deletes reachable chunk;
11. GC removes old unreferenced orphan chunk;
12. snapshot cadence/retention не меняют canonical state hash;
13. module extension section participates in delta/rebase without snapshot-core change.


---

# 34. Canonical serialization и state hash

## 34.1. CanonicalWriter

Не использовать arbitrary serde map encoding как consensus format.

## 34.2. Ordering

Entities/components/relations serialise in documented stable order.

## 34.3. Hashes

- BLAKE3 local integrity;
- Keccak-256 future blockchain commitment.

## 34.4. Hash domain

Includes:

- engine protocol version;
- module manifest hash;
- content manifest hash.

## 34.5. Migration hashing

Old snapshot migrated twice must produce identical new hash.

## 34.6. State hash vs snapshot chunk hash

Не смешивать два уровня:

- `canonical_state_hash` описывает semantic full world state;
- `chunk_content_hash` адресует один canonical serialized shard;
- `snapshot_manifest_hash` описывает конкретный manifest/restore point.

Rebase/compaction может изменить `snapshot_manifest_hash`, но при том же world state не имеет права изменить `canonical_state_hash`.

Zstd recompression может изменить physical compressed bytes, но не `chunk_content_hash`, если canonical uncompressed bytes те же.

---

# 35. Future blockchain/transaction influence boundary

## 35.1. Статус

Blockchain gameplay integration сейчас не реализуется, но architectural seam обязателен.

## 35.2. ExternalInputProvider

Provider выдаёт `NormalizedExternalEvent`.

World Engine не знает RPC/EVM/block headers.

## 35.3. NormalizedExternalEvent

Минимальный envelope:

```text
source_kind
source_network optional
source_cursor optional
external_event_id
schema_version
observed_at_world_time
effective_world_time
actor_binding optional
target_bindings[]
event_type_id
payload
payload_hash
source_metadata optional
```

## 35.4. Blockchain-specific metadata isolated

Future adapter may contain:

- chain_id;
- block_number;
- block_hash;
- transaction_hash;
- transaction_index;
- log_index;
- sender;
- contract address.

Domain modules не читают эти поля напрямую без typed influence policy.

## 35.5. InfluencePolicy

Pipeline:

```text
blockchain/source event
→ NormalizedExternalEvent
→ InfluencePolicy
→ 0..N typed WorldCommand
→ validation
→ reducer
→ canonical state
```

## 35.6. No arbitrary field patch

Запрещён production command вида:

```text
SET_FIELD(entity, path, arbitrary_value)
```

Новый effect получает typed command + validator.

## 35.7. Idempotency

`(source_kind, external_event_id)` unique.

Повторная доставка не меняет state второй раз.

## 35.8. Ordering

Future EVM adapter должен выдавать finalized events в explicit deterministic order, например:

```text
chain_id
block_number
transaction_index
log_index
```

## 35.9. Finality/reorg

Adapter решает finality до canonical engine.

Engine получает finalized accepted facts.

## 35.10. External identity

Entity identity не равна wallet address.

```text
ExternalIdentityLink {
  entity_id,
  namespace,
  identity_value
}
```

## 35.11. Future transaction effects

Позднее blockchain event сможет влиять на:

- need;
- mood/state component;
- memory;
- world resource;
- social relation;
- modifier;
- world event;
- module-specific typed state.

Конкретная mapping сейчас не фиксируется.

## 35.12. State commitments

Snapshot/state hashing должен позволять позднее публиковать state root/snapshot hash/event batch hash в blockchain.

## 35.13. Fake provider acceptance test

Fake provider + test `InfluencePolicy` являются частью **Foundation Gate A**.

До начала simulation/gameplay foundation необходимо доказать полный путь:

```text
fake ExternalInputProvider
→ NormalizedExternalEvent
→ persisted dedupe
→ InfluencePolicy
→ typed WorldCommand
→ canonical reducer
→ canonical event/state
→ delta/base snapshot
→ restore/replay
```

Повторная доставка того же `external_event_id` не имеет второго эффекта.

---

# 36. World Engine process

## 36.1. worldd

Responsibilities:

- load config;
- validate engine/module/content manifests;
- migrate DB;
- load snapshot;
- replay inputs;
- start world runner;
- start API;
- metrics;
- delta snapshot writer/rebase/GC orchestration;
- read models;
- graceful shutdown.

## 36.2. Mutation queue

Bounded queue.

Canonical loop:

1. receive command/advance request;
2. validate;
3. execute through registered handler;
4. update revision;
5. atomically persist required input/metadata;
6. publish derived notification.

## 36.3. Backpressure

External API returns 429/503 rather than drop commands.

Internal scheduled events never silently drop.

---

# 37. Persistence schema

Минимальные tables:

- `schema_meta`;
- `world_meta`;
- `module_manifest`;
- `content_manifest`;
- `canonical_inputs`;
- `external_event_dedupe`;
- `snapshot_manifests`;
- `snapshot_manifest_chunks`;
- `snapshot_pins`;
- `snapshot_heads`;
- `snapshot_gc_runs`;
- `snapshot_compaction_runs`;
- `derived_events`;
- entity/component read projections;
- `agents_read`;
- `places_read`;
- `relationships_read`;
- `collectives_read`;
- `technologies_read`;
- `objects_read` optional;
- `operations_journal`.

Минимальные `snapshot_manifests` fields:

```text
snapshot_id
snapshot_kind        // GENESIS_BASE | REBASE_BASE | DELTA
parent_snapshot_id?
world_time
state_revision
canonical_input_sequence
engine_protocol_version
module_manifest_hash
content_manifest_hash
canonical_state_hash
manifest_hash
created_at_real_time
storage_format_version
status
```

`snapshot_manifest_chunks` хранит logical section/shard mutation references, а не дублирует chunk payload.

Физические chunks располагаются content-addressed на persistent volume/object store.

Canonical deep state может жить in-memory + snapshot repository; SQL read tables являются projections.

---

# 38. API

## 38.1. Read API

Minimum:

- `GET /api/world`;
- `/api/world/metrics`;
- `/api/agents`;
- `/api/agents/{id}`;
- `/api/agents/{id}/components`;
- `/api/agents/{id}/relationships`;
- `/api/agents/{id}/memories`;
- `/api/agents/{id}/knowledge`;
- `/api/agents/{id}/decision-explanation`;
- `/api/places`;
- `/api/places/{id}`;
- `/api/routes`;
- `/api/collectives`;
- `/api/collectives/{id}`;
- `/api/technologies`;
- `/api/chronicle`;
- `/api/events`.

## 38.2. Module sections

API core DTO must not require adding a field for every future component.

Support typed module sections/component descriptors.

## 38.3. Live stream

Derived notifications only.

## 38.4. Admin API

Pause/resume/speed/snapshot/verify/shutdown/rebuild read models.

State-affecting admin action goes through command path.

---

# 39. Frontend

## 39.1. World overview

World time, population, collectives, technology count, recent events, resource stress, simulation status.

## 39.2. Graph map

Places/routes/population/infrastructure/trade/collective influence.

Level-of-detail required.

## 39.3. Agent profile

Core identity + dynamically render known module sections.

Specialized views for built-in traits/needs/memory/social/knowledge.

## 39.4. Place page

Residents/resources/structures/routes/trade/collectives/events/derived labels.

## 39.5. Technology page

Lineage/adopters/design/performance/diffusion.

## 39.6. Collective page

Policies/members/roles/resources/beliefs/relations/history.

## 39.7. Chronicle

Filterable significant event feed.

## 39.8. Explainability

Показывать:

- selected goal;
- alternatives;
- utility breakdown;
- plan/strategy;
- beliefs;
- memory refs;
- deterministic decision scope identifier.

---

# 40. Resource budget и performance targets

Reference workload:

- 10,000 agents;
- 10,000–50,000 places;
- <=100,000 route/infrastructure edges;
- 500,000–1,000,000 objects/parts;
- <=1,000,000 directional social edges;
- tens of thousands recipes/designs/strategies;
- realtime 1x.

Reference hardware:

- modern 8–16 core CPU;
- 32 GB RAM;
- NVMe;
- no GPU requirement.

## 40.1. RAM

Target RSS <=16 GB, blocker >24 GB steady state on 32 GB machine.

## 40.2. CPU

Realtime reference world should have catch-up headroom.

## 40.3. Decision throughput

Beta target >=200 full agent decisions/s synthetic benchmark.

## 40.4. Catch-up

>=10x realtime with live rendering disabled.

## 40.5. API

p95 <250 ms common read requests.

## 40.6. Disk

Общий reference budget остаётся:

```text
20–100 GB за 180 world days
```

для разумно настроенного мира без media assets и без бессрочного хранения каждого internal action.

Snapshot subsystem не должен умножать полный размер state на число snapshot points.

За счёт delta + content-addressed chunks physical snapshot bytes должны отражать retained changes.

Для каждого 180-day benchmark обязательно отдельно показать:

```text
canonical_inputs bytes
derived_history/read-model bytes
unique snapshot chunk bytes
snapshot manifest/index bytes
SQLite/WAL bytes
total bytes
dedupe ratio
```

1 TB NVMe остаётся комфортным стартовым объёмом с большим operational запасом.

Если snapshot repository становится крупнейшим потребителем диска из-за duplicated unchanged state, release blocker — исправить chunking/deduplication до production.

## 40.7. Accelerated Genesis-1000 target

Для test fixture, соответствующего production Genesis population из 1000 agents, создать headless accelerated benchmark.

Цель v1:

- корректно работать в `10x` без пропуска событий;
- корректно работать в `100x` без изменения simulation semantics;
- на reference hardware стремиться sustained effective speed >= `100x` для Genesis-1000 benchmark после warm-up;
- если конкретная поздняя стадия мира не удерживает `100x`, benchmark обязан явно показать effective speed и bottleneck.

Release blocker — любое нарушение детерминизма, потеря events или расхождение state hash между pacing modes.

## 40.8. Pacing correctness

Обязательные assertions:

- `1x`, `10x`, `100x` дают одинаковый hash при одинаковом target `WorldTime`;
- switch `1x -> 100x -> 10x -> 1x` не создаёт time jump/backwards;
- pause/resume не меняет scheduled timestamps;
- runner lag не приводит к event dropping;
- catch-up и accelerated mode используют один и тот же `advance_to` path.

---

# 41. Observability

Metrics:

- world time;
- configured speed factor;
- effective world-time speed;
- pacing lag;
- Genesis population / current population;
- scheduler queue;
- events/s;
- decisions/s;
- planner expansions/fallback;
- active agents;
- relation count;
- object/part count;
- place/route count;
- technology count;
- collective count;
- DB size;
- snapshot delta creation duration;
- current delta bytes;
- p95 delta bytes;
- logical snapshot bytes;
- physical chunk-store bytes;
- unique chunk count;
- snapshot dedupe ratio;
- delta chain depth;
- rebase duration/count;
- GC candidate/reclaimed bytes;
- snapshot restore duration;
- state hash;
- catch-up;
- command queue;
- API latency/errors;
- per-module event/handler metrics.

Logs: structured `tracing` JSON.

---

# 42. Security and safety boundaries

## 42.1. Admin auth

Token/mTLS/reverse proxy restriction.

## 42.2. No arbitrary execution

No executable recipes/rules.

## 42.3. Bounded computational work

Planner, recipe exploration, gossip propagation, module handlers have hard budgets.

## 42.4. External inputs

Future providers require schema validation, dedupe, allowlist, size/rate limits, deterministic mapping.

## 42.5. Secrets

World simulation requires no private key.

Future blockchain signer/submission is separate process/service boundary.

## 42.6. Module safety

Domain module cannot bypass canonical command context to mutate unrelated component stores.

---

# 43. Обязательные инварианты

Property/invariant tests минимум:

1. EntityId не переиспользуется.
2. Object не находится одновременно в mutually exclusive locations.
3. Quantity не отрицательна.
4. Non-renewable matter не возникает без defined transformation/genesis.
5. Route refs exist.
6. Part refs exist.
7. Scheduled time monotonic.
8. Normalized bounds respected.
9. Dead agent не выполняет living actions.
10. Ownership transfer atomic.
11. External input dedupe works.
12. Snapshot+replay hash identical.
13. Genesis replay hash identical.
14. Restart does not alter outcome.
15. Read-model rebuild does not alter canonical hash.
16. Renderer does not alter state.
17. Read queries do not alter randomness.
18. Unknown canonical module/component fails closed.
19. Module registration order does not alter state hash.
20. Content pack order does not alter semantics when manifests equal.
21. Migration deterministic.
22. Collective nested membership cannot create forbidden cycles if module declares acyclic hierarchy.
23. Base + delta chain restore produces exact canonical state hash.
24. Rebase/compaction does not alter canonical state hash.
25. Retention policy does not alter canonical state hash.
26. GC cannot delete chunks reachable from any protected manifest.
27. Chunk hash always validates canonical uncompressed bytes.
28. Snapshot compression settings do not alter canonical state hash.

---

# 44. Эмерджентные scenario tests

Fixed seeds + assertions:

## 44.1. Emergent path

Repeated movement changes route attractiveness under physical rules.

## 44.2. Tool discovery

Curious agent discovers useful design without item-specific invention command.

## 44.3. Technology diffusion

Teaching/imitation spreads technology.

## 44.4. Technology mutation

Variant + lineage.

## 44.5. False belief

Correlation creates wrong belief, changes behavior, can spread.

## 44.6. Organization emergence

Repeated cooperation/shared threat creates generic collective organization without story command.

## 44.7. Organization split

Cohesion/policy conflict can split.

## 44.8. Resource shock

Food scarcity changes values/trade/migration/strategies.

## 44.9. Infrastructure consequence

New route changes downstream movement/trade.

## 44.10. Water consequence

Water edge changes downstream availability/production utility.

## 44.11. Cross-seed diversity

20 seeds must show meaningful diversity metrics.

---

# 45. Обязательные тесты архитектурной расширяемости

Тесты этой секции являются dependency gates. Их нельзя откладывать до конца разработки.

## 45.1. Gate A: `TestExtensionModule`

После engine/storage/replay foundation создать test-only module, который добавляет:

- новый versioned component;
- новый typed command;
- новый canonical event;
- новый scheduled handler;
- новый relation type;
- новый derived projection;
- test `ActionProvider`;
- test `GoalProvider`.

Добавление module требует только:

- module registration в composition root/test manifest;
- test fixture/config changes.

Изменения generic engine internals запрещены.

## 45.2. Gate A: State extension test

Добавить test state `TestMoodLikeState` или аналог, отсутствующий в base modules.

Проверить:

1. default initialization;
2. typed mutation;
3. canonical event;
4. base snapshot;
5. delta snapshot после mutation;
6. restore;
7. replay;
8. schema migration;
9. stable canonical state hash;
10. unknown schema fail-closed.

## 45.3. Gate A: Generic relation/collective extension test

Test-only module должен:

1. создать две обычные entities;
2. создать test collective entity;
3. добавить обе entities как members через generic relation storage;
4. сохранить shared test component;
5. создать второй collective;
6. вложить два collectives в third collective;
7. snapshot/restore/replay;
8. получить identical canonical hash.

Это доказывает future compatibility с communities/settlements/polities **до** реализации production collective gameplay.

## 45.4. Gate A: External input test

Fake `ExternalInputProvider`:

```text
external event
→ persisted dedupe
→ InfluencePolicy
→ typed command
→ reducer
→ canonical event/state
→ snapshot/replay
```

Проверить:

- duplicate event ID has no second effect;
- restart между ingest и повторной доставкой безопасен;
- external source не получает mutable storage access;
- новый provider не требует изменения world core.

## 45.5. Gate A: Scheduler/provider registration test

Test extension регистрирует:

- scheduled handler;
- ActionProvider;
- GoalProvider.

На Gate A достаточно доказать registration/dispatch contract и отсутствие core switch/case.

Planner-level использование action/goal проверяется Gate B.

## 45.6. Gate A: Core-change guard

CI должен иметь allowlist/guard для foundation interfaces.

При добавлении `TestExtensionModule` не должны изменяться:

- deterministic RNG implementation;
- scheduler queue/ordering core;
- canonical writer format core;
- generic entity/component store core;
- generic relation store core;
- storage transaction core;
- snapshot restore algorithm;
- command dispatch core.

Если extension требует изменить один из этих компонентов, Gate A считается failed и architecture должна быть пересмотрена.

## 45.7. Gate B: Content extension test

После появления materials/objects/affordances/planner добавить content-only pack:

- новый material;
- новый object prototype;
- новый набор capabilities.

Проверить:

1. content manifest принимает pack;
2. material/object создаются без source changes core;
3. affordance system обнаруживает capabilities;
4. planner способен выбрать действие с новым object;
5. planner source не изменён;
6. одинаковый seed даёт одинаковый result.

## 45.8. Gate B: ActionProvider extension test

Test gameplay module добавляет новый primitive action через `ActionProvider`.

Проверить:

- planner получает candidate;
- symbolic preconditions/effects работают;
- command проходит normal reducer path;
- hardcoded action switch в planner отсутствует;
- bounded planning limits сохраняются.

## 45.9. Gate B: GoalProvider extension test

Test gameplay module добавляет новый goal.

Проверить:

- goal появляется в candidate set;
- получает integer utility;
- участвует в top-K/weighted choice;
- goal selector source не меняется;
- deterministic explanation содержит provider/module origin.

## 45.10. Gate B: Component-to-decision extension test

Test-only component влияет на новый test action/goal только через объявленный query/context interface.

Planner не импортирует concrete extension component store.

## 45.11. Society integration gate

После production society modules выполнить интеграционные extension tests ещё раз на полном world manifest.

Проверить, что добавление test module/content pack по-прежнему не требует изменения core после появления:

- memory/strategies;
- social;
- communication;
- beliefs/culture;
- economy;
- structures;
- technology;
- collectives/organizations;
- demography.

## 45.12. Production Genesis Freeze gate

Финальный production Genesis golden hash не фиксируется до прохождения Society Integration Gate и завершения canonical v1 module/content manifests.

После freeze любое изменение canonical Genesis composition требует protocol-version decision.

---

# 46. Пошаговый план разработки и dependency DAG

## 46.1. Правило выполнения

Эта секция является **обязательным dependency DAG**, а не примерным списком.

Каждый этап содержит `Depends on`.

Запрещено начинать этап, пока:

1. все перечисленные dependencies не завершены;
2. их тесты не зелёные;
3. обязательный gate между фазами не пройден.

Если при реализации обнаружено, что этап требует subsystem, который по DAG расположен позже:

- не реализовывать поздний subsystem скрытно внутри текущего этапа;
- остановиться;
- зафиксировать dependency defect;
- исправить DAG/spec до продолжения.

`worldd`, `simctl` и module crates могут существовать как пустые skeletons раньше, но production behavior считается реализованным только на соответствующем этапе.

---

# PHASE A — ENGINE FOUNDATION

Цель: доказать deterministic/extensible/storage-safe ядро **до gameplay**.

## Этап 0. Rust workspace foundation

**Depends on:** nothing.

- [ ] создать Cargo workspace;
- [ ] rust-toolchain;
- [ ] rustfmt;
- [ ] clippy policy;
- [ ] создать core crates;
- [ ] создать module crates skeleton;
- [ ] создать `worldd` skeleton без production runtime;
- [ ] создать `simctl` skeleton;
- [ ] CI fmt/clippy/tests;
- [ ] Windows/Linux matrix;
- [ ] Docker builder;
- [ ] compose baseline.

## Этап 1. Deterministic primitives

**Depends on:** 0.

- [ ] EntityId и другие stable ID newtypes;
- [ ] StableArena;
- [ ] fixed-point types;
- [ ] WorldTime;
- [ ] keyed random scope;
- [ ] weighted deterministic choice;
- [ ] stable ordering helpers;
- [ ] deterministic hashing helpers;
- [ ] bounds property tests;
- [ ] random non-shift test;
- [ ] cross-platform primitive fixture.

## Этап 2. Extensibility substrate

**Depends on:** 1.

- [ ] ModuleId/ComponentTypeId/CommandTypeId/EventTypeId/RelationTypeId/CapabilityId;
- [ ] ComponentRegistry;
- [ ] ModuleRegistry;
- [ ] generic entity/component stores;
- [ ] generic relation store;
- [ ] RelationTypeRegistry;
- [ ] typed command handler registry;
- [ ] canonical event registry;
- [ ] scheduled handler registry contract;
- [ ] ActionProvider registry contract;
- [ ] GoalProvider registry contract;
- [ ] DerivedProjection registry contract;
- [ ] CapabilityRegistry contract;
- [ ] migration registry interface;
- [ ] explicit schema versions;
- [ ] unknown component/module/type fail-closed tests;
- [ ] module registration order determinism test.

На этом этапе providers только регистрируются; реальный planner ещё не существует.

## Этап 3. Canonical serialization + state hash

**Depends on:** 1, 2.

- [ ] определить `engine_protocol_version`;
- [ ] CanonicalWriter;
- [ ] entity/component section encoding;
- [ ] generic relation encoding;
- [ ] command/event envelope encoding;
- [ ] module manifest encoding;
- [ ] content manifest envelope encoding;
- [ ] scheduler-state encoding contract;
- [ ] BLAKE3 canonical state hash;
- [ ] Keccak commitment root;
- [ ] golden bytes fixture;
- [ ] unordered container guards;
- [ ] Linux/Windows state-hash fixture.

## Этап 4. Scheduler core

**Depends on:** 1, 2, 3.

На этом этапе реализуется deterministic simulated-time scheduler, **но не wall-clock pacing**.

- [ ] stable priority queue;
- [ ] ScheduleId;
- [ ] cancellation/generation;
- [ ] registered scheduled handlers;
- [ ] `advance_to(WorldTime)`;
- [ ] jump-to-next-event;
- [ ] monotonic assertions;
- [ ] scheduler canonical serialization;
- [ ] scheduled handler extension fixture;
- [ ] pause semantics на уровне target advancement test helper;
- [ ] никаких `SystemTime` reads внутри engine.

`WorldRunner`, `PacingState`, `1x/10x/100x`, restart anchors и realtime catch-up реализуются позже.

## Этап 5. Minimal canonical persistence

**Depends on:** 2, 3.

Реализовать минимальный durable correctness boundary до snapshot/external-input tests.

- [ ] SQLite bootstrap;
- [ ] WAL;
- [ ] `sqlx` migrations для foundation tables;
- [ ] `world_meta`;
- [ ] module/content manifest metadata;
- [ ] `canonical_inputs`;
- [ ] `external_event_dedupe`;
- [ ] minimal operations journal;
- [ ] snapshot manifest metadata tables;
- [ ] transaction boundary API;
- [ ] atomic canonical input append;
- [ ] restart/open validation;
- [ ] DB crash/reopen tests.

На этом этапе не требуются gameplay read projections, chronicle tables или production backup UX.

## Этап 6. Snapshot/replay foundation

**Depends on:** 3, 4, 5.

Реализовать минимальный, но настоящий snapshot repository, на котором зависят Genesis и Gate A.

- [ ] deterministic stable shard/chunk boundaries foundation;
- [ ] chunk header/file format;
- [ ] BLAKE3 content hash canonical uncompressed bytes;
- [ ] Zstd payload;
- [ ] compressed payload checksum;
- [ ] content-addressed chunk path;
- [ ] staging + fsync + atomic rename;
- [ ] immutable BASE manifest;
- [ ] immutable DELTA manifest;
- [ ] basic dirty-shard tracking;
- [ ] tombstone/removal representation;
- [ ] atomic manifest commit;
- [ ] HEAD pointer;
- [ ] base restore;
- [ ] base + delta restore;
- [ ] canonical state hash verification;
- [ ] snapshot/replay from canonical inputs;
- [ ] crash before manifest commit -> safe orphan;
- [ ] module/component section extension test.

На этом этапе **не** реализуются:

- retention policy;
- rebase;
- max-chain operational compaction;
- mark-and-sweep GC;
- remote backup;
- production corruption recovery workflow.

Они относятся к Production Hardening.

## Этап 7. Schema migration foundation

**Depends on:** 2, 3, 5, 6.

- [ ] migration trait/registry implementation;
- [ ] component version migration;
- [ ] relation schema migration;
- [ ] module manifest compatibility validation;
- [ ] deterministic migration ordering;
- [ ] migrate restored snapshot in memory;
- [ ] create migrated immutable manifest;
- [ ] provenance `migrated_from_snapshot_id`;
- [ ] old fixture migration test;
- [ ] repeated migration determinism test;
- [ ] migrated state hash test;
- [ ] unknown/no-path migration fail closed.

Production backup/dry-run operator workflow остаётся поздним hardening этапом.

## Этап 8. External-input foundation

**Depends on:** 2, 3, 5, 6.

- [ ] `ExternalInputProvider`;
- [ ] `NormalizedExternalEvent`;
- [ ] stable external event envelope;
- [ ] `InfluencePolicy`;
- [ ] typed external-event -> WorldCommand conversion;
- [ ] persisted dedupe;
- [ ] stable external ordering contract;
- [ ] fake provider;
- [ ] fake influence policy;
- [ ] duplicate/restart test;
- [ ] snapshot/replay after external input;
- [ ] `ExternalIdentityLink`;
- [ ] document future blockchain adapter contract/boundary;
- [ ] доказать отсутствие mutable storage access у provider/policy.

Blockchain RPC/finality не реализуются.

## Этап 9. Content/prototype/capability foundation

**Depends on:** 2, 3, 5.

- [ ] content loader;
- [ ] stable content IDs;
- [ ] content hashes;
- [ ] dependency validation;
- [ ] prototype registry;
- [ ] capability descriptors;
- [ ] content manifest persistence;
- [ ] invalid content tests;
- [ ] content pack ordering determinism test;
- [ ] content-only registry fixture.

Здесь ещё нет MaterialDefinition/Object physics; проверяется infrastructure content packs.

## Gate A. Structural Extensibility

**Depends on:** 0–9.

**Blocks:** все этапы Phase B.

Обязательные checks:

- [ ] `TestExtensionModule`;
- [ ] new component;
- [ ] new command;
- [ ] new canonical event;
- [ ] new scheduled handler;
- [ ] new relation type;
- [ ] derived projection;
- [ ] test ActionProvider registration;
- [ ] test GoalProvider registration;
- [ ] state extension base/delta snapshot;
- [ ] restore/replay;
- [ ] schema migration;
- [ ] generic collective/nested collective test;
- [ ] fake external-input full path;
- [ ] external dedupe/restart;
- [ ] stable state hash;
- [ ] core-change guard.

Если Gate A failed, gameplay реализация запрещена.

---

# PHASE B — SIMULATION FOUNDATION

Цель: создать физический/агентный минимум и доказать, что planner действительно расширяется providers/content без hardcoded switches.

## Этап 10. Graph topology

**Depends on:** Gate A, 9.

- [ ] PlaceStore;
- [ ] RouteStore;
- [ ] sorted adjacency;
- [ ] parent-child places;
- [ ] route create/disable;
- [ ] reachability;
- [ ] shortest path integer cost;
- [ ] TopologyBackend;
- [ ] no higher-domain concrete storage import test;
- [ ] topology invariants.

## Этап 11. Environment/resources

**Depends on:** 10.

- [ ] environment components;
- [ ] seasons;
- [ ] deterministic anomalies;
- [ ] resource deposits;
- [ ] lazy renewables;
- [ ] non-renewable depletion;
- [ ] extraction API;
- [ ] conservation tests.

## Этап 12. Materials/symbolic physics

**Depends on:** 9, 11.

- [ ] MaterialDefinition content schema;
- [ ] material property fixed types;
- [ ] heat/cool;
- [ ] burn;
- [ ] dry/wet;
- [ ] crush/grind;
- [ ] mix;
- [ ] compress/shape;
- [ ] transformation fixtures;
- [ ] no item-name special case audit.

## Этап 13. Objects/parts/affordances

**Depends on:** 10, 12.

- [ ] Object components;
- [ ] Part;
- [ ] connector relations;
- [ ] attach/detach validation;
- [ ] location/carrier/container relation;
- [ ] generic affordance query API;
- [ ] derived affordance calculator;
- [ ] revision cache;
- [ ] container capacity;
- [ ] support;
- [ ] cutting/piercing/impact;
- [ ] rolling/rotation;
- [ ] invariants.

## Этап 14. Primitive physical action framework

**Depends on:** 4, 10, 11, 12, 13.

Реализовать framework и **только те providers, чьи domain dependencies уже существуют**.

- [ ] ActionProvider execution contract;
- [ ] action descriptor;
- [ ] typed args;
- [ ] symbolic preconditions/effects;
- [ ] actual WorldCommand mapping;
- [ ] failure type;
- [ ] observation outcome;
- [ ] MOVE provider;
- [ ] TAKE/PLACE/DROP/STORE providers;
- [ ] OBSERVE/REST/WAIT;
- [ ] physical transformation providers;
- [ ] attach/detach/build-part primitives;
- [ ] deterministic tests.

На этом этапе **не реализуются**:

- barter/trade;
- gossip;
- teaching;
- threat/social relationship mutations;
- organization actions.

Эти providers добавляются соответствующими domain modules позже.

## Этап 15. Agent/needs/lifecycle core

**Depends on:** 4, 10, 11, 13, 14.

- [ ] AgentCoreComponent;
- [ ] `AgentOrigin`;
- [ ] genome;
- [ ] traits;
- [ ] body;
- [ ] extensible NeedType registry integration;
- [ ] v1 physical/basic needs;
- [ ] inventory index;
- [ ] goal/plan state components;
- [ ] knowledge/memory/social reference slots/interfaces;
- [ ] lifecycle state;
- [ ] lazy need materialization;
- [ ] threshold scheduling;
- [ ] test fixture agent constructor;
- [ ] death-state primitive;
- [ ] no production arbitrary-spawn API.

Репродукция реализуется в demography stage.

## Этап 16. Goal/utility core

**Depends on:** 11, 13, 14, 15.

- [ ] GoalProvider execution contract;
- [ ] candidate budget;
- [ ] integer utility breakdown;
- [ ] stable top-K;
- [ ] weighted choice;
- [ ] decision explanation object;
- [ ] restore basic need goal;
- [ ] acquire resource goal;
- [ ] avoid threat/hazard goal;
- [ ] explore/novelty goal;
- [ ] basic shelter/comfort goal only если affordance доступен;
- [ ] module goal extension fixture.

На этом этапе не hardcode'ить social/status/organization goals. Поздние modules регистрируют их providers.

## Этап 17. Planner core

**Depends on:** 13, 14, 16.

- [ ] symbolic planner state;
- [ ] bounded beam search;
- [ ] depth budget;
- [ ] expansion budget;
- [ ] stable tie-break;
- [ ] target limiter;
- [ ] ActionProvider discovery;
- [ ] GoalProvider result consumption;
- [ ] optional `StrategySource` interface;
- [ ] default empty StrategySource;
- [ ] safe fallback;
- [ ] no-world-clone test;
- [ ] planner benchmark.

`strategy-first` как реальное поведение активируется после Memory/Learning; planner core сейчас лишь имеет extension seam.

## Gate B. Behavioral Extensibility

**Depends on:** 10–17.

**Blocks:** Phase C society modules и production Genesis mechanism.

- [ ] content-only pack добавляет новый material;
- [ ] content-only pack добавляет новый object prototype;
- [ ] новый capability обнаруживается affordance system;
- [ ] новый ActionProvider используется planner;
- [ ] новый GoalProvider участвует в utility selection;
- [ ] planner source не изменяется;
- [ ] goal selector source не изменяется;
- [ ] extension component доступен только через declared query/context;
- [ ] deterministic cross-platform fixture.

Если Gate B failed, запрещено наращивать society gameplay.

## Этап 18. Genesis mechanism + WorldRunner pacing

**Depends on:** Gate B, 5, 6, 15, 16, 17.

Это **development Genesis implementation**, не Production Genesis Freeze.

### Genesis mechanism

- [ ] `GenesisManifest`;
- [ ] explicit `simctl init-world --config`;
- [ ] atomic initialization transaction;
- [ ] product-v1 validator `genesis_population == 1000`;
- [ ] deterministic genome/traits/basic-needs generation;
- [ ] deterministic cohorts `150/600/200/50`;
- [ ] deterministic initial biological age;
- [ ] deterministic valid placement;
- [ ] no pre-existing relationships;
- [ ] no organizations;
- [ ] no learned technologies/recipes/blueprints/strategies;
- [ ] innate capability baseline;
- [ ] first-decision staggering 0..300 world seconds;
- [ ] Genesis BASE snapshot;
- [ ] development Genesis replay/golden test;
- [ ] repeated init fail closed;
- [ ] arbitrary production spawn forbidden;
- [ ] test scenario builder isolated from production mutations.

### WorldRunner pacing

- [ ] `PacingState`;
- [ ] runner wall-clock adapter outside engine;
- [ ] speed factors `1x/10x/100x`;
- [ ] integer target-time calculation;
- [ ] correct re-anchor at set-speed;
- [ ] pause/resume;
- [ ] restart persisted pacing;
- [ ] realtime catch-up;
- [ ] headless accelerated mode;
- [ ] effective-speed/pacing-lag metrics;
- [ ] same target WorldTime => same hash for 1x/10x/100x;
- [ ] Genesis-1000 accelerated benchmark.

---

# PHASE C — SOCIETY AND OPEN-ENDED GAMEPLAY

Цель: наращивать domain modules уже поверх доказанных extension boundaries.

## Этап 19. Memory + individual learning + strategy integration

**Depends on:** 15, 17, 18.

- [ ] Episode;
- [ ] importance;
- [ ] consolidation;
- [ ] OutcomeRecord;
- [ ] personal strategy score;
- [ ] macro extraction;
- [ ] strategy mutation;
- [ ] strategy limits;
- [ ] deterministic forgetting;
- [ ] episodic memory capacity / retention limits / consolidation bounds;
- [ ] подключить real StrategySource к planner;
- [ ] strategy-first behavior test.

На этом этапе нет social imitation/teaching — сначала нужен social/communication layer.

## Этап 20. Social relationships

**Depends on:** 2, 15, 19.

- [ ] v1 directional social component/dimensions;
- [ ] lazy social relation creation;
- [ ] co-location/contact events;
- [ ] affinity/trust/fear/respect/envy/rivalry/obligation/familiarity;
- [ ] relationship updates;
- [ ] lazy decay;
- [ ] local candidate selection;
- [ ] relationship-memory integration;
- [ ] social GoalProviders;
- [ ] social ActionProviders, не требующие structured negotiation;
- [ ] extensible relation tests;
- [ ] social benchmark.

## Этап 21. Structured communication

**Depends on:** 14, 15, 20.

Этот этап обязателен; communication architecture не должна оставаться только текстом в §26.

- [ ] `SpeechAct`/structured message schema;
- [ ] request;
- [ ] offer intent;
- [ ] accept/refuse;
- [ ] threaten/warn;
- [ ] praise/insult;
- [ ] teach envelope;
- [ ] gossip envelope;
- [ ] promise/claim/command;
- [ ] typed refs/payload;
- [ ] observability/privacy-of-hidden-state rules;
- [ ] communication action providers;
- [ ] deterministic delivery/outcome;
- [ ] procedural renderer interface только presentation-side;
- [ ] renderer-purity test.

## Этап 22. Beliefs + individual culture core

**Depends on:** 19, 20, 21.

- [ ] proposition schema;
- [ ] confidence update;
- [ ] evidence/contrary evidence;
- [ ] observation-derived beliefs;
- [ ] false correlation heuristic;
- [ ] CulturalMeme;
- [ ] meme structured content;
- [ ] meme lineage;
- [ ] adoption strength;
- [ ] belief/meme limits;
- [ ] false-belief individual scenario.

## Этап 23. Social learning / imitation / gossip / cultural transmission

**Depends on:** 19, 20, 21, 22.

- [ ] observation-safe strategy abstraction;
- [ ] imitation;
- [ ] teaching of allowed structured knowledge;
- [ ] trust-weighted gossip adoption;
- [ ] deterministic distortion;
- [ ] meme transmission;
- [ ] strategy rumor handling;
- [ ] no hidden-state leakage;
- [ ] social learning limits;
- [ ] false-belief spread scenario;
- [ ] cultural diffusion scenario.

## Этап 24. Economy

**Depends on:** 11, 13, 19, 20, 21.

- [ ] ownership relation/component;
- [ ] subjective value model;
- [ ] barter Offer object;
- [ ] structured offer communication;
- [ ] accept/refuse economic handlers;
- [ ] atomic trade transfer;
- [ ] trade memory;
- [ ] scarcity inputs;
- [ ] trade flow metrics;
- [ ] derived market projection;
- [ ] economic ActionProviders/GoalProviders;
- [ ] resource shock scenario.

## Этап 25. World modification / structures / infrastructure

**Depends on:** 10, 11, 12, 13, 14, 17.

- [ ] Structure components;
- [ ] structure anchoring;
- [ ] structural part graph reuse;
- [ ] shelter/storage/workspace;
- [ ] child interior Place rule;
- [ ] route traffic effects;
- [ ] material surface upgrades;
- [ ] route enable/disable by structure;
- [ ] WaterFlowEdge;
- [ ] hydraulic head rules;
- [ ] local water recalculation;
- [ ] cultivated resource populations;
- [ ] construction ActionProviders;
- [ ] infrastructure GoalProviders;
- [ ] infrastructure/water scenarios.

Никаких `BUILD_HOUSE`/`CREATE_ROAD` high-level story commands.

## Этап 26. Technology discovery

**Depends on:** 19, 23, 25.

World modification идёт раньше technology discovery, потому что `StructureBlueprint` не должен появляться до существования generic Structure substrate.

- [ ] ProcessRecipe;
- [ ] ObjectDesign;
- [ ] StructureBlueprint;
- [ ] structural duplicate hash;
- [ ] experiment mutation generator;
- [ ] experiment budget;
- [ ] utility/novelty scoring;
- [ ] learned recipe/design knowledge;
- [ ] teaching/copying через Stage 23 transmission;
- [ ] lineage;
- [ ] forgetting/disappearance;
- [ ] rediscovery support;
- [ ] tool discovery scenario;
- [ ] technology diffusion scenario;
- [ ] technology mutation scenario.

## Этап 27. Production collective substrate

**Depends on:** 2, 6, 20, 24.

Gate A уже доказал возможность test-only collectives. Здесь реализуется production generic substrate.

- [ ] CollectiveEntity marker/component;
- [ ] membership relation;
- [ ] nested collective membership;
- [ ] roles;
- [ ] shared resource pool;
- [ ] shared knowledge refs;
- [ ] decision policy interface;
- [ ] claim/influence/control relation types;
- [ ] collective external relations;
- [ ] cycle policy/invariants;
- [ ] snapshot/replay;
- [ ] nested collective test.

## Этап 28. Organizations/institutions v1

**Depends on:** 22, 23, 24, 27.

- [ ] formation motives;
- [ ] membership rules;
- [ ] leadership;
- [ ] succession;
- [ ] contribution/redistribution;
- [ ] punishment/conflict;
- [ ] secrecy;
- [ ] shared memes/knowledge;
- [ ] cohesion;
- [ ] policy change;
- [ ] split/merge;
- [ ] organization ActionProviders/GoalProviders;
- [ ] derived labels;
- [ ] organization emergence scenario;
- [ ] organization split scenario.

## Этап 29. Demography / generations / inheritance

**Depends on:** 15, 19, 20, 22, 23.

- [ ] lifecycle age rules;
- [ ] reproduction eligibility;
- [ ] offspring creation;
- [ ] AgentOrigin::WorldBorn;
- [ ] genetic crossover;
- [ ] bounded mutation;
- [ ] kin relations;
- [ ] cultural inheritance;
- [ ] learned knowledge inheritance policy;
- [ ] death/historical transition;
- [ ] carrying pressure/population stabilizers;
- [ ] no arbitrary replenishment invariant;
- [ ] 100-generation test.

## Этап 30. Significant history + procedural narrative

**Depends on:** 19–29.

- [ ] SignificantEvent schema;
- [ ] significance scorer;
- [ ] chronicle projection;
- [ ] procedural templates;
- [ ] structured speech rendering;
- [ ] personality/relationship/mood-dependent speech style variants;
- [ ] agent/place/technology/organization templates;
- [ ] pure-render guarantee;
- [ ] renderer snapshot tests.

## Gate C. Society Integration

**Depends on:** 19–30.

**Blocks:** Production Hardening/Genesis Freeze.

- [ ] все mandatory emergent scenarios §44;
- [ ] полный extension module повторно подключается без core changes;
- [ ] content-only extension всё ещё используется planner;
- [ ] external-input fake provider всё ещё проходит replay;
- [ ] collective/nested collective compatibility;
- [ ] no hardcoded story command audit;
- [ ] no domain module imports into world-core;
- [ ] deterministic multi-module replay;
- [ ] module registration order invariants;
- [ ] 20-seed preliminary diversity run.

---

# PHASE D — PRODUCTION PERSISTENCE AND RUNTIME HARDENING

## Этап 31. Delta snapshot operations hardening

**Depends on:** Gate C, 6, 7.

- [ ] robust dirty-shard instrumentation for all v1 modules;
- [ ] max delta chain depth;
- [ ] rebase/base-manifest compaction;
- [ ] verify rebase reuses chunks;
- [ ] snapshot pins;
- [ ] 6h/daily/weekly retention pins;
- [ ] mark-and-sweep GC;
- [ ] GC grace period;
- [ ] GC dry-run;
- [ ] reachable-chunk safety;
- [ ] corrupt latest delta fallback;
- [ ] snapshot migration operational workflow;
- [ ] backup/restore reachable chunks;
- [ ] delta/dedupe/rebase/GC metrics;
- [ ] module-extension delta snapshot regression;
- [ ] crash matrix around chunk/manifest operations.

## Этап 32. Production persistence projections + operations

**Depends on:** 5, 30, 31.

- [ ] production SQLite migrations;
- [ ] derived events persistence;
- [ ] agents read projection;
- [ ] places read projection;
- [ ] relationships read projection;
- [ ] collectives/organizations read projection;
- [ ] technologies read projection;
- [ ] objects read projection if needed;
- [ ] projection rebuild;
- [ ] operations journal completion;
- [ ] backup procedure;
- [ ] restore procedure;
- [ ] migration dry-run workflow;
- [ ] projection rebuild hash-isolation test;
- [ ] DB crash/recovery tests.

## Gate D. Production Genesis Freeze

**Depends on:** Gate C, 29, 31, 32.

До этого gate существовали только development Genesis fixtures.

- [ ] final engine protocol version chosen;
- [ ] final v1 canonical module manifest frozen;
- [ ] final v1 content manifest frozen;
- [ ] final lifecycle/demography config frozen;
- [ ] final Genesis config frozen;
- [ ] clean init exactly 1000 agents;
- [ ] cohorts 150/600/200/50 verified;
- [ ] no fake prehistory;
- [ ] no organizations/learned technologies at t=0;
- [ ] Genesis BASE snapshot verified;
- [ ] Linux/Windows Genesis hash identical;
- [ ] production Genesis manifest/hash recorded as release evidence;
- [ ] mutation of frozen manifest without protocol-version change rejected.

## Этап 33. worldd production runtime + API

**Depends on:** Gate D, 18, 31, 32.

- [ ] production config load;
- [ ] startup manifest validation;
- [ ] worldd fail-closed if canonical world is not initialized; never perform implicit Genesis;
- [ ] DB migration;
- [ ] snapshot restore;
- [ ] canonical input replay;
- [ ] WorldRunner;
- [ ] persisted PacingState;
- [ ] bounded command queue;
- [ ] read API;
- [ ] component/module inspection API;
- [ ] live feed;
- [ ] admin API;
- [ ] pause/resume/set-speed;
- [ ] snapshot/rebase/GC orchestration;
- [ ] health/readiness;
- [ ] graceful shutdown;
- [ ] metrics;
- [ ] structured logs;
- [ ] backpressure;
- [ ] restart/catch-up integration test.

## Этап 34. Frontend

**Depends on:** 30, 33.

- [ ] Next.js;
- [ ] API client;
- [ ] world overview;
- [ ] graph map;
- [ ] agent profile;
- [ ] dynamic component sections;
- [ ] decision explanation;
- [ ] place page;
- [ ] technology page;
- [ ] collective/organization page;
- [ ] chronicle;
- [ ] search/filters;
- [ ] live updates;
- [ ] pacing controls for authorized test/admin UI;
- [ ] error/loading states;
- [ ] Playwright smoke.

## Этап 35. Performance / accelerated soak

**Depends on:** 33, 34.

- [ ] 1k reference scenario;
- [ ] 10k scenario;
- [ ] 1M object/part fixture;
- [ ] 1M relation fixture;
- [ ] planner benchmark;
- [ ] scheduler benchmark;
- [ ] 1x/10x/100x equivalence;
- [ ] Genesis-1000 100x effective-speed benchmark;
- [ ] delta snapshot benchmark;
- [ ] full-copy-vs-delta storage comparison;
- [ ] dedupe ratio report;
- [ ] rebase benchmark;
- [ ] restore-chain benchmark;
- [ ] GC benchmark;
- [ ] 180-world-day snapshot storage growth;
- [ ] catch-up benchmark;
- [ ] heap profile;
- [ ] no accidental global scans;
- [ ] RSS target;
- [ ] API p95;
- [ ] 24h accelerated run;
- [ ] periodic restart during soak;
- [ ] hash validation;
- [ ] unbounded collection checks;
- [ ] DB growth report;
- [ ] multi-seed diversity metrics.

## Этап 36. Packaging / operations / release

**Depends on:** 35.

- [ ] production Dockerfile;
- [ ] compose persistent volumes;
- [ ] env/config example;
- [ ] backup command/script;
- [ ] restore command/script;
- [ ] snapshot verify CLI;
- [ ] snapshot compact/GC CLI;
- [ ] replay verify CLI;
- [ ] operations docs;
- [ ] corrupted DB/snapshot recovery docs;
- [ ] metrics dashboard template;
- [ ] benchmark report;
- [ ] Genesis release evidence;
- [ ] release checklist;
- [ ] clean-room install/start test;
- [ ] final CI green.

---

## 46.2. Dependency summary

Критический путь:

```text
Workspace
  ↓
Determinism
  ↓
Registries / Generic Entity + Relation Stores
  ↓
Canonical Serialization
  ├──────────────┐
  ↓              ↓
Scheduler     Minimal SQLite
  └──────┬───────┘
         ↓
Snapshot/Replay Foundation
  ├──────┴────────────┐
  ↓                   ↓
Migrations       External Input
  └────────┬──────────┘
           ↓
Content Foundation
           ↓
        GATE A
           ↓
Topology → Environment → Materials → Objects
           ↓
Primitive Physical Actions
           ↓
Agent → Goals → Planner
           ↓
        GATE B
           ↓
Genesis Mechanism + Pacing
           ↓
Memory
           ↓
Relationships
           ↓
Structured Communication
           ↓
Beliefs/Culture
           ↓
Social Learning/Gossip
           ↓
Economy
           ├─────────────┐
           ↓             │
World Modification       │
           ↓             │
Technology               │
           └──────┬──────┘
                  ↓
Collectives → Organizations
          └───────┬───────┘
                  ↓
             Demography
                  ↓
          History/Narrative
                  ↓
               GATE C
                  ↓
Snapshot Ops Hardening
                  ↓
Production Projections/Ops
                  ↓
     PRODUCTION GENESIS FREEZE
                  ↓
             worldd/API
                  ↓
              Frontend
                  ↓
       Performance/Soak
                  ↓
          Packaging/Release
```

## 46.3. Явно запрещённые обратные зависимости

Следующие зависимости считаются architectural defect:

- Genesis implementation → future snapshot repository, которого ещё нет;
- Gate A → planner/materials;
- planner core → concrete strategy implementation;
- primitive physical action stage → economy/social/organization implementations;
- beliefs/gossip → nonexistent relationship/trust layer;
- gossip/teaching → nonexistent structured communication layer;
- technology `StructureBlueprint` → nonexistent Structure substrate;
- production collective substrate → nonexistent generic RelationStore;
- production Genesis hash → incomplete v1 module/content manifest;
- frontend/API → прямой canonical mutable storage;
- blockchain adapter → domain storage/reducer internals;
- retention/GC settings → canonical state outcome.

## 46.4. Разрешённые forward extension seams

Допускается, что ранний subsystem предоставляет interface, который заполняется позднее:

- planner имеет пустой `StrategySource`, позднее подключается learning module;
- Agent имеет memory/social/knowledge refs/interfaces, но concrete stores появляются позже;
- ActionProvider registry существует до social/economic providers;
- GoalProvider registry существует до social/organization goals;
- generic RelationStore существует до social/collective semantics;
- snapshot repository знает module sections до появления production modules;
- ExternalInputProvider существует как fake/test adapter до blockchain adapter.

Главное правило: ранний этап может предоставлять **interface**, но не должен скрытно реализовывать будущую domain subsystem.

---

# 47. CLI

`simctl` minimum:

```text
simctl init-world --config <file>
simctl status
simctl pause
simctl resume
simctl set-speed 1
simctl set-speed 10
simctl set-speed 100
simctl pacing-status
simctl snapshot
simctl snapshot-status
simctl snapshot-verify [<id>]
simctl snapshot-compact
simctl snapshot-gc --dry-run
simctl snapshot-gc
simctl verify
simctl replay --from-genesis
simctl replay --snapshot <id>
simctl inspect-entity <id>
simctl inspect-agent <id>
simctl inspect-place <id>
simctl inspect-collective <id>
simctl inspect-components <id>
simctl explain-agent <id>
simctl seed-scenario <file>
simctl export-chronicle
simctl modules
simctl content-manifest
```

No direct canonical table patch command.

`simctl init-world` имеет два clearly separated режима:

- test/development fixture — до Production Genesis Freeze;
- production initialization — только с manifest/config, совпадающими с frozen v1 Genesis release evidence.

Production mode обязан fail closed при несовпадении engine/module/content/genesis manifest hashes.

---

# 48. Конфигурация и tuning

Canonical world config versioned and hashed.

Categories:

- Genesis parameters;
- `genesis_population` (product-v1 must equal 1000);
- Genesis age cohort/lifecycle ranges;
- `genesis_initial_decision_spread` (default 300 world seconds);
- simulation calendar/lifecycle constants;
- need curves;
- planner limits;
- memory limits;
- exploration;
- experiment budget;
- relationship decay;
- organization thresholds;
- resource regeneration;
- weather variability;
- significance thresholds;
- performance caps;
- enabled modules/content manifests.

Canonical config change after Genesis проходит как versioned admin input, если параметр влияет на world state.

Operational pacing config хранится отдельно.

Минимум:

```text
speed_factor: 1 | 10 | 100
```

Он определяет соответствие real time → target `WorldTime`, но не изменяет domain formulas.

Persisted `PacingState` должен переживать restart.

`PacingState` реализуется вместе с WorldRunner/Genesis mechanism после Scheduler Core. Scheduler Core не читает wall clock и не зависит от `PacingState`.

Operational persistence/snapshot config хранится отдельно от canonical world config, потому что snapshot cadence не должна менять world semantics.

Минимум:

```text
snapshot_world_interval = 6h
snapshot_state_change_threshold = N
snapshot_chunk_entity_range = versioned fixed value
max_delta_chain_depth = 128
snapshot_rebase_world_interval = 30d
snapshot_gc_grace_real_hours = 24
snapshot_keep_frequent_world_days = 7
snapshot_keep_daily_world_days = 90
snapshot_keep_weekly = true
zstd_level = operational value
```

Изменение этих параметров не должно менять canonical state hash.

---

# 49. Защита от комбинаторного взрыва

Mandatory limits:

- planner expansion budget;
- local target top-N;
- local social set;
- local graph scope;
- recipe mutation edit limit;
- experiment cooldown/budget;
- structural duplicate hashing;
- memory consolidation;
- strategy cap;
- belief cap;
- gossip fanout cap;
- collective membership policy limits;
- no all-pairs scan;
- no all-world path search per decision;
- module handler work budget;
- external input size/rate caps.

---

# 50. Criteria эмерджентности

Перед beta провести multi-seed experiment и измерить:

- unique technology lineages;
- lineage depth;
- collective policy fingerprints;
- trade concentration;
- social graph divergence;
- belief diversity;
- false-belief survival;
- migration patterns;
- inequality;
- route centrality changes;
- population/collective churn.

Если разные seeds дают почти одинаковую историю, goal не достигнут.

---

# 51. Future LLM reserve

LLM не входит в текущий canonical product.

Boundaries должны позволять позже:

1. render SpeechAct;
2. художественно описывать Episode/Belief;
3. world historian;
4. summarizer;
5. non-canonical dialogue;
6. предлагать candidate structured actions, которые проходят обычную validation.

LLM никогда напрямую не пишет canonical state.

---

# 52. Future blockchain reserve

Позднее отдельный adapter/service сможет:

- связывать external blockchain identity с entity;
- наблюдать finalized chain events;
- формировать NormalizedExternalEvent;
- применять InfluencePolicy;
- посылать typed WorldCommand;
- публиковать state commitments.

Критерий архитектурной готовности: blockchain adapter добавляется без изменения physics, planner, technology, social, economy, scheduler и replay core.

---

# 53. Definition of Done продукта v1

Продукт готов только если одновременно выполнены условия:

1. Engine deterministic/replayable.
2. Cross-platform state hash совпадает.
3. 10k agents realtime reference hardware.
4. GPU не требуется.
5. Restart/catch-up работают.
6. Snapshot/replay tests зелёные.
7. Agent decisions основаны на needs/context/knowledge.
8. Planner строит primitive sequences.
9. Learning/strategies работают.
10. Structured memories/beliefs работают.
11. False beliefs возможны.
12. Directional social graph работает.
13. Gossip/imitation/cultural transmission работают.
14. Barter/subjective value economy работает.
15. Useful technology/design может появиться без item-specific invention command.
16. Technology lineage/diffusion работают.
17. Agents изменяют graph world/infrastructure.
18. High-level place labels выводятся из simulation state.
19. Generic collectives/organizations возникают и изменяют policies.
20. Generic CollectiveEntity поддерживает nested collectives.
21. Архитектура позволяет позднее добавить communities/settlements/polities модулем, без world-core refactor.
22. Поколения и genetic/cultural inheritance работают.
23. UI показывает world graph, agents, collectives, technology, chronicle.
24. Decision explainability доступна.
25. Derived text не влияет на state.
26. ComponentRegistry/ModuleRegistry существуют и используются.
27. Content/prototype/capability registry существует.
28. Добавление test state не требует изменения scheduler/replay/entity core.
29. Добавление test material/object не требует изменения planner source.
30. TestExtensionModule проходит snapshot/replay/migration.
31. Unknown canonical schema fails closed.
32. ExternalInputProvider/InfluencePolicy boundary реализован.
33. Fake external input изменяет state только через typed command/reducer.
34. External dedupe/replay протестированы.
35. Domain model не зависит от Ethereum address.
36. State hash пригоден для future commitment.
37. 24h accelerated soak пройден.
38. Multi-seed diversity experiment пройден.
39. Benchmark/operations docs готовы.
40. CI зелёный.
41. Product-v1 initialization создаёт ровно 1000 Genesis agents.
42. Genesis создаётся детерминированно и имеет reproducible Genesis state hash.
43. Genesis population не получает fake prehistory, готовые organizations и learned technologies.
44. Начальные 1000 agents имеют deterministic age cohorts `150/600/200/50` и валидное deterministic placement.
45. После Genesis нет arbitrary production spawn/replenishment; новые agents появляются через world lifecycle/reproduction rules.
46. `simctl init-world` fail-closed защищает уже существующий мир.
47. `1x`, `10x`, `100x` и pause реализованы как WorldRunner pacing, а не изменение domain formulas.
48. При одинаковом target `WorldTime` state hash совпадает независимо от pacing factor/history.
49. `set-speed` re-anchor, restart persistence и pacing lag протестированы.
50. Genesis-1000 headless accelerated benchmark опубликован; `100x` не пропускает события и не ослабляет simulation rules.
51. Genesis snapshot является immutable base manifest в content-addressed repository.
52. Обычные snapshot points после Genesis создаются как delta snapshots, а не физические full copies.
53. Неизменившиеся chunks дедуплицируются по canonical content hash.
54. Stable chunking не разрушает дедупликацию при локальном изменении одной entity/component shard.
55. Delta chain имеет bounded depth и автоматически rebase/compact.
56. Rebase не меняет canonical state hash и переиспользует существующие chunks.
57. Retention реализован pins/manifests без копирования state.
58. Mark-and-sweep GC доказан тестами: reachable chunks никогда не удаляются.
59. Crash между chunk write и manifest commit безопасен; orphan chunks чистятся GC.
60. Corrupt latest delta допускает deterministic fallback + replay.
61. Snapshot cadence/compression/retention settings не влияют на canonical state hash.
62. 180-world-day benchmark публикует physical snapshot bytes и dedupe ratio.
63. Все этапы §46 имеют explicit dependencies; spec не требует реализовать subsystem до его dependency stage.
64. Gate A пройден до simulation/gameplay modules.
65. Gate B пройден до society gameplay modules.
66. Structured Communication реализован отдельным этапом до gossip/teaching/economic negotiation.
67. Structure substrate реализован до `StructureBlueprint`.
68. Production Genesis hash фиксируется только на Gate D после final v1 module/content manifest.
69. Planner strategy integration активируется только после Memory/Learning; Planner Core использует empty `StrategySource`.
70. Social/trade/organization ActionProviders не реализуются внутри раннего Primitive Physical Action stage.

---

# 54. Архитектурное резюме

```text
                        EXTERNAL SOURCES (future)
                  Ethereum / admin / signed inputs
                               │
                               ▼
                     ExternalInputProvider
                               │
                               ▼
                    NormalizedExternalEvent
                               │
                        InfluencePolicy
                               │
                               ▼
                         WorldCommand
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│              DETERMINISTIC CANONICAL WORLD ENGINE            │
│                                                              │
│  Genesis(1000) / WorldTime / Scheduler / RNG / Commands      │
│  Runner pacing: pause / 1x / 10x / 100x                      │
│                        │                                     │
│        ┌───────────────┼────────────────┐                    │
│        ▼               ▼                ▼                    │
│   ModuleRegistry   ComponentRegistry  ContentRegistry        │
│        │               │                │                    │
│        └───────────────┼────────────────┘                    │
│                        ▼                                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Domain modules                                         │  │
│  │ agents / needs / social / economy / materials          │  │
│  │ objects / technology / culture / collectives           │  │
│  │ institutions / demography / narrative projections      │  │
│  └────────────────────────────────────────────────────────┘  │
│                        │                                     │
│                   Graph Topology                             │
│                        │                                     │
│        future: HybridTopology backend                        │
└────────────────────────┬─────────────────────────────────────┘
                         │
          ┌──────────────┼─────────────────┐
          ▼              ▼                 ▼
   Canonical Inputs   Delta Snapshots  Derived History
          │              │                 │
          │        CAS Chunk Store          │
          └──────────────┴─────────────────┘
                         │
                       SQLite
                         │
                   Read Projections
                         │
                     API / UI
```

Главная ставка проекта — **комбинаторная эмерджентность при жёсткой детерминированности и модульной расширяемости**.

Разработчик должен предпочитать общие laws/capabilities/components/providers высокоуровневым special cases.

Перед добавлением любого нового понятия необходимо ответить:

1. Это content extension или rule extension?
2. Это canonical или derived state?
3. Какой module владеет понятием?
4. Нужен ли новый component/relation?
5. Нужен ли новый command/event/provider?
6. Нужна ли schema migration?
7. Может ли planner обнаружить новую возможность через capability/action provider?
8. Нужно ли world-core вообще знать об этом понятии?

Если ответ на пункт 8 — «да», это должно быть обосновано как фундаментальная абстракция.

Понятия вроде религии, локального сообщества, поселения, государства, школы, эпидемии, нового материала, нового инструмента, новой потребности или новой социальной роли **не должны сами по себе требовать изменений world-core**.

Если новый этап требует subsystem, который в §46 расположен позже, developer не должен «додумывать» или преждевременно реализовывать его. Это считается ошибкой dependency DAG и требует сначала обновить spec.

