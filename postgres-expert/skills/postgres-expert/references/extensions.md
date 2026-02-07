# PostgreSQL Extensions

## UUID Generation -- The Modern Way

```sql
-- PG 13+: gen_random_uuid() is built-in. No extension needed.
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL
);

-- uuid-ossp is only needed for:
-- v1 (time+MAC), v3 (MD5 namespace), v5 (SHA-1 namespace)
-- If you only need v4 random UUIDs, do NOT install uuid-ossp.
```

## pg_stat_statements -- Essential for Every Production DB

```sql
-- postgresql.conf (requires restart):
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.max = 10000        -- Track top 10K query patterns
pg_stat_statements.track = 'all'      -- Include utility commands (VACUUM, CREATE INDEX)
pg_stat_statements.track_utility = on -- PG 13+: track non-DML separately
pg_stat_statements.track_planning = on -- PG 13+: include planning time (adds ~5% overhead)

-- Overhead: ~1-3% CPU for track=all, ~5% with track_planning=on
-- Trade-off: track_planning adds meaningful overhead on OLTP with many short queries.
-- Disable it on high-throughput OLTP (> 50K queries/sec).

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

```sql
-- Top queries by total time (most impactful to optimize)
SELECT
  queryid,
  left(query, 100) AS query,
  calls,
  round(total_exec_time::numeric / 1000, 2) AS total_sec,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round(stddev_exec_time::numeric, 2) AS stddev_ms,
  rows,
  round(100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0), 1) AS cache_hit_pct,
  -- PG 13+:
  round(total_plan_time::numeric, 2) AS total_plan_ms,
  wal_bytes  -- WAL generated
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;

-- Queries with worst cache hit ratio (need more shared_buffers or index)
SELECT queryid, left(query, 100), calls,
  shared_blks_hit, shared_blks_read,
  round(100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0), 1) AS hit_pct
FROM pg_stat_statements
WHERE calls > 100 AND shared_blks_read > 1000
ORDER BY hit_pct ASC
LIMIT 10;

-- Reset after config changes to get clean baseline:
SELECT pg_stat_statements_reset();
```

## pgvector -- Vector Similarity Search

### Index Types and Tuning

```sql
CREATE EXTENSION IF NOT EXISTS vector;

-- Two index types with very different trade-offs:

-- HNSW (PG pgvector 0.5+): Higher recall, more memory, slower build
CREATE INDEX CONCURRENTLY idx_embed_hnsw
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
-- m: connections per node (default 16). Higher = better recall, more memory.
--    Rule: m=16 for <1M rows, m=32 for 1-10M, m=48 for 10M+
-- ef_construction: build-time search breadth (default 64). Higher = better recall, slower build.
--    Rule: ef_construction = 2 * m is a good starting point

-- Query-time parameter:
SET hnsw.ef_search = 100;  -- Default 40. Higher = better recall, slower query.
-- Recall benchmarks (1M vectors, 1536 dims):
-- ef_search=40:  ~95% recall, ~5ms
-- ef_search=100: ~98% recall, ~12ms
-- ef_search=400: ~99.5% recall, ~40ms

-- IVFFlat: Less memory, faster build, lower recall for same speed
CREATE INDEX CONCURRENTLY idx_embed_ivf
  ON embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 1000);
-- lists: number of clusters. Rule: sqrt(row_count) for <1M, row_count/1000 for >1M
-- MUST insert data before creating index (needs data for clustering)
-- Rebuild after significant data changes (clusters become stale)

SET ivfflat.probes = 10;  -- Default 1. Check more clusters = better recall.
-- probes = sqrt(lists) is a good starting point

-- When to use which:
-- HNSW: default choice. Better recall at same query speed. Worth the memory.
-- IVFFlat: when memory is constrained or dataset changes frequently (cheaper rebuilds)

-- Distance operators:
-- <=> cosine distance (normalized embeddings -- most common)
-- <-> L2/Euclidean distance (when magnitude matters)
-- <#> negative inner product (pre-normalized data, slightly faster than <=>)

-- Exact search (no index, for ground-truth testing):
SET enable_indexscan = off;
SELECT * FROM embeddings ORDER BY embedding <=> $1 LIMIT 10;
SET enable_indexscan = on;
```

## PostGIS -- Geography vs Geometry

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

-- GEOMETRY: Planar (flat-earth) calculations.
-- Fast. Coordinates are in the SRID's units (degrees for 4326, meters for UTM).
-- ST_Distance on geometry(4326) returns DEGREES, not meters. Common mistake.

-- GEOGRAPHY: Spherical (round-earth) calculations.
-- Accurate for long distances. Always meters. ~5-10x slower than geometry.

-- Rule: Use GEOGRAPHY for real-world distance queries.
-- Use GEOMETRY for bounding box checks, containment, or projected coordinate systems.

-- WRONG: distance in degrees, meaningless
SELECT ST_Distance(
  ST_SetSRID(ST_MakePoint(-74.0, 40.7), 4326)::geometry,
  ST_SetSRID(ST_MakePoint(-118.2, 34.0), 4326)::geometry
);  -- Returns ~45.6 (degrees!)

-- RIGHT: distance in meters
SELECT ST_Distance(
  ST_SetSRID(ST_MakePoint(-74.0, 40.7), 4326)::geography,
  ST_SetSRID(ST_MakePoint(-118.2, 34.0), 4326)::geography
);  -- Returns ~3,940,000 (meters, NYC to LA)

-- Performance pattern: use geometry for initial bounding box filter,
-- geography for precise distance in final filter:
SELECT * FROM locations
WHERE geom && ST_Expand(ST_SetSRID(ST_MakePoint(-74.0, 40.7), 4326)::geometry, 0.1)
  AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(-74.0, 40.7), 4326)::geography, 10000);
-- Bounding box filter is fast (uses GiST index), then precise 10km radius check
```

## pg_trgm -- Fuzzy Search

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index enables LIKE '%middle%' to use index
CREATE INDEX CONCURRENTLY idx_users_name_trgm
  ON users USING GIN(name gin_trgm_ops);

-- Now these are fast (normally they'd be seq scans):
SELECT * FROM users WHERE name ILIKE '%john%';
SELECT * FROM users WHERE name % 'jonh';  -- Fuzzy match (typo tolerance)

-- Tune similarity threshold (default 0.3):
SET pg_trgm.similarity_threshold = 0.4;  -- Higher = stricter matching
-- 0.3 catches most typos but has false positives
-- 0.5 reduces false positives but misses more typos

-- GiST vs GIN for pg_trgm:
-- GIN: faster reads, slower writes, larger index. Use for read-heavy.
-- GiST: faster writes, slower reads, supports KNN distance ordering. Use for ORDER BY similarity.
```

## pg_cron -- In-Database Scheduling (PG 10+)

```sql
-- postgresql.conf (requires restart):
shared_preload_libraries = 'pg_cron'
cron.database_name = 'mydb'

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule partition maintenance (daily at 3 AM):
SELECT cron.schedule('create-partitions', '0 3 * * *',
  $$SELECT partman.run_maintenance()$$);

-- Refresh materialized view every 15 minutes:
SELECT cron.schedule('refresh-dashboard', '*/15 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_stats$$);

-- Purge old data weekly:
SELECT cron.schedule('purge-logs', '0 2 * * 0',
  $$DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days'$$);

-- List scheduled jobs:
SELECT * FROM cron.job;

-- View execution history:
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Unschedule:
SELECT cron.unschedule('create-partitions');

-- Trade-off: runs as superuser by default. Use cron.schedule_in_database() for per-db isolation.
-- Failure mode: if job takes longer than schedule interval, next run is skipped (no overlap).
```

## pg_partman -- Automatic Partition Management

```sql
CREATE EXTENSION IF NOT EXISTS pg_partman;

-- Auto-create time-based partitions:
SELECT partman.create_parent(
  p_parent_table := 'public.events',
  p_control := 'created_at',
  p_type := 'native',           -- Use PG declarative partitioning
  p_interval := 'monthly',
  p_premake := 3                -- Create 3 future partitions
);

-- Auto-drop old partitions (retention):
UPDATE partman.part_config
SET retention = '12 months',
    retention_keep_table = false  -- Actually drop, not just detach
WHERE parent_table = 'public.events';

-- Run maintenance (call from pg_cron):
SELECT partman.run_maintenance();
-- Creates new partitions, drops expired ones
```

## pgstattuple -- Dead Tuple and Free Space Stats

```sql
CREATE EXTENSION IF NOT EXISTS pgstattuple;

-- Detailed bloat analysis (scans entire table -- slow on large tables):
SELECT * FROM pgstattuple('users');
-- dead_tuple_percent > 20% = needs VACUUM or pg_repack

-- Index bloat:
SELECT * FROM pgstatindex('idx_users_email');
-- avg_leaf_density < 50% = index needs REINDEX

-- Faster approximate stats (samples, PG 12+):
SELECT * FROM pgstattuple_approx('users');
-- ~100x faster, good enough for monitoring
```

## amcheck -- B-tree Index Integrity (PG 11+)

```sql
CREATE EXTENSION IF NOT EXISTS amcheck;

-- Verify index is not corrupted (non-blocking read check):
SELECT bt_index_check('idx_users_email');
-- Returns void if OK, raises ERROR if corrupted

-- Thorough check including heap cross-reference (slower, takes lock):
SELECT bt_index_parent_check('idx_users_email', heapallcheck := true);

-- When to use:
-- After unexpected crashes, storage failures, PG upgrades
-- If queries return wrong results intermittently
-- Scheduled weekly in non-peak hours via pg_cron

-- If corruption found:
REINDEX INDEX CONCURRENTLY idx_users_email;
```

## pgcrypto -- When Application Can't Hash

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- bcrypt for passwords (prefer application-side hashing when possible):
INSERT INTO users (email, password_hash)
VALUES ('user@example.com', crypt('password123', gen_salt('bf', 12)));
-- Cost 12 = ~250ms per hash. Don't go below 10.

-- Verify:
SELECT id FROM users
WHERE email = 'user@example.com'
  AND password_hash = crypt('password123', password_hash);

-- When NOT to use: if your application framework has bcrypt/argon2.
-- Hashing in DB means password traverses the network to DB and appears in pg_stat_activity.
```
