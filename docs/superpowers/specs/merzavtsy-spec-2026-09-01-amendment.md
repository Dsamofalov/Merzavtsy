# Правки к `2026-08-29-merzavtsy-world-engine-development-spec.md`

Дата правки: 2026-09-01

## Обязательная правка 1 — полностью удалить зависимость от `feat/mvp`

Из основного ТЗ удалить весь раздел, посвящённый обязательному исследованию, сравнению, аудиту, запуску, reuse/cherry-pick/port/drop решений и любому другому взаимодействию с веткой `feat/mvp`.

Также удалить по всему документу все задачи, acceptance criteria, этапы implementation plan и ссылки, которые требуют:
- читать `feat/mvp`;
- сравнивать `main` и `feat/mvp`;
- запускать verification pipeline `feat/mvp`;
- создавать `feat-mvp-reuse-audit.md`;
- переиспользовать старые contracts/daemon/runtime/store/oracle;
- переносить идеи из `feat/mvp` как обязательный prerequisite;
- строить новую архитектуру вокруг совместимости с кодом этой ветки.

Новая разработка считается самостоятельной greenfield-архитектурой. Старые ветки могут быть изучены вручную когда-нибудь позднее, но это не является частью ТЗ, prerequisite, DoD или implementation sequence.

---

# 3. Расширяемость архитектуры и будущие внешние воздействия

## 3.1. Цель

World Engine должен быть спроектирован так, чтобы после запуска продукта можно было добавлять новые классы состояния, новые базовые сущности мира, новые типы отношений и новые общественные подсистемы без переписывания scheduler, event loop, persistence core, deterministic random, canonical reducer, replay engine и других фундаментальных частей системы.

Также архитектура должна заранее позволять позднее подключить Ethereum/EVM или другую blockchain-сеть так, чтобы подтверждённые транзакции могли влиять на состояние мерзавчиков и мира.

На текущей фазе blockchain-интеграция не реализуется.

Ключевые правила:
1. Ядро знает **как исполнять детерминированный мир**, но не обязано знать все будущие доменные понятия.
2. Доменные модули знают **какие компоненты, команды и правила они добавляют**, но не управляют commit-path самостоятельно.
3. Внешние системы могут запрашивать изменение мира только через типизированные команды.
4. Ни HTTP API, ни будущий blockchain adapter, ни admin tool не могут напрямую менять каноническое хранилище.
5. Любое расширение обязано сохранять deterministic replay.

---

## 3.2. Два класса расширений

Разработчик обязан строго разделить два вида расширяемости.

### 3.2.1. Content extension

Content extension — добавление новых данных, которые используют уже существующие законы.

Примеры:
- новый материал;
- новый ресурс;
- новый вид поверхности/места;
- новый тип primitive object;
- новый вид affordance;
- новый тег/категория;
- новый тип социального отношения, если его семантика уже поддерживается generic social component;
- новые коэффициенты;
- новые genesis templates;
- новые варианты потребностей, если они реализуются существующим generic need processor;
- новые предметные prototypes.

Такие изменения по возможности должны добавляться через versioned content packs/registries без изменения engine core.

### 3.2.2. Rule extension

Rule extension — добавление нового типа причинно-следственной логики.

Примеры:
- локальные сообщества;
- поселения;
- государства;
- политические институты;
- религиозные институты;
- эпидемии;
- образование;
- новые формы собственности;
- наследственное право;
- новые классы производства;
- новый тип сложной инфраструктуры.

Такие изменения оформляются отдельным доменным модулем с собственными:
- typed components;
- commands;
- validators;
- reducers;
- scheduled-event handlers;
- derived projections;
- migrations;
- tests.

Rule extension не должен требовать изменения внутренностей generic scheduler/event queue/persistence/replay.

---

## 3.3. Запрет монолитного `MerzavetsState`

Запрещено строить основной runtime вокруг одного постоянно растущего типа:

```rust
struct MerzavetsState {
    hunger: ...
    mood: ...
    religion: ...
    settlement: ...
    government: ...
    // ещё сотни полей
}
```

Такой подход приводит к тому, что каждое новое понятие требует изменений во всём проекте.

Вместо этого сущность должна иметь стабильный `EntityId` и набор типизированных компонентов.

Концептуально:

```text
Entity #1337
├── IdentityComponent
├── GenomeComponent
├── NeedsComponent
├── PersonalityComponent
├── InventoryComponent
├── SocialComponent
├── MemoryComponent
├── KnowledgeComponent
└── ...components from future modules
```

Компоненты не обязаны реализовываться классической ECS-библиотекой. Разработчик может использовать собственные typed stores, если выполняются требования этого ТЗ.

---

## 3.4. Stable identifiers

Следующие категории должны иметь стабильные идентификаторы, не зависящие от порядка регистрации:

- `EntityId`;
- `ComponentTypeId`;
- `CommandTypeId`;
- `EventTypeId`;
- `ActionTypeId`;
- `CapabilityId`;
- `RelationTypeId`;
- `ResourceTypeId`;
- `MaterialTypeId`;
- `NeedTypeId`;
- `BeliefTypeId`;
- `OrganizationTypeId`;
- `ContentPackId`;
- `ModuleId`;
- `SchemaVersion`.

Нельзя использовать `enum` ordinal как persisted identity, если добавление элемента в середину способно изменить существующие значения.

Persisted IDs должны быть явными и version-stable.

---

## 3.5. Component registry

В composition root должен существовать `ComponentRegistry`.

Он обязан:
1. регистрировать каждый тип канонического компонента;
2. запрещать collision `ComponentTypeId`;
3. знать schema version компонента;
4. уметь сериализовать/десериализовать компонент;
5. уметь проверить, существует ли migration path;
6. предоставлять metadata read-model слою;
7. не позволять неизвестному компоненту молча участвовать в canonical replay.

Неизвестный persisted component при старте canonical engine должен вызывать fail-closed ошибку, пока не установлен совместимый модуль/migration.

---

## 3.6. Module registry

Все rule extensions должны подключаться через единый compile-time `ModuleRegistry`.

Условный интерфейс:

```text
WorldModule
├── module_id()
├── schema_version()
├── register_components()
├── register_commands()
├── register_event_handlers()
├── register_action_providers()
├── register_validators()
├── register_derived_views()
└── migrations()
```

Это концептуальный интерфейс. Конкретный Rust API может отличаться.

Критические требования:
- runtime dynamic loading произвольных `.so`, WASM, Lua, JS и другого стороннего исполняемого кода запрещён;
- modules первой версии подключаются при сборке;
- порядок регистрации не должен влиять на результат симуляции;
- все IDs должны быть explicit;
- модуль не получает mutable access ко всему WorldState в обход canonical transaction/reducer API.

---

## 3.7. Capability-based design

Agent planner и world rules не должны зависеть от большого количества конкретных `if item == X`.

Объекты и сущности должны экспонировать capabilities.

Примеры:

```text
EDIBLE
CUTTING_EDGE
HEAT_SOURCE
CONTAINER
PORTABLE
COMBUSTIBLE
LOAD_BEARING
SHELTER
TRADEABLE
OWNABLE
COMMUNICATIVE
CAN_JOIN_COLLECTIVE
CAN_HOLD_TERRITORY
```

Action provider должен спрашивать:

```text
"Какие объекты рядом имеют capability EDIBLE?"
```

а не:

```text
"Есть ли рядом Apple?"
```

Это позволяет добавлять новые предметы и материалы без изменения planner.

---

## 3.8. Prototype/content registry

Базовые сущности мира должны иметь versioned prototypes.

Prototype описывает:
- stable prototype ID;
- набор начальных components;
- capabilities;
- material/physical properties;
- affordances;
- допустимые composition links;
- presentation metadata, не влияющую на canonical state.

Добавление нового простого материала/объекта не должно требовать изменения canonical engine.

Content packs являются частью genesis/version identity мира.

Для canonical replay должны фиксироваться:
- content pack IDs;
- версии;
- content hashes;
- dependency hashes.

Нельзя незаметно изменить JSON/YAML content pack и продолжить считать его той же версией мира.

---

## 3.9. Отделение engine core от domain modules

Минимальная рекомендуемая граница workspace:

```text
crates/
  world-core/
  world-model/
  world-engine/
  world-storage/
  world-replay/
  world-api/

  modules/
    agents/
    needs/
    social/
    economy/
    materials/
    crafting/
    knowledge/
    culture/
    organizations/
```

Будущие модули могут добавляться рядом:

```text
modules/
  communities/
  settlements/
  polity/
```

Точное разбиение файлов может меняться, но зависимость должна идти:

```text
domain modules
        ↓
stable engine interfaces
        ↓
world core
```

`world-core` не должен импортировать `settlements`, `religion`, `polity` и другие высокоуровневые понятия.

---

## 3.10. Generic graph model

Графовый мир должен использовать универсальные узлы и рёбра.

Высокоуровневый graph core не должен иметь фиксированный enum:

```text
HOUSE
CITY
CHURCH
STATE
```

Вместо этого:
- узел имеет `EntityId`;
- типизированные components;
- tags/capabilities;
- relations с explicit relation IDs;
- модульные derived classifications.

Например "поселение" позднее может быть не фундаментальным node type, а коллективной сущностью, которая имеет:
- membership graph;
- persistent location/influence node;
- resource pool;
- governance component;
- infrastructure links;
- population aggregation.

---

## 3.11. Новые состояния мерзавчика

Добавление нового состояния мерзавчика должно требовать минимального набора действий:

1. Создать новый component или расширить module-owned component.
2. Назначить explicit schema version.
3. Определить deterministic default для старых entities.
4. Если требуется — написать migration.
5. Зарегистрировать component.
6. Добавить commands, которые имеют право его менять.
7. Добавить reducer/validator.
8. Добавить read projection.
9. Добавить deterministic tests.
10. При необходимости добавить UI renderer.

Не должно требоваться:
- менять scheduler;
- менять event queue;
- менять snapshot engine;
- менять replay algorithm;
- менять API transport core;
- менять базовый `Entity`;
- добавлять новое поле в десятках общих структур.

---

## 3.12. Extensible needs

Потребности не должны быть навсегда захардкожены одним большим struct.

Допускаются хорошо известные built-in needs, однако storage/API должны поддерживать stable `NeedTypeId`.

Каждая need definition определяет:
- bounds;
- initial value;
- continuous/lazy dynamics;
- utility pressure;
- threshold events;
- visibility;
- decay/accumulation rules;
- module owner.

Таким образом позднее можно добавить, например:
- territorial security;
- ideological belonging;
- prestige;
- collective identity;

не переписывая generic need scheduler.

---

## 3.13. Extensible relations

Social graph не должен быть ограничен навсегда только `friend/enemy`.

Relation type должен иметь stable ID и module-owned state.

Примеры будущих отношений:
- trust;
- affinity;
- fear;
- kinship;
- obligation;
- debt;
- authority;
- mentorship;
- ideological affinity;
- citizenship/member-of;
- vassalage.

Generic graph storage должен поддерживать появление новых relation components.

---

## 3.14. Общественные уровни как extension, а не special-case core

Система должна позволять в будущем добавить цепочку:

```text
individuals
↓
local informal group
↓
persistent community
↓
settlement
↓
multi-settlement polity
↓
state / federation / empire / other form
```

На текущем этапе не требуется реализовывать государства.

Однако текущие архитектурные решения не должны этому мешать.

Для этого необходимо зарезервировать generic понятие `CollectiveEntity`.

`CollectiveEntity` — обычная entity, способная иметь:
- members;
- membership rules;
- roles;
- shared resources;
- shared knowledge;
- norms/beliefs;
- internal relationships;
- external relationships;
- persistent identity;
- optional spatial/world anchor;
- decision policy;
- ownership/control links.

Нельзя делать отдельные независимые архитектуры для:
- клана;
- религиозной группы;
- поселения;
- государства.

Это разные конфигурации/модули над общей collective substrate.

---

## 3.15. Community extension point

Будущий `communities` module должен иметь возможность определить условия, при которых повторяющаяся социальная сеть получает persistent collective identity.

Пример будущей логики:
- стабильное ядро участников;
- высокая частота взаимодействия;
- общие ресурсы;
- общие места;
- shared norms;
- продолжительность существования выше threshold.

Важно: сейчас этот алгоритм не реализуется.

Требование текущей разработки — сохранить данные и API boundaries так, чтобы модуль можно было добавить позднее.

---

## 3.16. Settlement extension point

Будущий `settlements` module должен иметь возможность связать `CollectiveEntity` с частью world graph.

Settlement может позднее возникать из:
- устойчивой концентрации существ;
- созданной инфраструктуры;
- storage/production network;
- мест общего использования;
- routes;
- collective control/influence.

World graph уже сейчас не должен предполагать, что `Location` имеет только одного владельца или только один фиксированный смысл.

Необходимо поддержать generic:
- `claims`;
- `influence`;
- `control`;
- `usage`;
- `access`;

как расширяемые relation concepts.

---

## 3.17. Polity/state extension point

Будущий `polity` module должен уметь объединять несколько collectives/settlements.

Для этого generic architecture должна позволять:
- entity может быть member другой entity;
- collective может состоять из collectives;
- relations существуют между collectives;
- shared resource pools могут принадлежать collectives;
- rules/roles могут применяться к collective members;
- authority/delegation могут быть графовыми связями;
- world ownership/influence не зашивается в Agent struct.

Это позволит позднее добавить:
- государства;
- федерации;
- империи;
- союзы;
- конфедерации;
- вассальные системы;

без изменения world-core.

---

## 3.18. Rules and norms

Нормы, beliefs и organization rules должны быть данными, исполняемыми ограниченным интерпретатором.

Запрещено хранить произвольный executable script.

Rule может ссылаться на:
- event type;
- entity/component predicates;
- relation predicates;
- thresholds;
- permitted predefined effects;
- utility modifiers;
- sanctions/rewards.

Новый модуль может добавлять новые безопасные typed predicates/effects через registry.

---

## 3.19. Schema evolution

Каждый persisted canonical component имеет schema version.

Обязательны:
- explicit migrations;
- deterministic migrations;
- migration tests;
- snapshot fixtures старой версии;
- запрет silent default для семантически несовместимых изменений.

После migration один и тот же старый snapshot на двух машинах должен дать одинаковый новый state hash.

---

## 3.20. Snapshot format extensibility

Snapshot не должен сериализовать один giant Rust struct, формат которого ломается при добавлении любого поля.

Snapshot должен содержать versioned sections/components.

Концептуально:

```text
Snapshot
├── world metadata
├── module manifest
├── entity table
├── component section A / schema vN
├── component section B / schema vM
├── graph relations
└── scheduler state
```

Snapshot обязательно фиксирует:
- engine version;
- module manifest;
- content manifest;
- schema versions;
- world seed;
- deterministic scheduler state;
- state hash.

---

## 3.21. Event log extensibility

Canonical event envelope должен отделять transport metadata от typed payload.

Минимум:

```text
CanonicalEventEnvelope
- event_id
- world_time
- sequence
- module_id
- event_type_id
- schema_version
- actor/entity references
- payload
```

Unknown canonical event type при replay — fail closed.

Нельзя молча игнорировать неизвестные события.

---

## 3.22. Command extensibility

Аналогично `WorldCommand` не должен быть одним enum, который через несколько лет содержит 500 вариантов и требует править world-core для каждого нового модуля.

Допускается tagged typed command registry.

Каждый command type обязан иметь:
- stable ID;
- schema version;
- validator;
- deterministic reducer/handler;
- authorization/source policy;
- idempotency semantics, где применимо;
- tests.

Engine отвечает за порядок и atomic commit, module — за доменную семантику.

---

# 4. Будущая blockchain-интеграция

## 4.1. Статус

На текущей фазе:
- RPC client не нужен canonical engine;
- Ethereum watcher не реализуется;
- contracts не являются prerequisite;
- транзакции не влияют на мир.

Но код должен иметь стабильную границу для будущего подключения blockchain source.

---

## 4.2. External input pipeline

Все будущие внешние воздействия проходят только по пути:

```text
external system
      ↓
ExternalInputProvider
      ↓
NormalizedExternalEvent
      ↓
InfluencePolicy
      ↓
WorldCommand
      ↓
validation
      ↓
canonical reducer
      ↓
event log + state
```

Blockchain является одним из возможных `ExternalInputProvider`.

Другие будущие источники могут быть:
- admin-approved event;
- tournament service;
- signed user message;
- migration/import source.

Engine не должен знать, откуда пришло событие после normalization.

---

## 4.3. Запрет прямого изменения state из blockchain adapter

Будущий Ethereum adapter не имеет доступа к storage mutators.

Нельзя делать:

```text
chain event
↓
UPDATE merzavets SET mood = 999
```

Допустимо только:

```text
chain event
↓
typed external event
↓
policy
↓
typed command
↓
normal reducer
```

Это обязательный security/determinism invariant.

---

## 4.4. Normalized external event

Необходимо заранее определить stable envelope, не привязанный к Ethereum-specific полям.

Концептуально:

```text
NormalizedExternalEvent {
    source_kind,
    source_network,
    source_cursor,
    external_event_id,
    observed_at_world_time,
    actor_ref?,
    target_refs[],
    event_type,
    payload_schema,
    payload,
    payload_hash
}
```

Ethereum-specific metadata может жить в source metadata:

```text
chain_id
block_number
block_hash
transaction_hash
transaction_index
log_index
contract_address
sender
```

Но world domain modules не должны читать RPC напрямую.

---

## 4.5. Deterministic ordering будущих chain inputs

Для Ethereum/EVM adapter необходимо предусмотреть canonical ordering минимум по:

```text
chain_id
block_number
transaction_index
log_index
```

Если используются calldata-level события без logs, ordering rule также должен быть explicit.

Одинаковый finalized chain history должен генерировать одинаковую последовательность `NormalizedExternalEvent`.

---

## 4.6. Finality и reorg boundary

Будущий chain adapter обязан решать finality/reorg до передачи event в canonical engine.

World Engine не должен сам опрашивать блокчейн.

External input должен иметь состояние:
- observed;
- pending finality;
- finalized;
- rejected/orphaned.

В canonical world допускаются только события, прошедшие выбранную finality policy.

Если позднее будет выбран optimistic reversible режим, это будет отдельное архитектурное решение; текущий core не должен предполагать наличие rollback blockchain reorg.

---

## 4.7. Idempotency

Каждое внешнее событие имеет stable `external_event_id`.

Повторная доставка одного и того же события:
- не должна повторно менять мир;
- должна быть безопасной после crash/restart;
- должна определяться persisted dedup state/event log.

---

## 4.8. Future transaction influence

В будущем одна транзакция может, например, стать основанием для:
- изменения need;
- изменения mood;
- возникновения memory;
- получения/потери world resource;
- социального воздействия;
- world event;
- специального temporary modifier;
- другого module-defined effect.

Ни один конкретный эффект сейчас не фиксируется.

Важно только, что новый эффект можно будет добавить через:
1. новый external event type;
2. `InfluencePolicy`;
3. typed `WorldCommand`;
4. соответствующий module reducer;

без изменения blockchain ingestion core и world scheduler.

---

## 4.9. Никакого arbitrary patch API

Future-proofing не означает, что блокчейн должен получить универсальную команду:

```text
SET_ANY_FIELD(entity, path, value)
```

Такой API запрещён для production canonical mutations.

Он разрушает:
- инварианты;
- domain validation;
- backward compatibility;
- auditability.

Если нужен новый редактируемый state, добавляется typed command/effect с валидатором.

---

## 4.10. Optional blockchain identity

`EntityId` мерзавчика не должен архитектурно быть равен Ethereum address.

Связь должна быть отдельной:

```text
ExternalIdentityLink {
    entity_id
    identity_namespace
    identity_value
}
```

Например:

```text
namespace = "eip155:1"
identity = "0x..."
```

Это позволяет:
- запустить мир без блокчейна;
- позднее привязать кошелёк;
- поддержать несколько сетей;
- потенциально поддержать smart accounts;
- не заражать весь domain model типом Ethereum address.

---

## 4.11. Future state commitments

Архитектура snapshot/state hashing должна позволять позднее публиковать в блокчейн:
- world state root;
- snapshot hash;
- event batch hash;
- engine/content version hash.

Сейчас публикация не реализуется.

Нельзя проектировать hashing так, чтобы позднее пришлось полностью менять snapshot representation.

---

# 5. Требования к modularity для planner и действий

## 5.1. Planner не знает все actions заранее

Action candidates предоставляются `ActionProvider`-ами.

Каждый module может зарегистрировать provider.

Planner:
1. собирает providers;
2. спрашивает доступные действия для локального context;
3. получает typed candidate actions;
4. оценивает utility/cost/risk;
5. выбирает;
6. отправляет command.

Добавление нового action module не должно требовать правки центрального planner switch.

---

## 5.2. Goals

Goals также должны иметь registry/provider boundary.

Новый общественный модуль сможет позднее добавить:
- protect_community;
- improve_collective_status;
- acquire_territory;
- enforce_norm;

не меняя основную структуру агента.

При этом generic needs/goals API обязан иметь bounded computational budget.

---

## 5.3. Derived state

Не каждое новое понятие должно становиться persisted component.

Если состояние можно однозначно вывести из canonical state, оно должно быть derived projection.

Пример:
- `"это поселение"` может быть classification результата population/infrastructure/community graph;
- `"богатый"` может быть derived status;
- `"religious majority"` может быть derived statistic.

Это уменьшает migration burden.

Каждое новое состояние сначала классифицировать:
1. canonical persisted;
2. scheduled state;
3. derived state;
4. cache/read model.

---

# 6. Persistence requirements для расширений

## 6.1. Module manifest

Каждый world snapshot/database metadata хранит manifest:

```text
module_id
module_version
schema_version
content_hash
```

Startup проверяет manifest до запуска simulation.

---

## 6.2. Миграции

Migration выполняется отдельным explicit workflow.

Запрещено:
- частично мигрировать live state во время обычного event processing;
- зависеть от wall clock;
- использовать nondeterministic iteration order;
- генерировать случайность без stable migration seed.

---

## 6.3. Backups перед migration

Production migration:
1. останавливает canonical writer;
2. создаёт verified backup/snapshot;
3. выполняет dry-run;
4. считает state hash;
5. выполняет migration;
6. запускает invariant checks;
7. только затем запускает writer.

---

# 7. API/read model requirements

API не должен иметь один hardcoded response DTO со всеми возможными полями мира.

Требуются:
- stable core identity fields;
- typed module sections;
- component descriptors/version;
- specialized endpoints для важных подсистем;
- generic inspection endpoint для debug/admin tools.

Frontend может иметь специализированные renderers, но отсутствие renderer для нового component не должно ломать API целиком.

---

# 8. Обязательные extension tests

До завершения core architecture реализовать test-only extension module.

Он не является игровой функцией.

Например `TestExtensionModule` добавляет:
- новый component;
- новый command;
- новый event;
- новый scheduled handler;
- новый derived view.

Тест обязан доказать, что для его добавления не потребовалось менять:
- scheduler internals;
- event queue internals;
- replay algorithm;
- storage transaction core;
- deterministic RNG core;
- generic entity representation.

Допустимое изменение composition root — одна явная регистрация модуля.

---

## 8.1. State-extension acceptance test

Создать test-only состояние, которого не было в исходном agent module.

Проверить:
1. default initialization;
2. mutation command;
3. snapshot;
4. restore;
5. replay;
6. migration from previous schema;
7. stable state hash.

---

## 8.2. Content-extension acceptance test

Добавить test content pack с новым материалом и новым object prototype.

Проверить, что planner/affordance system способен использовать новый объект на основании capabilities без изменения planner source.

---

## 8.3. Collective-extension architecture test

Создать минимальный test-only `CollectiveEntity` module:
- два agents становятся members;
- collective получает shared resource counter;
- relation membership сохраняется;
- snapshot/replay воспроизводят состояние.

Не реализовывать settlement/state gameplay.

Цель — доказать extension boundary.

---

## 8.4. External-input acceptance test

Использовать fake `ExternalInputProvider`, не blockchain.

Подать deterministic external event.

Проверить:

```text
external event
→ influence policy
→ typed command
→ state mutation
→ canonical event
→ snapshot/replay
```

Повторная доставка event ID не должна повторять mutation.

Этот тест является обязательным доказательством будущей blockchain-ready архитектуры.

---

# 9. Definition of Done для архитектурной расширяемости

Архитектура считается готовой только если выполнено всё:

1. В коде нет зависимости от `feat/mvp`.
2. В документации нет обязательных задач на `feat/mvp`.
3. `Entity` не содержит giant hardcoded world-state struct.
4. Canonical state разделён на typed versioned components.
5. Существует component registry.
6. Существует module registry/composition mechanism.
7. Существуют explicit stable IDs.
8. Существует content/prototype registry.
9. Planner получает actions через providers/capabilities.
10. Persistence знает module/schema manifest.
11. Snapshot/replay работает с test extension module.
12. Добавление test component не требует изменения engine core.
13. Добавление test material не требует изменения planner.
14. Generic `CollectiveEntity` extension boundary доказан тестом.
15. Существует `ExternalInputProvider` abstraction.
16. Существует normalized external event envelope.
17. Существует `InfluencePolicy` abstraction.
18. External events не имеют прямого mutable storage access.
19. Fake external event способен изменить состояние через normal command/reducer path.
20. Dedup/replay fake external events протестированы.
21. Domain model не зависит от Ethereum address.
22. Snapshot hashing допускает future external publication/state commitment.
23. Unknown component/event/module при canonical replay fail closed.
24. Migration tests присутствуют.
25. Все deterministic tests воспроизводимы на чистом запуске.

---

# 10. Корректировки implementation sequence

Из существующего implementation sequence удалить любые этапы и подпункты, связанные с `feat/mvp`.

В раннюю фазу реализации добавить отдельный milestone **Extensibility Foundation** до создания большого количества gameplay modules.

Порядок:

1. `world-core` IDs/time/deterministic RNG.
2. generic Entity/component storage.
3. ComponentRegistry.
4. ModuleRegistry.
5. versioned snapshot/event envelope.
6. migration primitives.
7. content/prototype registry.
8. capability/affordance interfaces.
9. generic WorldCommand handler registry.
10. generic scheduled-event handler registry.
11. fake/test extension module.
12. `ExternalInputProvider`.
13. `NormalizedExternalEvent`.
14. `InfluencePolicy`.
15. fake external input integration test.
16. только после прохождения этих gates — gameplay modules.

Причина: если сначала реализовать много доменной логики монолитно, будущая модульность станет дорогим refactor.

---

# 11. Архитектурное правило для всех будущих задач

Перед добавлением любого нового понятия разработчик обязан ответить:

1. Это content или новое правило?
2. Это canonical state или derived state?
3. Какой module владеет этим понятием?
4. Нужен ли новый component?
5. Нужен ли новый command/event?
6. Нужна ли migration?
7. Может ли planner обнаружить новую возможность через capability/provider?
8. Нужно ли world-core знать об этом понятии?

Если ответ на пункт 8 — "да", разработчик обязан обосновать, почему это действительно фундаментальная абстракция, а не доменная логика.

Примеры понятий, которые **не должны** требовать изменений `world-core`:
- религия;
- локальное сообщество;
- поселение;
- государство;
- партия;
- школа;
- эпидемия;
- новый материал;
- новый инструмент;
- новая социальная роль;
- новая потребность;
- новая форма собственности.

