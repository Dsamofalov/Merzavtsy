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
- должна позволять добавлять новые состояния, сущности, материалы, отношения, действия и большие общественные подсистемы без переписывания ядра World Engine.

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

Snapshot не сериализует один giant Rust struct.

Концептуальный layout:

```text
Snapshot
  world metadata
  engine protocol version
  module manifest
  content manifest
  entity table
  component sections + schema versions
  graph sections
  scheduler state
  external-input cursor/dedupe state
  state hash
```

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

## 3.25. Extensibility acceptance gate

До реализации большого количества gameplay-модулей необходимо создать test-only extension module, который добавляет:

- component;
- command;
- event;
- scheduled handler;
- action provider;
- derived view.

Тест должен доказать, что не были изменены scheduler, replay, RNG, storage transaction core и generic entity model.

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
- binary snapshots + Zstd;
- read models в SQLite.

Причина: один canonical writer естественно соответствует SQLite и минимизирует инфраструктурную сложность.

Storage boundary должен позволять позднее добавить PostgreSQL без изменения domain logic.

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
4. determine target WorldTime;
5. `advance_to(target)` без sleeps;
6. suppress excessive live notifications;
7. resume realtime pacing.

---

# 9. Полностью графовая модель мира v1

## 9.1. Place graph

Мир v1 состоит из `PlaceNode` и `RouteEdge`.

Place — абстрактная область, а не hardcoded город/дом.

## 9.2. PlaceNode

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

## 9.3. RouteEdge

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

## 9.4. Graph layers

Разделить:

1. movement/place graph;
2. resource/infrastructure flow graph;
3. social/collective graph;
4. object/part graph.

## 9.5. Derived labels

`Village`, `City`, `MarketDistrict` и аналогичные ярлыки являются derived projections, если соответствующий будущий module не требует materialized collective entity.

---

# 10. Готовность к будущему hybrid world

## 10.1. TopologyBackend

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

## 10.2. No graph internals leakage

Cognition/social/economy/technology modules не импортируют concrete graph storage.

## 10.3. Migration path

Будущий `HybridTopology` должен сохранить macro IDs и high-level APIs, добавив chunks/cells/coordinates как backend detail.

---

# 11. Среда и ресурсы

## 11.1. Environment components

Place environment содержит целочисленные параметры:

- temperature baseline;
- seasonal amplitude;
- moisture;
- fertility;
- water availability;
- shelter exposure;
- hazard;
- biome/resource profile.

## 11.2. Seasons

Season function зависит только от WorldTime/config.

## 11.3. Weather anomalies

Deterministic keyed-random по region/time epoch.

## 11.4. ResourceDeposit

- resource/material type;
- quantity;
- accessibility;
- extraction difficulty;
- renewable flag;
- regeneration model;
- carrying capacity.

## 11.5. Lazy growth/depletion

Не обновлять ресурс каждую секунду.

---

# 12. Символическая физика материалов

## 12.1. MaterialDefinition

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

## 12.2. Generic transformations

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

## 12.3. No item-name physics

Нельзя давать физический bonus по имени типа предмета.

---

# 13. Объекты, части и конструкции

## 13.1. ObjectEntity

Object — entity с composition component.

Хранит:

- owner relation optional;
- location/carrier/container relation;
- part refs;
- condition;
- revision;
- derived affordance cache.

## 13.2. Part

- material;
- quantity/mass;
- length/thickness class;
- shape;
- edge/point sharpness;
- condition;
- temperature;
- connector capabilities.

## 13.3. Part relations

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

## 13.4. Derived affordances

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

## 13.5. Cache revision

Мутация composition graph invalidates cache.

---

# 14. Content, capabilities и affordances

## 14.1. Content packs

Материалы, базовые resource definitions и prototypes находятся в `content/` и загружаются через versioned registry.

## 14.2. Capability contracts

Capabilities имеют stable IDs и typed parameters при необходимости.

## 14.3. Affordance discovery

Action providers получают affordances из current components/capabilities.

Новый edible prototype автоматически становится candidate для consume action без изменения consume provider.

## 14.4. Content validation

Startup обязан проверить:

- duplicate IDs;
- missing dependencies;
- invalid ranges;
- content hash;
- schema version.

---

# 15. Универсальные primitive actions

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

# 16. Изменение мира существами

## 16.1. Общий принцип

Агенты преобразуют объекты, ресурсы, structures и graph links.

Нет `BUILD_HOUSE` как primitive.

## 16.2. Structure

Structure — composition/part graph, anchored к Place или Route.

Derived свойства:

- shelter;
- storage;
- security;
- workspace;
- heat;
- production capacity;
- route support.

## 16.3. Interior place

При достаточном enclosure/access engine может materialize child PlaceNode как физическое внутреннее пространство.

## 16.4. Roads

Traffic/compaction/surface improvement меняют route cost/quality.

## 16.5. Bridges/tunnels

Infrastructure может enable route. Destruction может disable route.

## 16.6. Water graph

`WaterFlowEdge` с symbolic hydraulic head/capacity/leakage.

Пересчитывать affected connected component.

## 16.7. Cultivation

PLANT создаёт renewable population. Growth зависит от environment/species/harvesting pressure.

---

# 17. Модель мерзавчика через components

## 17.1. AgentCoreComponent

Минимально стабильные core refs:

- entity/agent ID;
- birth time;
- alive/dead lifecycle;
- location relation;
- local decision sequence.

Не помещать в AgentCore все будущие состояния.

## 17.2. Built-in modules/components

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

## 17.3. External identity

Blockchain/wallet identity не является AgentId.

Использовать отдельный `ExternalIdentityLink` component/module.

---

# 18. Traits и Needs

## 18.1. Built-in personality traits

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

## 18.2. Built-in needs

- energy;
- hunger;
- safety;
- social;
- status;
- novelty;
- comfort;
- attachment/reproduction drive по lifecycle policy.

## 18.3. Need registry

Built-in needs используют тот же NeedTypeId/definition path, что future needs.

## 18.4. Lazy dynamics

Needs материализуются по времени, не тикают каждую секунду.

---

# 19. Goals и Utility System

## 19.1. Built-in goal providers

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

## 19.2. Goal collection

На decision event:

1. materialize relevant state;
2. collect local threats/opportunities;
3. collect social obligations;
4. collect active collective rules;
5. collect unfinished goals;
6. query GoalProviders;
7. apply bounded candidate budget;
8. compute integer utility.

## 19.3. Utility factors

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

## 19.4. Controlled exploration

Top-K deterministic weighted choice, а не всегда top-1.

---

# 20. Planner

## 20.1. Approach

Bounded GOAP-like planner + learned macro strategies.

## 20.2. Default budgets

- primitive depth <= 6;
- beam width <= 8;
- expansions <= 128;
- bounded local target top-N;
- stable ordering.

## 20.3. Symbolic state

Planner не клонирует весь WorldState.

## 20.4. Strategy first

Проверять learned macros перед search.

## 20.5. Fallback

REST/WAIT/MOVE_TO_SAFE/OBSERVE или module-provided safe fallback.

---

# 21. Обучение без нейросетей

## 21.1. OutcomeRecord

- context features;
- plan/action sequence;
- expected utility;
- actual utility delta;
- resource delta;
- safety delta;
- social delta;
- duration;
- success/failure.

## 21.2. Strategy scoring

Integer EMA/score.

## 21.3. Macro extraction

Успешная повторяющаяся sequence может стать Strategy entity/knowledge.

## 21.4. Mutation

Ограниченные mutations:

- target policy;
- resource/material;
- one primitive replacement;
- insertion/removal;
- threshold;
- local reorder.

## 21.5. Imitation

Передаётся observable abstraction, а не hidden state.

---

# 22. Память

## 22.1. Types

- episodic;
- relationship;
- procedural;
- semantic/belief;
- institutional/cultural.

## 22.2. Episode

- time;
- place;
- participants;
- category;
- observed facts;
- valence;
- importance;
- confidence.

## 22.3. Finite memory

Importance + recency + memory_bias. Consolidation обязательна.

## 22.4. No prose canonical memory

Canonical memory structured only.

---

# 23. Beliefs и ошибочные убеждения

## 23.1. Belief

- proposition type/key;
- subject/object refs;
- confidence;
- evidence counters;
- source;
- last update;
- social origin optional.

## 23.2. Partial knowledge

Agent не видит глобальную истину.

## 23.3. False causality

Повторяющаяся correlation может породить неверный causal belief.

## 23.4. Planner impact

Belief влияет на expected outcome/utility.

---

# 24. Отношения и social graph

## 24.1. Directional relation

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

## 24.2. Lazy creation

Relation создаётся после meaningful contact.

## 24.3. Extensible relation storage

Future module может добавлять relation components без изменения generic graph store.

## 24.4. Local candidate selection

No all-pairs scans.

---

# 25. Коммуникация без LLM

## 25.1. SpeechAct

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

## 25.2. Structured payload

Typed refs/propositions/actions, не natural-language canonical strings.

## 25.3. Renderer

Pure procedural text renderer.

## 25.4. LLM seam

Future LLM получает SpeechAct и context, но не меняет state напрямую.

---

# 26. Gossip, memes и культура

## 26.1. Gossip payload

- belief;
- opinion;
- event claim;
- strategy rumor;
- technology claim.

## 26.2. Distortion

Deterministic bounded mutation.

## 26.3. CulturalMeme

Категории:

- belief;
- taboo;
- preference;
- norm;
- ritualized procedure;
- strategy;
- symbol association;
- out-group attitude.

## 26.4. Meme lineage

Origin, parent, generation, adoption strength, transmission stats.

---

# 27. Экономика

## 27.1. Ownership as relation/component

Ownership не должен быть hardcoded только в Object struct; нужен generic ownership relation, пригодный также для collectives.

## 27.2. Subjective value

No fixed global price.

Depends on need, scarcity, usefulness, local availability, risk, obligation, remembered trades.

## 27.3. Barter first

Offer bundles.

## 27.4. Market derived

Market — high trade flow pattern, а не mandatory canonical entity.

## 27.5. Scarcity feedback

Consumption/production influence future behavior.

---

# 28. Технологии и изобретения

## 28.1. No full tech tree

Technology emerges from operations + materials + designs + knowledge.

## 28.2. ProcessRecipe

- operation graph/sequence;
- input constraints;
- parameters;
- observed output descriptors;
- success stats;
- discoverer;
- parent lineage;
- creation time.

## 28.3. ObjectDesign

Part graph template + constraints.

## 28.4. StructureBlueprint

Composition, connectors, relative geometry, material constraints, build sequence.

## 28.5. Experiment mutations

Local bounded edits.

## 28.6. Discovery acceptance

Valid physical outcome + utility/novelty + observable result + non-duplicate.

## 28.7. Diffusion

Observation/teaching/trade/imitation/theft/migration/collective knowledge.

## 28.8. Forgetting

Technology may disappear from living knowledge while remaining historical.

---

# 29. Collectives, organizations и future communities/settlements/polities

## 29.1. Generic collective foundation

V1 реализует `CollectiveEntity` substrate и generic Organization behavior поверх него.

Не создавать отдельные foundational classes для Religion/State/Gang/Corporation.

## 29.2. Organization components

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

## 29.3. Emergent formation

Formation only due to motives:

- repeated cooperation;
- shared threat;
- resource coordination;
- kinship/social cluster;
- shared belief;
- specialization.

## 29.4. Policy mutation

Policies can change through module-defined decision rules.

## 29.5. Derived labels

UI can classify a collective as clan/cult/trade league/etc. Label is not canonical authority unless a module explicitly materializes a typed institution component.

## 29.6. Future local communities

Architecture reserve described in section 3 is mandatory. Community support can be added as module without world-core refactor.

## 29.7. Future settlements

Settlement module can bind collective + physical place/infrastructure graph.

## 29.8. Future states/polities

Nested collectives and authority/claim relations must permit multi-settlement political entities.

---

# 30. Демография, наследование и поколения

## 30.1. Birth

World-native agents appear through lifecycle/reproduction rules.

## 30.2. Biological inheritance

Deterministic crossover + bounded mutation.

## 30.3. Cultural inheritance

Memes, beliefs, recipes, priors, memberships may transfer independently of genetics.

## 30.4. Death

Dead entity remains historical/tombstoned; ID not reused.

## 30.5. External owner link separate

Future blockchain owner binding не определяет biological identity автоматически.

---

# 31. Процедурная история без LLM

## 31.1. SignificantEvent

Отделить technical actions от historical events.

## 31.2. Significance scoring

- affected entities;
- permanent state change;
- rarity;
- economic impact;
- social threshold;
- collective/technology impact;
- infrastructure impact;
- birth/death;
- causal consequences.

## 31.3. Chronicle

Derived, replayable, template-rendered.

---

# 32. Canonical input log, snapshots и persistence model

## 32.1. Replay basis

Replay основывается на:

- engine protocol version;
- module manifest;
- content manifest;
- genesis;
- world seed;
- canonical external/admin inputs.

Внутренние decisions пересчитываются.

## 32.2. Storage classes

### canonical_inputs

Неперестраиваемые внешние факты и versioned admin changes.

### derived_history

Перестраиваемые significant events.

### snapshots

Быстрый restore state.

## 32.3. Snapshot policy

Default:

- every 6 world hours or N state changes;
- no duplicate revision snapshot;
- Zstd;
- checksum;
- engine/module/content manifests;
- input sequence;
- world time;
- state hashes.

## 32.4. Retention

Configurable retention: recent frequent + daily + weekly.

## 32.5. Module manifests

Snapshot/DB metadata фиксирует installed module IDs/versions/schema versions.

---

# 33. Canonical serialization и state hash

## 33.1. CanonicalWriter

Не использовать arbitrary serde map encoding как consensus format.

## 33.2. Ordering

Entities/components/relations serialise in documented stable order.

## 33.3. Hashes

- BLAKE3 local integrity;
- Keccak-256 future blockchain commitment.

## 33.4. Hash domain

Includes:

- engine protocol version;
- module manifest hash;
- content manifest hash.

## 33.5. Migration hashing

Old snapshot migrated twice must produce identical new hash.

---

# 34. Future blockchain/transaction influence boundary

## 34.1. Статус

Blockchain gameplay integration сейчас не реализуется, но architectural seam обязателен.

## 34.2. ExternalInputProvider

Provider выдаёт `NormalizedExternalEvent`.

World Engine не знает RPC/EVM/block headers.

## 34.3. NormalizedExternalEvent

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

## 34.4. Blockchain-specific metadata isolated

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

## 34.5. InfluencePolicy

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

## 34.6. No arbitrary field patch

Запрещён production command вида:

```text
SET_FIELD(entity, path, arbitrary_value)
```

Новый effect получает typed command + validator.

## 34.7. Idempotency

`(source_kind, external_event_id)` unique.

Повторная доставка не меняет state второй раз.

## 34.8. Ordering

Future EVM adapter должен выдавать finalized events в explicit deterministic order, например:

```text
chain_id
block_number
transaction_index
log_index
```

## 34.9. Finality/reorg

Adapter решает finality до canonical engine.

Engine получает finalized accepted facts.

## 34.10. External identity

Entity identity не равна wallet address.

```text
ExternalIdentityLink {
  entity_id,
  namespace,
  identity_value
}
```

## 34.11. Future transaction effects

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

## 34.12. State commitments

Snapshot/state hashing должен позволять позднее публиковать state root/snapshot hash/event batch hash в blockchain.

## 34.13. Fake provider acceptance test

До завершения foundation сделать fake provider + test policy и доказать full path с dedupe/replay.

---

# 35. World Engine process

## 35.1. worldd

Responsibilities:

- load config;
- validate engine/module/content manifests;
- migrate DB;
- load snapshot;
- replay inputs;
- start world runner;
- start API;
- metrics;
- snapshots;
- read models;
- graceful shutdown.

## 35.2. Mutation queue

Bounded queue.

Canonical loop:

1. receive command/advance request;
2. validate;
3. execute through registered handler;
4. update revision;
5. atomically persist required input/metadata;
6. publish derived notification.

## 35.3. Backpressure

External API returns 429/503 rather than drop commands.

Internal scheduled events never silently drop.

---

# 36. Persistence schema

Минимальные tables:

- schema_meta;
- world_meta;
- module_manifest;
- content_manifest;
- canonical_inputs;
- external_event_dedupe;
- snapshots;
- derived_events;
- entity/component read projections;
- agents_read;
- places_read;
- relationships_read;
- collectives_read;
- technologies_read;
- objects_read optional;
- operations_journal.

Canonical deep state может жить in-memory + snapshots; SQL read tables are projections.

---

# 37. API

## 37.1. Read API

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

## 37.2. Module sections

API core DTO must not require adding a field for every future component.

Support typed module sections/component descriptors.

## 37.3. Live stream

Derived notifications only.

## 37.4. Admin API

Pause/resume/speed/snapshot/verify/shutdown/rebuild read models.

State-affecting admin action goes through command path.

---

# 38. Frontend

## 38.1. World overview

World time, population, collectives, technology count, recent events, resource stress, simulation status.

## 38.2. Graph map

Places/routes/population/infrastructure/trade/collective influence.

Level-of-detail required.

## 38.3. Agent profile

Core identity + dynamically render known module sections.

Specialized views for built-in traits/needs/memory/social/knowledge.

## 38.4. Place page

Residents/resources/structures/routes/trade/collectives/events/derived labels.

## 38.5. Technology page

Lineage/adopters/design/performance/diffusion.

## 38.6. Collective page

Policies/members/roles/resources/beliefs/relations/history.

## 38.7. Chronicle

Filterable significant event feed.

## 38.8. Explainability

Показывать:

- selected goal;
- alternatives;
- utility breakdown;
- plan/strategy;
- beliefs;
- memory refs;
- deterministic decision scope identifier.

---

# 39. Resource budget и performance targets

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

## 39.1. RAM

Target RSS <=16 GB, blocker >24 GB steady state on 32 GB machine.

## 39.2. CPU

Realtime reference world should have catch-up headroom.

## 39.3. Decision throughput

Beta target >=200 full agent decisions/s synthetic benchmark.

## 39.4. Catch-up

>=10x realtime with live rendering disabled.

## 39.5. API

p95 <250 ms common read requests.

## 39.6. Disk

Design for 20–100 GB/180 days reference world; 1 TB NVMe comfortable.

Do not indefinitely store every internal action.

---

# 40. Observability

Metrics:

- world time;
- lag;
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
- snapshot duration/size;
- state hash;
- catch-up;
- command queue;
- API latency/errors;
- per-module event/handler metrics.

Logs: structured `tracing` JSON.

---

# 41. Security and safety boundaries

## 41.1. Admin auth

Token/mTLS/reverse proxy restriction.

## 41.2. No arbitrary execution

No executable recipes/rules.

## 41.3. Bounded computational work

Planner, recipe exploration, gossip propagation, module handlers have hard budgets.

## 41.4. External inputs

Future providers require schema validation, dedupe, allowlist, size/rate limits, deterministic mapping.

## 41.5. Secrets

World simulation requires no private key.

Future blockchain signer/submission is separate process/service boundary.

## 41.6. Module safety

Domain module cannot bypass canonical command context to mutate unrelated component stores.

---

# 42. Обязательные инварианты

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

---

# 43. Эмерджентные scenario tests

Fixed seeds + assertions:

## 43.1. Emergent path

Repeated movement changes route attractiveness under physical rules.

## 43.2. Tool discovery

Curious agent discovers useful design without item-specific invention command.

## 43.3. Technology diffusion

Teaching/imitation spreads technology.

## 43.4. Technology mutation

Variant + lineage.

## 43.5. False belief

Correlation creates wrong belief, changes behavior, can spread.

## 43.6. Organization emergence

Repeated cooperation/shared threat creates generic collective organization without story command.

## 43.7. Organization split

Cohesion/policy conflict can split.

## 43.8. Resource shock

Food scarcity changes values/trade/migration/strategies.

## 43.9. Infrastructure consequence

New route changes downstream movement/trade.

## 43.10. Water consequence

Water edge changes downstream availability/production utility.

## 43.11. Cross-seed diversity

20 seeds must show meaningful diversity metrics.

---

# 44. Обязательные тесты архитектурной расширяемости

## 44.1. TestExtensionModule

Test-only module adds:

- new component;
- command;
- canonical event;
- scheduled handler;
- action provider;
- goal provider;
- derived projection.

Adding it may require only composition-root registration and test fixture changes, not engine internals.

## 44.2. State extension test

Добавить test state `TestMoodLikeState` или аналог, отсутствующий в base modules.

Проверить:

1. default initialization;
2. typed mutation;
3. snapshot;
4. restore;
5. replay;
6. schema migration;
7. stable hash.

## 44.3. Content extension test

Добавить новый material + object prototype content-only.

Planner/action provider должен использовать его по capabilities без source change planner.

## 44.4. Collective extension test

Test-only module:

- creates collective;
- adds two members;
- stores shared resource;
- persists membership relation;
- snapshot/replay identical.

## 44.5. Nested collective test

Создать collective, который содержит два collectives, и проверить generic graph/persistence. Это доказательство future polity compatibility, не gameplay state implementation.

## 44.6. External input test

Fake `ExternalInputProvider`:

```text
external event
→ InfluencePolicy
→ typed command
→ reducer
→ canonical event/state
→ snapshot/replay
```

Duplicate event ID has no second effect.

## 44.7. Core-change guard

CI/docs должны перечислять files/crates, которые не должны изменяться для test extension. Architecture review gate проверяет нарушение boundary.

---

# 45. Пошаговый план разработки

Каждый этап состоит из атомарных задач. Foundation gates должны быть зелёными до наращивания domain complexity.

## Этап 0. Rust workspace foundation

- [ ] создать Cargo workspace;
- [ ] rust-toolchain;
- [ ] rustfmt;
- [ ] clippy policy;
- [ ] создать core crates;
- [ ] создать module crates skeleton;
- [ ] worldd;
- [ ] simctl;
- [ ] CI fmt/clippy/tests;
- [ ] Windows/Linux matrix;
- [ ] Docker builder;
- [ ] compose baseline.

## Этап 1. Deterministic primitives

- [ ] EntityId/newtypes;
- [ ] StableArena;
- [ ] fixed-point types;
- [ ] WorldTime;
- [ ] keyed random scope;
- [ ] weighted choice;
- [ ] stable ordering helpers;
- [ ] bounds property tests;
- [ ] random non-shift test;
- [ ] cross-platform fixture.

## Этап 2. Extensibility foundation

- [ ] ModuleId/ComponentTypeId/CommandTypeId/EventTypeId/etc;
- [ ] ComponentRegistry;
- [ ] ModuleRegistry;
- [ ] component store abstraction;
- [ ] typed command handler registry;
- [ ] scheduled handler registry;
- [ ] ActionProvider registry;
- [ ] GoalProvider registry;
- [ ] CapabilityRegistry;
- [ ] RelationTypeRegistry;
- [ ] ContentPack manifest;
- [ ] unknown schema fail-closed tests.

## Этап 3. Canonical serialization + module manifests

- [ ] protocol version;
- [ ] CanonicalWriter;
- [ ] entity/component section encoding;
- [ ] module manifest encoding;
- [ ] content manifest encoding;
- [ ] BLAKE3;
- [ ] Keccak;
- [ ] golden bytes fixture;
- [ ] unordered container guards.

## Этап 4. Schema migrations

- [ ] migration trait/registry;
- [ ] component version migration;
- [ ] module manifest compatibility validation;
- [ ] deterministic migration ordering;
- [ ] backup/dry-run hooks;
- [ ] old fixture migration test;
- [ ] state hash migration test.

## Этап 5. Scheduler/world loop

- [ ] priority queue;
- [ ] ScheduleId;
- [ ] cancellation/generation;
- [ ] registered handlers;
- [ ] advance_to;
- [ ] monotonic assertions;
- [ ] runner clock adapter;
- [ ] realtime factor;
- [ ] catch-up;
- [ ] pause/resume tests.

## Этап 6. Content/prototype/capability foundation

- [ ] content loader;
- [ ] stable IDs;
- [ ] content hashes;
- [ ] dependency validation;
- [ ] prototype registry;
- [ ] capability descriptors;
- [ ] invalid content tests;
- [ ] content-only extension fixture.

## Этап 7. Graph topology

- [ ] PlaceStore;
- [ ] RouteStore;
- [ ] sorted adjacency;
- [ ] parent-child places;
- [ ] route create/disable;
- [ ] reachability;
- [ ] shortest path integer cost;
- [ ] TopologyBackend;
- [ ] no higher-domain concrete import test;
- [ ] topology invariants.

## Этап 8. Environment/resources

- [ ] environment components;
- [ ] seasons;
- [ ] anomalies;
- [ ] deposits;
- [ ] lazy renewables;
- [ ] depletion;
- [ ] extraction API;
- [ ] conservation tests.

## Этап 9. Materials/physics

- [ ] MaterialDefinition schema;
- [ ] material property fixed types;
- [ ] heat/cool;
- [ ] burn;
- [ ] dry/wet;
- [ ] crush/grind;
- [ ] mix;
- [ ] compress/shape;
- [ ] transformation fixtures;
- [ ] no item-name special case audit test.

## Этап 10. Objects/parts

- [ ] Object composition component;
- [ ] Part;
- [ ] connector relations;
- [ ] attach/detach validation;
- [ ] location/carrier/container;
- [ ] affordance calculator;
- [ ] revision cache;
- [ ] container capacity;
- [ ] support;
- [ ] cutting/piercing/impact;
- [ ] rolling/rotation;
- [ ] invariants.

## Этап 11. Primitive action framework

- [ ] ActionProvider contract;
- [ ] action descriptor;
- [ ] typed args;
- [ ] symbolic preconditions/effects;
- [ ] actual command mapping;
- [ ] failure type;
- [ ] observation result;
- [ ] movement/inventory providers;
- [ ] transformation providers;
- [ ] social/trade providers;
- [ ] deterministic tests.

## Этап 12. Agent components

- [ ] AgentCoreComponent;
- [ ] genome;
- [ ] traits;
- [ ] body;
- [ ] needs registry/built-ins;
- [ ] inventory index;
- [ ] goal/plan state components;
- [ ] knowledge/memory/social refs;
- [ ] lifecycle;
- [ ] lazy need materialization;
- [ ] threshold scheduling;
- [ ] spawn/death.

## Этап 13. Goals/utility

- [ ] GoalProvider contract;
- [ ] built-in providers;
- [ ] candidate budget;
- [ ] integer utility breakdown;
- [ ] top-K;
- [ ] weighted selection;
- [ ] explanation object;
- [ ] module goal extension test.

## Этап 14. Planner

- [ ] symbolic planner state;
- [ ] bounded beam search;
- [ ] depth/expansion budgets;
- [ ] stable tie-break;
- [ ] target limiter;
- [ ] strategy-first;
- [ ] fallback;
- [ ] benchmark;
- [ ] no-world-clone test.

## Этап 15. Memory/learning

- [ ] Episode;
- [ ] importance;
- [ ] consolidation;
- [ ] OutcomeRecord;
- [ ] strategy score;
- [ ] macro extraction;
- [ ] strategy mutation;
- [ ] imitation;
- [ ] limits;
- [ ] deterministic forgetting.

## Этап 16. Beliefs/gossip/culture

- [ ] proposition schema;
- [ ] confidence update;
- [ ] evidence;
- [ ] false correlation;
- [ ] structured gossip;
- [ ] trust adoption;
- [ ] distortion;
- [ ] CulturalMeme;
- [ ] lineage;
- [ ] false belief scenario.

## Этап 17. Relationships

- [ ] generic relation storage;
- [ ] v1 directional social dimensions;
- [ ] lazy relation creation;
- [ ] contact events;
- [ ] updates;
- [ ] lazy decay;
- [ ] local candidate selection;
- [ ] extensible relation test;
- [ ] social benchmark.

## Этап 18. Economy

- [ ] ownership relation;
- [ ] subjective value;
- [ ] barter offer;
- [ ] accept/refuse;
- [ ] atomic trade;
- [ ] trade memory;
- [ ] scarcity;
- [ ] flow metrics;
- [ ] market projection;
- [ ] resource shock scenario.

## Этап 19. Technology discovery

- [ ] ProcessRecipe;
- [ ] ObjectDesign;
- [ ] StructureBlueprint;
- [ ] structural hash;
- [ ] experiment mutation;
- [ ] budget;
- [ ] utility/novelty;
- [ ] learning;
- [ ] teaching/copying;
- [ ] lineage;
- [ ] forgetting;
- [ ] discovery/diffusion scenarios.

## Этап 20. World modification

- [ ] Structure components;
- [ ] anchoring;
- [ ] shelter/storage/workspace;
- [ ] interior place rule;
- [ ] route traffic effects;
- [ ] surface upgrades;
- [ ] route enable/disable;
- [ ] water flow graph;
- [ ] local recalculation;
- [ ] cultivation;
- [ ] infrastructure scenarios.

## Этап 21. Collective substrate

- [ ] CollectiveEntity marker/component;
- [ ] membership relation;
- [ ] nested collective membership support;
- [ ] roles;
- [ ] shared resource pool;
- [ ] shared knowledge refs;
- [ ] decision policy interface;
- [ ] claim/influence/control relation types;
- [ ] collective external relations;
- [ ] snapshot/replay tests;
- [ ] nested collective test.

## Этап 22. Organizations/institutions v1

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
- [ ] derived labels;
- [ ] emergence scenario.

## Этап 23. Demography/generations

- [ ] age/lifecycle;
- [ ] reproduction eligibility;
- [ ] offspring;
- [ ] crossover;
- [ ] mutation;
- [ ] cultural inheritance;
- [ ] kin relations;
- [ ] death/history;
- [ ] carrying pressure;
- [ ] 100-generation test.

## Этап 24. History/narrative

- [ ] SignificantEvent;
- [ ] scoring;
- [ ] chronicle projection;
- [ ] procedural templates;
- [ ] speech styles;
- [ ] pure-render guarantee;
- [ ] tests.

## Этап 25. SQLite persistence

- [ ] migrations;
- [ ] WAL;
- [ ] manifests;
- [ ] canonical_inputs;
- [ ] dedupe;
- [ ] snapshot metadata;
- [ ] derived events;
- [ ] projections;
- [ ] operations journal;
- [ ] transaction boundaries;
- [ ] crash recovery.

## Этап 26. Snapshot/replay

- [ ] versioned section serializer;
- [ ] module/component sections;
- [ ] Zstd;
- [ ] checksum;
- [ ] atomic write;
- [ ] load validation;
- [ ] replay snapshot;
- [ ] replay genesis;
- [ ] state hash verify;
- [ ] corrupt fallback;
- [ ] retention;
- [ ] deterministic integration.

## Этап 27. External input seam

- [ ] ExternalInputProvider;
- [ ] NormalizedExternalEvent;
- [ ] dedupe storage;
- [ ] InfluencePolicy;
- [ ] typed external-event command conversion;
- [ ] fake provider;
- [ ] stable ordering;
- [ ] duplicate test;
- [ ] replay test;
- [ ] ExternalIdentityLink;
- [ ] document blockchain adapter contract.

## Этап 28. Extensibility proof gate

- [ ] TestExtensionModule;
- [ ] add new component without core change;
- [ ] add new command/event;
- [ ] add scheduler handler;
- [ ] add action provider;
- [ ] add goal provider;
- [ ] add content-only material/object;
- [ ] migration fixture;
- [ ] collective extension fixture;
- [ ] verify forbidden core files unchanged.

## Этап 29. worldd/API

- [ ] config;
- [ ] startup validation;
- [ ] manifest checks;
- [ ] DB migration;
- [ ] restore/replay;
- [ ] world runner;
- [ ] command queue;
- [ ] read API;
- [ ] component/module inspection API;
- [ ] live feed;
- [ ] admin API;
- [ ] health/readiness;
- [ ] graceful shutdown;
- [ ] metrics/logs.

## Этап 30. Frontend

- [ ] Next.js;
- [ ] API client;
- [ ] world overview;
- [ ] graph map;
- [ ] agent profile;
- [ ] dynamic component sections;
- [ ] decision explanation;
- [ ] place page;
- [ ] technology page;
- [ ] collective page;
- [ ] chronicle;
- [ ] search/filters;
- [ ] live updates;
- [ ] error/loading;
- [ ] Playwright smoke.

## Этап 31. Performance/soak/packaging

- [ ] 1k scenario;
- [ ] 10k scenario;
- [ ] 1M object fixture;
- [ ] 1M relationship fixture;
- [ ] planner benchmark;
- [ ] scheduler benchmark;
- [ ] snapshot benchmark;
- [ ] catch-up benchmark;
- [ ] heap profile;
- [ ] no accidental global scans;
- [ ] RSS target;
- [ ] API p95;
- [ ] 24h accelerated run;
- [ ] restart during soak;
- [ ] hash validation;
- [ ] unbounded collection checks;
- [ ] DB growth report;
- [ ] production Dockerfile;
- [ ] backups/restore;
- [ ] operations docs;
- [ ] benchmark report;
- [ ] release checklist.

---

# 46. CLI

`simctl` minimum:

```text
simctl status
simctl pause
simctl resume
simctl set-speed <factor>
simctl snapshot
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

---

# 47. Конфигурация и tuning

Canonical world config versioned and hashed.

Categories:

- time scale;
- need curves;
- planner limits;
- memory limits;
- exploration;
- experiment budget;
- relationship decay;
- organization thresholds;
- resource regeneration;
- weather variability;
- snapshot interval;
- significance thresholds;
- performance caps;
- enabled modules/content manifests.

Canonical config change after genesis проходит как versioned admin input.

---

# 48. Защита от комбинаторного взрыва

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

# 49. Criteria эмерджентности

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

# 50. Future LLM reserve

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

# 51. Future blockchain reserve

Позднее отдельный adapter/service сможет:

- связывать external blockchain identity с entity;
- наблюдать finalized chain events;
- формировать NormalizedExternalEvent;
- применять InfluencePolicy;
- посылать typed WorldCommand;
- публиковать state commitments.

Критерий архитектурной готовности: blockchain adapter добавляется без изменения physics, planner, technology, social, economy, scheduler и replay core.

---

# 52. Definition of Done продукта v1

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

---

# 53. Архитектурное резюме

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
│  WorldTime / Scheduler / RNG / Commands / Components         │
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
   Canonical Inputs   Snapshots       Derived History
          │              │                 │
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

