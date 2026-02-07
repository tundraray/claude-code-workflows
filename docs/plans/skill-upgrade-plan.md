# План обновления экспертных skill-плагинов до уровня Senior+

> **Статус:** Черновик
> **Дата аудита:** 2026-02-07
> **Автор:** На основе комплексного аудита 5 экспертных плагинов
> **Цель:** Систематическое обновление всех 5 плагинов с текущего middle-уровня до genuine senior+ (8+/10)

---

## Содержание

1. [Общие принципы обновления](#1-общие-принципы-обновления)
2. [Per-plugin секции](#2-per-plugin-секции)
   - [2.1 javascript-expert](#21-javascript-expert-510--810)
   - [2.2 nestjs-expert](#22-nestjs-expert-410--810)
   - [2.3 nextjs-developer](#23-nextjs-developer-410--810)
   - [2.4 playwright-expert](#24-playwright-expert-410--810)
   - [2.5 postgres-expert](#25-postgres-expert-5510--810)
3. [Общий чеклист учебникового контента для удаления](#3-общий-чеклист-учебникового-контента-для-удаления)
4. [Общие ошибки для исправления](#4-общие-ошибки-для-исправления)
5. [Фазы работы](#5-фазы-работы)
6. [Метрики успеха](#6-метрики-успеха)

---

## 1. Общие принципы обновления

### 1.1 Что отличает Senior+ контент от Middle-уровня

| Аспект | Middle (текущее состояние) | Senior+ (цель) |
|--------|---------------------------|-----------------|
| **Фокус** | "Как использовать API" | "Когда и почему выбирать этот подход" |
| **Примеры** | Hello World, базовый CRUD | Продакшн-сценарии, edge cases, failure modes |
| **Trade-offs** | Отсутствуют | Каждое решение сопровождается альтернативами и компромиссами |
| **Anti-patterns** | Не упоминаются | Явно документированы с объяснением "почему плохо" |
| **"Когда НЕ использовать"** | Отсутствует | Обязательная секция для каждого паттерна |
| **Ошибки и отказы** | Базовый try/catch | Failure modes, recovery strategies, graceful degradation |
| **Архитектурные решения** | Нет контекста | Связь с системной архитектурой, масштабируемостью |
| **Числа и метрики** | Нет | Бенчмарки, пороги, конкретные цифры ("GIN индекс на 1M записей занимает ~200ms для rebuild") |
| **Версионность** | Не указана | Явные указания версий, deprecated API, миграционные пути |

### 1.2 Обязательные секции в каждом файле senior+ уровня

Каждый reference-файл ДОЛЖЕН содержать:

1. **"Когда использовать"** — конкретные сценарии применения
2. **"Когда НЕ использовать"** — альтернативы и ситуации, где подход вреден
3. **"Trade-offs"** — компромиссы каждого решения
4. **"Failure modes"** — что ломается и как диагностировать
5. **"Production considerations"** — что важно на проде, но не в учебнике
6. **Конкретные числа** — производительность, лимиты, пороги
7. **Версионная маркировка** — какие API доступны в каких версиях

### 1.3 Правила удаления учебникового контента

Удалять или радикально сокращать:
- Примеры уровня "Hello World" и базовый CRUD
- Таблицы Quick Reference с очевидными API (`@Get`, `@Post`, `localStorage.setItem`)
- Комментарии типа `// Basic GET request`, `// Draw rectangle`
- Полные примеры, которые идентичны документации фреймворка
- Секции, которые просто перечисляют API без контекста применения

### 1.4 Правила оформления

- Каждый код-пример должен решать конкретную продакшн-задачу
- Комментарии в коде объясняют "ПОЧЕМУ", а не "ЧТО"
- Если пример > 30 строк, он должен быть обоснован (покрывает нетривиальный сценарий)
- Stage 3 proposals маркируются как нестабильные: `> **Stage 3 Proposal** — не использовать в продакшне без полифилла`

---

## 2. Per-plugin секции

---

### 2.1 javascript-expert (5/10 -> 8+/10)

**Базовый путь:** `javascript-expert/skills/javascript-expert/references/`

**Диагноз:** Сильный middle-уровень. ~50% текстового контента — переписанная документация MDN. Отсутствуют: производительность/V8 internals, безопасность, продвинутое тестирование. Есть фактические ошибки (fetch upload progress, deprecated API).

#### 2.1.1 Новые файлы (приоритет 1)

##### `references/performance.md`

**Обоснование:** Полностью отсутствующая критическая тема. Senior JS-разработчик обязан понимать V8 internals и профилирование.

**Содержание:**
- **V8 Internals:**
  - Hidden Classes — как V8 оптимизирует доступ к свойствам, почему динамическое добавление свойств деоптимизирует
  - Inline Caches (IC) — как мономорфные/полиморфные/мегаморфные IC влияют на скорость
  - Deoptimization — что вызывает bail-out из оптимизированного кода, как обнаружить (--trace-deopt)
  - JIT Compilation pipeline — Ignition → Sparkplug → Maglev → TurboFan, когда какой
- **Memory profiling:**
  - Heap snapshots — retained size vs shallow size, dominator tree
  - Memory leak паттерны — closures, event listeners, detached DOM, WeakRef как решение
  - `process.memoryUsage()` — heapUsed vs heapTotal vs external vs rss
  - Chrome DevTools Memory tab — workflow для поиска утечек
- **Event loop мониторинг:**
  - `monitorEventLoopDelay()` API — percentiles (p50, p99), thresholds
  - Blocked event loop detection — когда > 100ms это проблема
  - `perf_hooks` — PerformanceObserver для server-side метрик
- **Web Vitals (browser):**
  - LCP (Largest Contentful Paint) — оптимизация до < 2.5s
  - INP (Interaction to Next Paint) — заменяет FID, оптимизация до < 200ms
  - CLS (Cumulative Layout Shift) — причины и предотвращение
- **Bundle optimization:**
  - Tree shaking — dead code elimination, `/*#__PURE__*/` annotations
  - Code splitting — dynamic import(), route-based, component-based
  - Barrel files — почему `export * from` убивает tree shaking
- **Flame graphs:**
  - `--prof` и `--prof-process` в Node.js
  - 0x — генерация flame graphs
  - Chrome DevTools Performance tab — интерпретация

##### `references/security.md`

**Обоснование:** Полностью отсутствующая тема. Нет ни одного упоминания безопасности во всём плагине.

**Содержание:**
- **Prototype pollution:**
  - Механизм атаки — `__proto__`, `constructor.prototype`
  - Защита — `Object.create(null)`, Object.freeze(), `Map` вместо plain objects
  - Реальные CVE примеры (lodash.merge, jQuery.extend)
- **ReDoS (Regular Expression Denial of Service):**
  - Catastrophic backtracking — что это и как обнаружить
  - safe-regex, re2 — инструменты валидации
  - Atomic groups и possessive quantifiers (через re2)
- **Timing attacks:**
  - `crypto.timingSafeEqual()` — почему `===` не годится для сравнения токенов
  - Constant-time comparison для паролей и ключей
- **CSP (Content Security Policy):**
  - Директивы — `script-src`, `style-src`, `connect-src`, `frame-ancestors`
  - Nonce-based CSP — генерация и внедрение
  - Report-URI / Report-To — мониторинг нарушений
- **CORS deep dive:**
  - Preflight requests — когда они происходят и почему
  - `credentials: 'include'` — влияние на wildcard origins
  - Распространённые ошибки конфигурации
- **crypto.subtle / node:crypto:**
  - AES-GCM шифрование — когда использовать, длина IV
  - PBKDF2 / scrypt — хэширование паролей, выбор параметров
  - HMAC — подпись данных, webhook verification
- **Input sanitization:**
  - XSS vectors — DOM-based, stored, reflected
  - DOMPurify — конфигурация для разных контекстов
  - SQL injection через ORM — parameterized queries всегда
- **Supply chain security:**
  - npm audit / Snyk — автоматизация проверок
  - lock-файлы — `npm ci` vs `npm install`
  - `--ignore-scripts` — защита от postinstall malware

#### 2.1.2 Новые файлы (приоритет 2)

##### `references/testing.md`

**Содержание:**
- **node:test (Node.js built-in):**
  - `describe()`, `it()`, `test()` — встроенный test runner (Node 18+)
  - `--test-reporter` — TAP, spec, dot
  - Покрытие с `--experimental-test-coverage`
- **Property-based testing (fast-check):**
  - Generators — `fc.string()`, `fc.record()`, `fc.array()`
  - Shrinking — автоматическое нахождение минимального failing case
  - Когда PBT лучше example-based testing
- **Mocking strategies:**
  - `mock.method()` в node:test
  - Module mocking — `--experimental-vm-modules`
  - Dependency injection vs module mocking — trade-offs
- **Testing async edge cases:**
  - Тестирование race conditions — controlled Promise resolution
  - AbortController в тестах
  - EventEmitter leak detection (`setMaxListeners`)

#### 2.1.3 Доработка существующих файлов

##### `references/async-patterns.md`

**Текущее состояние:** Покрыты базовые Promise-паттерны и AsyncQueue. Отсутствует глубина.

**Что добавить:**
- **AsyncLocalStorage** — альтернатива thread-local для Node.js, use cases (request-scoped logging, tracing, tenant isolation)
- **`using` / `Symbol.asyncDispose`** (ES2024) — Explicit Resource Management, замена try/finally для cleanup
- **Backpressure** — когда producer быстрее consumer: `Readable.pause()`, `highWaterMark`, `drain` event
- **Promise memory leaks** — long-lived Promise chains, forgotten AbortController, unresolved Promise в Map
- **Retry с jitter** — экспоненциальный backoff + random jitter (предотвращение thundering herd)
  - Текущая реализация `retryWithBackoff` (строки 101-111) НЕ имеет jitter — исправить
- **Semaphore / Mutex** — AsyncSemaphore для controlled concurrency (улучшение текущего AsyncQueue)

##### `references/browser-apis.md`

**Текущее состояние:** Набор hello-world примеров (Canvas: "Draw rectangle", "Draw text"). Минимальная практическая ценность.

**Полная переработка — план:**

1. **Убрать полностью:**
   - Canvas & WebGL секция (строки 327-357) — "Draw rectangle", "Draw text", "Hello Canvas" — нулевая ценность
   - Quick Reference таблица (строки 386-399) — "Modern browsers" не информативен

2. **Исправить ошибки:**
   - Строка 46-54: "File upload with progress" через fetch — **fetch API НЕ поддерживает upload progress**. Заменить на XMLHttpRequest с `xhr.upload.onprogress` или ReadableStream workaround
   - Строки 362-365: `performance.timing` — **deprecated** (Navigation Timing Level 1). Заменить на `PerformanceNavigationTiming` через `performance.getEntriesByType('navigation')`

3. **Добавить:**
   - **WebSocket** — connect, reconnect с backoff, heartbeat, binary data
   - **Server-Sent Events (SSE)** — EventSource, retry, custom events, when SSE vs WebSocket
   - **BroadcastChannel** — cross-tab communication, use cases
   - **ResizeObserver** — responsive components без media queries
   - **`structuredClone()`** — deep clone без JSON.parse(JSON.stringify()), limitations (functions, DOM nodes)
   - **Web Components** — Custom Elements, Shadow DOM, slots, lifecycle callbacks, когда использовать vs React/Vue
   - **Web Crypto API** — `crypto.subtle.encrypt()`, `crypto.subtle.digest()`, key generation
   - **View Transitions API** — `document.startViewTransition()`, SPA transitions
   - **`requestIdleCallback()`** — non-critical background work, `deadline.timeRemaining()`

##### `references/modern-syntax.md`

**Что добавить:**
- **Proxy / Reflect** — реактивность, validation, logging, API mocking (20+ строк production-примеров)
- **Symbol ecosystem** — `Symbol.iterator`, `Symbol.asyncIterator`, `Symbol.toPrimitive`, `Symbol.hasInstance`, well-known symbols
- **`using` keyword** (ES2024) — Explicit Resource Management, `Symbol.dispose`, `Symbol.asyncDispose`
- **`Error.cause`** (ES2022) — цепочки ошибок для отладки: `throw new Error('Failed', { cause: originalError })`
- **`structuredClone()`** (ES2022) — deep clone
- **Decorators** (Stage 3) — `@logged`, `@cached`, `@debounce` — пометить как нестабильные

**Маркировка:**
- Строки 193-216: Pattern Matching помечен как "Stage 3 Proposal" — **НЕ Stage 3**, это Stage 1. Исправить с предупреждением
- Строки 218-240: Iterator Helpers — Stage 3 корректно, но добавить маркер нестабильности
- Строки 242-258: Temporal API — Stage 3, но потенциально скоро Stage 4. Обновить статус

##### `references/modules.md`

**Что исправить и добавить:**
- Строка 332: `import data from './data.json' assert { type: 'json' }` — **`assert` deprecated**, заменить на `with { type: 'json' }` (Import Attributes)
- **Добавить `node:` protocol** — `import { readFile } from 'node:fs/promises'` — рекомендуемый подход с Node 16+
- **Dual package hazard** — проблема двойного инстанцирования при смешении ESM/CJS, решения
- **Monorepo patterns** — workspace resolution, `exports` для internal packages, tsconfig paths
- **Bundler-specific resolution** — Vite vs Webpack vs esbuild различия в resolve

##### `references/node-essentials.md`

**Что добавить:**
- **`Readable.from()`** — создание readable stream из итератора/async итератора
- **`stream.compose()`** (Node 18+) — композиция transform streams
- **Buffer** — best practices, `Buffer.alloc()` vs `Buffer.allocUnsafe()`, encoding trade-offs
- **AsyncLocalStorage** — request context propagation
- **`node:test`** — встроенный test runner
- **`http2`** — server push, multiplexing, when to use vs http1.1
- **`diagnostics_channel`** — structured observability API

**Что исправить:**
- Строка 401: `const user = JSON.parse(body)` — **нет try/catch**, JSON.parse может бросить SyntaxError на невалидном JSON. Обернуть в try/catch
- Строки 286-324: WorkerPool — **нет error handling** (worker crash handler), **нет drain** (graceful shutdown), **нет destroy** метода. Добавить полноценную реализацию

---

### 2.2 nestjs-expert (4/10 -> 8+/10)

**Базовый путь:** `nestjs-expert/skills/nestjs-expert/references/`

**Диагноз:** Middle-уровень. ~75% контента — учебниковое. Отсутствуют: архитектурные паттерны (CQRS, DDD), продвинутая работа с БД, безопасность, микросервисы, observability. Критическая ошибка: refresh token signed с тем же секретом.

#### 2.2.1 Новые файлы (приоритет 1)

##### `references/architecture-patterns.md`

**Содержание:**
- **CQRS с @nestjs/cqrs:**
  - Command Bus / Query Bus / Event Bus — разделение ответственности
  - Sagas — side effects на events
  - Когда CQRS оправдан, а когда overhead (trade-off: < 10 сущностей — не нужен)
- **DDD (Domain-Driven Design):**
  - Bounded Contexts в NestJS modules — один module = один контекст
  - Aggregate Root — entity с бизнес-инвариантами
  - Value Objects — immutable objects без identity
  - Domain Events — интеграция с @nestjs/cqrs EventBus
  - Anti-corruption Layer — между bounded contexts
- **Hexagonal Architecture (Ports & Adapters):**
  - Ports = абстрактные классы/интерфейсы
  - Adapters = конкретные реализации (TypeORM, Redis, HTTP)
  - NestJS DI как wire-up layer
- **Dynamic Modules:**
  - `forRoot()` / `forRootAsync()` — глобальная конфигурация
  - `forFeature()` — per-feature регистрация
  - Паттерн ConfigurableModuleBuilder (NestJS 9+)
- **Lifecycle Hooks:**
  - `onModuleInit` / `onModuleDestroy` / `onApplicationBootstrap` / `onApplicationShutdown`
  - Порядок выполнения, async hooks
  - Graceful shutdown с `enableShutdownHooks()`

##### `references/database-advanced.md`

**Содержание:**
- **Транзакции:**
  - `DataSource.transaction()` — callback pattern
  - `QueryRunner` — manual transaction control (begin, commit, rollback)
  - Isolation levels — READ COMMITTED vs SERIALIZABLE, когда какой
  - Distributed transactions — two-phase commit pitfalls
- **Миграции:**
  - TypeORM CLI — `migration:generate`, `migration:run`, `migration:revert`
  - Naming conventions, idempotent migrations
  - Zero-downtime migrations — добавление nullable column, backfill, then NOT NULL
- **N+1 prevention:**
  - `relations` option в find
  - `QueryBuilder` с `.leftJoinAndSelect()`
  - DataLoader pattern для GraphQL
- **TypeORM QueryBuilder advanced:**
  - Subqueries, CTEs
  - Raw queries с параметризацией
  - Streaming для больших выборок
- **Repository pattern (domain-oriented):**
  - Custom repositories с бизнес-методами
  - Отделение domain entity от ORM entity
  - Repository vs Active Record — trade-offs в NestJS контексте
- **Soft delete:**
  - `@DeleteDateColumn()`, `softDelete()`, `restore()`
  - Global scope для фильтрации
- **Auditing:**
  - Subscribers для автоматического audit trail
  - `@BeforeInsert`, `@BeforeUpdate` — timestamps, user tracking
- **Multi-tenancy:**
  - Schema-per-tenant с dynamic DataSource
  - Row-level isolation с RLS
  - Tenant resolution через middleware

##### `references/security-hardening.md`

**Содержание:**
- **@nestjs/throttler:**
  - Rate limiting — global, per-route, per-user
  - Настройка с Redis store для distributed environments
  - Skip throttling для определённых endpoints
- **Helmet:**
  - Настройка заголовков безопасности
  - CSP конфигурация для SPA
  - HSTS, X-Frame-Options, X-Content-Type-Options
- **CORS deep config:**
  - `origin` — whitelist, dynamic origin resolution
  - `credentials: true` — implications для cookies
  - Preflight caching с `maxAge`
- **CSRF:**
  - csurf middleware — двойной cookie pattern
  - SameSite cookies как альтернатива
- **Token rotation / blacklisting:**
  - Refresh token rotation — каждый refresh выдаёт новый refresh token
  - Token family detection для обнаружения кражи
  - Redis-based blacklist для logout
- **OAuth2 / OIDC:**
  - Passport strategies — Google, GitHub, custom OIDC provider
  - Authorization Code Flow с PKCE
  - Token exchange, scope management
- **CASL for ABAC:**
  - Ability definition — `can('read', 'Article', { authorId: user.id })`
  - Integration с NestJS Guards
  - Policy-based vs Role-based — когда что
- **Input sanitization:**
  - class-sanitizer — strip HTML, trim
  - Custom validation pipes
  - SQL injection prevention через parameterized queries

#### 2.2.2 Новые файлы (приоритет 2)

##### `references/microservices.md`

**Содержание:**
- **Транспорты:** TCP, Redis, RabbitMQ, Kafka, gRPC — сравнительная таблица (latency, throughput, ordering, at-least-once vs exactly-once)
- **MessagePattern vs EventPattern** — request-response vs fire-and-forget
- **Saga pattern** — orchestration vs choreography
- **Hybrid applications** — HTTP + microservice в одном приложении
- **Circuit breaker** — паттерн с @nestjs/terminus или custom implementation
- **Service discovery** — Consul, etcd, Kubernetes DNS
- **Message serialization** — Protobuf vs JSON, schema evolution

##### `references/performance-caching.md`

**Содержание:**
- **@nestjs/cache-manager:**
  - In-memory cache — ttl, max items
  - Redis adapter — `cache-manager-redis-yet`
  - `@CacheKey()`, `@CacheTTL()` decorators
  - Cache invalidation strategies
- **LazyModuleLoader:**
  - On-demand module loading
  - Уменьшение startup time для больших приложений
- **Connection pooling:**
  - TypeORM pool config — `extra.max`, `extra.min`, `extra.idleTimeoutMillis`
  - pgBouncer интеграция
- **Compression:**
  - `compression` middleware — gzip/brotli
  - Когда НЕ использовать (уже compressed content)
- **Streaming responses:**
  - `StreamableFile` — файловые загрузки без загрузки в память
  - SSE с `@Sse()` decorator
- **Memory leak prevention:**
  - Request-scoped providers — overhead и когда необходимы
  - EventEmitter leak detection
  - Subscription cleanup в onModuleDestroy

##### `references/observability.md`

**Содержание:**
- **@nestjs/terminus health checks:**
  - Database, Redis, memory, disk health indicators
  - Custom health indicators
  - Kubernetes readiness/liveness probes
- **Graceful shutdown:**
  - `enableShutdownHooks()` — SIGTERM, SIGINT handling
  - In-flight request draining
  - Database connection cleanup
- **Structured logging:**
  - Pino — performance (5x faster than Winston)
  - Correlation ID — request tracing через AsyncLocalStorage
  - Log levels per environment
  - Redaction — маскирование PII в логах
- **OpenTelemetry:**
  - Auto-instrumentation — `@opentelemetry/auto-instrumentations-node`
  - Custom spans с `@nestjs/opentelemetry`
  - Traces, metrics, logs — связь
- **Prometheus metrics:**
  - `nestjs-prometheus` — request duration, error rate
  - Custom counters, gauges, histograms
  - Grafana dashboards

#### 2.2.3 Доработка существующих файлов

##### `references/authentication.md`

**Критическая ошибка (строка 112):**
```typescript
refresh_token: this.jwtService.sign(payload, { expiresIn: '7d' }),
```
Refresh token подписан **тем же секретом**, что и access token. Это означает, что refresh token может быть использован как access token. **Исправить:**
- Отдельный секрет для refresh token: `JWT_REFRESH_SECRET`
- Или separate JwtModule instance

**Что добавить:**
- Refresh token rotation с отдельным секретом
- Token blacklisting (Redis-based) для logout
- OAuth2/OIDC integration
- API key authentication — для service-to-service
- CASL ABAC (Attribute-Based Access Control) — production-ready пример
- Guard execution order — `APP_GUARD` ordering, `@Public()` priority

##### `references/controllers-routing.md`

**Что убрать:**
- Quick Reference таблица с `@Get()`, `@Post()`, `@Put()`, `@Delete()` — это уровень "первая глава учебника"
- Базовые примеры CRUD контроллера

**Что добавить:**
- Interceptors — response transformation, caching, logging, timeout
- Custom parameter decorators — `@CurrentUser()`, `@Tenant()` с createParamDecorator
- Streaming responses — `StreamableFile`, `@Header('Content-Disposition')`
- Versioning trade-offs — URI vs Header vs Media Type, когда какой
- Pagination с cursors — cursor-based vs offset-based, trade-offs
- Cache headers / ETags — `@Header('Cache-Control')`, conditional requests

##### `references/services-di.md`

**Что добавить:**
- `forwardRef()` — решение циклических зависимостей, когда это запах архитектуры
- Dynamic module pattern — `ConfigurableModuleBuilder`
- `ModuleRef` — динамическое разрешение providers
- Provider lifecycle — `onModuleInit` / `onModuleDestroy`, async initialization
- Request-scoped providers — caveats (performance impact, DI chain propagation)
- Custom providers — `useFactory` с async, `useExisting` для aliasing

##### `references/dtos-validation.md`

**Что добавить:**
- `@ValidateIf()` — conditional validation
- Validation groups — разные правила для create vs update
- Async validators — `@Validate()` с custom async constraint
- Response DTOs separation — `@Exclude()`, `ClassSerializerInterceptor`, plainToInstance
- Discriminated unions — `@Type(() => ...)` с discriminator для полиморфных DTO

##### `references/testing-patterns.md`

**Текущее состояние:** Только базовые unit tests и один E2E пример. Нет integration testing, нет тестирования Guards/Pipes.

**Полная переработка:**
- **Integration testing с Testcontainers:**
  - PostgreSQL container для реальной базы в тестах
  - Shared container для ускорения test suite
  - Database seeding — factory pattern (fishery, factorybot)
- **Тестирование Guards отдельно:**
  - `ExecutionContext` mock
  - Reflector mock для metadata
- **Тестирование Interceptors:**
  - `CallHandler` mock
  - Observable chain testing
- **Тестирование Pipes:**
  - `ArgumentMetadata` mock
  - Validation error assertions
- **Contract testing:**
  - Pact — consumer-driven contracts
  - Schema validation для API endpoints
- **Custom test utilities:**
  - `createTestingApp()` helper
  - Database transaction rollback between tests

##### `references/migration-from-express.md`

**Что добавить:**
- Reverse proxy config — Nginx перед NestJS
- WebSocket migration — Socket.IO → @nestjs/websockets
- Background jobs migration — Bull → @nestjs/bull
- Canary deployment — gradual traffic shift
- Feature flags — LaunchDarkly / Flagsmith integration pattern

---

### 2.3 nextjs-developer (4/10 -> 8+/10)

**Базовый путь:** `nextjs-developer/skills/nextjs-developer/references/`

**Диагноз:** Middle-уровень. ~75% контента — учебниковое. Отсутствуют: middleware, caching architecture (4 уровня), testing. Критические проблемы: устаревшие API (experimental_useOptimistic, useFormState вместо useActionState), отсутствие security discussion для Server Actions.

#### 2.3.1 Новые файлы (приоритет 1)

##### `references/middleware.md`

**Содержание:**
- **Auth middleware:**
  - JWT verification в middleware — до рендеринга страницы
  - Redirect для unauthenticated users
  - Token refresh flow в middleware
- **Geo-routing:**
  - `request.geo` — country, city, region
  - A/B testing на основе geo
  - Edge runtime limitations для geo
- **A/B testing:**
  - Cookie-based split
  - `NextResponse.rewrite()` для разных вариантов
  - Analytics tracking
- **Request rewriting:**
  - URL rewriting для legacy URLs
  - API proxy через middleware
  - Multi-tenant routing (`{tenant}.example.com`)
- **Rate limiting:**
  - Edge-compatible rate limiting
  - Upstash Redis integration
  - Per-IP и per-user strategies
- **Edge runtime limitations:**
  - Конкретные неработающие APIs — `fs`, `net`, `child_process`, `dns`
  - `crypto` — частично доступен
  - Maximum execution time — 30 seconds (Vercel) / configurable (self-hosted)
- **Matcher config:**
  - `config.matcher` — include/exclude patterns
  - Regex matchers
  - Как НЕ ломать static assets (`_next/static`, `favicon.ico`)
- **Chaining logic:**
  - Middleware composition — sequential checks
  - Early return pattern для performance

##### `references/caching-architecture.md`

**Обоснование:** Самый сложный и непонятный аспект Next.js. Отсутствие этого материала — ключевая причина оценки 4/10.

**Содержание:**
- **4 уровня кэширования:**
  1. **Request Memoization** — React `cache()` + `fetch()` deduplication в рамках одного рендера
  2. **Data Cache** — `fetch()` cache с `revalidate` и `tags`, persistent между запросами
  3. **Full Route Cache** — HTML + RSC Payload на build time, invalidation через revalidation
  4. **Router Cache** — client-side cache, 30-second rule для dynamic routes, 5-minute для static
- **`unstable_cache` для ORM:**
  - Обёртка Prisma/Drizzle запросов в cache
  - Tagging для granular invalidation
  - Limitations — serializable values only
- **Cache invalidation strategies:**
  - Time-based — `revalidate: 60`
  - On-demand — `revalidateTag()`, `revalidatePath()`
  - Сложные data dependencies — когда обновление user инвалидирует posts, comments, dashboard
- **Opt-out patterns:**
  - `cache: 'no-store'` — per-fetch
  - `export const dynamic = 'force-dynamic'` — per-route
  - `noStore()` из `next/cache` — для non-fetch data
- **Router Cache 30-sec rule:**
  - Dynamic routes кэшируются на 30 секунд в client-side Router Cache
  - `router.refresh()` — принудительная инвалидация
  - Почему данные "застревают" после navigation

##### `references/testing.md`

**Содержание:**
- **Jest/Vitest config для App Router:**
  - `jest.config.ts` с `moduleNameMapper` для `@/`
  - `next/jest` preset — automatic transforms
  - Vitest setup — `vitest.config.ts` с `@vitejs/plugin-react`
- **Testing async Server Components:**
  - Direct function call testing — `const result = await ServerComponent(props)`
  - HTML snapshot comparison
  - Mock `headers()`, `cookies()` из `next/headers`
- **Mocking `headers()` / `cookies()` / `fetch()`:**
  - `jest.mock('next/headers')` — pattern
  - `fetchMock` / `msw` для fetch interception
  - `NextRequest` / `NextResponse` mocking
- **Testing Server Actions:**
  - Direct function call — action как обычная async function
  - FormData creation для тестов
  - `revalidatePath` / `revalidateTag` mock verification
- **Playwright E2E patterns:**
  - Full-stack E2E с running Next.js dev server
  - `webServer` config в `playwright.config.ts`
  - API setup/teardown через `request` fixture
- **MSW integration:**
  - Service worker setup для App Router
  - Server-side MSW для Server Components

#### 2.3.2 Новые файлы (приоритет 2)

##### `references/auth-patterns.md`

**Содержание:**
- **NextAuth v5 / Auth.js setup:**
  - `auth.ts` config — providers, callbacks, session strategy
  - `middleware.ts` — route protection
  - Edge runtime compatibility
- **Middleware-based protection:**
  - Public routes whitelist
  - Role-based route access
  - API route protection
- **Session в Server vs Client Components:**
  - `auth()` в Server Components — direct call
  - `useSession()` в Client Components — SessionProvider
  - Passing session через props vs context
- **RBAC:**
  - Role checking в middleware
  - Component-level authorization
  - Server Action authorization
- **Protected API routes:**
  - `auth()` в Route Handlers
  - API key authentication

##### `references/performance-optimization.md`

**Содержание:**
- **Core Web Vitals checklist:**
  - LCP — `priority` на hero image, preload fonts, minimize server response time
  - CLS — explicit width/height на images, font display swap, skeleton UI
  - INP — avoid large JavaScript bundles, use `startTransition`, web workers
- **next/image advanced:**
  - `priority` — для above-the-fold images
  - `sizes` — responsive breakpoints, viewport-based sizing
  - `fill` — для unknown dimensions, с parent position relative
  - `placeholder="blur"` — blurDataURL generation
  - Remote images — `remotePatterns` config
- **next/font strategies:**
  - Variable fonts — single file, multiple weights
  - `display: 'swap'` vs `'optional'` — trade-off (FOUT vs invisible text)
  - Font subsetting — `unicode-range`
- **next/dynamic code splitting:**
  - `dynamic(() => import(...))` — lazy component loading
  - `ssr: false` — client-only components
  - `loading` component — fallback UI
- **Bundle analysis:**
  - `@next/bundle-analyzer` — визуализация bundle
  - `next build --profile` — performance profiling
  - Barrel file problem — re-exports увеличивают bundle

#### 2.3.3 Доработка существующих файлов

##### `references/app-router.md`

**Что добавить:**
- `default.tsx` для parallel routes — обязательный файл, иначе 404
- Intercepting routes conventions — `(.)`, `(..)`, `(...)`, `(..)(..)` — с конкретными use cases (модальные окна)
- `generateMetadata` advanced — dynamic OG images, async metadata, parent metadata merging
- `sitemap.ts` / `robots.ts` / `opengraph-image.tsx` — file conventions
- Route segment config полный — `dynamic`, `revalidate`, `runtime`, `preferredRegion`, `maxDuration`
- Middleware integration — как middleware влияет на routing

##### `references/server-components.md`

**Что добавить:**
- `server-only` / `client-only` packages — import guards для предотвращения неправильного использования
- **Serialization boundary** — `Date`, `Map`, `Set`, `RegExp` **НЕ проходят** через RSC boundary. Только JSON-serializable values
- RSC Payload optimization — минимизация данных в RSC payload
- **Partial Prerendering (PPR)** — экспериментальная функция, static shell + dynamic holes
- Nested Suspense strategies — cascading vs parallel Suspense boundaries
- `"use client"` as entry point semantics — это не "make everything client", а entry point в client module graph

##### `references/server-actions.md`

**Критические обновления:**
- Строка 85: `useFormState` → **`useActionState`** (React 19). `useFormState` deprecated
- Строка 150: `experimental_useOptimistic` → **`useOptimistic`** (React 19, stable). Убрать `experimental_` prefix
- **Security deep dive:**
  - Server Actions = **публичные HTTP endpoints**. Любой может вызвать POST запрос
  - Closure encryption — переменные из closure зашифрованы, но не скрыты
  - CSRF — Next.js автоматически проверяет Origin header, но custom implementations нужны для cross-origin
- **`.bind()` для аргументов** — `action.bind(null, id)` вместо hidden inputs
- **`useTransition` + actions** — non-blocking UI updates при вызове actions
- **Concurrent mutations** — что происходит при множественных одновременных вызовах одного action

##### `references/data-fetching.md`

**Что добавить:**
- **4 уровня кэширования** — краткое описание с ссылкой на `caching-architecture.md`
- **`unstable_cache` для ORM** — Prisma/Drizzle queries через cache wrapper
- **Request deduplication scope и ограничения** — работает только в рамках одного рендера, не между разными пользователями
- **Router Cache 30-sec rule** — dynamic routes кэшируются 30 секунд client-side
- **Patterns для real-time data** — SWR + Server Components, polling, SSE

##### `references/deployment.md`

**Что добавить:**
- **Edge runtime limitations** — конкретные неработающие APIs (список)
- **ISR gotchas на self-hosted** — необходимость persistent storage, cache handler
- **`dynamicParams`** — `true` (allow unlisted params) vs `false` (404 for unlisted)
- **Observability:**
  - OpenTelemetry integration — `@vercel/otel`
  - Structured logging — correlation IDs
  - Error tracking — Sentry integration
- **Feature flags** — LaunchDarkly / edge config / environment-based

---

### 2.4 playwright-expert (4/10 -> 8+/10)

**Базовый путь:** `playwright-expert/skills/playwright-expert/references/`

**Диагноз:** Middle/junior+ уровень. ~80% учебникового контента. Отсутствуют: visual testing, advanced patterns (multi-browser, component testing), CI/CD advanced, accessibility. Минимальная глубина в каждом файле.

#### 2.4.1 Новые файлы (приоритет 1)

##### `references/visual-testing.md`

**Содержание:**
- **`toHaveScreenshot()` с опциями:**
  - `threshold` — процент допустимого отличия пикселей (по умолчанию 0)
  - `maxDiffPixels` — абсолютное количество отличающихся пикселей
  - `maxDiffPixelRatio` — относительный порог
  - `mask` — массив locators для маскировки динамического контента (таймеры, даты, аватары)
  - `animations: 'disabled'` — стоп анимаций перед скриншотом
- **Baseline management в CI:**
  - Хранение baselines в git — git LFS для больших файлов
  - Update workflow — `npx playwright test --update-snapshots`
  - Platform-specific baselines — `linux/`, `darwin/`, `win32/` суффиксы
  - CI vs local — одинаковые шрифты через Docker
- **Full-page vs component screenshots:**
  - `page.screenshot({ fullPage: true })` — вся страница
  - `locator.screenshot()` — отдельный элемент
  - Viewport control — `page.setViewportSize()`
- **Cross-platform rendering differences:**
  - Шрифты — основная причина различий Linux vs macOS vs Windows
  - Anti-aliasing — subpixel rendering differences
  - Решение — Docker container с фиксированными шрифтами (`mcr.microsoft.com/playwright`)
- **Masking dynamic content:**
  - `mask: [page.locator('.timestamp')]` — маскировка дат
  - `stylePath` — CSS для скрытия динамических элементов при скриншоте

##### `references/advanced-patterns.md`

**Содержание:**
- **Multi-browser context (chat/collaboration testing):**
  - `browser.newContext()` — два пользователя в одном тесте
  - Синхронизация действий между контекстами
  - WebSocket communication testing
- **Multi-tab / popup handling:**
  - `page.waitForEvent('popup')` — перехват новых вкладок
  - `context.pages()` — список всех вкладок
  - Focus management между вкладками
- **`frameLocator()` для iframes:**
  - `page.frameLocator('#iframe-id')` — доступ к элементам внутри iframe
  - Nested iframes — `frameLocator().frameLocator()`
  - Cross-origin iframes — ограничения
- **Shadow DOM:**
  - Playwright пронизывает Shadow DOM по умолчанию
  - `page.locator('css:light=...')` — только light DOM
  - Тестирование Web Components
- **File upload / download:**
  - `input.setInputFiles()` — загрузка файлов
  - `page.waitForEvent('download')` — перехват скачивания
  - `download.saveAs()` — сохранение для проверки
- **Drag & Drop:**
  - `locator.dragTo(target)` — native drag and drop
  - Custom drag с mouse events для сложных библиотек
- **Component testing (@playwright/experimental-ct-react):**
  - Setup — `playwright-ct.config.ts`
  - `mount()` — рендеринг отдельного компонента
  - Props / Events testing
  - Когда использовать vs full E2E
- **API testing (`APIRequestContext`):**
  - `request.newContext()` — HTTP клиент без browser
  - API setup/teardown в тестах
  - Response assertions
- **`test.step()`:**
  - Группировка шагов в trace
  - Улучшенная отладка в Trace Viewer
- **Parameterized tests:**
  - `test.describe()` с loop — data-driven testing
  - `test.describe.parallel()` — параллельные параметризованные тесты

##### `references/ci-cd-advanced.md`

**Содержание:**
- **Sharding (`--shard=N/M`):**
  - Распределение тестов по CI jobs — `npx playwright test --shard=1/3`
  - Merge results — `npx playwright merge-reports`
  - Оптимальное количество shards — зависит от total test time
- **Docker (`mcr.microsoft.com/playwright`):**
  - Dockerfile для CI — минимальный размер
  - Volume mounts для test results
  - Кэширование node_modules и browser binaries
- **Parallel strategy:**
  - `workers` — параллельные тесты внутри одного CI job
  - `shards` — параллельные CI jobs
  - CI matrix — browser × sharding
  - Optimal formula: `total_shards = ceil(total_test_time / target_ci_time)`
- **Artifact management:**
  - Test results upload — screenshots, traces, videos
  - GitHub Actions artifact upload
  - S3/GCS для long-term storage
- **Flaky test quarantine:**
  - `@flaky` tag — skip in CI, track separately
  - Flaky detection metrics — failure rate over time
  - Auto-quarantine pipeline
- **PR comment integration:**
  - Custom reporter для GitHub PR comments
  - Test results summary в PR
  - Screenshot diff в PR review
- **Cache optimization:**
  - Browser binary caching — `PLAYWRIGHT_BROWSERS_PATH`
  - `npm ci` cache
  - Docker layer caching

#### 2.4.2 Новые файлы (приоритет 2)

##### `references/accessibility.md`

**Содержание:**
- **@axe-core/playwright integration:**
  - `AxeBuilder(page).analyze()` — automated a11y audit
  - Per-page и per-component scanning
  - `exclude()` — исключение known issues
- **Custom a11y assertions:**
  - `expect(violations).toHaveLength(0)` — zero violations policy
  - Custom matchers для specific WCAG criteria
- **WCAG compliance automation:**
  - Level A, AA, AAA — какие правила автоматизируемы
  - ~30% WCAG не автоматизируется — что нужно тестировать вручную
- **Keyboard navigation testing:**
  - Tab order verification — `page.keyboard.press('Tab')`
  - Focus trap testing для модальных окон
  - Skip links testing

##### `references/auth-testing.md`

**Содержание:**
- **Multi-role storageState:**
  - `global-setup.ts` — авторизация для всех ролей один раз
  - `storageState` per project — admin, user, readonly
  - Sharing state через файлы — `.auth/admin.json`, `.auth/user.json`
- **API-based auth (10-100x faster than UI):**
  - Direct API call для получения token
  - Cookie injection через `context.addCookies()`
  - Когда UI-based auth всё же нужен (OAuth redirect flow)
- **OAuth flow testing:**
  - Mock OAuth provider
  - Bypass с environment variable
  - Token injection для CI
- **MFA / TOTP testing:**
  - `otpauth` library — генерация TOTP в тесте
  - Shared secret в test fixtures
- **Session management:**
  - Session expiry testing
  - Concurrent session testing
  - Session invalidation verification

#### 2.4.3 Доработка существующих файлов

##### `references/selectors-locators.md`

**Что добавить:**
- **Custom selectors** — `playwright.selectors.register()` для domain-specific selectors
- **Shadow DOM** — поведение по умолчанию (pierce), explicit light DOM selection
- **Framework-specific selectors** — `_react=`, `_vue=` (experimental)
- **Strategy for legacy code** — без `role`, без `testid`: чек-лист из getByText → getByLabel → CSS → XPath, порядок приоритетов

##### `references/page-object-model.md`

**Что добавить:**
- **Builder pattern** — для сложных форм: `form.withName('John').withEmail('john@test.com').submit()`
- **State Machine pattern** — LoginPage → DashboardPage, typed navigation
- **Abstract Base Page** — common methods: navigation, waitForLoad, header/footer
- **API shortcuts для data setup** — `await api.createUser()` вместо UI flow для test data
- **Worker-scoped fixtures** — shared state across tests in same worker
- **Fixture composition** — nested fixtures, dependency injection
- **Когда НЕ использовать POM** — простые smoke tests, one-off scripts
- **Screenplay pattern** — краткое описание альтернативы

##### `references/api-mocking.md`

**Что добавить:**
- **GraphQL mocking по operation name:**
  - `route.fulfill()` на основе `operationName` в request body
  - Type-safe mocks с codegen
- **Request payload validation:**
  - Assertion на body в mock handler
  - Schema validation для request data
- **Mock factories:**
  - `createMockUser()`, `createMockPost()` — reusable data generators
  - Faker integration для realistic data
- **WebSocket mocking:**
  - `page.routeWebSocket()` — перехват WS connections
  - Custom WS server для тестов
- **SSE mocking:**
  - Streaming response с `Transfer-Encoding: chunked`
- **Middleware-like route handler chains:**
  - `route.continue()` — modify and pass through
  - Request/response transformation

##### `references/configuration.md`

**Что добавить:**
- **Environment-specific configs:**
  - `.env.local`, `.env.staging`, `.env.production`
  - `baseURL` per environment
  - Config merging pattern
- **Custom reporters:**
  - Allure — rich HTML reports
  - TestRail — test management integration
  - Custom reporter API — `onTestEnd`, `onStepEnd`
- **Sharding config:**
  - `fullyParallel: true` — test-level parallelism
  - Worker count tuning per CI environment
- **Docker-optimized config:**
  - Headless-only, no video in CI
  - `/dev/shm` для shared memory
  - `ipc: host` для Chrome
- **Secrets management:**
  - `.env` файлы — НЕ коммитить
  - CI secrets injection
  - Vault integration pattern
- **Monorepo config:**
  - Shared config base
  - Per-package test dirs
- **Timeout strategies by test type:**
  - Navigation tests — 30s
  - API tests — 10s
  - Visual tests — 20s (screenshot comparison)
  - Custom timeout per test: `test.setTimeout(60000)`

##### `references/debugging-flaky.md`

**Что добавить:**
- **Systematic flaky analysis:**
  - Metrics — failure rate per test over 30 days
  - Trends — increasing vs decreasing flakiness
  - Quarantine process — auto-skip flaky after N failures
- **Soft assertions:**
  - `expect.soft()` — продолжить тест после failure
  - Collect all failures в один отчёт
- **`toPass()` polling:**
  - `await expect(async () => { ... }).toPass()` — retry assertion block
  - `timeout` и `intervals` options
- **CI-specific debugging (local pass / CI fail):**
  - Timing differences — CI machines are slower
  - Resource contention — parallel tests fighting for CPU
  - Font rendering — different fonts on CI
  - Timezone / locale issues — `locale`, `timezoneId` in config
- **Trace Viewer deep analysis:**
  - Network tab — timing, payloads
  - Console tab — JavaScript errors
  - Action log — каждое действие с timing
  - Before/After screenshots — visual diff
- **`test.info().attachments`:**
  - Custom attachments — debug data, screenshots, HAR files
  - Programmatic attachment в reporter

---

### 2.5 postgres-expert (5.5/10 -> 8+/10)

**Базовый путь:** `postgres-expert/skills/postgres-expert/references/`

**Диагноз:** Middle+ уровень (лучший из 5 плагинов). ~40% учебникового контента. Отсутствуют: query planner deep dive, partitioning, transactions/MVCC, security (RLS). Есть фактические ошибки и опасные советы.

#### 2.5.1 Новые файлы (приоритет 1)

##### `references/query-planner.md`

**Содержание:**
- **Cost model:**
  - `seq_page_cost` (default 1.0) — стоимость sequential read одной страницы
  - `random_page_cost` (default 4.0, SSD: 1.1) — стоимость random read
  - `cpu_tuple_cost` (default 0.01) — стоимость обработки одной строки
  - `cpu_index_tuple_cost` (default 0.005) — стоимость обработки index entry
  - `cpu_operator_cost` (default 0.0025) — стоимость одного оператора
  - Как planner выбирает план на основе estimated total cost
- **Join algorithms:**
  - **Nested Loop** — O(N*M), хорош когда inner маленький, или есть индекс на inner
  - **Hash Join** — O(N+M), нужен `work_mem` для hash table, хорош для больших equi-joins
  - **Merge Join** — O(N log N + M log M), нужна сортировка, хорош для already-sorted data
  - Таблица: когда planner выбирает каждый, как заставить (без hints) через настройки
- **Parallel query:**
  - `min_parallel_table_scan_size` — минимальный размер для parallel scan
  - `parallel_tuple_cost`, `parallel_setup_cost` — cost adjustments
  - `max_parallel_workers_per_gather` — workers per query
  - Какие операции параллелизуются: Seq Scan, Index Scan, Hash Join, Aggregate
  - Какие НЕ параллелизуются: CTE scans, cursors, non-parallel-safe functions
- **JIT compilation:**
  - `jit_above_cost` (default 100000) — порог активации JIT
  - `jit_inline_above_cost`, `jit_optimize_above_cost`
  - Когда JIT помогает (long-running OLAP), когда вредит (short OLTP)
- **Generic vs Custom plans:**
  - Prepared statements — 5 первых выполнений = custom plan, потом generic
  - `plan_cache_mode` (PG 12+) — `force_custom_plan`, `force_generic_plan`
  - Проблема: generic plan плох для skewed data distribution
- **pg_hint_plan:**
  - Extension для force-указания strategy: `/*+ SeqScan(t) */`, `/*+ HashJoin(a b) */`
  - Когда использовать (emergency fix), почему это anti-pattern для долгосрочного решения
- **Partition pruning:**
  - Static pruning — на этапе планирования
  - Dynamic pruning (PG 11+) — на этапе выполнения (subquery, join filter)
  - `enable_partition_pruning` — default on

##### `references/partitioning.md`

**Содержание:**
- **Declarative partitioning (PG 10+):**
  - RANGE — `PARTITION BY RANGE (created_at)`, time-series наиболее частый use case
  - LIST — `PARTITION BY LIST (region)`, enum-like values
  - HASH — `PARTITION BY HASH (id)`, равномерное распределение
- **Multi-level partitioning:**
  - RANGE по дате → LIST по региону
  - Ограничения — max depth, naming conventions
- **pg_partman:**
  - Автоматическое создание и удаление партиций
  - `create_parent()` — initial setup
  - `run_maintenance()` — scheduled job
  - Retention policies
- **Partition-wise joins / aggregates (PG 11+):**
  - `enable_partitionwise_join` — join на уровне отдельных партиций
  - `enable_partitionwise_aggregate` — aggregation per partition then merge
  - Performance impact — не всегда лучше, зависит от данных
- **Attach / detach without downtime:**
  - `ALTER TABLE ... ATTACH PARTITION` — берёт ACCESS EXCLUSIVE lock
  - Workaround: `DETACH CONCURRENTLY` (PG 14+), `ATTACH` с constraint validated заранее
- **Default partition:**
  - `CREATE TABLE ... DEFAULT` — catch-all для неожиданных значений
  - Проблема: всё попадает в default если забыли создать нужную партицию
- **Index propagation:**
  - Индексы на parent автоматически создаются на новых партициях (PG 11+)
  - `CREATE INDEX ON ONLY parent` — не пропагирует, для partial rollout

##### `references/transactions.md`

**Содержание:**
- **Isolation levels:**
  - **READ COMMITTED** (default) — видит committed данные других транзакций, non-repeatable reads возможны
  - **REPEATABLE READ** — snapshot на начало транзакции, serialization failure при write conflict
  - **SERIALIZABLE (SSI)** — Serializable Snapshot Isolation, гарантирует сериализуемость, но может abort
  - Таблица: аномалии по уровням (dirty read, non-repeatable read, phantom, serialization anomaly)
- **MVCC internals:**
  - `xmin` / `xmax` — system columns, transaction IDs на строках
  - Visibility rules — когда строка видна транзакции
  - Snapshot — `pg_current_snapshot()`, active transactions
  - CLOG (commit log) — как PostgreSQL проверяет commit status
- **Advisory locks:**
  - `pg_advisory_lock(key)` — блокирующий, session-level
  - `pg_try_advisory_lock(key)` — non-blocking
  - `pg_advisory_xact_lock(key)` — transaction-level (автоматический release)
  - Use cases: prevent concurrent cron jobs, dedup processing, distributed mutex
- **Deadlock detection:**
  - `deadlock_timeout` (default 1s) — когда начинать проверку
  - `log_lock_waits` (default off) — логировать ожидания > deadlock_timeout
  - Как читать deadlock log — cycle detection
  - Prevention — consistent lock ordering
- **Lock levels compatibility matrix:**
  - 8 уровней от ACCESS SHARE до ACCESS EXCLUSIVE
  - Какие DDL берут какие locks
  - `ALTER TABLE ... ADD COLUMN` — ACCESS EXCLUSIVE (блокирует всё!)
  - `CREATE INDEX CONCURRENTLY` — SHARE UPDATE EXCLUSIVE (не блокирует reads/writes)
- **Long transaction impact на VACUUM:**
  - Open transaction → VACUUM не может удалить dead tuples
  - `idle_in_transaction_session_timeout` — auto-terminate idle transactions
  - Мониторинг: `pg_stat_activity WHERE state = 'idle in transaction'`
- **Two-phase commit:**
  - `PREPARE TRANSACTION`, `COMMIT PREPARED`
  - Distributed transaction use case
  - Orphaned prepared transactions — как обнаружить и cleanup

##### `references/security.md`

**Содержание:**
- **Row-Level Security (RLS):**
  - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
  - `CREATE POLICY` — `USING` (SELECT/UPDATE/DELETE) и `WITH CHECK` (INSERT/UPDATE)
  - Multi-tenant patterns — `current_setting('app.tenant_id')`
  - Superuser bypass — `FORCE ROW LEVEL SECURITY` для тестирования
  - Performance implications — policy evaluation per row
- **Column-level permissions:**
  - `GRANT SELECT (column1, column2) ON table TO role`
  - Когда column-level vs RLS vs views
- **pg_hba.conf advanced:**
  - `cert` — client certificate authentication
  - `ldap` — LDAP/Active Directory integration
  - `radius` — RADIUS authentication
  - Connection type: `local`, `host`, `hostssl`, `hostnossl`
  - Порядок правил — first match wins
- **SSL/TLS setup:**
  - Server certificate — `ssl_cert_file`, `ssl_key_file`
  - Client certificates — `sslmode=verify-full`
  - Certificate rotation без downtime — `pg_reload_conf()`
- **Role hierarchy:**
  - `SET ROLE` — privilege escalation/de-escalation
  - `SECURITY DEFINER` functions — execute as function owner
  - `SECURITY INVOKER` (default) — execute as caller
  - Login roles vs Group roles
- **pg_audit configuration:**
  - `pgaudit.log` — READ, WRITE, FUNCTION, DDL, ALL
  - Per-role auditing
  - Session vs Object audit logging
  - Performance impact — log volume
- **SCRAM-SHA-256 vs md5:**
  - `password_encryption = 'scram-sha-256'` (default PG 14+)
  - Migration от md5 — `ALTER USER ... PASSWORD '...'` перегенерирует
  - Совместимость клиентских библиотек

#### 2.5.2 Новые файлы (приоритет 2)

##### `references/advanced-sql.md`

**Содержание:**
- **Window functions:**
  - `ROW_NUMBER()`, `RANK()`, `DENSE_RANK()` — различия и use cases
  - `LAG()`, `LEAD()` — доступ к предыдущей/следующей строке
  - Frame specification — `ROWS BETWEEN`, `RANGE BETWEEN`, `GROUPS BETWEEN`
  - Running total, moving average, percentile
- **LATERAL joins:**
  - Top-N-per-group — `LATERAL (SELECT ... LIMIT N)`
  - Correlated subquery optimization
  - Когда LATERAL лучше window functions
- **Recursive CTEs:**
  - Graph traversal — parent-child hierarchy
  - Cycle detection — `CYCLE` clause (PG 14+)
  - Performance — `UNION ALL` vs `UNION`, depth limiting
- **GROUPING SETS / CUBE / ROLLUP:**
  - Multi-level aggregation в одном запросе
  - `GROUPING()` function — определение NULL из GROUP BY vs реальный NULL
- **MERGE (PG 15+):**
  - Upsert replacement — `WHEN MATCHED THEN UPDATE`, `WHEN NOT MATCHED THEN INSERT`
  - Comparison с `INSERT ... ON CONFLICT`
- **DISTINCT ON:**
  - PostgreSQL-specific — first row per group
  - `DISTINCT ON (user_id) ORDER BY user_id, created_at DESC` — latest per user
- **CTE optimization fence:**
  - Pre-PG 12: CTE = optimization barrier (всегда materialized)
  - PG 12+: CTE inlining, `MATERIALIZED` / `NOT MATERIALIZED` hints

##### `references/backup-recovery.md`

**Содержание:**
- **pgBackRest:**
  - Incremental backups — только изменённые файлы
  - Differential backups — изменения с последнего full
  - Parallel backup/restore
  - Encryption — AES-256-CBC
  - S3/Azure/GCS storage
- **barman:**
  - Streaming backup с `pg_basebackup`
  - WAL archiving
  - Catalog management
- **WAL-G:**
  - WAL archiving to cloud storage
  - Delta backups
  - PITR (Point-In-Time Recovery)
- **Continuous archiving:**
  - `archive_command` — WAL shipping
  - `archive_timeout` — force switch after N seconds
  - WAL retention policies
- **RPO/RTO:**
  - RPO (Recovery Point Objective) — максимально допустимая потеря данных
  - RTO (Recovery Time Objective) — максимально допустимое время восстановления
  - Как backup strategy влияет на RPO/RTO
- **`pg_verifybackup`** (PG 13+) — верификация backup integrity
- **Backup testing automation:**
  - Регулярный restore тест
  - Checksum verification
  - Automated pipeline

##### `references/schema-design.md`

**Содержание:**
- **Normalization vs denormalization:**
  - 3NF — когда строго следовать
  - Денормализация для read performance — materialized views, JSONB columns
  - Trade-off: write complexity vs read speed
- **Enum vs lookup table:**
  - `CREATE TYPE status AS ENUM(...)` — простота, но ALTER TYPE ADD VALUE не в транзакции
  - Lookup table — гибкость, FK constraint, но JOIN overhead
  - Когда что: < 10 стабильных значений → enum, иначе → table
- **Domain types:**
  - `CREATE DOMAIN email AS TEXT CHECK (VALUE ~ '^.+@.+$')` — reusable constraints
  - Vs CHECK constraint — domain = reusable, check = per-table
- **Identity vs Serial (PG 10+):**
  - `GENERATED ALWAYS AS IDENTITY` — SQL-standard, рекомендуется
  - `SERIAL` — legacy, создаёт sequence неявно
  - `GENERATED BY DEFAULT` — разрешает explicit значения
- **TOAST mechanism:**
  - Automatic compression и out-of-line storage для > 2KB
  - Strategies: `PLAIN`, `EXTENDED`, `EXTERNAL`, `MAIN`
  - Impact на JSONB — large JSONB values = TOAST overhead
- **Foreign key strategies:**
  - `ON DELETE CASCADE` vs `RESTRICT` vs `SET NULL` — когда что
  - Deferred constraints — `DEFERRABLE INITIALLY DEFERRED`
  - FK и performance — каждый INSERT/UPDATE/DELETE проверяет FK
- **Generated columns:**
  - `GENERATED ALWAYS AS (expression) STORED` — computed column
  - Use cases: full-text search vector, derived values
- **Composite types:**
  - `CREATE TYPE address AS (street TEXT, city TEXT, zip TEXT)`
  - Когда composite type vs отдельные columns vs JSONB

#### 2.5.3 Доработка существующих файлов

##### `references/performance.md`

**Что исправить:**

1. **Строки 34-39: "Node types (fastest to slowest)"** — **опасное упрощение**. Seq Scan на 100 строк быстрее Index Scan на 100 строк. Скорость зависит от размера таблицы, selectivity, correlation. Переписать как "Node types с пояснением когда каждый оптимален"

2. **Строка 173: `SET work_mem = '256MB'`** — **опасный совет** без контекста. `work_mem` выделяется PER OPERATION (не per query, не per connection). Запрос с 5 sort/hash операциями × 100 connections = 128GB RAM. Добавить предупреждение и формулу расчёта

**Что добавить:**
- **`CREATE INDEX CONCURRENTLY`** — критически важно для production! Не блокирует reads/writes. Отсутствует полностью
- **Index-only scan prerequisites:**
  - Visibility map — VACUUM должен быть выполнен
  - Все нужные columns в индексе
  - Высокий vacuum coverage = больше index-only scans
- **INCLUDE deep dive:**
  - `CREATE INDEX ... INCLUDE (col)` — non-key columns в индексе
  - Включённые columns не используются для search, только для output
  - Разница с составным индексом
- **Hash indexes:**
  - PG 10+ — WAL-logged, crash-safe
  - Только equality (`=`), не range queries
  - Когда лучше B-tree — single column equality с высокой cardinality
- **SP-GiST:**
  - Space-partitioned GiST — quadtrees, k-d trees
  - IP addresses (`inet_ops`), text prefix (`text_ops`)
- **Multicolumn index design:**
  - Equality-Range ordering rule — equality columns первые, range column последний
  - Index-only implications
- **HOT updates + fillfactor:**
  - Heap-Only Tuple — обновление без индекс-update, если новая версия на той же странице
  - `fillfactor = 90` — оставить 10% для HOT updates
  - Мониторинг: `n_tup_hot_upd` в `pg_stat_user_tables`
- **EXPLAIN (SETTINGS, FORMAT JSON):**
  - `SETTINGS` — показывает non-default settings, влияющие на план
  - `FORMAT JSON` — machine-readable output для автоматизации

##### `references/jsonb.md`

**Что добавить:**
- **`jsonb_to_recordset()`** — JSONB array → table rows
- **`jsonb_populate_record()`** — JSONB → composite type
- **Performance comparison:**
  - `@>` containment operator — использует GIN index, O(log N)
  - `->> = 'value'` expression — может использовать expression index, но не GIN
  - Конкретные цифры: 1M записей, GIN `@>` — ~2ms, `->>` без индекса — ~500ms
- **TOAST implications:**
  - JSONB > 2KB → TOAST compression + out-of-line storage
  - Partial update невозможен — полная перезапись JSONB value
  - Альтернатива для часто обновляемых полей: JSONB для read-heavy, отдельные columns для write-heavy
- **JSONB update = full rewrite semantics:**
  - `jsonb_set()` читает весь JSONB, модифицирует, записывает целиком
  - Для частых обновлений отдельных ключей — separate columns или EAV

##### `references/extensions.md`

**Что исправить:**
- Строки 73-92: **`uuid-ossp` устарел для PG 13+**. `gen_random_uuid()` доступен без расширения начиная с PostgreSQL 13. Добавить рекомендацию использовать `gen_random_uuid()` напрямую, `uuid-ossp` только для v1/v3/v5 UUID

**Что добавить:**
- **pgvector tuning:**
  - HNSW parameters — `m` (connections per element), `ef_construction` (build quality)
  - IVFFlat parameters — `lists` (number of clusters), `probes` (search clusters)
  - Index rebuild после массовой вставки — `REINDEX`
  - Approximate vs exact search trade-offs
- **PostGIS geography vs geometry:**
  - `geography` — расчёты на сфере, метры, медленнее
  - `geometry` — расчёты на плоскости, единицы SRID, быстрее
  - Когда что: глобальные расстояния → geography, карта города → geometry
- **pg_stat_statements — `track_utility` / `track_planning`:**
  - `track_utility = on` — отслеживание DDL и utility commands
  - `track_planning = on` (PG 13+) — planning time statistics
  - Overhead: ~5% CPU для track_planning
- **pg_cron:**
  - `cron.schedule()` — cron jobs внутри PostgreSQL
  - Use cases: partition maintenance, materialized view refresh, cleanup
- **pg_partman:**
  - Автоматическое управление партициями
  - `create_parent()`, `run_maintenance()`
- **pgstattuple:**
  - `pgstattuple('tablename')` — точная статистика dead tuples
  - `pgstatindex('indexname')` — индекс фрагментация
- **amcheck:**
  - `bt_index_check()` — проверка целостности B-tree индексов
  - `bt_index_parent_check()` — deep check с parent verification

##### `references/replication.md`

**Что добавить:**
- **pg_rewind:**
  - Rejoin бывшего primary к новому primary после failover
  - Альтернатива pg_basebackup — быстрее для больших баз
  - Requirements: `wal_log_hints` или checksums
- **Conflict resolution в logical replication:**
  - `ALTER SUBSCRIPTION ... SET (origin = 'none')` — prevent loops
  - Custom conflict handlers (PG 16+)
  - `log_min_messages = 'DEBUG1'` для отладки конфликтов
- **`max_slot_wal_keep_size`:**
  - Ограничение WAL retention для replication slots
  - Защита от disk full из-за отключённого replica
- **Split-brain prevention:**
  - Fencing — STONITH (Shoot The Other Node In The Head)
  - `primary_conninfo` timeout settings
  - Patroni / repmgr — automatic failover с fencing
- **Quorum-based sync:**
  - `synchronous_standby_names = 'ANY 2 (s1, s2, s3)'` — quorum commit
  - Trade-off: availability vs durability

##### `references/maintenance.md`

**Что добавить:**
- **VACUUM options (PG 12+):**
  - `INDEX_CLEANUP` — `AUTO` (default), `ON`, `OFF`
  - `TRUNCATE` — `ON` (default), `OFF` — возвращать ли пустые страницы OS
  - `PARALLEL` (PG 13+) — параллельный vacuum index cleanup
- **HOT updates deep dive + fillfactor:**
  - Как HOT updates работают — in-page update chain
  - `fillfactor` — оставить пространство для HOT: `ALTER TABLE SET (fillfactor = 80)`
  - Мониторинг: `n_tup_hot_upd / n_tup_upd` — ratio HOT updates
  - Когда HOT невозможен: indexed column changed
- **Freeze map vs Visibility map:**
  - Visibility map — 2 bits per page: all-visible, all-frozen
  - Freeze map — subset, страницы где все tuples frozen (не нужен vacuum для anti-wraparound)
  - `pg_visibility` extension — inspect visibility map
- **`pg_stat_progress_vacuum` phases interpretation:**
  - `initializing` → `scanning heap` → `vacuuming indexes` → `vacuuming heap` → `cleaning up indexes` → `truncating heap` → `performing final cleanup`
  - Как определить где vacuum "застрял"
- **Emergency vacuum near wraparound:**
  - Autovacuum to prevent wraparound — запускается при `autovacuum_freeze_max_age` (default 200M)
  - Forced anti-wraparound vacuum — при `vacuum_freeze_table_age` (default 150M)
  - Emergency: `datfrozenxid` > 1 billion от лимита — немедленный `VACUUM FREEZE`
  - `vacuum_failsafe_age` (PG 14+) — bypass cost delay при критическом возрасте
- **`log_autovacuum_min_duration`:**
  - `0` — логировать все autovacuum
  - `250ms` — логировать только длинные (рекомендация для production)
- **TOAST vacuum:**
  - TOAST таблицы вакуумятся вместе с основной
  - Но `VACUUM (PROCESS_TOAST OFF)` — skip TOAST для ускорения
  - TOAST bloat — отдельная проблема, `pg_repack` помогает

---

## 3. Общий чеклист учебникового контента для удаления

### 3.1 javascript-expert

| Файл | Контент для удаления/сокращения | Строки |
|------|--------------------------------|--------|
| `browser-apis.md` | Canvas "Draw rectangle", "Draw text", "Hello Canvas" | 327-357 |
| `browser-apis.md` | Quick Reference с "Modern browsers" | 386-399 |
| `browser-apis.md` | Базовый Fetch "Basic GET request" | 5-8 |
| `browser-apis.md` | localStorage/sessionStorage hello world (`setItem`/`getItem`) | 171-179 |
| `node-essentials.md` | Path module полностью — это `man path`, нулевая senior+ ценность | 60-98 |
| `node-essentials.md` | Quick Reference таблица | 460-472 |
| `modern-syntax.md` | Optional chaining — каждый junior знает `?.` | 6-19 |
| `modern-syntax.md` | Quick Reference таблица | 260-273 |
| `async-patterns.md` | Quick Reference таблица | 326-335 |
| `modules.md` | Quick Reference таблица ESM vs CommonJS | 345-358 |

### 3.2 nestjs-expert

| Файл | Контент для удаления/сокращения | Строки |
|------|--------------------------------|--------|
| `controllers-routing.md` | Quick Reference с @Get/@Post/@Put/@Delete | Вся таблица |
| `controllers-routing.md` | Базовый CRUD controller example | Сократить до минимума |
| `authentication.md` | Quick Reference таблица | 157-167 |
| `testing-patterns.md` | Quick Reference таблица | 177-187 |
| `services-di.md` | Базовые примеры DI (constructor injection) | Сократить |
| `dtos-validation.md` | Базовые `@IsString()`, `@IsEmail()` примеры | Сократить |

### 3.3 nextjs-developer

| Файл | Контент для удаления/сокращения | Строки |
|------|--------------------------------|--------|
| `server-actions.md` | Quick Reference таблица + Best Practices list | 441-462 |
| `server-actions.md` | "Basic Server Action" — слишком учебниковое | 1-22 |
| `data-fetching.md` | Quick Reference таблица + Best Practices list | 464-482 |
| `data-fetching.md` | "Basic GET request" пример | 5-25 |
| `app-router.md` | Базовые файловые конвенции (page.tsx, layout.tsx) | Сократить |

### 3.4 playwright-expert

| Файл | Контент для удаления/сокращения | Строки |
|------|--------------------------------|--------|
| `debugging-flaky.md` | Quick Reference таблицы | 135-151 |
| `debugging-flaky.md` | "Common Flaky Test Causes" — слишком поверхностно | 32-79 |
| `selectors-locators.md` | Базовые getByRole/getByText примеры | Сократить до ссылки на docs |
| `page-object-model.md` | Базовый POM example | Сократить, добавить advanced |
| `api-mocking.md` | Quick Reference если есть | Проверить |
| `configuration.md` | Базовый config example | Сократить |

### 3.5 postgres-expert

| Файл | Контент для удаления/сокращения | Строки |
|------|--------------------------------|--------|
| `extensions.md` | uuid-ossp секция — переписать с gen_random_uuid() | 73-92 |
| `extensions.md` | Extension Management basics (CREATE/DROP) | 1-22, сократить |
| `performance.md` | "Node types fastest to slowest" — упрощение | 34-39 |
| `maintenance.md` | VACUUM Variants — слишком базово | 15-29 |

---

## 4. Общие ошибки для исправления

### 4.1 Фактические ошибки

| # | Плагин | Файл | Строки | Ошибка | Исправление |
|---|--------|------|--------|--------|-------------|
| 1 | javascript-expert | `browser-apis.md` | 46-54 | "File upload with progress" через fetch — **fetch API НЕ поддерживает upload progress** | Заменить на `XMLHttpRequest` с `xhr.upload.onprogress` или отметить как limitation |
| 2 | javascript-expert | `browser-apis.md` | 362-365 | `performance.timing` — **deprecated** (Navigation Timing Level 1) | Заменить на `performance.getEntriesByType('navigation')[0]` |
| 3 | javascript-expert | `node-essentials.md` | 401 | `JSON.parse(body)` без try/catch — crash на невалидном JSON | Обернуть в try/catch с proper error response |
| 4 | javascript-expert | `modern-syntax.md` | 193-216 | Pattern Matching помечен "Stage 3" — **на самом деле Stage 1** | Исправить стадию, добавить предупреждение |
| 5 | javascript-expert | `modules.md` | 332 | `import ... assert { type: 'json' }` — **`assert` deprecated** | Заменить на `with { type: 'json' }` (Import Attributes) |
| 6 | nestjs-expert | `authentication.md` | 112 | Refresh token signed с **тем же секретом** что access token | Использовать отдельный `JWT_REFRESH_SECRET` |
| 7 | nextjs-developer | `server-actions.md` | 85 | `useFormState` — **deprecated** в React 19 | Заменить на `useActionState` |
| 8 | nextjs-developer | `server-actions.md` | 150 | `experimental_useOptimistic` — **stable в React 19** | Заменить на `useOptimistic` (без experimental_ prefix) |
| 9 | postgres-expert | `performance.md` | 34-39 | "Node types fastest to slowest" — **опасное упрощение**, Seq Scan может быть быстрее Index Scan | Переписать с контекстом: зависит от selectivity и размера таблицы |
| 10 | postgres-expert | `performance.md` | 173 | `SET work_mem = '256MB'` — **опасный совет** (per-operation, не per-query) | Добавить формулу: `total_mem = work_mem × operations × connections` |
| 11 | postgres-expert | `extensions.md` | 73-92 | `uuid-ossp` рекомендуется для UUID — **устарел для PG 13+** | `gen_random_uuid()` доступен без расширения |

### 4.2 Устаревшие API (не ошибки, но вводят в заблуждение)

| # | Плагин | Файл | Проблема | Актуальная альтернатива |
|---|--------|------|----------|------------------------|
| 1 | javascript-expert | `browser-apis.md` | `performance.timing` | `PerformanceNavigationTiming` |
| 2 | javascript-expert | `modules.md` | `assert` keyword для imports | `with` keyword (Import Attributes) |
| 3 | nextjs-developer | `server-actions.md` | `useFormState` | `useActionState` (React 19) |
| 4 | nextjs-developer | `server-actions.md` | `experimental_useOptimistic` | `useOptimistic` (React 19, stable) |
| 5 | postgres-expert | `extensions.md` | `uuid-ossp` для UUID | `gen_random_uuid()` (PG 13+, built-in) |

### 4.3 Опасные советы (не ошибки, но могут навредить)

| # | Плагин | Файл | Строки | Совет | Почему опасно |
|---|--------|------|--------|-------|---------------|
| 1 | postgres-expert | `performance.md` | 173 | `SET work_mem = '256MB'` | Per-operation, не per-connection. 100 connections × 5 operations = 128GB |
| 2 | postgres-expert | `performance.md` | 34-39 | "Seq Scan on large table - Problem" | Seq Scan на 100 строк нормален; Index Scan overhead не оправдан |
| 3 | javascript-expert | `node-essentials.md` | 286-324 | WorkerPool без error handling | Worker crash = зависший Promise, memory leak |
| 4 | nestjs-expert | `authentication.md` | 112 | Один секрет для access и refresh | Refresh token работает как access token |

---

## 5. Фазы работы

### Фаза 1: Исправление фактических ошибок (1-2 дня)

**Приоритет: ВЫСШИЙ. Наименьший объём работы, наибольший impact на корректность.**

| Задача | Файл | Оценка |
|--------|------|--------|
| 1.1 Исправить fetch upload progress | `javascript-expert/.../browser-apis.md` | 15 мин |
| 1.2 Заменить performance.timing | `javascript-expert/.../browser-apis.md` | 15 мин |
| 1.3 Добавить try/catch на JSON.parse | `javascript-expert/.../node-essentials.md` | 10 мин |
| 1.4 Исправить Pattern Matching stage | `javascript-expert/.../modern-syntax.md` | 10 мин |
| 1.5 Заменить assert на with | `javascript-expert/.../modules.md` | 10 мин |
| 1.6 Исправить refresh token secret | `nestjs-expert/.../authentication.md` | 30 мин |
| 1.7 Заменить useFormState на useActionState | `nextjs-developer/.../server-actions.md` | 20 мин |
| 1.8 Убрать experimental_ prefix у useOptimistic | `nextjs-developer/.../server-actions.md` | 15 мин |
| 1.9 Исправить "Node types fastest to slowest" | `postgres-expert/.../performance.md` | 30 мин |
| 1.10 Добавить предупреждение к work_mem | `postgres-expert/.../performance.md` | 15 мин |
| 1.11 Обновить uuid-ossp рекомендацию | `postgres-expert/.../extensions.md` | 20 мин |

**Итого Фаза 1: ~3.5 часа**

### Фаза 2: Создание файлов приоритета 1 (1-2 недели)

**Приоритет: ВЫСОКИЙ. Наибольший impact на рейтинг — заполнение критических пробелов.**

| Задача | Плагин | Файл | Оценка |
|--------|--------|------|--------|
| 2.1 Performance (V8, profiling, Web Vitals) | javascript-expert | `references/performance.md` | 1 день |
| 2.2 Security (prototype pollution, CSP, crypto) | javascript-expert | `references/security.md` | 1 день |
| 2.3 Architecture patterns (CQRS, DDD, Hex) | nestjs-expert | `references/architecture-patterns.md` | 1 день |
| 2.4 Database advanced (transactions, migrations) | nestjs-expert | `references/database-advanced.md` | 1 день |
| 2.5 Security hardening (throttler, CORS, tokens) | nestjs-expert | `references/security-hardening.md` | 0.5 дня |
| 2.6 Middleware (auth, geo, A/B, rate limiting) | nextjs-developer | `references/middleware.md` | 0.5 дня |
| 2.7 Caching architecture (4 levels) | nextjs-developer | `references/caching-architecture.md` | 1 день |
| 2.8 Testing (Server Components, Actions, MSW) | nextjs-developer | `references/testing.md` | 0.5 дня |
| 2.9 Visual testing (screenshots, baselines) | playwright-expert | `references/visual-testing.md` | 0.5 дня |
| 2.10 Advanced patterns (multi-browser, API testing) | playwright-expert | `references/advanced-patterns.md` | 1 день |
| 2.11 CI/CD advanced (sharding, Docker, flaky) | playwright-expert | `references/ci-cd-advanced.md` | 0.5 дня |
| 2.12 Query planner (cost model, joins, JIT) | postgres-expert | `references/query-planner.md` | 1 день |
| 2.13 Partitioning (declarative, pg_partman) | postgres-expert | `references/partitioning.md` | 0.5 дня |
| 2.14 Transactions (isolation, MVCC, locks) | postgres-expert | `references/transactions.md` | 1 день |
| 2.15 Security (RLS, pg_hba, SSL, audit) | postgres-expert | `references/security.md` | 0.5 дня |

**Итого Фаза 2: ~10 рабочих дней**

### Фаза 3: Переработка существующих файлов (1-2 недели)

**Приоритет: СРЕДНИЙ. Удаление учебникового контента, добавление глубины.**

| Задача | Плагин | Файл | Действия | Оценка |
|--------|--------|------|----------|--------|
| 3.1 | javascript-expert | `browser-apis.md` | Полная переработка | 1 день |
| 3.2 | javascript-expert | `async-patterns.md` | Добавить 6 тем | 0.5 дня |
| 3.3 | javascript-expert | `modern-syntax.md` | Добавить 6 тем, маркировки | 0.5 дня |
| 3.4 | javascript-expert | `modules.md` | Исправления + 4 темы | 0.5 дня |
| 3.5 | javascript-expert | `node-essentials.md` | Добавить 7 тем, исправления | 0.5 дня |
| 3.6 | nestjs-expert | `authentication.md` | Добавить 5 тем, исправления | 0.5 дня |
| 3.7 | nestjs-expert | `controllers-routing.md` | Убрать учебниковое, добавить 6 тем | 0.5 дня |
| 3.8 | nestjs-expert | `services-di.md` | Добавить 6 тем | 0.5 дня |
| 3.9 | nestjs-expert | `dtos-validation.md` | Добавить 5 тем | 0.5 дня |
| 3.10 | nestjs-expert | `testing-patterns.md` | Полная переработка | 1 день |
| 3.11 | nestjs-expert | `migration-from-express.md` | Добавить 5 тем | 0.5 дня |
| 3.12 | nextjs-developer | `app-router.md` | Добавить 6 тем | 0.5 дня |
| 3.13 | nextjs-developer | `server-components.md` | Добавить 6 тем | 0.5 дня |
| 3.14 | nextjs-developer | `server-actions.md` | Обновить API, добавить security | 0.5 дня |
| 3.15 | nextjs-developer | `data-fetching.md` | Добавить 5 тем | 0.5 дня |
| 3.16 | nextjs-developer | `deployment.md` | Добавить 5 тем | 0.5 дня |
| 3.17 | playwright-expert | `selectors-locators.md` | Добавить 4 темы | 0.5 дня |
| 3.18 | playwright-expert | `page-object-model.md` | Добавить 8 тем | 0.5 дня |
| 3.19 | playwright-expert | `api-mocking.md` | Добавить 6 тем | 0.5 дня |
| 3.20 | playwright-expert | `configuration.md` | Добавить 7 тем | 0.5 дня |
| 3.21 | playwright-expert | `debugging-flaky.md` | Добавить 6 тем | 0.5 дня |
| 3.22 | postgres-expert | `performance.md` | Исправления + 7 тем | 1 день |
| 3.23 | postgres-expert | `jsonb.md` | Добавить 5 тем | 0.5 дня |
| 3.24 | postgres-expert | `extensions.md` | Исправления + 7 тем | 0.5 дня |
| 3.25 | postgres-expert | `replication.md` | Добавить 5 тем | 0.5 дня |
| 3.26 | postgres-expert | `maintenance.md` | Добавить 7 тем | 0.5 дня |

**Итого Фаза 3: ~12 рабочих дней**

### Фаза 4: Создание файлов приоритета 2 (1 неделя)

**Приоритет: НИЗКИЙ. Добавление полноты, но не критических знаний.**

| Задача | Плагин | Файл | Оценка |
|--------|--------|------|--------|
| 4.1 | javascript-expert | `references/testing.md` | 0.5 дня |
| 4.2 | nestjs-expert | `references/microservices.md` | 1 день |
| 4.3 | nestjs-expert | `references/performance-caching.md` | 0.5 дня |
| 4.4 | nestjs-expert | `references/observability.md` | 0.5 дня |
| 4.5 | nextjs-developer | `references/auth-patterns.md` | 0.5 дня |
| 4.6 | nextjs-developer | `references/performance-optimization.md` | 0.5 дня |
| 4.7 | playwright-expert | `references/accessibility.md` | 0.5 дня |
| 4.8 | playwright-expert | `references/auth-testing.md` | 0.5 дня |
| 4.9 | postgres-expert | `references/advanced-sql.md` | 0.5 дня |
| 4.10 | postgres-expert | `references/backup-recovery.md` | 0.5 дня |
| 4.11 | postgres-expert | `references/schema-design.md` | 0.5 дня |

**Итого Фаза 4: ~6 рабочих дней**

### Фаза 5: Финальная ревизия и проверка консистентности (2-3 дня)

| Задача | Описание | Оценка |
|--------|----------|--------|
| 5.1 | Проверка всех файлов на наличие обязательных секций (см. 1.2) | 0.5 дня |
| 5.2 | Проверка отсутствия учебникового контента (Quick Reference таблицы, hello world) | 0.5 дня |
| 5.3 | Проверка версионной маркировки (Stage 3, PG 13+, Node 18+, etc.) | 0.5 дня |
| 5.4 | Cross-reference между файлами (ссылки, отсутствие дублирования) | 0.5 дня |
| 5.5 | Повторный аудит по оригинальным критериям (целевая оценка 8+/10) | 0.5 дня |

**Итого Фаза 5: ~2.5 рабочих дня**

### Суммарная оценка

| Фаза | Время | Кумулятивно |
|-------|-------|-------------|
| Фаза 1: Ошибки | 0.5 дня | 0.5 дня |
| Фаза 2: Приоритет 1 файлы | 10 дней | 10.5 дней |
| Фаза 3: Переработка | 12 дней | 22.5 дней |
| Фаза 4: Приоритет 2 файлы | 6 дней | 28.5 дней |
| Фаза 5: Ревизия | 2.5 дня | 31 день |
| **Итого** | **~31 рабочий день** | **~6.5 недель** |

---

## 6. Метрики успеха

### 6.1 Общие критерии senior+ файла

Каждый reference-файл считается senior+ если:

- [ ] **0% "Hello World"** — нет примеров уровня первой главы документации
- [ ] **Секция "Когда НЕ использовать"** — присутствует для каждого основного паттерна
- [ ] **Trade-offs** — минимум 3 явных trade-off обсуждения
- [ ] **Конкретные числа** — производительность, лимиты, пороги (не "fast"/"slow", а ms/MB/QPS)
- [ ] **Failure modes** — минимум 2 описания "что ломается и почему"
- [ ] **Версионная маркировка** — все API помечены версиями (ES2022, PG 14+, Node 18+)
- [ ] **Production-ориентированность** — 80%+ примеров решают реальные production-задачи
- [ ] **Отсутствие Quick Reference таблиц** с очевидным содержимым

### 6.2 Per-plugin метрики

#### javascript-expert (цель: 8+/10)

| Файл | Критерий 8+/10 |
|------|----------------|
| `performance.md` | V8 deopt examples с `--trace-deopt` output, memory leak workflow из 5+ шагов, Web Vitals с конкретными порогами |
| `security.md` | Prototype pollution exploit + fix, ReDoS regex example, CSP с nonce, timing-safe comparison |
| `async-patterns.md` | AsyncLocalStorage production example, backpressure diagram, retry с jitter формула |
| `browser-apis.md` | WebSocket с reconnect, SSE vs WS trade-off table, structuredClone limitations list |
| `modern-syntax.md` | Proxy с validation + logging, using keyword с DB connection, все proposals с correct stage |
| `modules.md` | Dual package hazard reproduction, `with` syntax, monorepo resolution diagram |
| `node-essentials.md` | stream.compose example, WorkerPool с error recovery + drain, diagnostics_channel |
| `testing.md` | fast-check property test, node:test full example, module mocking strategy |

#### nestjs-expert (цель: 8+/10)

| Файл | Критерий 8+/10 |
|------|----------------|
| `architecture-patterns.md` | CQRS full command/query/event cycle, DDD aggregate с invariants, "когда CQRS — overhead" |
| `database-advanced.md` | QueryRunner transaction с rollback, N+1 detection + fix, multi-tenancy schema pattern |
| `security-hardening.md` | Refresh token rotation flow diagram, CASL policy example, throttler с Redis |
| `authentication.md` | Отдельные секреты для tokens, OAuth2 PKCE flow, API key pattern |
| `testing-patterns.md` | Testcontainers example, Guard unit test, custom testing utilities |
| `microservices.md` | Transport comparison table с числами, Saga pattern full example |
| `observability.md` | Pino + correlation ID, OpenTelemetry auto-instrumentation, health check |

#### nextjs-developer (цель: 8+/10)

| Файл | Критерий 8+/10 |
|------|----------------|
| `middleware.md` | Auth + rate limiting chain, geo-routing, edge limitations list |
| `caching-architecture.md` | 4 levels diagram, unstable_cache for Prisma, Router Cache 30-sec workaround |
| `testing.md` | Server Component test, Server Action test with FormData, MSW setup |
| `server-components.md` | Serialization boundary types list, PPR explanation, nested Suspense strategy |
| `server-actions.md` | useActionState (not useFormState), security section, .bind() pattern |
| `data-fetching.md` | 4 cache levels reference, real-time patterns, deduplication scope limits |

#### playwright-expert (цель: 8+/10)

| Файл | Критерий 8+/10 |
|------|----------------|
| `visual-testing.md` | toHaveScreenshot с mask, CI baseline workflow, cross-platform solution |
| `advanced-patterns.md` | Multi-context chat test, component testing setup, API testing example |
| `ci-cd-advanced.md` | Sharding formula, Docker config, flaky quarantine pipeline |
| `debugging-flaky.md` | Systematic metrics, expect.soft(), toPass() polling, CI-specific debug |
| `page-object-model.md` | Builder pattern, State Machine, when NOT to use POM |
| `api-mocking.md` | GraphQL by operation, WebSocket mock, mock factory pattern |
| `auth-testing.md` | API-based auth vs UI timing comparison, multi-role storageState |

#### postgres-expert (цель: 8+/10)

| Файл | Критерий 8+/10 |
|------|----------------|
| `query-planner.md` | Cost model с конкретными числами, join algorithm selection criteria, JIT trade-offs |
| `partitioning.md` | pg_partman setup, attach/detach без downtime, partition pruning verification |
| `transactions.md` | Isolation level anomaly table, MVCC xmin/xmax explanation, advisory lock pattern |
| `security.md` | RLS multi-tenant policy, pg_hba.conf с cert auth, role hierarchy |
| `performance.md` | CREATE INDEX CONCURRENTLY, HOT updates + fillfactor, corrected node types |
| `jsonb.md` | Performance comparison с цифрами (@> vs ->>), TOAST implications |
| `extensions.md` | gen_random_uuid() recommendation, pgvector tuning params, pg_stat_statements advanced |
| `maintenance.md` | VACUUM phases interpretation, emergency wraparound procedure, HOT ratio monitoring |

### 6.3 Итоговая целевая оценка

| Плагин | Текущая | После Фазы 1 | После Фазы 2 | После Фазы 3 | После Фазы 4+5 |
|--------|---------|--------------|--------------|--------------|----------------|
| javascript-expert | 5/10 | 5.5/10 | 7/10 | 8/10 | 8.5/10 |
| nestjs-expert | 4/10 | 4.5/10 | 6.5/10 | 8/10 | 8.5/10 |
| nextjs-developer | 4/10 | 4.5/10 | 6.5/10 | 8/10 | 8.5/10 |
| playwright-expert | 4/10 | 4/10 | 6/10 | 7.5/10 | 8/10 |
| postgres-expert | 5.5/10 | 6/10 | 7.5/10 | 8.5/10 | 9/10 |

---

## Приложение: Полный список файлов

### Новые файлы (всего: 26)

**Приоритет 1 (15 файлов):**
1. `javascript-expert/.../references/performance.md`
2. `javascript-expert/.../references/security.md`
3. `nestjs-expert/.../references/architecture-patterns.md`
4. `nestjs-expert/.../references/database-advanced.md`
5. `nestjs-expert/.../references/security-hardening.md`
6. `nextjs-developer/.../references/middleware.md`
7. `nextjs-developer/.../references/caching-architecture.md`
8. `nextjs-developer/.../references/testing.md`
9. `playwright-expert/.../references/visual-testing.md`
10. `playwright-expert/.../references/advanced-patterns.md`
11. `playwright-expert/.../references/ci-cd-advanced.md`
12. `postgres-expert/.../references/query-planner.md`
13. `postgres-expert/.../references/partitioning.md`
14. `postgres-expert/.../references/transactions.md`
15. `postgres-expert/.../references/security.md`

**Приоритет 2 (11 файлов):**
16. `javascript-expert/.../references/testing.md`
17. `nestjs-expert/.../references/microservices.md`
18. `nestjs-expert/.../references/performance-caching.md`
19. `nestjs-expert/.../references/observability.md`
20. `nextjs-developer/.../references/auth-patterns.md`
21. `nextjs-developer/.../references/performance-optimization.md`
22. `playwright-expert/.../references/accessibility.md`
23. `playwright-expert/.../references/auth-testing.md`
24. `postgres-expert/.../references/advanced-sql.md`
25. `postgres-expert/.../references/backup-recovery.md`
26. `postgres-expert/.../references/schema-design.md`

### Существующие файлы для переработки (всего: 26)

1. `javascript-expert/.../references/async-patterns.md`
2. `javascript-expert/.../references/browser-apis.md` (полная переработка)
3. `javascript-expert/.../references/modern-syntax.md`
4. `javascript-expert/.../references/modules.md`
5. `javascript-expert/.../references/node-essentials.md`
6. `nestjs-expert/.../references/authentication.md`
7. `nestjs-expert/.../references/controllers-routing.md`
8. `nestjs-expert/.../references/services-di.md`
9. `nestjs-expert/.../references/dtos-validation.md`
10. `nestjs-expert/.../references/testing-patterns.md` (полная переработка)
11. `nestjs-expert/.../references/migration-from-express.md`
12. `nextjs-developer/.../references/app-router.md`
13. `nextjs-developer/.../references/server-components.md`
14. `nextjs-developer/.../references/server-actions.md`
15. `nextjs-developer/.../references/data-fetching.md`
16. `nextjs-developer/.../references/deployment.md`
17. `playwright-expert/.../references/selectors-locators.md`
18. `playwright-expert/.../references/page-object-model.md`
19. `playwright-expert/.../references/api-mocking.md`
20. `playwright-expert/.../references/configuration.md`
21. `playwright-expert/.../references/debugging-flaky.md`
22. `postgres-expert/.../references/performance.md`
23. `postgres-expert/.../references/jsonb.md`
24. `postgres-expert/.../references/extensions.md`
25. `postgres-expert/.../references/replication.md`
26. `postgres-expert/.../references/maintenance.md`
