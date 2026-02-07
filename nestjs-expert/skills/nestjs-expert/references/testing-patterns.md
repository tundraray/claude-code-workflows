# Testing Patterns — Production Grade

> NestJS 10+ | Jest 29+ | @testcontainers/postgresql 10+ | @nestjs/testing 10+

## Integration Testing with Testcontainers

Unit tests with mocked repositories miss real query bugs, constraint violations, and migration issues. Use Testcontainers for tests that hit a real PostgreSQL.

```typescript
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

describe('OrdersService (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let service: OrdersService;

  beforeAll(async () => {
    // Spins up a real PostgreSQL in Docker — ~3s first run, ~500ms cached
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('test')
      .start();

    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: container.getHost(),
          port: container.getMappedPort(5432),
          username: container.getUsername(),
          password: container.getPassword(),
          database: container.getDatabase(),
          entities: [Order, OrderItem, Product],
          synchronize: true, // OK for tests, never in production
        }),
        TypeOrmModule.forFeature([Order, OrderItem, Product]),
        OrdersModule,
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    dataSource = module.get(DataSource);
    service = module.get(OrdersService);
  }, 30_000); // Container startup timeout

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  // Transaction rollback pattern — each test gets a clean state
  let queryRunner: QueryRunner;

  beforeEach(async () => {
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    // Replace the data source's manager with the transactional one
    // so the service uses the same transaction
    jest.spyOn(dataSource, 'createQueryRunner').mockReturnValue(queryRunner);
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
    jest.restoreAllMocks();
  });

  it('should calculate order total with tax', async () => {
    // Seed test data in the real database
    await queryRunner.manager.save(Product, [
      { id: 'p1', name: 'Widget', price: 29.99 },
      { id: 'p2', name: 'Gadget', price: 49.99 },
    ]);

    const order = await service.create({
      items: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 },
      ],
    });

    expect(order.subtotal).toBeCloseTo(109.97);
    expect(order.tax).toBeCloseTo(109.97 * 0.08);
    expect(order.items).toHaveLength(2);
  });

  it('should enforce unique constraint on duplicate order reference', async () => {
    await service.create({ reference: 'ORD-001', items: [{ productId: 'p1', quantity: 1 }] });

    await expect(
      service.create({ reference: 'ORD-001', items: [{ productId: 'p1', quantity: 1 }] }),
    ).rejects.toThrow(ConflictException);
  });
});
```

**CI configuration**: Add Docker-in-Docker or a Docker socket mount to your CI runner. GitHub Actions supports `services: postgres` natively, but Testcontainers gives you version control per test suite.

**Performance**: First container startup ~3s. Reuse across test suites with `--runInBand` or use a global setup to share one container. Transaction rollback per test: ~1ms.

---

## Testing Guards in Isolation

Guards are the most under-tested component. Test them without the full NestJS app.

```typescript
describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function createMockContext(user: Partial<AuthUser>, handlerRoles?: string[]): ExecutionContext {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;

    if (handlerRoles) {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(handlerRoles);
    } else {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    }

    return context;
  }

  it('should allow access when no roles are defined', () => {
    const context = createMockContext({ role: 'user' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny access when user role does not match', () => {
    const context = createMockContext({ role: 'user' }, ['admin']);
    expect(guard.canActivate(context)).toBe(false);
  });

  it('should allow access when user role matches', () => {
    const context = createMockContext({ role: 'admin' }, ['admin', 'superadmin']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should handle missing user gracefully', () => {
    const context = createMockContext({}, ['admin']);
    expect(guard.canActivate(context)).toBe(false);
  });
});
```

---

## Testing Interceptors

```typescript
describe('TimeoutInterceptor', () => {
  let interceptor: TimeoutInterceptor;

  beforeEach(() => {
    interceptor = new TimeoutInterceptor(100); // 100ms timeout for tests
  });

  const mockContext = {} as ExecutionContext;

  it('should pass through fast responses', (done) => {
    const handler: CallHandler = {
      handle: () => of({ data: 'fast' }).pipe(delay(10)),
    };

    interceptor.intercept(mockContext, handler).subscribe({
      next: (val) => {
        expect(val).toEqual({ data: 'fast' });
        done();
      },
    });
  });

  it('should throw RequestTimeoutException for slow responses', (done) => {
    const handler: CallHandler = {
      handle: () => of({ data: 'slow' }).pipe(delay(200)),
    };

    interceptor.intercept(mockContext, handler).subscribe({
      error: (err) => {
        expect(err).toBeInstanceOf(RequestTimeoutException);
        done();
      },
    });
  });
});
```

---

## Testing Pipes

```typescript
describe('ParseDateRangePipe', () => {
  let pipe: ParseDateRangePipe;

  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: DateRangeDto,
    data: 'range',
  };

  beforeEach(() => {
    pipe = new ParseDateRangePipe();
  });

  it('should parse valid ISO date range', () => {
    const result = pipe.transform(
      { start: '2024-01-01', end: '2024-01-31' },
      metadata,
    );
    expect(result.start).toBeInstanceOf(Date);
    expect(result.end).toBeInstanceOf(Date);
  });

  it('should reject range where start > end', () => {
    expect(() =>
      pipe.transform({ start: '2024-02-01', end: '2024-01-01' }, metadata),
    ).toThrow(BadRequestException);
  });

  it('should reject range exceeding 90 days', () => {
    expect(() =>
      pipe.transform({ start: '2024-01-01', end: '2024-06-01' }, metadata),
    ).toThrow(BadRequestException);
  });
});
```

---

## Contract Testing with Pact

Verify that your API provider matches what consumers expect, without running the consumer.

```typescript
import { PactV4, MatchersV3 } from '@pact-foundation/pact';
const { like, eachLike, uuid } = MatchersV3;

describe('Orders API (Pact Provider)', () => {
  const provider = new PactV4({
    consumer: 'frontend-app',
    provider: 'orders-api',
    dir: path.resolve(__dirname, '..', 'pacts'),
  });

  it('should return order by ID', async () => {
    await provider
      .addInteraction()
      .given('an order with ID abc-123 exists')
      .uponReceiving('a request for order abc-123')
      .withRequest('GET', '/orders/abc-123', (builder) => {
        builder.headers({ Authorization: like('Bearer token') });
      })
      .willRespondWith(200, (builder) => {
        builder.jsonBody({
          id: uuid('abc-123'),
          status: like('confirmed'),
          items: eachLike({
            productId: uuid(),
            quantity: like(2),
            price: like(29.99),
          }),
          total: like(59.98),
        });
      })
      .executeTest(async (mockServer) => {
        // Point your NestJS HTTP client at the mock server
        const response = await axios.get(`${mockServer.url}/orders/abc-123`, {
          headers: { Authorization: 'Bearer test-token' },
        });

        expect(response.status).toBe(200);
        expect(response.data.items).toHaveLength(1);
      });
  });
});
```

**When NOT to use Pact**: Internal monolith APIs where you control both producer and consumer. The overhead of maintaining pact files outweighs the benefit. Use E2E tests instead.

**Trade-off**: Pact catches schema drift but not business logic bugs. Combine with integration tests for full coverage.

---

## Custom Test Utilities — createTestingApp()

Reduce boilerplate across test files with a factory function.

```typescript
// test/utils/create-testing-app.ts
interface TestingAppOptions {
  imports?: any[];
  providers?: any[];
  controllers?: any[];
  withAuth?: boolean;
  withValidation?: boolean;
}

export async function createTestingApp(options: TestingAppOptions = {}) {
  const moduleBuilder = Test.createTestingModule({
    imports: options.imports || [],
    providers: options.providers || [],
    controllers: options.controllers || [],
  });

  // Override guards for tests that do not need auth
  if (!options.withAuth) {
    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({
      canActivate: () => true,
    });
  }

  const module = await moduleBuilder.compile();
  const app = module.createNestApplication();

  if (options.withValidation !== false) {
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
  }

  await app.init();

  return {
    app,
    module,
    // Convenience getters
    get: <T>(token: any) => module.get<T>(token),
    request: () => supertest(app.getHttpServer()),
    close: () => app.close(),
  };
}

// Usage in test files
describe('OrdersController (e2e)', () => {
  let testApp: Awaited<ReturnType<typeof createTestingApp>>;

  beforeAll(async () => {
    testApp = await createTestingApp({
      imports: [OrdersModule, TypeOrmTestModule],
      withAuth: false,
    });
  });

  afterAll(() => testApp.close());

  it('should create order', async () => {
    const response = await testApp.request()
      .post('/orders')
      .send({ items: [{ productId: 'p1', quantity: 2 }] })
      .expect(201);

    expect(response.body.data.items).toHaveLength(1);
  });
});
```

---

## Testing Anti-Patterns

**1. Testing implementation, not behavior**
```typescript
// BAD: Brittle — breaks when you rename internal methods
expect(service.calculateSubtotal).toHaveBeenCalledWith(items);
// GOOD: Test the observable outcome
expect(result.total).toBeCloseTo(109.97);
```

**2. Excessive mocking hides bugs**
```typescript
// BAD: Mocking TypeORM repository hides N+1 queries, missing indexes, constraint violations
repo.find.mockResolvedValue(mockOrders);
// GOOD: Use Testcontainers for services with complex queries
```

**3. Not testing error paths**
```typescript
// Cover: What happens when DB is down? When external API times out?
// When user sends 10MB payload? When concurrent requests race?
```

**4. Shared mutable state between tests**
```typescript
// BAD: beforeAll seed once, tests depend on order
// GOOD: Each test sets up its own data, uses transaction rollback
```
