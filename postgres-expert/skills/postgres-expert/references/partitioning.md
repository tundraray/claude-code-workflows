# Partitioning

## When to Partition

**Partition when**: Table > 50-100GB, queries naturally filter by partition key (time ranges, tenant ID), need to DROP old data without VACUUM overhead, maintenance operations (VACUUM, REINDEX) take too long on the whole table.

**When NOT to partition**: Table < 10GB (overhead exceeds benefit), queries don't filter by partition key (scans all partitions = worse than single table), fewer than 10 expected partitions (no point), write-heavy workload with random partition access (lock contention on partition routing).

**Trade-offs**: Partition pruning speeds up filtered queries but adds planning overhead. More partitions = longer planning time. PG handles 100-1000 partitions well; 10,000+ partitions cause slow planning (~1ms per 1000 partitions in PG 14).

## Declarative Partitioning (PG 10+)

### RANGE Partitioning -- Time-Series, Date-Based

```sql
-- Parent table (no data stored here):
CREATE TABLE events (
  id bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id int NOT NULL,
  created_at timestamptz NOT NULL,
  event_type text NOT NULL,
  payload jsonb
) PARTITION BY RANGE (created_at);

-- Child partitions (RANGE uses lower-inclusive, upper-exclusive):
CREATE TABLE events_2024_01 PARTITION OF events
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE events_2024_02 PARTITION OF events
  FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Indexes on parent propagate to all children (PG 11+):
CREATE INDEX CONCURRENTLY idx_events_tenant ON events(tenant_id);
-- Automatically creates idx on every existing and future partition

-- Unique constraints MUST include the partition key:
ALTER TABLE events ADD CONSTRAINT events_pkey PRIMARY KEY (id, created_at);
-- Can't do PRIMARY KEY (id) alone -- PG needs partition key for routing
-- This is the most common partitioning surprise.
```

### LIST Partitioning -- Multi-Tenant, Category-Based

```sql
CREATE TABLE orders (
  id bigint GENERATED ALWAYS AS IDENTITY,
  region text NOT NULL,
  created_at timestamptz NOT NULL,
  total numeric
) PARTITION BY LIST (region);

CREATE TABLE orders_us PARTITION OF orders FOR VALUES IN ('us-east', 'us-west');
CREATE TABLE orders_eu PARTITION OF orders FOR VALUES IN ('eu-west', 'eu-central');
CREATE TABLE orders_ap PARTITION OF orders FOR VALUES IN ('ap-south', 'ap-east');
```

### HASH Partitioning (PG 11+) -- Even Distribution

```sql
-- Distributes rows evenly by hash of partition key. No natural grouping.
CREATE TABLE sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id int NOT NULL,
  data jsonb
) PARTITION BY HASH (id);

-- Must create exactly the number of partitions you specify as modulus:
CREATE TABLE sessions_0 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE sessions_1 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE sessions_2 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE sessions_3 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 3);

-- Use case: spread I/O across tablespaces on different disks
-- Use case: parallel VACUUM (each partition vacuumed independently)
-- WARNING: cannot prune by range queries. Only exact match on hash key.
-- WARNING: cannot change modulus after creation. Plan capacity upfront.
```

## Multi-Level Partitioning

```sql
-- Partition by range (time), then sub-partition by list (tenant):
CREATE TABLE metrics (
  ts timestamptz NOT NULL,
  tenant_id int NOT NULL,
  value double precision
) PARTITION BY RANGE (ts);

CREATE TABLE metrics_2024_01 PARTITION OF metrics
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01')
  PARTITION BY LIST (tenant_id);

CREATE TABLE metrics_2024_01_tenant_1 PARTITION OF metrics_2024_01
  FOR VALUES IN (1);
CREATE TABLE metrics_2024_01_tenant_2 PARTITION OF metrics_2024_01
  FOR VALUES IN (2);

-- Pruning works at both levels:
-- WHERE ts = '2024-01-15' AND tenant_id = 1 -> scans only metrics_2024_01_tenant_1

-- Trade-off: partition count grows multiplicatively.
-- 12 months * 50 tenants = 600 partitions. Watch planning time.
```

## Default Partition -- The Catch-All Pitfall

```sql
CREATE TABLE events_default PARTITION OF events DEFAULT;

-- Catches all rows that don't match any partition.
-- DANGER: if you forget to create a future partition, rows silently go to DEFAULT.
-- Then when you create the new partition, PG must SCAN the entire default partition
-- to verify no rows belong in the new partition (takes ACCESS EXCLUSIVE lock).

-- If default partition has millions of misrouted rows, creating new partition:
-- 1. Scans all rows in default
-- 2. Holds ACCESS EXCLUSIVE lock during scan
-- 3. Can take minutes to hours

-- Best practice: always pre-create future partitions.
-- Use pg_partman to automate this.
-- If you must use DEFAULT, keep it empty.
```

## pg_partman -- Automatic Management

```sql
CREATE EXTENSION IF NOT EXISTS pg_partman;

-- Setup automatic time-based partitioning:
SELECT partman.create_parent(
  p_parent_table := 'public.events',
  p_control := 'created_at',
  p_type := 'native',            -- Uses PG declarative partitioning
  p_interval := 'monthly',       -- One partition per month
  p_premake := 4                 -- Pre-create 4 future partitions
);

-- Configure retention (drop old partitions):
UPDATE partman.part_config
SET retention = '24 months',
    retention_keep_table = false,  -- DROP partition (not just detach)
    retention_keep_index = false
WHERE parent_table = 'public.events';

-- Run maintenance (creates new partitions, drops expired ones):
SELECT partman.run_maintenance();
-- Schedule via pg_cron:
SELECT cron.schedule('partition-maintenance', '0 3 * * *',
  $$SELECT partman.run_maintenance()$$);

-- Verify setup:
SELECT * FROM partman.part_config;
SELECT * FROM partman.show_partitions('public.events');
```

## Partition-Wise Joins and Aggregates (PG 11+)

```sql
-- Partition-wise join: if both tables are partitioned on the same key,
-- PG joins matching partitions directly instead of joining full tables.
SET enable_partitionwise_join = on;  -- Default OFF (adds planning time)

-- Example: events and event_details both partitioned by created_at
-- Without: Hash Join on full tables, then filter
-- With: Hash Join on events_2024_01 + event_details_2024_01, then union

-- Partition-wise aggregate (PG 11+):
SET enable_partitionwise_aggregate = on;  -- Default OFF

-- Example: SELECT date_trunc('month', created_at), count(*) FROM events GROUP BY 1
-- Without: scan all partitions, aggregate globally
-- With: aggregate per partition, then combine (can parallelize)

-- Trade-off: both add planning time (~10-50ms for 100+ partitions).
-- Only enable if queries benefit (verified with EXPLAIN ANALYZE).
-- Not always faster: if query touches most partitions, overhead exceeds benefit.
```

## Attach and Detach

```sql
-- ATTACH PARTITION: adds existing table as partition (validates all rows match constraint)
ALTER TABLE events ATTACH PARTITION events_2024_07
  FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
-- Takes ACCESS EXCLUSIVE lock on parent while validating.
-- For large tables, this can block queries for minutes.

-- Speed up ATTACH with pre-validation:
-- Add a CHECK constraint matching the partition bounds BEFORE attaching:
ALTER TABLE events_2024_07
  ADD CONSTRAINT chk_range CHECK (created_at >= '2024-07-01' AND created_at < '2024-08-01');
-- Now ATTACH skips validation (constraint already proves all rows match):
ALTER TABLE events ATTACH PARTITION events_2024_07
  FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
-- Lock still taken but released immediately (no scan).
-- Drop the CHECK after attaching (partition constraint handles it).

-- DETACH PARTITION:
ALTER TABLE events DETACH PARTITION events_2023_01;
-- Takes ACCESS EXCLUSIVE lock on parent. Blocks all queries on events.

-- DETACH CONCURRENTLY (PG 14+):
ALTER TABLE events DETACH PARTITION events_2023_01 CONCURRENTLY;
-- Two-phase: first marks partition as detaching (brief lock), then finalizes.
-- Queries continue on remaining partitions during detach.
-- CANNOT run inside a transaction block.

-- After detach, the partition is a standalone table. DROP or archive it.
DROP TABLE events_2023_01;
```

## Index Propagation (PG 11+)

```sql
-- Indexes created on the parent are automatically created on all existing
-- and future child partitions.

CREATE INDEX CONCURRENTLY idx_events_type ON events(event_type);
-- Creates matching index on events_2024_01, events_2024_02, etc.
-- New partitions created later also get this index automatically.

-- Unique indexes MUST include partition key:
CREATE UNIQUE INDEX idx_events_id_created ON events(id, created_at);
-- Cannot enforce global uniqueness on 'id' alone across partitions.
-- If you need globally unique IDs, use UUIDs or application-level enforcement.

-- Per-partition index (not propagated):
CREATE INDEX idx_events_2024_01_special ON events_2024_01(payload);
-- Only on this partition. Useful for hot partitions needing special access patterns.
```

## Failure Modes

**Symptom**: INSERT fails with "no partition of relation found for row."
**Cause**: No partition covers the inserted value, and no DEFAULT partition exists.
**Fix**: Create the missing partition or add DEFAULT. Use pg_partman to pre-create.

**Symptom**: Planning time > 100ms on partitioned table.
**Cause**: Too many partitions (> 1000) or `enable_partitionwise_join/aggregate` on with many partitions.
**Fix**: Reduce partition count (use quarterly instead of daily), or disable partitionwise settings.

**Symptom**: ATTACH PARTITION blocks queries for minutes.
**Cause**: PG scanning the new partition to validate all rows match bounds.
**Fix**: Add a matching CHECK constraint before ATTACH.

**Symptom**: Query scans all partitions despite WHERE on partition key.
**Cause**: Partition pruning failed -- function on partition key, type mismatch, or `enable_partition_pruning = off`.
**Fix**: Check EXPLAIN for "Subplans Removed" or "never executed". Keep WHERE directly on partition key with matching types.
