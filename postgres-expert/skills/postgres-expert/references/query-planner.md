# Query Planner Internals

## Cost Model

The planner estimates query cost in abstract units. The absolute number is meaningless -- only relative comparison between plans matters.

```sql
-- Key cost parameters (postgresql.conf):
seq_page_cost = 1.0              -- Baseline: cost of one sequential 8KB page read
random_page_cost = 4.0           -- Random I/O cost (HDD). Set to 1.1 for SSD.
cpu_tuple_cost = 0.01            -- Processing one row
cpu_index_tuple_cost = 0.005     -- Processing one index entry
cpu_operator_cost = 0.0025       -- Evaluating one operator/function

-- SSD configuration (most production systems):
random_page_cost = 1.1           -- Nearly sequential on SSD
effective_io_concurrency = 200   -- SSD handles parallel reads
-- These two changes alone can fix plans choosing Seq Scan over Index Scan

-- Total cost formula (simplified):
-- cost = (pages_read * page_cost) + (rows_processed * cpu_tuple_cost)
-- Seq Scan:   total_pages * seq_page_cost + total_rows * cpu_tuple_cost
-- Index Scan: index_pages * random_page_cost + matching_rows * (cpu_index_tuple_cost + random_page_cost)

-- Why the planner chooses Seq Scan on small tables:
-- 100 rows in 1 page:  Seq Scan cost = 1*1.0 + 100*0.01 = 2.0
-- Index Scan (1 row):  cost = 2*1.1 + 1*0.005 + 1*1.1 = 3.305  (index page + heap page)
-- Seq Scan wins because table fits in one page.

-- effective_cache_size: tells planner how much data is in OS cache + shared_buffers
-- Does NOT allocate memory. Only affects cost estimates.
effective_cache_size = '48GB'    -- 75% of RAM. Makes planner favor index scans.
```

## Join Algorithms

### Nested Loop Join

```sql
-- Algorithm: for each row in outer, scan inner. O(N * M).
-- Optimal when: outer is very small (< 100 rows) or inner has an index.
-- The planner uses this with index lookup on inner table (fast for small outer).

-- EXPLAIN output:
-- Nested Loop
--   -> Seq Scan on users (rows=10)        -- outer (small)
--   -> Index Scan on orders (rows=500)    -- inner (indexed, runs 10 times)
-- Total: 10 * (index_scan_cost_per_lookup)

-- When it's BAD: both tables large, no index on inner join column.
-- Symptom: "Nested Loop" with huge "loops=" number and Seq Scan on inner.
```

### Hash Join

```sql
-- Algorithm: build hash table from smaller table, probe with larger. O(N + M).
-- Optimal when: no useful index, both tables are medium-large, work_mem fits hash.

-- EXPLAIN output:
-- Hash Join
--   -> Seq Scan on orders (rows=1000000)  -- probe side
--   -> Hash
--       -> Seq Scan on users (rows=50000) -- build side (smaller table)
-- Build phase: hash all users into memory
-- Probe phase: for each order, lookup user in hash table

-- Failure mode: if hash table exceeds work_mem, spills to disk ("Batches: 4").
-- "Batches: 1" = entirely in memory (good).
-- "Batches: 8" = 8 disk spills (increase work_mem for this query).

-- Hash Join is BLOCKED by enable_hashjoin=off (don't do this globally).
```

### Merge Join

```sql
-- Algorithm: sort both sides, walk in parallel. O(N log N + M log M).
-- Optimal when: both inputs are already sorted (index, prior sort), or very large tables.

-- EXPLAIN output:
-- Merge Join
--   -> Index Scan on users_pkey (rows=50000)    -- pre-sorted by index
--   -> Sort
--       -> Seq Scan on orders (rows=1000000)    -- sorted in memory/disk
-- If both sides come from indexes in sort order, no sort step needed.

-- When Merge Join beats Hash Join:
-- 1. Both inputs pre-sorted (from index or prior ORDER BY)
-- 2. work_mem too small for hash table (merge can sort on disk more efficiently)
-- 3. FULL OUTER JOIN (hash join doesn't support full outer in some PG versions)
```

### Choosing the Right Join

```sql
-- The planner chooses automatically based on:
-- 1. Table sizes and selectivity estimates
-- 2. Available indexes
-- 3. work_mem (affects hash join viability)
-- 4. random_page_cost (affects index scan cost)

-- If the planner chooses wrong (verified with EXPLAIN ANALYZE):
-- 1. Check statistics: ANALYZE both_tables;
-- 2. Check random_page_cost (too high favors Seq Scan + Hash Join on SSD)
-- 3. Check work_mem (too low forces Nested Loop instead of Hash Join)
-- 4. Check for correlation issues: CREATE STATISTICS on correlated columns

-- DO NOT: SET enable_hashjoin = off / enable_nestloop = off globally.
-- This breaks other queries. Use per-query SET LOCAL if absolutely necessary.
```

## Parallel Query (PG 10+)

```sql
-- The planner considers parallel execution when:
-- 1. Table size > min_parallel_table_scan_size (default 8MB)
-- 2. No query features that prevent parallelism
-- 3. max_parallel_workers_per_gather > 0

-- What CAN parallelize:
-- Seq Scan, Index Scan (PG 12+), Bitmap Heap Scan
-- Hash Join (inner side), Nested Loop (inner side)
-- Aggregate (partial + finalize)
-- Append (for UNION ALL, partitioned tables)

-- What CANNOT parallelize:
-- Writing data (INSERT/UPDATE/DELETE) -- except PG 14+ for CREATE TABLE AS / REFRESH MATVIEW
-- Cursors
-- Functions marked PARALLEL UNSAFE (most user-defined functions by default)
-- Subtransactions (EXCEPTION blocks in PL/pgSQL)
-- Serializable isolation
-- CTE scans (pre-PG 12)

-- Key parameters:
min_parallel_table_scan_size = '8MB'     -- Table must be at least this big
min_parallel_index_scan_size = '512kB'   -- Index must be at least this big
parallel_tuple_cost = 0.1               -- Cost of passing tuple between workers
parallel_setup_cost = 1000              -- Fixed cost of starting parallel workers

-- Forcing parallelism for testing (DO NOT leave in production):
SET parallel_tuple_cost = 0;
SET parallel_setup_cost = 0;
SET min_parallel_table_scan_size = 0;
SET max_parallel_workers_per_gather = 4;

-- Verify parallel execution:
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM large_table WHERE col > 100;
-- Look for: "Workers Planned: 4" and "Workers Launched: 4"
-- If Workers Launched < Planned: max_parallel_workers limit reached system-wide
```

## JIT Compilation (PG 11+)

```sql
-- JIT compiles query expressions and tuple deforming to native code using LLVM.
-- Adds compilation overhead but speeds up CPU-heavy operations.

-- Parameters:
jit = on                          -- Enable JIT (default: on in PG 12+)
jit_above_cost = 100000           -- Only JIT queries with cost above this
jit_inline_above_cost = 500000    -- Inline functions above this cost
jit_optimize_above_cost = 500000  -- Apply LLVM optimizations above this cost

-- When JIT HELPS (OLAP):
-- Aggregations over millions of rows
-- Complex WHERE expressions evaluated on many rows
-- Wide tables with many columns (tuple deforming speedup)
-- Typically 20-50% speedup on analytical queries

-- When JIT HURTS (OLTP):
-- Short queries (< 10ms) where compilation cost (5-50ms) exceeds query time
-- High concurrency: JIT compilation is CPU-intensive, competes with query execution
-- Many unique query patterns: each gets JIT-compiled separately

-- Disable JIT for OLTP workloads:
jit = off
-- Or raise the threshold:
jit_above_cost = 1000000

-- Check if JIT was used:
EXPLAIN (ANALYZE) SELECT ...;
-- Look for: "JIT: Functions: 12, Options: Inlining true, Optimization true, Expressions true"
-- "Generation Time: 5.432ms, Inlining Time: 23.456ms"
-- If generation + inlining time > query execution improvement, JIT is hurting.
```

## Generic vs Custom Plans (Prepared Statements)

```sql
-- Prepared statements can use:
-- Generic plan: planned once, reused for all parameter values (like a template)
-- Custom plan: re-planned for each execution with specific parameter values

-- PG behavior (PG 12+):
-- First 5 executions: always custom plan
-- After 5: compares average custom plan cost with generic plan cost
-- If generic plan cost <= 1.1 * average custom plan cost, switches to generic

-- Problem: Generic plan ignores parameter-specific selectivity
PREPARE find_user AS SELECT * FROM users WHERE status = $1;
-- status = 'active' (90% of rows) -> Seq Scan optimal
-- status = 'suspended' (0.1% of rows) -> Index Scan optimal
-- Generic plan must choose one strategy for all values

-- Force behavior (PG 12+):
SET plan_cache_mode = 'force_custom_plan';   -- Always re-plan (safer but slower)
SET plan_cache_mode = 'force_generic_plan';  -- Always reuse (faster but may be wrong)
SET plan_cache_mode = 'auto';                -- Default, use heuristic

-- Diagnose: check pg_prepared_statements
SELECT name, generic_plans, custom_plans FROM pg_prepared_statements;
-- If generic_plans > 0 and some queries are slow, try force_custom_plan
```

## pg_hint_plan -- Emergency Override

```sql
-- pg_hint_plan forces the planner to use specific strategies.
-- Install: CREATE EXTENSION pg_hint_plan;

-- Usage (hint comments MUST start at beginning of query):
/*+ SeqScan(users) HashJoin(users orders) */
SELECT * FROM users JOIN orders ON users.id = orders.user_id;

-- Common hints:
/*+ IndexScan(t idx_name) */       -- Force specific index
/*+ NestLoop(t1 t2) */             -- Force Nested Loop join
/*+ HashJoin(t1 t2) */             -- Force Hash Join
/*+ MergeJoin(t1 t2) */            -- Force Merge Join
/*+ Parallel(t 4 hard) */          -- Force 4 parallel workers
/*+ Set(work_mem '1GB') */         -- Override GUC for this query
/*+ Rows(t1 t2 *10) */             -- Tell planner to multiply row estimate by 10

-- WHY it's an anti-pattern long-term:
-- 1. Hints are invisible to code review (in SQL comments)
-- 2. They prevent the planner from adapting to data changes
-- 3. They break when tables are renamed, indexes dropped
-- 4. They mask root causes (stale statistics, wrong cost parameters)

-- Use pg_hint_plan ONLY:
-- 1. Emergency production fix while investigating root cause
-- 2. Testing what the optimal plan should be
-- 3. Working around known planner bugs (file a bug report too)
-- Always set a calendar reminder to remove the hint after fixing the root cause.
```

## Partition Pruning

```sql
-- Static pruning (PG 10+): eliminates partitions at plan time when WHERE uses constants
EXPLAIN SELECT * FROM events WHERE created_at = '2024-06-15';
-- Shows: scans only the 2024-06 partition, other partitions not mentioned

-- Dynamic pruning (PG 11+): eliminates partitions at execution time
-- Works with parameters, subqueries, join values
PREPARE q AS SELECT * FROM events WHERE created_at = $1;
EXECUTE q('2024-06-15');
-- Prunes at execution, not planning

-- Enable (default ON in PG 11+):
SET enable_partition_pruning = on;

-- Verify pruning in EXPLAIN:
-- "Subplans Removed: 11" = 11 partitions pruned at plan time
-- "never executed" in EXPLAIN ANALYZE = pruned at execution time

-- Failure mode: pruning fails if:
-- 1. Partition key has a function applied: WHERE date_trunc('month', created_at) = ...
-- 2. Cross-type comparison: WHERE created_at = 12345 (int vs timestamp)
-- 3. OR conditions spanning partitions with complex expressions
-- Fix: keep WHERE conditions directly on the partition key column with matching types
```
