# Architecture Patterns — When and Why

> NestJS 10+ | @nestjs/cqrs 10+ | @nestjs/core 10+

## CQRS with @nestjs/cqrs

Separate read models from write models. Commands mutate state, queries read state, events propagate side effects.

```typescript
// commands/create-order.command.ts
export class CreateOrderCommand {
  constructor(
    public readonly userId: string,
    public readonly items: OrderItemDto[],
    public readonly idempotencyKey: string,
  ) {}
}

// commands/create-order.handler.ts
@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(
    private readonly ordersRepo: OrdersRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateOrderCommand): Promise<string> {
    // Idempotency check — prevent duplicate orders from retries
    const existing = await this.ordersRepo.findByIdempotencyKey(command.idempotencyKey);
    if (existing) return existing.id;

    const order = Order.create(command.userId, command.items);
    await this.ordersRepo.save(order);

    // Publish domain event — handlers run asynchronously
    this.eventBus.publish(new OrderCreatedEvent(order.id, order.userId, order.total));

    return order.id;
  }
}

// events/order-created.handler.ts
@EventsHandler(OrderCreatedEvent)
export class OrderCreatedHandler implements IEventHandler<OrderCreatedEvent> {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly analytics: AnalyticsService,
  ) {}

  async handle(event: OrderCreatedEvent): Promise<void> {
    // Side effects — failures here do NOT roll back the order
    await Promise.allSettled([
      this.notifications.sendOrderConfirmation(event.userId, event.orderId),
      this.analytics.trackOrder(event.orderId, event.total),
    ]);
  }
}

// queries/get-order.handler.ts — can read from a different data source (read replica, cache)
@QueryHandler(GetOrderQuery)
export class GetOrderHandler implements IQueryHandler<GetOrderQuery> {
  constructor(
    @InjectRepository(OrderReadModel)
    private readonly readRepo: Repository<OrderReadModel>,
  ) {}

  async execute(query: GetOrderQuery): Promise<OrderReadModel> {
    return this.readRepo.findOneOrFail({ where: { id: query.orderId } });
  }
}
```

### Sagas — Long-Running Workflows

```typescript
@Injectable()
export class OrderSaga {
  @Saga()
  orderCreated = (events$: Observable<any>): Observable<ICommand> =>
    events$.pipe(
      ofType(OrderCreatedEvent),
      delay(5000), // Wait 5s for payment processing
      map((event) => new CheckPaymentCommand(event.orderId)),
    );

  @Saga()
  paymentFailed = (events$: Observable<any>): Observable<ICommand> =>
    events$.pipe(
      ofType(PaymentFailedEvent),
      map((event) => new CancelOrderCommand(event.orderId, 'Payment failed')),
    );
}
```

### When CQRS Is Overkill

- **CRUD-dominant apps**: If 90% of operations are simple reads/writes, CQRS adds indirection without value
- **Small teams (<3 devs)**: The cognitive overhead of separate command/query/event handlers slows development
- **Consistent read requirements**: If you need read-your-own-writes consistency, separate read models add complexity (eventual consistency lag)
- **<100 concurrent users**: The performance benefits of read replicas and separate read models are negligible

**Trade-off**: CQRS increases the number of files by ~3x per feature (command, handler, event, event handler, query, query handler). Worth it when read/write patterns diverge significantly (e.g., 100:1 read:write ratio, or complex write validation with simple reads).

**Failure mode**: Events in `@nestjs/cqrs` are in-process by default (not persisted). If the app crashes between command execution and event handling, the event is lost. For critical events, persist to an outbox table and use a separate worker to process them.

---

## DDD — Bounded Contexts as NestJS Modules

### Aggregate Root Pattern

```typescript
// domain/order.aggregate.ts
export class Order {
  private _items: OrderItem[] = [];
  private _status: OrderStatus = OrderStatus.DRAFT;

  // Factory method — enforces invariants at creation
  static create(userId: string, items: OrderItemDto[]): Order {
    if (items.length === 0) {
      throw new DomainException('Order must have at least one item');
    }
    const order = new Order();
    order.id = randomUUID();
    order.userId = userId;
    order._items = items.map((i) => OrderItem.create(i.productId, i.quantity, i.price));
    order._status = OrderStatus.PENDING;
    order.createdAt = new Date();
    return order;
  }

  // Domain methods — all state transitions go through the aggregate
  confirm(paymentId: string): void {
    if (this._status !== OrderStatus.PENDING) {
      throw new DomainException(`Cannot confirm order in ${this._status} status`);
    }
    this._status = OrderStatus.CONFIRMED;
    this.paymentId = paymentId;
    // Domain event — collected by repository on save
    this.addEvent(new OrderConfirmedEvent(this.id));
  }

  cancel(reason: string): void {
    if ([OrderStatus.SHIPPED, OrderStatus.DELIVERED].includes(this._status)) {
      throw new DomainException('Cannot cancel shipped/delivered orders');
    }
    this._status = OrderStatus.CANCELLED;
    this.cancellationReason = reason;
    this.addEvent(new OrderCancelledEvent(this.id, reason));
  }

  get total(): number {
    return this._items.reduce((sum, item) => sum + item.subtotal, 0);
  }
}
```

### Value Objects

```typescript
// domain/value-objects/money.ts
export class Money {
  private constructor(
    public readonly amount: number,
    public readonly currency: string,
  ) {
    if (amount < 0) throw new DomainException('Money cannot be negative');
    if (!/^[A-Z]{3}$/.test(currency)) throw new DomainException('Invalid currency code');
  }

  static of(amount: number, currency: string): Money {
    return new Money(Math.round(amount * 100) / 100, currency);
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new DomainException('Cannot add different currencies');
    }
    return Money.of(this.amount + other.amount, this.currency);
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }
}
```

### Bounded Context as Module

```
src/
├── orders/              # Orders Bounded Context
│   ├── domain/          # Aggregates, Value Objects, Domain Events, Repository interfaces
│   ├── application/     # Use cases (Commands, Queries, Handlers)
│   ├── infrastructure/  # TypeORM repos, external API clients
│   └── orders.module.ts
├── inventory/           # Inventory Bounded Context
│   ├── domain/
│   ├── application/
│   ├── infrastructure/
│   └── inventory.module.ts
└── shared/              # Shared kernel — common value objects, event interfaces
    └── shared.module.ts
```

**When NOT to use DDD**:
- Apps with <5 entities and simple business rules
- CRUD apps where the domain logic is just "save to DB and return"
- Teams unfamiliar with DDD concepts (the learning curve is 2-3 months)

---

## Hexagonal Architecture — Ports & Adapters

Domain logic depends on abstractions (ports), infrastructure implements them (adapters).

```typescript
// ports/order-repository.port.ts (interface — no NestJS decorators)
export interface OrderRepositoryPort {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
  findByUser(userId: string, pagination: PaginationParams): Promise<Order[]>;
}

// Infrastructure adapter — TypeORM implementation
@Injectable()
export class TypeOrmOrderRepository implements OrderRepositoryPort {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly repo: Repository<OrderEntity>,
  ) {}

  async save(order: Order): Promise<void> {
    const entity = OrderMapper.toEntity(order);
    await this.repo.save(entity);
  }

  async findById(id: string): Promise<Order | null> {
    const entity = await this.repo.findOne({ where: { id }, relations: ['items'] });
    return entity ? OrderMapper.toDomain(entity) : null;
  }
}

// Module wiring — bind port to adapter
@Module({
  providers: [
    {
      provide: 'OrderRepositoryPort',
      useClass: TypeOrmOrderRepository,
    },
    OrdersService,
  ],
})
export class OrdersModule {}

// Service depends on port, not implementation
@Injectable()
export class OrdersService {
  constructor(
    @Inject('OrderRepositoryPort')
    private readonly ordersRepo: OrderRepositoryPort,
  ) {}
}
```

**Trade-off**:
- Pro: Can swap TypeORM for Prisma, Drizzle, or an in-memory adapter without touching domain logic
- Pro: Domain layer is pure TypeScript — no framework dependency, easy to test
- Con: Mapper boilerplate between domain and ORM entities adds ~50 lines per entity
- Con: Indirection makes debugging harder — stack traces go through interfaces

**When NOT to use Hexagonal**: When you have no realistic chance of swapping infrastructure. If you will always use PostgreSQL + TypeORM, the adapter layer is pure overhead.

---

## Dynamic Modules — forRoot/forRootAsync/forFeature

### Pattern: Global Config with Per-Feature Customization

```typescript
// cache.module.ts
@Module({})
export class CacheModule {
  // forRoot — global configuration (call once in AppModule)
  static forRoot(options: CacheModuleOptions): DynamicModule {
    return {
      module: CacheModule,
      global: true,
      providers: [
        { provide: 'CACHE_OPTIONS', useValue: options },
        CacheService,
      ],
      exports: [CacheService],
    };
  }

  // forRootAsync — when config depends on other providers
  static forRootAsync(options: CacheModuleAsyncOptions): DynamicModule {
    return {
      module: CacheModule,
      global: true,
      imports: options.imports || [],
      providers: [
        {
          provide: 'CACHE_OPTIONS',
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        CacheService,
      ],
      exports: [CacheService],
    };
  }

  // forFeature — per-module cache namespace
  static forFeature(namespace: string): DynamicModule {
    return {
      module: CacheModule,
      providers: [
        {
          provide: 'CACHE_NAMESPACE',
          useValue: namespace,
        },
        // Each feature gets its own prefixed cache instance
        {
          provide: NamespacedCacheService,
          useFactory: (cacheService: CacheService, ns: string) =>
            new NamespacedCacheService(cacheService, ns),
          inject: [CacheService, 'CACHE_NAMESPACE'],
        },
      ],
      exports: [NamespacedCacheService],
    };
  }
}
```

---

## Lifecycle Hooks — Execution Order

```
1. onModuleInit()           — Per module, bottom-up (leaf modules first)
2. onApplicationBootstrap() — Per module, bottom-up
--- app.listen() ---
3. onModuleDestroy()        — Per module, top-down (root module first)
4. beforeApplicationShutdown(signal) — Per module, top-down
5. onApplicationShutdown(signal)     — Per module, top-down
```

**Critical detail**: `onModuleInit` runs bottom-up. If `OrdersModule` imports `UsersModule`, `UsersModule.onModuleInit` runs first. Use this to ensure dependencies are ready before consumers initialize.

**Failure mode**: Async `onModuleInit` that takes >30s blocks the app from starting. Kubernetes kills the pod if it exceeds the liveness probe timeout. Move heavy initialization to a background task or use a readiness probe.

**Failure mode**: `enableShutdownHooks()` must be called explicitly. Without it, hooks 3-5 never fire, causing connection leaks on graceful shutdown.
