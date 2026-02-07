# Services & Dependency Injection — Advanced Patterns

> NestJS 10+ | @nestjs/core 10+

## forwardRef() — Circular Dependency Resolution

Two modules importing each other causes `Cannot resolve dependency` at startup.

```typescript
// orders.module.ts
@Module({
  imports: [forwardRef(() => UsersModule)],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

// users.module.ts
@Module({
  imports: [forwardRef(() => OrdersModule)],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

// In the service — also needs forwardRef for injection
@Injectable()
export class OrdersService {
  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}
}
```

### When forwardRef Is an Architecture Smell

If you need `forwardRef` more than twice in your app, your module boundaries are wrong.

**Fix pattern**: Extract the shared dependency into a third module.

```
BEFORE (circular):  OrdersModule <-> UsersModule
AFTER (extracted):  OrdersModule -> SharedModule <- UsersModule
```

Alternatively, use an event-based approach: `OrdersModule` emits `OrderCreated` event, `UsersModule` listens — no direct import needed.

**Failure mode**: `forwardRef` with request-scoped providers creates a dependency resolution deadlock. NestJS will throw `Scope TRANSIENT/REQUEST cannot be combined with forwardRef` in some topologies. Restructure to eliminate the circular dependency.

---

## Dynamic Module Pattern — ConfigurableModuleBuilder (NestJS 10+)

For reusable library modules that accept configuration. Replaces manual `forRoot/forRootAsync` boilerplate.

```typescript
// notifications.module-definition.ts
import { ConfigurableModuleBuilder } from '@nestjs/common';

export interface NotificationsModuleOptions {
  provider: 'ses' | 'sendgrid' | 'smtp';
  apiKey?: string;
  from: string;
  retryAttempts?: number;
}

export const {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN,
  OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<NotificationsModuleOptions>()
  .setClassMethodName('forRoot')   // Generates forRoot() and forRootAsync()
  .setExtras({ isGlobal: false }, (definition, extras) => ({
    ...definition,
    global: extras.isGlobal,       // Opt-in global registration
  }))
  .build();

// notifications.module.ts
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule extends ConfigurableModuleClass {}

// notifications.service.ts
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(MODULE_OPTIONS_TOKEN)
    private readonly options: NotificationsModuleOptions,
  ) {}
}

// app.module.ts — usage
@Module({
  imports: [
    NotificationsModule.forRootAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        provider: config.getOrThrow('NOTIFICATION_PROVIDER'),
        apiKey: config.get('NOTIFICATION_API_KEY'),
        from: config.getOrThrow('NOTIFICATION_FROM'),
        retryAttempts: 3,
      }),
    }),
  ],
})
export class AppModule {}
```

**When NOT to use ConfigurableModuleBuilder**: Simple modules with 1-2 config values. A plain `register()` static method is less magic and easier to debug.

---

## ModuleRef — Dynamic Provider Resolution

For cases where you cannot use constructor injection (strategy pattern, plugin systems, lazy loading).

```typescript
@Injectable()
export class PaymentProcessorFactory {
  constructor(private readonly moduleRef: ModuleRef) {}

  async getProcessor(type: PaymentType): Promise<PaymentProcessor> {
    // Resolve by class token — provider must be registered in current module scope
    switch (type) {
      case PaymentType.STRIPE:
        return this.moduleRef.resolve(StripeProcessor);
      case PaymentType.PAYPAL:
        return this.moduleRef.resolve(PaypalProcessor);
      default:
        throw new BadRequestException(`Unknown payment type: ${type}`);
    }
  }
}
```

### `get()` vs `resolve()`

| Method | Scope | Returns |
|--------|-------|---------|
| `get()` | Singleton only | Same instance every call |
| `resolve()` | Any scope | New instance for transient, unique per context ID for request-scoped |

```typescript
// For request-scoped providers, pass a context ID to share instances within a request
const contextId = ContextIdFactory.create();
const processor = await this.moduleRef.resolve(RequestScopedService, contextId);
```

**Failure mode**: Calling `get()` on a request-scoped provider throws `Cannot get a non-static provider from the application context`. Always use `resolve()` for non-singleton providers.

---

## Provider Lifecycle Hooks

Execution order during application startup and shutdown:

```
onModuleInit()        → Called after all providers in the module are resolved
onApplicationBootstrap() → Called after all modules are initialized
---app running---
onModuleDestroy()     → Called when module is being destroyed (shutdown signal)
beforeApplicationShutdown(signal) → Last chance before connections close
onApplicationShutdown(signal)     → App is shutting down, clean up resources
```

### Async Initialization Pattern

```typescript
@Injectable()
export class CacheWarmupService implements OnModuleInit {
  constructor(
    private readonly productsRepo: ProductsRepository,
    private readonly redis: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    // Runs during startup — blocks app from receiving requests until complete
    const hotProducts = await this.productsRepo.findTopSelling(1000);
    const pipeline = this.redis.pipeline();
    for (const product of hotProducts) {
      pipeline.set(`product:${product.id}`, JSON.stringify(product), 'EX', 3600);
    }
    await pipeline.exec();
    // ~500ms for 1000 products. If this exceeds health check timeout, move to background.
  }
}
```

### Graceful Shutdown

```typescript
// main.ts — enable shutdown hooks (not enabled by default!)
app.enableShutdownHooks();

// service
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  async onApplicationShutdown(signal: string): Promise<void> {
    // signal is 'SIGTERM', 'SIGINT', etc.
    await this.dataSource.destroy();
    // Allow 5s for in-flight queries to complete
  }
}
```

**Critical**: `enableShutdownHooks()` uses `process.on('SIGTERM')` which interferes with some PaaS platforms. On AWS ECS, the container runtime sends SIGTERM and waits `stopTimeout` (default 30s). Make sure your shutdown completes within that window.

**Failure mode**: Not calling `enableShutdownHooks()` means `onModuleDestroy` and `onApplicationShutdown` never fire. Database connections leak on redeploy.

---

## Request-Scoped Providers — Caveats

```typescript
@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  constructor(@Inject(REQUEST) private readonly request: Request) {}

  get tenantId(): string {
    return this.request.headers['x-tenant-id'] as string;
  }
}
```

### Performance Impact

Every provider that depends on a request-scoped provider also becomes request-scoped. This propagates up the dependency chain.

```
TenantContext (REQUEST) <- TenantService (becomes REQUEST) <- OrdersService (becomes REQUEST)
```

**Benchmark**: Singleton service resolution: ~0.01ms. Request-scoped resolution: ~0.3ms per provider in the chain. With 10 request-scoped providers per request at 1000 RPS, you add ~3 seconds of total CPU time per second to provider resolution alone.

**Alternatives to request-scoped providers**:

1. **AsyncLocalStorage** (Node 16+, NestJS 10+) — Zero DI overhead:
```typescript
// cls.module.ts
@Module({
  providers: [{
    provide: 'ALS',
    useValue: new AsyncLocalStorage<{ tenantId: string; userId: string }>(),
  }],
  exports: ['ALS'],
})
export class ClsModule {}

// cls.middleware.ts — populates the store before request handling
@Injectable()
export class ClsMiddleware implements NestMiddleware {
  constructor(@Inject('ALS') private als: AsyncLocalStorage<any>) {}

  use(req: Request, _res: Response, next: NextFunction) {
    this.als.run({ tenantId: req.headers['x-tenant-id'], userId: req.user?.id }, next);
  }
}
```

2. **nestjs-cls** library — wraps AsyncLocalStorage with NestJS-friendly API.

**Trade-off**: AsyncLocalStorage adds ~1-2% overhead on microbenchmarks but avoids DI chain propagation entirely. Prefer it over `Scope.REQUEST` in all cases.

---

## Custom Providers — Advanced Patterns

### useFactory with async initialization

```typescript
{
  provide: 'ELASTICSEARCH_CLIENT',
  useFactory: async (config: ConfigService): Promise<Client> => {
    const client = new Client({
      node: config.getOrThrow('ELASTICSEARCH_URL'),
      auth: {
        apiKey: config.getOrThrow('ELASTICSEARCH_API_KEY'),
      },
    });
    // Verify connection at startup — fail fast if ES is down
    const health = await client.cluster.health();
    if (health.status === 'red') {
      throw new Error('Elasticsearch cluster is RED — aborting startup');
    }
    return client;
  },
  inject: [ConfigService],
}
```

### useExisting for aliasing

```typescript
// Swap implementations without changing consumers
{
  provide: 'CACHE_STORE',
  useExisting: process.env.NODE_ENV === 'test'
    ? InMemoryCacheService
    : RedisCacheService,
}
```

**Failure mode**: `useExisting` requires the target provider to be registered in the same module or imported. If it is not, you get a silent `undefined` injection (not an error) when `strict` mode is off. Always set `strict: true` in `NestFactory.create` during development.
