# Performance Optimization

## EXPLAIN Deep Dive

```sql
-- Always use this form in production analysis (PG 12+ for SETTINGS)
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT TEXT)
SELECT ...;

-- JSON format for programmatic parsing / pgMustard / Dalibo
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)
SELECT ...;

-- WAL output for write-heavy analysis (PG 13+)
EXPLAIN (ANALYZE, BUFFERS, WAL)
INSERT INTO ...;
```

### Reading EXPLAIN Output -- What Actually Matters

```
Seq Scan on users  (cost=0.00..1234.56 rows=10000 width=32)
                    ^^^^                ^^^^^^^^^^
                    startup..total      ESTIMATED rows -- compare to actual

Actual time=0.123..45.678 rows=9876 loops=1
                          ^^^^^^^^
                          ACTUAL rows -- if >> estimated, statistics are stale
```

**Critical diagnostic**: When estimated rows diverge from actual rows by 10x+, run `ANALYZE` on the table. If still wrong, increase `ALTER TABLE t ALTER COLUMN c SET STATISTICS 1000`.

### Node Types -- When Each Is Optimal

**Seq Scan**: Optimal when reading >5-10% of table, or table < ~8KB (1 page). A Seq Scan on a 100-row table is faster than an Index Scan because it avoids index traversal overhead. The planner correctly chooses this.

**Index Scan**: Optimal for high selectivity (returning < 5% of rows) on uncorrelated data. Performs heap lookup per tuple -- random I/O on HDD, acceptable on SSD.

**Index Only Scan**: Best case -- never touches heap. **Prerequisites**: (1) all needed columns in index via INCLUDE, (2) visibility map mostly set, meaning recent VACUUM. Check `pg_stat_user_tables.n_dead_tup` -- if high, Index Only Scan degrades to Index Scan behavior because it must check heap for visibility.

**Bitmap Index Scan + Bitmap Heap Scan**: Optimal for medium selectivity (1-20% of rows) or OR conditions across indexes. Sorts TIDs to convert random I/O to sequential. Loses effectiveness when `work_mem` too small (lossy bitmap).

**BRIN Index Scan**: For naturally ordered data (time-series). Scans only relevant page ranges. 1000x smaller than B-tree. Useless if data is not physically correlated with index column (`correlation` in `pg_stats` should be > 0.9).

## Index Design

### CREATE INDEX CONCURRENTLY -- Production Requirement

```sql
-- NEVER in production:
CREATE INDEX idx_orders_user ON orders(user_id);
-- Takes ACCESS EXCLUSIVE lock briefly, then SHARE lock for duration
-- Blocks all writes for entire build time on large tables

-- ALWAYS in production:
CREATE INDEX CONCURRENTLY idx_orders_user ON orders(user_id);
-- Two passes: no blocking reads or writes
-- Takes ~2-3x longer, uses more CPU
-- CANNOT run inside a transaction block
-- If interrupted, leaves INVALID index -- check and drop:
SELECT indexrelid::regclass, indisvalid
FROM pg_index WHERE NOT indisvalid;
```

**Failure mode**: If CONCURRENTLY build fails (OOM, disk full, canceled), the index is marked INVALID. It still consumes space and slows writes. You must `DROP INDEX CONCURRENTLY idx_name` and retry.

### Multicolumn Index Design -- The Equality-Range Rule

```sql
-- Rule: equality columns first, range/sort column last
-- Query: WHERE tenant_id = X AND status = Y AND created_at > Z ORDER BY created_at
CREATE INDEX CONCURRENTLY idx_orders_tenant_status_created
  ON orders(tenant_id, status, created_at);
--         ^^^^^^^^^ ^^^^^^  ^^^^^^^^^^
--         equality  equality range/sort

-- WHY this order matters:
-- B-tree traverses left-to-right. Equality narrows to exact subtree.
-- Range column must be last because it breaks the sort for subsequent columns.

-- WRONG order:
CREATE INDEX ON orders(created_at, tenant_id, status);
-- Can only use created_at for range scan, then must filter the rest
```

### Covering Indexes with INCLUDE (PG 11+)

```sql
-- INCLUDE adds non-key columns to leaf pages -- enables Index Only Scan
CREATE INDEX CONCURRENTLY idx_orders_covering
  ON orders(user_id, status) INCLUDE (total, created_at);

-- Difference from composite index:
-- INCLUDE columns are NOT in the B-tree sort order
-- They cannot be used for WHERE or ORDER BY
-- They add ~8 bytes per column to leaf page size
-- Trade-off: larger index vs avoiding heap lookups

-- When NOT to use: if INCLUDE columns are wide (text, jsonb)
-- the index bloats and may not fit in shared_buffers
```

### Hash Indexes (PG 10+ WAL-logged)

```sql
-- Only equality lookups. Smaller than B-tree for high-cardinality equality-only.
CREATE INDEX CONCURRENTLY idx_sessions_token_hash
  ON sessions USING HASH(session_token);

-- When better than B-tree:
-- Column is high-cardinality (UUIDs, tokens), only equality queries, no range/sort
-- ~30% smaller than equivalent B-tree

-- When NOT to use:
-- Any range query (>, <, BETWEEN), ORDER BY, IS NULL (not supported pre-PG 11)
-- Multicolumn (not supported)
```

### SP-GiST Indexes

```sql
-- Quadtree for points (faster than GiST for non-overlapping data)
CREATE INDEX CONCURRENTLY idx_locations_spgist
  ON locations USING SPGIST(point_column);

-- IP address range lookups (inet_ops)
CREATE INDEX CONCURRENTLY idx_access_log_ip
  ON access_log USING SPGIST(client_ip inet_ops);
-- Enables: WHERE client_ip <<= '10.0.0.0/8'

-- Text prefix search (text_ops)
CREATE INDEX CONCURRENTLY idx_urls_prefix
  ON urls USING SPGIST(path text_ops);
-- Enables: WHERE path LIKE '/api/v2/%' (prefix only, not suffix)

-- When NOT to use: overlapping ranges (use GiST), full LIKE '%middle%' (use pg_trgm GIN)
```

### Partial Indexes

```sql
-- Only index rows matching a predicate -- smaller, faster, less maintenance
CREATE INDEX CONCURRENTLY idx_orders_pending
  ON orders(created_at) WHERE status = 'pending';
-- If 95% of orders are 'completed', this index is ~20x smaller

-- Multi-tenant: index only the active tenant's hot data
CREATE INDEX CONCURRENTLY idx_tenant_active
  ON events(created_at) WHERE tenant_id = 42 AND archived = false;

-- Trade-off: query must match the WHERE clause exactly (or be more restrictive)
-- The planner won't use this index for WHERE status = 'shipped'
```

### HOT Updates and Fillfactor

```sql
-- HOT (Heap-Only Tuple) = in-page update that avoids index maintenance
-- Conditions: (1) updated columns not in any index, (2) free space on same page

-- For high-update tables, lower fillfactor to leave room for HOT:
ALTER TABLE sessions SET (fillfactor = 70);
-- 30% of each page reserved for updates

-- Monitor HOT effectiveness:
SELECT relname,
  n_tup_upd,
  n_tup_hot_upd,
  round(100.0 * n_tup_hot_upd / NULLIF(n_tup_upd, 0), 1) AS hot_pct
FROM pg_stat_user_tables
WHERE n_tup_upd > 1000
ORDER BY n_tup_upd DESC;
-- Target: hot_pct > 90% for frequently updated tables

-- Trade-off: lower fillfactor = more pages = larger table = slower seq scans
-- Sweet spots: 70 for heavy update, 90 for moderate, 100 (default) for append-only

-- Failure mode: if you add an index on a frequently updated column,
-- HOT breaks for that column and update performance drops significantly
```

## work_mem -- The Most Dangerous Setting

```sql
-- work_mem is per-OPERATION, not per-query, not per-connection
-- A single query can have multiple sort/hash operations

-- Danger calculation:
-- Query with 5 hash joins × 100 concurrent connections × 256MB work_mem = 128GB
-- This WILL cause OOM and crash PostgreSQL

-- Safe approach: set conservatively at global level, raise per-session when needed
-- postgresql.conf:
work_mem = '16MB'  -- Conservative default for OLTP

-- For a specific reporting query:
BEGIN;
SET LOCAL work_mem = '256MB';  -- Only affects this transaction
SELECT ... complex aggregation ...;
COMMIT;  -- work_mem reverts to global setting

-- Diagnostics: find queries that spill to disk
EXPLAIN (ANALYZE, BUFFERS)
SELECT ...;
-- Look for: "Sort Method: external merge  Disk: 45000kB"
-- This means work_mem was too small for this sort

-- Formula for global work_mem:
-- Available RAM = Total - shared_buffers - OS cache - maintenance_work_mem
-- work_mem = Available RAM / (max_connections * avg_operations_per_query * 2)
-- The "* 2" is safety margin
```

## Statistics and Selectivity

```sql
-- Increase statistics target for columns with skewed distributions
ALTER TABLE orders ALTER COLUMN status SET STATISTICS 1000;
-- Default 100 = 100 most-common-values tracked
-- 1000 = better estimates for skewed data, ANALYZE takes ~10x longer on this column

-- Extended statistics for correlated columns (PG 10+)
CREATE STATISTICS stat_orders_user_status (dependencies, ndistinct, mcv)
  ON user_id, status FROM orders;
ANALYZE orders;
-- Fixes bad estimates when columns are correlated
-- e.g., user_id=42 almost always has status='premium'

-- Check if planner estimates are accurate:
SELECT tablename, attname, n_distinct, most_common_vals, most_common_freqs
FROM pg_stats WHERE tablename = 'orders' AND attname = 'status';
```

## Performance Monitoring Queries

```sql
-- Top queries by total time (requires pg_stat_statements)
SELECT
  queryid,
  left(query, 80) AS query_preview,
  calls,
  round(total_exec_time::numeric / 1000, 2) AS total_sec,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round(stddev_exec_time::numeric, 2) AS stddev_ms,
  rows,
  round(100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0), 1) AS hit_pct
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;

-- Cache hit ratio per table (target: > 99% for OLTP)
SELECT
  schemaname, relname,
  heap_blks_hit,
  heap_blks_read,
  round(100.0 * heap_blks_hit / NULLIF(heap_blks_hit + heap_blks_read, 0), 2) AS hit_ratio
FROM pg_statio_user_tables
WHERE heap_blks_hit + heap_blks_read > 1000
ORDER BY hit_ratio ASC;
-- Tables with low hit ratio need more shared_buffers or are too large for RAM

-- Unused indexes wasting space and slowing writes
SELECT
  schemaname, tablename, indexname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelname NOT LIKE '%pkey'
  AND indexrelname NOT LIKE '%unique%'
ORDER BY pg_relation_size(indexrelid) DESC;
-- Wait at least 1 full business cycle (1 week minimum) before dropping
-- Some indexes are only used by monthly reports
```

## Configuration -- Key Parameters

```sql
-- Memory (for 64GB RAM server, OLTP workload)
shared_buffers = '16GB'            -- 25% of RAM
effective_cache_size = '48GB'      -- 75% of RAM (tells planner about OS cache)
work_mem = '16MB'                  -- Conservative. Raise per-session for analytics.
maintenance_work_mem = '2GB'       -- For VACUUM, CREATE INDEX (1 worker at a time)
huge_pages = 'try'                 -- Reduces TLB misses, ~5-10% gain on large shared_buffers

-- Checkpoints
checkpoint_completion_target = 0.9
checkpoint_timeout = '15min'       -- Spread I/O over longer period
max_wal_size = '4GB'               -- Allow more WAL between checkpoints

-- Planner (SSD)
random_page_cost = 1.1             -- Default 4.0 assumes HDD. SSD has no seek penalty.
effective_io_concurrency = 200     -- SSD can handle parallel reads
-- HDD: random_page_cost = 3.0, effective_io_concurrency = 2

-- Parallelism (PG 10+)
max_parallel_workers_per_gather = 4   -- Per-query parallel workers
max_parallel_workers = 8              -- System-wide parallel worker limit
max_parallel_maintenance_workers = 4  -- For CREATE INDEX, VACUUM (PG 11+)
```
