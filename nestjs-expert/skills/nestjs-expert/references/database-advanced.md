# Database Advanced Patterns

> NestJS 10+ | TypeORM 0.3+ | PostgreSQL 14+

## Transactions

### DataSource.transaction() — Simple Cases

```typescript
@Injectable()
export class OrdersService {
  constructor(private readonly dataSource: DataSource) {}

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      // All operations share the same transaction
      const order = manager.create(Order, { userId: dto.userId, status: 'pending' });
      await manager.save(order);

      for (const item of dto.items) {
        // Decrement stock with row-level lock — prevents overselling
        const result = await manager.query(
          `UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING stock`,
          [item.quantity, item.productId],
        );
        if (result[0].length === 0) {
          // Transaction will be rolled back automatically when error is thrown
          throw new ConflictException(`Insufficient stock for product ${item.productId}`);
        }

        await manager.save(OrderItem, {
          orderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        });
      }

      return order;
    });
  }
}
```

### QueryRunner — Fine-Grained Control

Use QueryRunner when you need to control commit/rollback timing or execute raw SQL within the transaction.

```typescript
async transferFunds(fromId: string, toId: string, amount: number): Promise<void> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction('SERIALIZABLE'); // Highest isolation

  try {
    // SELECT FOR UPDATE — prevents concurrent reads of stale balance
    const from = await queryRunner.manager
      .createQueryBuilder(Account, 'a')
      .setLock('pessimistic_write')
      .where('a.id = :id', { id: fromId })
      .getOneOrFail();

    if (from.balance < amount) {
      throw new BadRequestException('Insufficient funds');
    }

    await queryRunner.manager.decrement(Account, { id: fromId }, 'balance', amount);
    await queryRunner.manager.increment(Account, { id: toId }, 'balance', amount);

    // Audit log in same transaction
    await queryRunner.manager.save(AuditLog, {
      action: 'transfer',
      metadata: { fromId, toId, amount },
    });

    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release(); // Return connection to pool
  }
}
```

### Isolation Levels — Trade-offs

| Level | Prevents | Performance Impact | Use When |
|-------|----------|--------------------|----------|
| READ COMMITTED (default) | Dirty reads | Baseline | Most CRUD operations |
| REPEATABLE READ | + Non-repeatable reads | ~5-10% slower | Reports, aggregations |
| SERIALIZABLE | + Phantom reads | ~20-50% slower, more retries | Financial transactions |

**Failure mode**: SERIALIZABLE transactions fail with `could not serialize access` under contention. Implement retry logic:
```typescript
async withSerializableRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === '40001' && attempt < maxRetries) {
        // Serialization failure — exponential backoff
        await new Promise((r) => setTimeout(r, 50 * Math.pow(2, attempt)));
        continue;
      }
      throw error;
    }
  }
}
```

---

## Migrations — Zero-Downtime Patterns

### TypeORM CLI Setup

```json
// package.json
{
  "scripts": {
    "migration:generate": "typeorm migration:generate -d dist/data-source.js",
    "migration:run": "typeorm migration:run -d dist/data-source.js",
    "migration:revert": "typeorm migration:revert -d dist/data-source.js"
  }
}
```

### Zero-Downtime Column Addition

Adding a NOT NULL column to a table with 10M+ rows locks the table. Use a 3-step migration:

```typescript
// Migration 1: Add nullable column (no lock)
export class AddPhoneColumn1234567890 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN phone VARCHAR(20)`);
    // NULL allowed — no table rewrite
  }
}

// Migration 2: Backfill data (application-level, not a migration)
// Run as a background job, not blocking deployment
async backfillPhoneNumbers(): Promise<void> {
  let lastId = '';
  while (true) {
    const batch = await this.repo.query(
      `SELECT id FROM users WHERE phone IS NULL AND id > $1 ORDER BY id LIMIT 1000`,
      [lastId],
    );
    if (batch.length === 0) break;
    // Update in batches to avoid long transactions
    await this.repo.query(
      `UPDATE users SET phone = 'unknown' WHERE id = ANY($1)`,
      [batch.map((r) => r.id)],
    );
    lastId = batch[batch.length - 1].id;
  }
}

// Migration 3: Add NOT NULL constraint (after backfill complete)
export class MakePhoneNotNull1234567891 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Validates existing data without full table lock in PostgreSQL 12+
    await queryRunner.query(
      `ALTER TABLE users ALTER COLUMN phone SET NOT NULL`,
    );
  }
}
```

**Failure mode**: Running all three steps in one deployment. If the backfill is slow (10M rows = ~5 minutes), the deployment times out. Deploy migration 1, run backfill, then deploy migration 3 in a separate release.

---

## N+1 Prevention

### The Problem

```typescript
// This generates N+1 queries:
const orders = await this.ordersRepo.find(); // Query 1: SELECT * FROM orders
for (const order of orders) {
  order.user = await this.usersRepo.findOne({ where: { id: order.userId } }); // Query N
}
```

### Solution 1: Eager Relations (simple cases)

```typescript
const orders = await this.ordersRepo.find({
  relations: ['user', 'items', 'items.product'],
});
// 1 query with JOINs instead of N+1
```

**Trade-off**: Loads all relation data even when not needed. For list endpoints returning 50 orders, loading 50 users + 200 items + 200 products in one JOIN produces a large result set.

### Solution 2: QueryBuilder with Selective Loading

```typescript
const orders = await this.ordersRepo
  .createQueryBuilder('order')
  .leftJoinAndSelect('order.items', 'item')
  .leftJoinAndSelect('item.product', 'product')
  // Only load user name, not entire user entity
  .leftJoin('order.user', 'user')
  .addSelect(['user.id', 'user.name'])
  .where('order.status = :status', { status: 'active' })
  .orderBy('order.createdAt', 'DESC')
  .take(20)
  .getMany();
```

### Solution 3: DataLoader (GraphQL or batch scenarios)

```typescript
// dataloader.service.ts
@Injectable({ scope: Scope.REQUEST })
export class UserLoader {
  private loader = new DataLoader<string, User>(async (ids) => {
    // Single query for all requested user IDs
    const users = await this.usersRepo.findByIds([...ids]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    return ids.map((id) => userMap.get(id) || null);
  });

  async load(id: string): Promise<User | null> {
    return this.loader.load(id);
  }
}
```

**Performance benchmark**: 50 orders with user relation:
- N+1: ~51 queries, ~250ms
- JOIN: 1 query, ~15ms
- DataLoader: 2 queries (orders + batch users), ~20ms

---

## TypeORM QueryBuilder — Advanced Patterns

### Subqueries

```typescript
// Orders with total above average
const orders = await this.ordersRepo
  .createQueryBuilder('order')
  .where((qb) => {
    const subQuery = qb
      .subQuery()
      .select('AVG(o.total)')
      .from(Order, 'o')
      .getQuery();
    return `order.total > (${subQuery})`;
  })
  .getMany();
```

### CTEs (Common Table Expressions) — PostgreSQL

```typescript
// Recursive CTE for category tree
const categories = await this.dataSource.query(`
  WITH RECURSIVE category_tree AS (
    SELECT id, name, parent_id, 0 as depth
    FROM categories WHERE parent_id IS NULL
    UNION ALL
    SELECT c.id, c.name, c.parent_id, ct.depth + 1
    FROM categories c
    JOIN category_tree ct ON c.parent_id = ct.id
    WHERE ct.depth < 10  -- Safety limit to prevent infinite recursion
  )
  SELECT * FROM category_tree ORDER BY depth, name
`);
```

### Streaming Large Result Sets

```typescript
// Process 1M rows without loading all into memory
async exportAllOrders(writableStream: Writable): Promise<void> {
  const stream = await this.ordersRepo
    .createQueryBuilder('order')
    .leftJoinAndSelect('order.items', 'item')
    .stream();

  for await (const rawRow of stream) {
    writableStream.write(formatCsvRow(rawRow));
  }
}
```

**When NOT to use QueryBuilder**: Simple find operations. `repo.find({ where: { status: 'active' }, relations: ['user'] })` is more readable and type-safe than equivalent QueryBuilder code.

---

## Repository Pattern — Custom Repositories (TypeORM 0.3+)

TypeORM 0.3 removed `@EntityRepository`. Use custom repository classes with `@Injectable`.

```typescript
@Injectable()
export class OrdersRepository {
  constructor(
    @InjectRepository(Order)
    private readonly repo: Repository<Order>,
  ) {}

  // Domain-specific query methods — not generic CRUD
  async findPendingOlderThan(minutes: number): Promise<Order[]> {
    return this.repo
      .createQueryBuilder('order')
      .where('order.status = :status', { status: 'pending' })
      .andWhere('order.createdAt < NOW() - INTERVAL :minutes MINUTE', { minutes })
      .getMany();
  }

  async calculateRevenueByMonth(year: number): Promise<MonthlyRevenue[]> {
    return this.repo.query(`
      SELECT
        EXTRACT(MONTH FROM created_at) as month,
        SUM(total) as revenue,
        COUNT(*) as order_count
      FROM orders
      WHERE EXTRACT(YEAR FROM created_at) = $1
        AND status = 'completed'
      GROUP BY EXTRACT(MONTH FROM created_at)
      ORDER BY month
    `, [year]);
  }
}
```

---

## Soft Delete

```typescript
@Entity()
export class Article {
  @DeleteDateColumn()
  deletedAt: Date | null;
  // TypeORM automatically adds WHERE deleted_at IS NULL to all find queries
}

// Soft delete
await this.repo.softRemove(article);

// Include soft-deleted in query
await this.repo.find({ withDeleted: true });

// Restore
await this.repo.restore(id);
```

**Failure mode**: Unique constraints conflict with soft delete. Two articles with the same slug — one active, one deleted — violate a UNIQUE constraint on `slug`. Use a partial unique index:
```sql
CREATE UNIQUE INDEX idx_articles_slug_active ON articles (slug) WHERE deleted_at IS NULL;
```

---

## Multi-Tenancy Patterns

### Schema-per-Tenant (strongest isolation)

```typescript
@Injectable()
export class TenantConnectionService {
  private connections = new Map<string, DataSource>();

  async getConnection(tenantId: string): Promise<DataSource> {
    if (this.connections.has(tenantId)) {
      return this.connections.get(tenantId);
    }

    const ds = new DataSource({
      type: 'postgres',
      schema: `tenant_${tenantId}`,
      // Share same DB, different schemas
      ...this.baseConfig,
    });
    await ds.initialize();
    this.connections.set(tenantId, ds);
    return ds;
  }
}
```

**Trade-off**: Strong isolation, per-tenant backup/restore, but migrations must run per-schema. At 1000 tenants, migration deployment takes 1000x longer.

### Row-Level Security (shared tables, PostgreSQL)

```sql
-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Set tenant context per request
SET LOCAL app.tenant_id = 'abc-123';
```

```typescript
// tenant.middleware.ts — sets PostgreSQL session variable per request
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly dataSource: DataSource) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) throw new BadRequestException('Missing tenant header');

    // SET LOCAL scopes to the current transaction only
    await this.dataSource.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
    next();
  }
}
```

**Trade-off**: No migration overhead, but a single misconfigured query leaks cross-tenant data. Every raw query must go through RLS. Test with `SET app.tenant_id = 'wrong-tenant'` to verify isolation.
