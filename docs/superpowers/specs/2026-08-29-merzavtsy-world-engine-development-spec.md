# Merzavtsy — полное техническое задание на разработку World Engine

**Дата:** 2026-08-29  
**Статус:** утверждённое направление архитектуры; документ предназначен как основной источник требований для следующей разработки  
**Целевая ветка документа:** `main`  
**Предыдущий документ:** `docs/superpowers/specs/2026-08-28-merzavtsy-design.md` сохраняется как исторический дизайн предыдущей итерации. Настоящий документ имеет приоритет при любых противоречиях, связанных с автономным World Engine, графовым миром, эмерджентным обществом и текущим отсутствием LLM.

---

## 0. Назначение документа

Этот документ должен позволить агенту-разработчику реализовать работающий продукт **без самостоятельного додумывания базовой архитектуры**. Если в процессе реализации обнаруживается техническая невозможность или внутреннее противоречие, разработчик обязан сначала зафиксировать проблему отдельным коротким design note/issue и получить решение, а не молча заменять описанную архитектуру своей.

Ключевая цель продукта — не создать игру с большим каталогом сценариев и не написать 10 000 заранее известных действий. Нужно создать **детерминированную симуляцию искусственного общества**, в которой сложное поведение, технологии, организации, экономика, культура и изменения мира возникают из небольшого набора общих законов и примитивов.

Текущая версия **не использует LLM**. Архитектура обязана позволять в будущем подключить LLM как слой языка/рефлексии/нарратива, не передавая LLM канонический контроль над физикой мира.

Текущая версия начинает с **полностью графового мира**. Архитектура обязана позволять в будущем мигрировать к гибридной модели `graph + spatial chunks/cells` без переписывания систем агентов, экономики, культуры, технологий и внешних входов.

Также архитектура обязана заранее допускать будущую возможность влиять на мерзавчиков и мир через Ethereum-транзакции. Конкретные правила такого влияния сейчас **не разрабатываются**. Необходимо создать чистую внешнюю границу входных событий, чтобы позднее добавить chain adapter без внедрения RPC/контрактной логики внутрь симулятора.

---

# 1. Продуктовая концепция

## 1.1. Основной тезис

Merzavtsy — постоянно живущий искусственный мир, состоящий из автономных существ, ресурсов, предметов, мест, отношений, знаний, технологий и социальных структур.

Система должна давать ощущение, что разработчик создал **законы мира**, а не сценарий его истории.

Высокоуровневые явления не должны быть захардкожены как отдельные команды:

- не должно быть `FOUND_CITY`;
- не должно быть `CREATE_RELIGION`;
- не должно быть `INVENT_SPEAR`;
- не должно быть `BECOME_DICTATOR`;
- не должно быть `START_WAR_FOR_FOOD`;
- не должно быть `CREATE_MARKET`.

Вместо этого должны существовать универсальные механизмы, из сочетаний которых такие явления появляются как производные.

## 1.2. Целевое ощущение

Пользователь должен иметь возможность не заходить в проект несколько дней, после чего увидеть, что за это время:

- конкретные мерзавчики изменили отношения;
- появились и исчезли объединения;
- кто-то нашёл новый способ использования материала;
- технологию скопировали, украли или улучшили;
- изменилась торговая сеть;
- появился новый маршрут или инфраструктурное соединение;
- место стало фактическим центром обмена;
- неверное убеждение распространилось по группе;
- общественная норма укрепилась или исчезла;
- произошёл конфликт из-за дефицита;
- последствия конфликта изменили дальнейшую историю;
- разные популяции, живущие в одном движке, пошли по разным путям.

Эти события должны быть следствием симуляции, а не выбора случайной строки из каталога сюжетов.

## 1.3. Детерминированность

Для одинаковых:

- версии движка;
- `world_seed`;
- genesis-конфигурации;
- последовательности внешних входов;
- целевого `WorldTime`;

результат должен быть **бит-в-бит одинаковым** на всех поддерживаемых машинах.

Практическая непредсказуемость достигается не недетерминированностью, а большим числом взаимосвязанных причин, локальной информацией агентов, культурной передачей, ошибочными убеждениями, обучением, мутациями стратегий и обратными связями.

## 1.4. Что не входит в текущую фазу

На этой фазе не требуется:

- LLM;
- генеративная речь нейросетью;
- настоящий физический симулятор частиц;
- Navier–Stokes;
- полноценный 3D-мир;
- клеточная карта;
- on-chain канонический world state;
- чтение Ethereum-транзакций в production;
- токен проекта;
- marketplace;
- staking/yield;
- NFT-экономика;
- платные boosts;
- механики азартных игр.

---

# 2. Неподвижные архитектурные принципы

## 2.1. World Engine — единственный автор канонического состояния

Канонические изменения мира проходят через один детерминированный reducer/engine.

API, frontend, cron, будущий Ethereum adapter и админские инструменты не имеют права напрямую менять таблицы канонического состояния.

Любое изменение должно превращаться в типизированный `WorldCommand` или `ExternalInput`, пройти валидацию и только затем попасть в движок.

## 2.2. Один канонический writer

Первая версия использует **однопоточный канонический commit path**.

Допускается многопоточность для:

- HTTP;
- сериализации;
- компрессии snapshot;
- формирования read models;
- чистых предварительных расчётов;

но порядок применения state-changing операций должен оставаться однозначным.

Параллельный mutation world state в первой версии запрещён.

## 2.3. Integer/fixed-point only в канонической логике

Каноническая симуляция не использует `f32`/`f64` для вычислений, влияющих на state.

Все нормализованные параметры используют фиксированный масштаб, по умолчанию `0..=10_000`.

Для величин с размерностью используются целочисленные единицы, определённые в model crate.

## 2.4. Никакой зависимости доменных правил от wall clock

Engine не читает системное время.

Системное время читает только `WorldRunner`, который определяет целевой `WorldTime` и просит engine выполнить `advance_to(target_time)`.

## 2.5. Никакого глобального случайного генератора с зависимостью от порядка вызовов

Запрещена модель, в которой один глобальный PRNG последовательно вызывается всеми подсистемами и добавление новой проверки сдвигает случайность всего будущего мира.

Случайность должна вычисляться по стабильному ключу:

`R = hash(world_seed, subsystem_id, entity_id, decision_sequence, purpose_tag)`.

Каждый случайный выбор должен быть воспроизводим отдельно.

## 2.6. Никаких исполняемых пользовательских скриптов

Рецепты, стратегии, мемы, правила организаций и blueprint — **данные**, интерпретируемые ограниченными движками.

Ни один агент не может записать JavaScript, WASM, Lua, shell или другой произвольный код и заставить сервер исполнить его.

## 2.7. Событийная, а не тиковая симуляция

Не должно быть глобального цикла вида:

`for every agent every second -> tick()`.

Использовать:

- scheduled events;
- аналитический lazy-decay;
- threshold events;
- jump-to-next-event;
- локальные пересчёты только затронутых графов.

---

# 3. Обязательное исследование существующей ветки `feat/mvp`

До написания нового production-кода разработчик обязан изучить:

`https://github.com/Dsamofalov/Merzavtsy/tree/feat/mvp`

Цель — не продолжить старую архитектуру любой ценой, а определить, какие части уже решают общие задачи качественно и могут быть перенесены.

## 3.1. Обязательные действия аудита

1. Сравнить `main` и `feat/mvp`.
2. Прочитать минимум:
   - `README.md`;
   - `CONCEPT.md`;
   - `ARCHITECTURE.md`;
   - `OPERATIONS.md`;
   - `SECURITY.md`;
   - `package.json`;
   - `contracts/Merzavets.sol`;
   - `contracts/ActivityOracle.sol`;
   - `contracts/MerzavetsWorld.sol`;
   - `daemon/src/store.ts`;
   - `daemon/src/runtime.ts`;
   - `daemon/src/composition.ts`;
   - `daemon/src/chain-watcher.ts`;
   - `daemon/src/rpc-blocks.ts`;
   - `daemon/src/logger.ts`;
   - тесты контрактов;
   - тесты daemon.
3. Запустить старую ветку локально согласно её README, если она ещё собирается.
4. Запустить её verification pipeline.
5. Зафиксировать, какие модули имеют тестовое покрытие и какие являются экспериментальными.
6. Не cherry-pick'ать крупные файлы до завершения матрицы переиспользования.

## 3.2. Создать `docs/architecture/feat-mvp-reuse-audit.md`

Для каждого рассматриваемого компонента записать:

- путь;
- назначение;
- качество API;
- наличие тестов;
- наличие скрытой зависимости от старой on-chain модели;
- пригодность для нового World Engine;
- решение `REUSE_AS_IS / PORT_IDEA / REWRITE / DROP`;
- причину решения;
- риски переноса.

## 3.3. Наиболее вероятные кандидаты на перенос идеи

Это не приказ переиспользовать код, а список обязательных кандидатов для оценки:

- separation `oracle signer / submitter` как будущий паттерн внешних blockchain-входов;
- EIP-712/replay-protection идеи из `ActivityOracle.sol`;
- finality/reorg fail-stop идеи из daemon;
- durable restart semantics;
- SQLite WAL/storage-механика;
- structured logging/redaction;
- configuration validation;
- Docker/operations scaffolding;
- тестовые паттерны replay/idempotency;
- `Merzavets.sol` как возможная будущая account-bound identity база;
- viem adapters как возможная основа будущего chain input provider.

## 3.4. Компоненты, которые запрещено считать автоматически пригодными

- старый `MerzavetsWorld.sol`;
- старый `lifeTick`;
- старые XP/level механики;
- старые фиксированные intent lists;
- activity classifier старого MVP;
- любые части, привязывающие основную симуляцию к on-chain state machine.

Если итог аудита покажет, что от ветки `feat/mvp` ничего не стоит переносить, это считается допустимым результатом. Аудит всё равно обязателен.

---

# 4. Выбранный технологический стек

## 4.1. Канонический World Engine

Использовать **Rust stable**.

Причины выбора:

- контролируемое потребление памяти;
- высокая производительность CPU;
- удобная модель enum/typed domain events;
- отсутствие GC-пауз;
- возможность в будущем собрать часть чистой логики в WASM;
- хороший property testing и benchmarking.

## 4.2. Web/API

Backend API — Rust + `axum` + `tokio`.

API может работать в том же процессе, что `worldd`, но mutation endpoint обязан передавать command через внутреннюю очередь canonical writer, а не менять state напрямую.

## 4.3. Persistence

Первая production-реализация:

- SQLite;
- WAL mode;
- `sqlx`;
- versioned migrations;
- snapshots отдельными бинарными файлами с Zstd;
- read models также в SQLite.

Причина: один canonical writer естественно совпадает с SQLite; это уменьшает количество инфраструктуры и позволяет переиспользовать идеи старого daemon.

Storage API обязан быть скрыт за интерфейсами, чтобы позднее добавить PostgreSQL без изменения доменной логики.

## 4.4. Frontend

- Next.js;
- React;
- TypeScript;
- WebGL graph renderer через Sigma.js или эквивалентный слой;
- обычный REST для запросов;
- SSE или WebSocket для live feed.

Frontend не является источником истины.

## 4.5. Тестирование

Rust:

- built-in tests;
- `proptest`;
- `criterion` для benchmark;
- snapshot/golden tests для детерминированных сценариев.

Frontend:

- unit/component tests;
- Playwright для основных пользовательских потоков.

## 4.6. Ops

- Docker;
- Docker Compose;
- persistent volume для SQLite и snapshot directory;
- JSON structured logs;
- Prometheus-compatible metrics endpoint;
- health/readiness endpoints.

---

# 5. Предлагаемая структура репозитория

```text
/
├─ Cargo.toml
├─ rust-toolchain.toml
├─ crates/
│  ├─ sim-core/
│  ├─ sim-model/
│  ├─ topology/
│  ├─ scheduler/
│  ├─ physics/
│  ├─ objects/
│  ├─ agents/
│  ├─ cognition/
│  ├─ memory/
│  ├─ social/
│  ├─ economy/
│  ├─ technology/
│  ├─ institutions/
│  ├─ narrative/
│  ├─ persistence/
│  ├─ replay/
│  ├─ external-input/
│  └─ api-types/
├─ apps/
│  ├─ worldd/
│  └─ simctl/
├─ web/
├─ migrations/
├─ scenarios/
├─ benches/
├─ deployments/
├─ docs/
│  ├─ architecture/
│  ├─ operations/
│  └─ superpowers/specs/
└─ compose.yaml
```

Каждый crate обязан иметь одну понятную ответственность. Циклические зависимости между domain crates запрещены.

---

# 6. Канонические идентификаторы и контейнеры

## 6.1. Stable IDs

Создать новые типы:

- `AgentId(u64)`;
- `PlaceId(u64)`;
- `RouteId(u64)`;
- `ObjectId(u64)`;
- `PartId(u64)`;
- `StructureId(u64)`;
- `RelationshipId(u64)` при необходимости;
- `OrganizationId(u64)`;
- `RecipeId(u64)`;
- `BlueprintId(u64)`;
- `BeliefId(u64)`;
- `StrategyId(u64)`;
- `EventId(u64)`;
- `ScheduleId(u64)`.

Нельзя использовать случайный UUID как canonical ordering key.

## 6.2. Выделение ID

IDs выдаются монотонно.

Удалённые IDs не переиспользуются.

## 6.3. StableArena

Для крупных сущностей создать `StableArena<T>`:

- внутренний `Vec<Option<T>>`;
- индекс соответствует ID;
- монотонное добавление;
- tombstone при удалении;
- итерация строго по возрастанию ID.

Это предпочтительнее BTreeMap для миллионов объектов.

---

# 7. Детерминированная математика и random

## 7.1. Normalized value

Создать типы fixed-point вместо сырых `i32` по всему коду.

Пример:

- `NormU16` = `0..=10_000`;
- `NormI16` = `-10_000..=10_000`.

Все операции обязаны иметь clamp semantics.

## 7.2. Hash-random API

Создать единый API:

```text
random_u64(scope)
random_range(scope, max_exclusive)
weighted_choice(scope, [(weight, stable_id)])
chance(scope, probability_0_10000)
```

`scope` обязан содержать:

- world seed;
- subsystem tag;
- subject ID;
- subject-local sequence;
- purpose tag.

## 7.3. Tie-breaking

Любая сортировка кандидатов должна иметь последний стабильный ключ ID.

Нельзя полагаться на порядок `HashMap`.

## 7.4. Cross-platform golden test

CI должен считать state hash одного и того же fixture на Linux и Windows. Хэши обязаны совпадать.

---

# 8. Время мира и scheduler

## 8.1. `WorldTime`

`WorldTime(u64)` измеряет целые симуляционные секунды.

Engine не знает timezone и календарь ОС.

Отображаемый календарь является производной функцией.

## 8.2. ScheduledEvent key

Полный порядок:

1. `scheduled_at`;
2. `priority`;
3. `subject_id`;
4. `schedule_id`.

## 8.3. Jump scheduling

Если следующее событие через 4 часа, engine прыгает сразу к этому времени.

## 8.4. Lazy continuous state

Для hunger/energy/decay/production хранить:

- базовое значение;
- `last_updated_at`;
- rate/curve parameters.

Текущее значение вычислять только при materialization.

Для пересечения важного threshold scheduler заранее ставит событие на вычисленное время пересечения.

## 8.5. Catch-up после downtime

`WorldRunner` хранит последнюю пару:

- real timestamp;
- world time.

После рестарта:

1. загрузить snapshot;
2. применить canonical inputs после snapshot;
3. вычислить target world time;
4. запустить `advance_to(target)` без artificial sleeps;
5. не пропускать state-changing events;
6. не генерировать избыточный live transport во время catch-up;
7. после догоняния включить realtime pacing.

---

# 9. Полностью графовая модель мира v1

## 9.1. Главный граф мест

Мир состоит из `PlaceNode` и `RouteEdge`.

`PlaceNode` не означает город/дом/деревню. Это абстрактное место, в котором могут находиться агенты, ресурсы, объекты и структуры.

## 9.2. `PlaceNode`

Минимальные поля:

- `id`;
- `parent_place: Option<PlaceId>`;
- `scale_class`;
- `environment`;
- `capacity`;
- `occupancy summary`;
- `resource_deposits`;
- `structure_ids`;
- `object_ids`;
- `agent_ids`;
- `route_ids` sorted by ID;
- `tags` только как физические/environmental facts, а не высокоуровневые сюжетные ярлыки.

## 9.3. `RouteEdge`

Поля:

- `from`;
- `to`;
- `directionality`;
- `length_units`;
- `base_travel_cost`;
- `surface_quality`;
- `capacity`;
- `hazard`;
- `maintenance`;
- `visibility`;
- `ownership/claim optional`;
- `enabled`;
- `infrastructure_component` optional.

## 9.4. Graph layers

Разделить минимум четыре графа:

1. place/movement graph;
2. infrastructure/resource-flow graph;
3. social graph;
4. object/structure part graph.

Они могут ссылаться друг на друга через IDs, но не должны сливаться в один универсальный граф с неограниченным enum edge type.

## 9.5. Derived settlements

`Village`, `City`, `MarketDistrict` не являются canonical entity types.

Read-model анализатор может присвоить place/subgraph производный label на основании:

- persistent population;
- плотности structures;
- trade volume;
- duration habitation;
- route centrality;
- specialization.

Удаление label не изменяет мир.

---

# 10. Архитектурная готовность к будущему hybrid world

## 10.1. `TopologyBackend` boundary

Системы агентов не обращаются к конкретной реализации graph storage.

Определить API:

- `neighbors(place)`;
- `travel_cost(a,b,agent)`;
- `reachable(origin,budget)`;
- `local_environment(place)`;
- `create_connection(spec)`;
- `modify_connection(id,delta)`;
- `create_place(spec)`;
- `place_entities(place)`.

## 10.2. Запрет утечки graph internals

Crates `cognition`, `social`, `economy`, `technology` не импортируют внутренний storage type графа.

## 10.3. Будущий migration path

Позднее `HybridTopology` сможет:

- оставить macro `PlaceId`;
- сопоставить place с chunk/area;
- сопоставить route с пространственным path;
- постепенно добавить координаты;
- не менять AgentId/ObjectId/RecipeId;
- не менять high-level goals и social/economy systems.

---

# 11. Среда и ресурсы

## 11.1. Environment

Каждое место хранит целочисленные:

- temperature baseline;
- seasonal amplitude;
- moisture;
- fertility;
- water availability;
- shelter exposure;
- hazard;
- biome/resource profile.

## 11.2. Seasons

Season function детерминированно зависит от `WorldTime` и world configuration.

## 11.3. Weather anomalies

Допускаются детерминированные региональные anomalies, вычисляемые hash-random по `region + day/epoch`.

Никаких внешних weather API.

## 11.4. Deposits

`ResourceDeposit` содержит:

- material/resource ID;
- remaining quantity;
- accessibility;
- extraction difficulty;
- renewable flag;
- regeneration model;
- carrying capacity.

## 11.5. Renewable resource lazy update

Рост ресурса не обновляется каждую секунду.

Использовать аналитическое целочисленное обновление при materialization.

---

# 12. Символическая физика материалов

## 12.1. `MaterialDefinition`

Минимальные свойства `0..10000`:

- hardness;
- toughness;
- elasticity;
- density;
- brittleness;
- friction;
- flammability;
- heat_resistance;
- thermal_conductivity;
- plasticity;
- absorbency;
- corrosion_resistance;
- binding_affinity.

Также:

- temperature transition thresholds;
- material family;
- renewable/non-renewable origin.

## 12.2. Никакой физической магии по item name

Damage, cutting, containment и shelter рассчитываются из свойств частей и конструкции.

Нельзя писать `if object.type == SPEAR { damage += 50 }`.

## 12.3. Material transformations

Определить generic transformations:

- heating;
- cooling;
- burning;
- drying;
- wetting;
- crushing;
- grinding;
- mixing;
- compression;
- shaping.

Transform result должен зависеть от material properties и operation parameters.

---

# 13. Объекты, части и конструкции

## 13.1. Object composition

`ObjectEntity` содержит:

- object ID;
- owner optional;
- current place/carrier/container;
- part IDs;
- aggregate condition;
- derived affordances cache + revision.

## 13.2. `Part`

Поля:

- material;
- quantity/mass;
- length class;
- thickness class;
- shape class;
- edge sharpness;
- point sharpness;
- condition;
- temperature;
- connector capabilities.

## 13.3. Part graph edges

Поддержать ограниченный enum:

- `FIXED`;
- `BOUND`;
- `HINGE`;
- `AXLE`;
- `SLIDER`;
- `ROPE_LINK`;
- `RESTS_ON`;
- `SUPPORTS`;
- `COVERS`.

## 13.4. Derived affordances

Расчёт должен уметь получить как минимум:

- graspability;
- carrying capacity;
- container capacity;
- cutting effectiveness;
- piercing effectiveness;
- impact effectiveness;
- reach;
- durability;
- insulation;
- shelter contribution;
- structural support;
- rotational utility;
- rolling efficiency;
- heat retention.

## 13.5. Cache invalidation

Любая мутация part graph увеличивает revision объекта. Derived cache с другой revision считается недействительным.

---

# 14. Универсальные primitive actions

В движке допускается ограниченный каталог универсальных action schemas. Каталог должен описывать операции над сущностями, а не сюжет.

Минимальный набор:

- `MOVE`;
- `TAKE`;
- `PLACE`;
- `DROP`;
- `GIVE`;
- `STORE`;
- `REMOVE_FROM_CONTAINER`;
- `EAT/CONSUME`;
- `OBSERVE`;
- `REST`;
- `WAIT`;
- `STRIKE`;
- `CUT`;
- `SCRAPE`;
- `BREAK`;
- `GRIND`;
- `SHAPE`;
- `ATTACH`;
- `DETACH`;
- `TIE/BIND`;
- `STACK`;
- `MIX`;
- `HEAT`;
- `COOL`;
- `BURN`;
- `DRY`;
- `WET`;
- `DIG/EXTRACT`;
- `POUR`;
- `COMPRESS`;
- `PUSH`;
- `PULL`;
- `ROTATE`;
- `PLANT`;
- `HARVEST`;
- `OFFER`;
- `ACCEPT`;
- `REFUSE`;
- `TRADE`;
- `BORROW`;
- `STEAL`;
- `THREATEN`;
- `ATTACK`;
- `DEFEND`;
- `FLEE`;
- `HELP`;
- `FOLLOW`;
- `TEACH`;
- `IMITATE`;
- `GOSSIP`;
- `JOIN_GROUP`;
- `LEAVE_GROUP`;
- `CLAIM`;
- `RELINQUISH_CLAIM`.

Каждый schema обязан содержать:

- typed arguments;
- preconditions;
- estimated cost;
- actual reducer;
- possible failure reasons;
- observable outcome;
- memory signal;
- skill/knowledge gates, если нужны.

---

# 15. Изменение мира существами

## 15.1. Общий принцип

Агенты не вызывают `BUILD_HOUSE`.

Они преобразуют материалы, объекты и связи мира.

## 15.2. Строения

`Structure` — component graph, закреплённый в Place.

Он может давать производные свойства:

- shelter;
- storage;
- security;
- workspace;
- heat;
- production capacity.

## 15.3. Образование внутреннего места

Если construction достигает порогов enclosure/shelter/access, engine может создать производный child `PlaceNode` как interior space и соединить его entrance route с parent place.

Это не `house type`; это результат конструкции.

## 15.4. Дороги

Поток перемещений на RouteEdge повышает `wear/compaction` и может менять travel cost в пределах правил.

Улучшение поверхности материалами может повысить surface quality и capacity.

Таким образом маршрут может стать дорогой без `CREATE_ROAD`.

## 15.5. Мосты и тоннели

Структура/инфраструктура может enable route, который до этого был недоступен из-за barrier.

Разрушение supporting structure должно disable route.

## 15.6. Водные каналы в graph world

Создать отдельный `WaterFlowEdge`.

Пассивный поток разрешать только по убыванию `hydraulic_head`, чтобы v1 не требовал сложного solver.

Flow зависит от:

- head difference;
- edge capacity;
- leakage;
- source availability.

Изменение water network должно локально пересчитывать только connected component.

## 15.7. Поля/культивация

`PLANT` создаёт cultivated renewable resource population.

Рост зависит от:

- moisture;
- fertility;
- temperature;
- species/material definition;
- harvesting pressure.

Agriculture считается появившейся только как аналитический label, когда устойчиво существуют выращивание и harvest cycle.

---

# 16. Модель мерзавчика

## 16.1. Canonical AgentState

Минимально:

- `AgentId`;
- birth time;
- optional parent IDs;
- optional external owner binding;
- alive/dead state;
- location;
- body condition;
- traits;
- needs;
- skills;
- inventory refs;
- current goal;
- current plan;
- next scheduled action;
- relationships index;
- memory index;
- belief index;
- known recipe IDs;
- known blueprint IDs;
- strategy IDs;
- organization memberships;
- personal value estimates;
- local decision sequence.

## 16.2. Personality traits

Начальный минимум `0..10000`:

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

## 16.3. Needs

Минимум:

- energy;
- hunger;
- safety;
- social;
- status;
- novelty;
- comfort;
- reproduction/attachment drive — включается по lifecycle policy.

## 16.4. Needs не должны тикать каждую секунду

Использовать lazy curves и scheduled threshold crossings.

---

# 17. Goals и Utility System

## 17.1. Goal types должны быть общими

Примеры допустимых goal categories:

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
- assist_group;
- reproduce/attach;
- explore.

Это не высокоуровневые сюжеты.

## 17.2. Candidate goal generation

На decision event:

1. materialize needs;
2. собрать локальные угрозы/возможности;
3. получить social obligations;
4. получить active organization rules;
5. получить remembered unfinished goals;
6. сгенерировать ограниченный список candidates;
7. вычислить integer utility.

## 17.3. Utility factors

Формула обязана учитывать:

- need pressure;
- personality modifiers;
- expected resource benefit;
- social benefit/cost;
- expected risk;
- familiarity;
- novelty;
- group norm effect;
- relationship effect;
- time cost;
- uncertainty.

## 17.4. Controlled unpredictability

Не всегда брать top-1.

Среди top-K использовать deterministic weighted choice.

Exploration weight зависит от curiosity/chaos/novelty seeking и от предыдущего успеха.

---

# 18. Planner

## 18.1. Подход

Использовать bounded GOAP-like planner + learned macro strategies.

## 18.2. Search limits v1

Конфигурируемые defaults:

- max primitive depth: 6;
- beam width: 8;
- max expanded nodes: 128 на decision;
- max candidate targets per action: ограниченный локальный top-N;
- deterministic stable ordering.

## 18.3. Action model

Planner работает с symbolic preconditions/effects, а не копирует реальный world state целиком.

## 18.4. Strategy first

Перед поиском нового плана проверять известные успешные strategies/macros.

Если стратегия применима и ожидаемая utility достаточна — использовать её.

## 18.5. Fallback

При отсутствии плана agent выбирает safe fallback из `REST/WAIT/MOVE_TO_KNOWN_SAFE_PLACE/OBSERVE` в зависимости от состояния.

---

# 19. Обучение без нейросетей

## 19.1. Outcome record

После значимого плана записывать:

- context features;
- strategy/action sequence;
- expected utility;
- actual utility delta;
- resource delta;
- health/safety delta;
- social delta;
- duration;
- success/failure.

## 19.2. Strategy score

Использовать integer EMA/score.

Не хранить бесконечный full state как ключ. Context должен быть компактным feature vector/bitset.

## 19.3. Macro creation

Если последовательность повторилась успешно несколько раз, можно создать personal `Strategy` macro.

## 19.4. Exploration

Agent может мутировать известную strategy:

- заменить target selection;
- заменить resource/material;
- поменять один primitive;
- вставить/удалить один primitive;
- изменить threshold;
- изменить порядок соседних операций.

Mutation budget обязан быть ограничен.

## 19.5. Imitation

Agent может наблюдать успешную strategy другого и создать локальную копию с возможной мутацией.

Нельзя передавать hidden internal state другого агента; только наблюдаемую sequence abstraction.

---

# 20. Память

## 20.1. Типы памяти

Разделить:

- episodic;
- relationship memory;
- procedural/strategy;
- semantic/beliefs;
- institutional/cultural knowledge.

## 20.2. Episodic memory

`Episode` содержит:

- time;
- place;
- participants;
- event category;
- observed facts;
- valence;
- importance;
- confidence.

## 20.3. Ограничение памяти

Память конечна.

Использовать importance + recency + memory_bias.

Слабые episodes могут консолидироваться в summary counters/beliefs и удаляться.

## 20.4. Никаких prose memories в canonical state

Память структурированная. Человекочитаемый текст генерирует narrative renderer.

---

# 21. Beliefs и ошибочные убеждения

## 21.1. Belief model

Минимально:

- proposition key;
- subject/object refs;
- confidence;
- evidence_count;
- contrary_evidence_count;
- source;
- last_updated;
- social_origin optional.

## 21.2. Ошибки разрешены

Agent не получает глобальную истину автоматически.

Он строит убеждения только из:

- личных наблюдений;
- обучения;
- слухов;
- культурной передачи.

## 21.3. Простая ложная причинность

При повторяющейся корреляции agent может повысить confidence причинного belief даже если системной связи нет.

Это должно быть намеренной особенностью.

## 21.4. Beliefs влияют на planner

Неверный belief должен реально менять expected utility/expected outcome и потому поведение.

---

# 22. Отношения и социальный граф

## 22.1. Directional relationship

A→B и B→A различны.

Минимальные параметры:

- affinity;
- trust;
- fear;
- respect;
- envy;
- rivalry;
- obligation;
- familiarity.

## 22.2. Lazy relationship creation

Создавать связь только после значимого контакта.

## 22.3. Decay

Некоторые компоненты меняются со временем lazy-функцией, другие являются долгосрочными.

## 22.4. Local social candidate selection

Агент не сканирует все 10 000 существ.

Использовать:

- co-located agents;
- nearby reachable agents;
- relationship cache;
- organization peers;
- memory participants.

---

# 23. Коммуникация без LLM

## 23.1. Internal speech acts

Использовать структурированные сообщения:

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

## 23.2. Message payload

Содержит typed refs и proposition/action, а не строку.

## 23.3. Procedural renderer

Frontend/backend преобразует message в текст шаблонами.

Выбор шаблона зависит от:

- personality;
- relationship;
- mood;
- deterministic random scope.

Renderer не влияет на state.

## 23.4. Future LLM compatibility

Позднее LLM может заменить renderer и получить тот же structured speech act. World Engine при этом не меняется.

---

# 24. Gossip и культурная передача

## 24.1. Gossip

Передавать не prose, а:

- belief proposition;
- confidence source;
- opinion about agent/group;
- event claim;
- strategy rumor;
- technology claim.

## 24.2. Distortion

При передаче допускать детерминированную мутацию:

- confidence drift;
- omitted detail;
- participant substitution в строго контролируемом наборе;
- exaggeration valence.

## 24.3. Trust weighting

Получатель меняет belief в зависимости от trust к источнику и conformity.

---

# 25. Мемы и культура

`CulturalMeme` — переносимая единица поведения/убеждения/нормы.

Минимальные категории:

- belief;
- taboo;
- preference;
- norm;
- ritualized procedure;
- strategy;
- symbol association;
- out-group attitude.

Поля:

- meme ID;
- content as structured data;
- origin;
- lineage parent optional;
- mutation generation;
- adoption strength per agent/group;
- transmission fitness statistics.

Meme может быть фактически неверным.

---

# 26. Экономика

## 26.1. Ownership

Любой ресурс/object имеет owner или public/unclaimed state.

## 26.2. Никаких фиксированных цен из engine constants

У каждого агента есть subjective value model.

Value зависит от:

- need;
- scarcity;
- expected future usefulness;
- local availability;
- risk;
- social obligations;
- memory of trades.

## 26.3. Barter first

Базовая торговля — offer bundles.

Любой переносимый ресурс теоретически может стать medium of exchange, если его начинают массово принимать.

## 26.4. Market как derived phenomenon

Место считается рынком в UI, если устойчиво имеет высокий trade flow/participant diversity.

Engine не создаёт `MarketEntity` только по названию.

## 26.5. Scarcity feedback

Production/consumption должны менять локальную availability и субъективные оценки, что влияет на следующие планы.

---

# 27. Технологии и изобретения

## 27.1. Главный принцип

В коде нет полного tech tree.

Есть primitive operations, materials, objects, affordances и знания агентов.

## 27.2. `ProcessRecipe`

Содержит:

- ordered operation graph/sequence;
- input constraints;
- parameter ranges;
- expected output descriptors;
- observed success stats;
- discoverer;
- lineage parent;
- creation time.

## 27.3. `ObjectDesign`

Содержит part graph template и параметрические ограничения, а не item enum.

## 27.4. `StructureBlueprint`

Содержит:

- components;
- connection types;
- relative symbolic geometry;
- material constraints;
- expected derived affordances;
- build sequence.

## 27.5. Discovery

Agent экспериментирует преимущественно через локальные мутации известного:

- substitute material;
- alter size class;
- alter temperature/time parameter;
- add/remove one part;
- change connector;
- swap neighboring operations;
- repeat operation;
- change shape.

## 27.6. Discovery acceptance

Новая технология сохраняется как knowledge, если:

- результат физически валиден;
- достигнут достаточный utility/novelty;
- agent смог наблюдать outcome;
- recipe не является exact duplicate.

## 27.7. Diffusion

Recipe/blueprint распространяется через:

- observation;
- teaching;
- trade;
- imitation;
- capture/steal;
- migration;
- organization knowledge.

## 27.8. Technology can disappear

Если знание не хранится ни одним living agent/group/archive, оно может исчезнуть из активной культуры, хотя historical event останется.

В дальнейшем оно может быть переоткрыто.

---

# 28. Организации и институты

## 28.1. Generic Organization

Не создавать отдельные core classes `Religion`, `State`, `Gang`, `Corporation`.

Использовать `Organization` с конфигурируемыми policy slots.

## 28.2. Поля

- members;
- membership rules;
- leadership selection;
- succession rule;
- shared resource pool;
- contribution/tax rule;
- redistribution rule;
- conflict rule;
- punishment rule;
- secrecy;
- territory claims;
- knowledge ownership;
- shared memes;
- allies/enemies;
- cohesion.

## 28.3. Возникновение

Organizations создаются только при наличии мотива:

- повторяющаяся кооперация;
- shared threat;
- resource coordination;
- kinship/social cluster;
- shared belief;
- production specialization.

## 28.4. Rules can mutate

Policy change — stateful decision организации/лидера/голосования по действующему decision rule.

## 28.5. Derived labels

UI может назвать организацию "клан", "культ", "торговая лига" или "диктатура" по её policy fingerprint. Label не является authority.

---

# 29. Демография, наследование и поколения

Для долгоживущего общества система должна поддерживать поколения.

## 29.1. Birth

Новый world-native agent создаётся через репродуктивное/social правило, а не из пустоты без причин.

## 29.2. Biological inheritance

Traits offspring = deterministic crossover parent traits + bounded mutation.

## 29.3. Cultural inheritance

Отдельно ребёнок может получить:

- memes;
- beliefs;
- recipes;
- relationship priors;
- language/template dialect tags;
- organization membership.

Культурное наследование не обязано совпадать с генетическим.

## 29.4. Death

World-native agents могут умереть от age/health/violence/resource failure по правилам симуляции.

Agent record не удаляется; он переходит в historical state.

## 29.5. Future owner-bound policy

External owner binding хранится отдельно от биологии, чтобы позднее решить, привязывается Ethereum address к конкретному агенту или к lineage. Текущий engine не должен зашивать это решение.

---

# 30. Процедурная история без LLM

## 30.1. SignificantEvent

Отделить internal technical actions от исторически значимых событий.

## 30.2. Significance scorer

Учитывает:

- количество затронутых агентов;
- permanent state change;
- rarity;
- resource/economic impact;
- relationship threshold;
- organization/technology impact;
- infrastructure impact;
- death/birth;
- long causal consequences.

## 30.3. Chronicle

Derived chronicle может показывать:

- technology discovered;
- organization founded/split;
- route/infrastructure changed;
- major conflict;
- migration;
- famine/resource shock;
- belief/meme spread milestone;
- notable betrayal/relationship change.

Текст формируется шаблонами.

---

# 31. Канонический input log, derived history и snapshots

## 31.1. Не хранить каждое внутреннее действие для replay

Replay основывается на:

- engine version;
- genesis;
- world seed;
- canonical external/admin inputs.

Внутренние решения пересчитываются детерминированно.

## 31.2. Три класса хранения

### A. `canonical_inputs`

Неперестраиваемые внешние факты:

- genesis;
- admin control changes;
- future external transaction facts;
- future player influence inputs.

Хранить бессрочно.

### B. `derived_history`

Significant events для UI/аналитики.

Можно перестроить replay.

### C. snapshots

Бинарное состояние для быстрого старта.

Можно перестроить replay.

## 31.3. Snapshot policy

Default:

- каждые 6 world hours или после N state-changing events, что наступит раньше;
- не писать второй snapshot, если state revision не менялся;
- Zstd compression;
- checksum;
- schema version;
- engine version;
- input sequence;
- world time;
- state hash.

## 31.4. Retention

Хранить:

- последние 48 hourly/6-hour snapshots;
- daily snapshots 90 дней;
- weekly snapshots далее;

Policy сделать конфигурируемой.

---

# 32. Canonical serialization и state hash

## 32.1. Не использовать произвольный serde map encoding как консенсусный hash

Создать явный `CanonicalWriter`.

## 32.2. Порядок

Все entity stores сериализуются по ascending ID.

Все adjacency lists сортируются.

Все optional/value discriminants имеют документированный byte format.

## 32.3. Hashes

- BLAKE3 для локальной быстрой integrity проверки;
- Keccak-256 дополнительный root для будущего Ethereum anchoring.

## 32.4. Versioning

State hash domain включает `engine_protocol_version`.

---

# 33. Future Ethereum/transaction influence boundary

Конкретное влияние транзакций сейчас **не реализовывать**.

Нужно реализовать архитектурный шов.

## 33.1. `ExternalInputProvider` trait

Provider выдаёт `NormalizedExternalEvent`.

Engine не знает RPC, block headers, EIP-712 или viem.

## 33.2. `NormalizedExternalEvent`

Минимальные поля:

- `source_kind`;
- `source_event_id`;
- `schema_version`;
- `observed_at`;
- `effective_world_time`;
- `subject_bindings`;
- `event_kind`;
- `payload_digest`;
- typed payload;
- optional finality reference.

## 33.3. Deduplication

Unique key: `(source_kind, source_event_id)`.

## 33.4. `InfluencePolicy`

Отдельный adapter переводит normalized external fact в 0..N `WorldCommand`.

Default implementation для blockchain events в текущей версии — no-op/disabled.

## 33.5. Тест архитектурного шва

Добавить fake provider, который посылает внешний факт и через тестовый `InfluencePolicy` создаёт ограниченный world command.

Тест должен доказать, что для добавления нового provider не требуется менять `sim-core`, planner или physics.

## 33.6. Future reuse из `feat/mvp`

После branch audit здесь потенциально могут пригодиться:

- finality logic;
- block continuity;
- replay protection;
- EIP-712 attestations;
- signer separation;
- viem RPC adapter.

Но их нельзя тащить в canonical engine.

---

# 34. World Engine process

## 34.1. `worldd`

Один binary отвечает за:

- load config;
- migrate DB;
- load/verify snapshot;
- replay canonical inputs;
- start world runner;
- start API;
- expose metrics;
- graceful shutdown;
- periodic snapshots;
- background rebuild read models.

## 34.2. Mutation queue

Все commands попадают в bounded queue.

Canonical loop serially:

1. получает command/advance target;
2. валидирует;
3. применяет;
4. обновляет revision;
5. пишет durable commit/input если нужен;
6. публикует derived notification.

## 34.3. Backpressure

При переполнении внешней command queue API должен отвечать 429/503, а не терять commands.

Internal scheduler не должен терять events.

---

# 35. Persistence schema

Минимальные таблицы:

- `schema_meta`;
- `world_meta`;
- `canonical_inputs`;
- `snapshots`;
- `derived_events`;
- `agents_read`;
- `places_read`;
- `relationships_read`;
- `organizations_read`;
- `technologies_read`;
- `objects_read` при необходимости;
- `external_event_dedupe`;
- `operations_journal`.

Canonical deep state не обязан нормализовываться в SQL; он может жить в snapshot и памяти. SQL read tables — projection.

---

# 36. API

## 36.1. Public read API

Минимальные endpoints:

- `GET /api/world`;
- `GET /api/world/metrics`;
- `GET /api/agents`;
- `GET /api/agents/{id}`;
- `GET /api/agents/{id}/relationships`;
- `GET /api/agents/{id}/memories`;
- `GET /api/agents/{id}/knowledge`;
- `GET /api/agents/{id}/decision-explanation`;
- `GET /api/places`;
- `GET /api/places/{id}`;
- `GET /api/routes`;
- `GET /api/organizations`;
- `GET /api/organizations/{id}`;
- `GET /api/technologies`;
- `GET /api/technologies/{id}`;
- `GET /api/chronicle`;
- `GET /api/events`.

## 36.2. Live stream

SSE/WebSocket messages только derived/read notifications.

Потеря client connection не влияет на simulation.

## 36.3. Admin API

Отдельная auth boundary:

- pause runner;
- resume;
- set speed;
- request snapshot;
- verify state;
- shutdown graceful;
- run catch-up;
- trigger read model rebuild.

Admin command тоже проходит canonical command path, если влияет на world time/state.

---

# 37. Frontend

## 37.1. Главные страницы

### World overview

Показывает:

- world age/time;
- population;
- active organizations;
- known technology count;
- recent significant events;
- resource stress indicators;
- simulation status.

### Graph map

Показывает:

- Place nodes;
- Routes;
- population density;
- important structures;
- trade intensity;
- organization influence;
- water/infrastructure overlays.

Нужно level-of-detail: не рендерить 100k labels одновременно.

### Agent profile

Показывает:

- traits;
- needs;
- location;
- current goal;
- current plan summary;
- inventory;
- relationships;
- beliefs;
- memories;
- strategies;
- technologies;
- organization memberships;
- biography.

### Place page

- residents;
- resources;
- structures;
- routes;
- trade;
- organizations;
- recent events;
- derived settlement label.

### Technology page

- discoverer;
- recipe/blueprint structure;
- lineage;
- adopters;
- performance;
- mutations/variants;
- geographic diffusion.

### Organization page

- policies;
- members;
- leadership;
- shared resources;
- beliefs;
- allies/enemies;
- history.

### Chronicle

Фильтруемый feed значимых событий.

## 37.2. Explainability UX

На profile должна быть кнопка/секция "Почему он это сделал?".

Показывать:

- выбранную цель;
- top alternative goals;
- utility components;
- выбранную strategy/plan;
- beliefs, повлиявшие на решение;
- memory refs;
- deterministic random scope identifier без раскрытия внутренних секретов, которых в simulation нет.

---

# 38. Resource budget и performance targets

Целевой reference workload v1:

- 10 000 agents;
- до 10 000–50 000 Place nodes;
- до 100 000 routes/infrastructure edges;
- до 500 000–1 000 000 objects/parts;
- до 1 000 000 directional social edges;
- десятки тысяч active recipes/blueprints/strategies;
- realtime world speed 1x.

Reference hardware:

- современный 8–16 core CPU;
- 32 GB RAM;
- NVMe SSD;
- GPU не требуется.

## 38.1. RAM target

При reference workload стремиться к RSS `worldd` <= 16 GB.

Жёсткий release blocker: не превышать 24 GB на 32 GB машине в steady state.

## 38.2. CPU target

Realtime simulation не должна стабильно держать все 8 физических ядер на 100% при 10k agents.

Canonical mutation thread должен оставлять headroom для catch-up.

## 38.3. Decision throughput

Benchmark обязан измерять не только events/s, но и full decisions/s с planner.

Минимальная цель перед beta: sustained >= 200 agent decisions/s на reference CPU в synthetic benchmark без API traffic.

Это даёт большой запас относительно модели, где каждый из 10k агентов принимает значимое решение раз в несколько игровых минут.

## 38.4. Catch-up

После 1 часа downtime при 1x speed reference world должен догоняться значительно быстрее realtime.

Acceptance target: минимум 10x realtime при выключенном live rendering.

## 38.5. API latency

Read endpoints p95 < 250 ms для обычных profile/list запросов при realtime simulation.

## 38.6. Disk estimate

При значимых derived events порядка 2 событий/agent/day:

- 3.6 млн значимых событий за 180 дней для 10k агентов;
- ожидаемый порядок derived DB — единицы/десятки GB;
- snapshots и indexes увеличат объём;
- проектировать под 20–100 GB за полгода;
- 1 TB NVMe считается комфортным стартовым объёмом.

Не хранить каждую промежуточную мысль/шаг как бессрочный log.

---

# 39. Observability

Экспортировать metrics:

- world time;
- real-to-world lag;
- scheduler queue length;
- events processed/sec;
- decisions/sec;
- average planner expansions;
- planner fallback rate;
- active agents;
- sleeping/idle agents;
- relationships count;
- object/part count;
- places/routes count;
- technologies count;
- organizations count;
- DB size;
- snapshot duration/size;
- state hash;
- catch-up status;
- command queue depth;
- API latency/error rate.

Logs — JSON structured через tracing.

---

# 40. Security and safety boundaries

## 40.1. Admin auth

Admin API не публиковать без auth token/mTLS/reverse proxy restriction.

## 40.2. No arbitrary execution

Recipes/strategies/messages не могут содержать исполняемый код.

## 40.3. Bounded planner

Любой планировщик имеет hard limits, чтобы один агент не устроил CPU DoS.

## 40.4. External inputs

Любой будущий provider обязан иметь:

- schema validation;
- replay protection;
- source allowlist;
- size limits;
- rate limits;
- deterministic mapping.

## 40.5. Secrets

World simulation не должна требовать private key.

Будущий chain signer/submission service держать отдельно.

---

# 41. Тестовые инварианты мира

Обязательные property/invariant tests:

1. один ObjectId не имеет двух mutually exclusive locations/carriers;
2. количество не может стать отрицательным;
3. non-renewable matter не появляется из ничего, кроме явно описанных genesis/transformation outputs;
4. Route не ссылается на отсутствующий Place;
5. Part edge не ссылается на отсутствующий Part;
6. scheduled time не идёт назад;
7. ID не переиспользуется;
8. normalized values не выходят за bounds;
9. dead agent не исполняет обычные living actions;
10. owner transfer операции атомарны;
11. canonical input dedupe работает;
12. snapshot + replay даёт тот же state hash;
13. replay с genesis даёт тот же state hash;
14. одна и та же seed/input последовательность даёт одинаковый результат после перезапуска;
15. read-model rebuild не меняет canonical hash;
16. procedural text renderer не меняет canonical state;
17. order-independent pure queries не влияют на randomness;
18. добавление API query не сдвигает random sequence;
19. deleted/tombstoned IDs не выдаются повторно.

---

# 42. Обязательные эмерджентные scenario tests

Создать фиксированные scenarios с seed и acceptance assertions.

## 42.1. Emergent path

Многократное движение по одному route должно повысить его привлекательность/usage при соответствующих физических правилах.

## 42.2. Tool discovery

Agent с высоким curiosity должен через ограниченные эксперименты создать новый полезный object design из частей; design должен существовать как knowledge, а не item enum.

## 42.3. Technology diffusion

Успешная технология должна через teaching/imitation распространиться хотя бы на часть локальной популяции.

## 42.4. Technology mutation

Копия должна иметь возможность породить вариант с отличающимися параметрами и собственной lineage.

## 42.5. False belief

При специально подобранном seed локальная корреляция должна породить ложный belief, который влияет на решения и может распространиться.

## 42.6. Organization emergence

Группа агентов с repeated cooperation/shared threat должна получить generic Organization с правилами, не через вызов `CREATE_CLAN`.

## 42.7. Organization split

Изменение cohesion/policy конфликтов должно иметь возможность породить split.

## 42.8. Resource shock

Падение доступности еды должно изменить subjective value, trade behavior, migration/strategy выборы.

## 42.9. Infrastructure consequence

Создание нового route должно изменить движение и downstream trade distribution.

## 42.10. Water consequence

Новый water edge должен изменить water availability downstream и production utility.

## 42.11. Cross-seed diversity

Запустить минимум 20 seeds одинакового genesis. Результаты не должны сводиться к одной и той же последовательности организаций и technologies.

Собирать diversity metrics вместо требования заранее заданной истории.

---

# 43. Пошаговый план разработки — атомарные этапы

Ни один последующий этап не начинать до зелёных тестов предыдущего foundational этапа, если он является dependency.

## Этап 0. Аудит `feat/mvp`

- [ ] checkout/read branch;
- [ ] запустить install/build/verify;
- [ ] прочитать обязательные документы;
- [ ] прочитать обязательные source files;
- [ ] составить reuse matrix;
- [ ] определить код, который можно портировать;
- [ ] определить код, который нельзя переносить;
- [ ] зафиксировать выводы в `feat-mvp-reuse-audit.md`;
- [ ] не менять новый engine до завершения отчёта.

## Этап 1. Rust workspace foundation

- [ ] создать root Cargo workspace;
- [ ] добавить rust-toolchain;
- [ ] добавить rustfmt config;
- [ ] добавить clippy deny policy для critical warnings;
- [ ] создать перечисленные crates пустыми с README responsibility;
- [ ] создать `worldd` binary;
- [ ] создать `simctl` binary;
- [ ] добавить CI: fmt, clippy, tests;
- [ ] добавить Windows/Linux matrix для core tests;
- [ ] добавить Docker builder;
- [ ] добавить baseline compose.

## Этап 2. Deterministic core primitives

- [ ] реализовать ID newtypes;
- [ ] реализовать StableArena;
- [ ] реализовать fixed-point types;
- [ ] реализовать WorldTime;
- [ ] реализовать deterministic hash-random scopes;
- [ ] реализовать weighted deterministic choice;
- [ ] реализовать canonical ordering helpers;
- [ ] добавить property tests bounds;
- [ ] добавить random non-shift test;
- [ ] добавить cross-platform golden fixture.

## Этап 3. Canonical serialization

- [ ] определить protocol version;
- [ ] написать CanonicalWriter;
- [ ] написать encoding для всех core primitives;
- [ ] вычислять BLAKE3 root;
- [ ] вычислять Keccak root;
- [ ] добавить golden bytes fixture;
- [ ] запретить HashMap в canonical encoding path;
- [ ] добавить schema/version test.

## Этап 4. Scheduler и world loop

- [ ] реализовать stable priority queue;
- [ ] реализовать ScheduleId;
- [ ] реализовать cancellation token/generation;
- [ ] реализовать `advance_to`;
- [ ] реализовать monotonic time assertions;
- [ ] реализовать runner clock adapter;
- [ ] реализовать realtime speed factor;
- [ ] реализовать catch-up mode;
- [ ] тест pause/resume;
- [ ] тест downtime catch-up.

## Этап 5. Graph topology

- [ ] реализовать PlaceStore;
- [ ] реализовать RouteStore;
- [ ] реализовать adjacency sorted vectors;
- [ ] реализовать create/remove/disable route;
- [ ] реализовать parent-child places;
- [ ] реализовать reachability;
- [ ] реализовать shortest path по integer cost;
- [ ] реализовать topology boundary trait;
- [ ] запретить прямой topology storage import из higher domains;
- [ ] topology integrity tests.

## Этап 6. Environment/resources

- [ ] environment structs;
- [ ] season function;
- [ ] deterministic anomaly generator;
- [ ] resource deposits;
- [ ] renewable lazy growth;
- [ ] non-renewable depletion;
- [ ] resource extraction API;
- [ ] conservation/property tests.

## Этап 7. Materials/physics

- [ ] material catalog schema;
- [ ] material property types;
- [ ] heating transformation;
- [ ] cooling;
- [ ] burning;
- [ ] drying/wetting;
- [ ] crushing/grinding;
- [ ] mixing;
- [ ] compression/shaping;
- [ ] material transition test fixtures;
- [ ] ensure no item-name special cases.

## Этап 8. Objects and part graph

- [ ] ObjectEntity;
- [ ] Part;
- [ ] connection enum;
- [ ] attach/detach validation;
- [ ] location/carrier/container ownership;
- [ ] derived affordance calculator;
- [ ] revision cache;
- [ ] container capacity;
- [ ] structural support;
- [ ] cutting/piercing/impact;
- [ ] rolling/rotation metrics;
- [ ] invariant tests.

## Этап 9. Primitive action framework

- [ ] define ActionSchema trait/data;
- [ ] precondition model;
- [ ] effect/reducer boundary;
- [ ] failure result type;
- [ ] observation outcome type;
- [ ] implement essential movement/inventory actions;
- [ ] implement physical transformations;
- [ ] implement social/trade primitives;
- [ ] implement build/composition primitives;
- [ ] action permission/knowledge checks;
- [ ] deterministic action tests.

## Этап 10. Agent base model

- [ ] AgentState;
- [ ] traits;
- [ ] needs;
- [ ] body/health;
- [ ] location;
- [ ] inventory refs;
- [ ] lifecycle flags;
- [ ] lazy needs materialization;
- [ ] threshold scheduling;
- [ ] spawn/genesis agent;
- [ ] death historical state.

## Этап 11. Goal utility system

- [ ] define GoalCandidate;
- [ ] need goals;
- [ ] safety goals;
- [ ] acquisition goals;
- [ ] social goals;
- [ ] status/exploration goals;
- [ ] integer utility breakdown;
- [ ] deterministic top-K;
- [ ] weighted selection;
- [ ] decision explanation object;
- [ ] tests for personality influence.

## Этап 12. Planner

- [ ] symbolic planner state;
- [ ] precondition/effect projection;
- [ ] bounded beam search;
- [ ] depth limit;
- [ ] expansion budget;
- [ ] stable tie-breaking;
- [ ] target candidate limiter;
- [ ] fallback behavior;
- [ ] benchmark planner;
- [ ] no-world-clone performance test.

## Этап 13. Memory/learning

- [ ] Episode;
- [ ] importance scoring;
- [ ] retention/consolidation;
- [ ] strategy outcome record;
- [ ] integer strategy score;
- [ ] macro extraction;
- [ ] strategy mutation;
- [ ] imitation;
- [ ] memory capacity;
- [ ] deterministic forgetting tests.

## Этап 14. Beliefs/gossip/culture

- [ ] belief proposition schema;
- [ ] confidence update;
- [ ] evidence/contrary evidence;
- [ ] false correlation heuristic;
- [ ] structured gossip;
- [ ] trust-weighted adoption;
- [ ] distortion mutation;
- [ ] CulturalMeme;
- [ ] meme lineage;
- [ ] transmission metrics;
- [ ] false-belief scenario.

## Этап 15. Relationships

- [ ] directional relationship model;
- [ ] lazy creation;
- [ ] co-location contact;
- [ ] trust/affinity/fear/respect/envy/rivalry updates;
- [ ] decay/materialization;
- [ ] local candidate selection;
- [ ] relationship memory integration;
- [ ] social performance benchmark.

## Этап 16. Economy

- [ ] resource ownership;
- [ ] subjective value model;
- [ ] barter Offer object;
- [ ] accept/refuse;
- [ ] trade atomic transfer;
- [ ] memory of trade;
- [ ] local scarcity inputs;
- [ ] trade flow metrics;
- [ ] derived market label;
- [ ] resource-shock scenario.

## Этап 17. Technology discovery

- [ ] ProcessRecipe;
- [ ] ObjectDesign;
- [ ] StructureBlueprint;
- [ ] stable structural hashing для duplicate detection;
- [ ] experiment mutation generator;
- [ ] experiment budget;
- [ ] outcome utility/novelty scoring;
- [ ] recipe learning;
- [ ] teaching/copying;
- [ ] technology lineage;
- [ ] disappearance/reintroduction support;
- [ ] tool discovery scenario;
- [ ] diffusion scenario.

## Этап 18. World modification

- [ ] Structure store;
- [ ] structure placement in Place;
- [ ] shelter/workspace/storage derived properties;
- [ ] child interior Place creation rule;
- [ ] traffic effect on Route;
- [ ] material route upgrade;
- [ ] route enabling by structure;
- [ ] route disabling by destruction;
- [ ] WaterFlowEdge;
- [ ] hydraulic head rule;
- [ ] local water component recalculation;
- [ ] cultivated resource populations;
- [ ] infrastructure consequence tests.

## Этап 19. Organizations/institutions

- [ ] Organization model;
- [ ] membership rules;
- [ ] leader selection;
- [ ] succession;
- [ ] shared resources;
- [ ] contribution rules;
- [ ] redistribution;
- [ ] punishment;
- [ ] conflict policy;
- [ ] territory claims;
- [ ] shared knowledge/memes;
- [ ] cohesion;
- [ ] formation triggers;
- [ ] policy mutation/change;
- [ ] split/merge primitives;
- [ ] derived label classifier;
- [ ] organization emergence scenario.

## Этап 20. Demography/generations

- [ ] age/lifecycle;
- [ ] reproduction eligibility;
- [ ] offspring creation;
- [ ] genetic crossover;
- [ ] trait mutation;
- [ ] cultural inheritance;
- [ ] kin relationships;
- [ ] death;
- [ ] historical retention;
- [ ] population stabilizers/carrying pressure;
- [ ] long-run 100-generation simulation test.

## Этап 21. Derived history/narrative

- [ ] SignificantEvent schema;
- [ ] significance scorer;
- [ ] chronicle projection;
- [ ] procedural templates;
- [ ] personality speech styles;
- [ ] organization/place/technology templates;
- [ ] ensure renderer pure;
- [ ] renderer snapshot tests.

## Этап 22. SQLite persistence

- [ ] migrations;
- [ ] WAL setup;
- [ ] canonical_inputs repository;
- [ ] dedupe indexes;
- [ ] snapshot metadata;
- [ ] derived events;
- [ ] read projections;
- [ ] operations journal;
- [ ] transaction boundaries;
- [ ] crash recovery tests;
- [ ] migration tests.

## Этап 23. Snapshot/replay

- [ ] snapshot serializer;
- [ ] Zstd compression;
- [ ] checksum;
- [ ] atomic temp-file + rename;
- [ ] snapshot load validation;
- [ ] replay from snapshot;
- [ ] replay from genesis;
- [ ] state hash verify;
- [ ] corrupt snapshot fallback;
- [ ] retention cleanup;
- [ ] deterministic replay integration test.

## Этап 24. worldd runtime/API

- [ ] config;
- [ ] startup validation;
- [ ] DB migration;
- [ ] snapshot recovery;
- [ ] world runner;
- [ ] command queue;
- [ ] read API;
- [ ] live feed;
- [ ] admin API;
- [ ] health/readiness;
- [ ] graceful shutdown;
- [ ] metrics;
- [ ] structured logs.

## Этап 25. Future external input seam

- [ ] ExternalInputProvider trait;
- [ ] NormalizedExternalEvent;
- [ ] dedupe storage;
- [ ] InfluencePolicy trait;
- [ ] disabled/no-op chain provider config;
- [ ] fake provider for tests;
- [ ] deterministic sequence ordering;
- [ ] demonstrate engine core unchanged by new provider;
- [ ] document future Ethereum adapter boundary.

## Этап 26. Frontend

- [ ] Next.js project;
- [ ] API client;
- [ ] World overview;
- [ ] graph map;
- [ ] agent profile;
- [ ] decision explainability;
- [ ] place page;
- [ ] technology page;
- [ ] organization page;
- [ ] chronicle;
- [ ] filters/search;
- [ ] live updates;
- [ ] loading/error states;
- [ ] Playwright smoke path.

## Этап 27. Performance

- [ ] create 1k synthetic scenario;
- [ ] create 10k reference scenario;
- [ ] generate 1M object/part fixture;
- [ ] generate 1M relationship fixture;
- [ ] benchmark planner;
- [ ] benchmark scheduler;
- [ ] benchmark snapshot;
- [ ] benchmark catch-up;
- [ ] heap profile;
- [ ] remove accidental per-tick scans;
- [ ] verify RSS limits;
- [ ] verify API p95;
- [ ] publish benchmark report.

## Этап 28. Long-run soak

- [ ] 24h accelerated run;
- [ ] periodic restart during run;
- [ ] snapshot/replay hash validation;
- [ ] check unbounded collections;
- [ ] check event queue growth;
- [ ] check technology explosion caps;
- [ ] check memory consolidation;
- [ ] check organization churn;
- [ ] check population stability;
- [ ] check DB growth;
- [ ] document tuning values.

## Этап 29. Packaging/operations

- [ ] production Dockerfile;
- [ ] compose volumes;
- [ ] env example;
- [ ] backup script;
- [ ] restore script;
- [ ] snapshot verify CLI;
- [ ] replay verify CLI;
- [ ] sim pause/resume CLI;
- [ ] docs for restart;
- [ ] docs for corrupted DB/snapshot;
- [ ] metrics dashboard template;
- [ ] release checklist.

---

# 44. Обязательные CLI-инструменты

`simctl` должен иметь минимум:

```text
simctl status
simctl pause
simctl resume
simctl set-speed <factor>
simctl snapshot
simctl verify
simctl replay --from-genesis
simctl replay --snapshot <id>
simctl inspect-agent <id>
simctl inspect-place <id>
simctl explain-agent <id>
simctl seed-scenario <file>
simctl export-chronicle
```

Ни один CLI не должен напрямую патчить canonical tables.

---

# 45. Конфигурация и tuning

Все balance/performance constants собрать в versioned world config, а не размазывать magic numbers.

Категории config:

- time scale;
- need curves;
- planner limits;
- memory limits;
- exploration probabilities;
- experiment budget;
- relationship decay;
- organization formation thresholds;
- resource regeneration;
- weather variability;
- snapshot interval;
- significance thresholds;
- performance caps.

Config hash входит в genesis/canonical identity мира.

Изменение canonical config после старта должно оформляться как versioned admin input, если оно влияет на state.

---

# 46. Защита от комбинаторного взрыва

Эмерджентность не означает бесконечный brute force.

Обязательные ограничения:

- planner expansion budget;
- local target top-N;
- local social candidate set;
- recipe mutation one/few edits per experiment;
- per-agent experiment cooldown/budget;
- technology duplicate structural hashing;
- memory consolidation;
- strategy cap per agent;
- belief cap with replacement/consolidation;
- organization membership limits policy;
- no all-pairs social scan;
- no all-world route search на каждый decision;
- cached hierarchical routing можно добавить позже, но v1 минимум должен использовать bounded reachable scope и route cache.

---

# 47. Criteria эмерджентности продукта

Перед заявлением о готовности beta должно быть доказано не только отсутствие crash, но и наличие эмерджентного пространства.

Провести automated multi-seed experiment и собрать:

- количество уникальных technology lineages;
- среднюю/максимальную глубину lineage;
- distribution organization policy fingerprints;
- concentration торговли по places;
- divergence social graphs;
- belief diversity;
- false-belief survival time;
- migration patterns;
- resource inequality distribution;
- route centrality changes;
- population/organization churn.

Если 20 seeds создают почти идентичные общества, задачу считать не выполненной даже при технически правильном engine.

---

# 48. Future LLM insertion — только архитектурный reserve

LLM не входит в текущую разработку.

Но structured boundaries должны позволить позже:

1. взять `SpeechAct` и отрендерить естественный текст;
2. взять `Episode`/`Belief` и сделать художественную рефлексию;
3. сделать world historian/summarizer;
4. сделать дополнительный non-canonical narrative layer;
5. потенциально предлагать candidate structured actions, которые всё равно проходят rules validation.

LLM никогда не должна напрямую писать canonical database/state.

---

# 49. Future Ethereum integration — reserve architecture

Позднее возможно:

- bind Ethereum address к agent/lineage;
- наблюдать finalized transactions;
- классифицировать факты;
- подавать их как `NormalizedExternalEvent`;
- применять bounded `InfluencePolicy`;
- якорить state hash в Ethereum;
- использовать account-bound identity.

Сейчас это не реализуется как gameplay.

Критерий готовности архитектуры: новый chain adapter можно добавить отдельным crate/service без изменения physics, planner, technology, social и economy crates.

---

# 50. Definition of Done готового продукта v1

Продукт считается готовым только если одновременно выполнены все условия:

1. World Engine детерминирован и replayable.
2. Один и тот же fixture даёт одинаковый state hash на поддерживаемых платформах.
3. 10k-agent reference scenario работает в realtime на целевом 32 GB классе машины.
4. Мир не требует GPU.
5. Мир переживает restart и догоняет время.
6. Snapshot/replay проверены автоматическими тестами.
7. Агенты выбирают цели из потребностей/контекста, а не фиксированного сюжетного state machine.
8. Planner строит последовательности primitive actions.
9. Агенты обучаются результатам и создают/мутируют strategies.
10. Существуют structured memory и beliefs.
11. Возможны ложные убеждения.
12. Работает directional social graph.
13. Работает imitation/gossip/cultural transmission.
14. Работает barter/subjective value economy.
15. Новые useful recipes/designs могут возникнуть без item-specific invention command.
16. Технологии имеют lineage и могут распространяться.
17. Агенты могут преобразовывать graph world: структуры, routes, infrastructure/water connections.
18. Поселения/рынки/социальные ярлыки выводятся аналитически, а не создаются отдельной сюжетной командой.
19. Generic Organizations возникают и меняют policies.
20. Поддерживаются поколения world-native agents и культурное/генетическое наследование.
21. UI позволяет наблюдать world graph, профили, организации, технологии и chronicle.
22. Для действия агента доступно объяснение причин.
23. Derived text не влияет на canonical state.
24. ExternalInput boundary существует и протестирован fake provider.
25. Нет прямой зависимости core engine от Ethereum RPC.
26. Проведён `feat/mvp` reuse audit.
27. Проведён 24h accelerated soak test.
28. Проведён multi-seed emergent diversity experiment.
29. Опубликованы benchmark и operations docs.
30. Все CI checks зелёные.

---

# 51. Финальное архитектурное резюме

Первая версия Merzavtsy должна выглядеть концептуально так:

```text
                       EXTERNAL WORLD (future)
                    Ethereum / other providers
                              │
                              ▼
                    NormalizedExternalEvent
                              │
                       InfluencePolicy
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    DETERMINISTIC WORLD ENGINE               │
│                                                             │
│  WorldTime / Scheduler                                      │
│         │                                                   │
│         ├─ Graph Topology                                   │
│         ├─ Environment / Resources                          │
│         ├─ Symbolic Materials Physics                       │
│         ├─ Objects / Structures / Infrastructure            │
│         ├─ Agents / Needs / Traits                          │
│         ├─ Goals / Utility / Planner                        │
│         ├─ Memory / Learning / Strategies                   │
│         ├─ Beliefs / Gossip / Memes                         │
│         ├─ Relationships                                    │
│         ├─ Economy                                          │
│         ├─ Technology / Recipes / Blueprints                │
│         ├─ Organizations / Institutions                     │
│         └─ Demography / Inheritance                         │
│                                                             │
└────────────────────────────┬────────────────────────────────┘
                             │
             ┌───────────────┼────────────────┐
             ▼               ▼                ▼
       Canonical Inputs   Snapshots      Derived History
             │               │                │
             └───────────────┴────────────────┘
                             │
                          SQLite
                             │
                      Read Projections
                             │
                   ┌─────────┴─────────┐
                   ▼                   ▼
                 API               Chronicle
                   │
                   ▼
               Next.js UI
```

Главная ставка проекта — **комбинаторная эмерджентность**.

Разработчик не должен пытаться сделать мир интересным добавлением тысяч уникальных hardcoded действий. Каждая новая физическая возможность, материал, primitive, social rule или knowledge mechanism должна расширять пространство комбинаций для всех агентов сразу.

Если приходится регулярно добавлять специальные функции вида `do_specific_story_event_X()`, это сигнал, что архитектура отклоняется от цели.
