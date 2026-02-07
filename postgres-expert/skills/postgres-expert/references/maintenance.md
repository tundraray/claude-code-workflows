# Database Maintenance

## VACUUM -- What It Actually Does

PostgreSQL MVCC means UPDATE creates a new row version; DELETE marks the old one dead. VACUUM reclaims dead rows, updates the visibility map (for Index Only Scans), and freezes old transaction IDs (prevents wraparound).

```sql
-- Standard VACUUM: non-blocking, marks space reusable (but doesn't return to OS)
VACUUM orders;

-- VACUUM FULL: rewrites entire table. Takes ACCESS EXCLUSIVE lock (blocks everything).
-- NEVER use in production without planned downtime. Use pg_repack instead.

-- Modern VACUUM options (PG 12+):
VACUUM (
  VERBOSE,           -- Show detailed progress
  INDEX_CLEANUP ON,  -- Clean up index entries (default ON; OFF skips for speed)
  TRUNCATE ON,       -- Release trailing empty pages to OS (default ON)
  PARALLEL 4         -- PG 13+: parallel index cleanup (4 workers)
) orders;

-- Skip index cleanup for emergency speed (PG 12+):
VACUUM (INDEX_CLEANUP OFF, TRUNCATE OFF) orders;
-- 10x faster but leaves index bloat. Use when fighting wraparound.
```

## Autovacuum Tuning

```sql
-- Default trigger formula:
-- vacuum when: dead_tuples > threshold + (scale_factor * live_tuples)
-- Default: 50 + (0.2 * live_tuples)
-- For 10M row table: vacuum after 2,000,050 dead tuples -- too late!

-- Per-table tuning for high-churn tables:
ALTER TABLE orders SET (
  autovacuum_vacuum_scale_factor = 0.01,    -- 1% instead of 20%
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0.005,  -- 0.5%
  autovacuum_vacuum_cost_delay = 0          -- No throttling for this table
);
-- For 10M rows: vacuum after 101,000 dead tuples instead of 2M

-- Cost-based throttling (global defaults):
autovacuum_vacuum_cost_delay = 2ms   -- Pause between cost limit hits
autovacuum_vacuum_cost_limit = 200   -- Cost units before pausing
-- Lower delay or higher limit = faster vacuum = more I/O impact
-- For SSD: cost_delay = 0, cost_limit = -1 (use vacuum_cost_limit)

-- Workers:
autovacuum_max_workers = 5    -- Default 3. More workers = more parallel vacuuming.
-- But each worker is single-threaded. For parallel index cleanup, use VACUUM (PARALLEL N).

-- CRITICAL: log autovacuum for production debugging:
log_autovacuum_min_duration = 250   -- Log any autovacuum taking > 250ms
-- Shows which tables are vacuumed, how long, how many dead tuples removed
```

## HOT Updates Deep Dive

```sql
-- HOT (Heap-Only Tuple): in-page update that skips index maintenance.
-- Conditions: (1) updated column is NOT in any index, (2) same page has free space.

-- Fillfactor controls reserved space per page:
ALTER TABLE sessions SET (fillfactor = 70);
-- 30% free space per page for HOT updates
-- VACUUM also defragments pages to reclaim dead HOT chains

-- Monitor HOT effectiveness:
SELECT relname,
  n_tup_upd,
  n_tup_hot_upd,
  round(100.0 * n_tup_hot_upd / NULLIF(n_tup_upd, 0), 1) AS hot_update_pct
FROM pg_stat_user_tables
WHERE n_tup_upd > 100
ORDER BY hot_update_pct ASC;
-- If hot_update_pct < 50% on a frequently updated table:
-- 1. Check if updated columns are indexed (remove unnecessary indexes)
-- 2. Lower fillfactor to 60-70
-- 3. Vacuum more aggressively (HOT chains consume page space)

-- Trade-off matrix:
-- fillfactor=100 (default): maximum storage density, zero HOT headroom
-- fillfactor=90: minimal overhead, works for moderate updates
-- fillfactor=70: good for high-update tables (sessions, counters)
-- fillfactor=50: extreme, only for ultra-high-update single-row tables
-- Lower fillfactor = larger table on disk = slower seq scans
```

## Visibility Map and Freeze Map

```sql
-- Each table has a visibility map: 2 bits per 8KB page
-- Bit 1 (all-visible): all tuples on page visible to all transactions
--   Enables Index Only Scans (skip heap check)
-- Bit 2 (all-frozen): all tuples on page are frozen (no XID references)
--   VACUUM skips frozen pages entirely (huge speedup on large tables)

-- VACUUM sets all-visible. VACUUM FREEZE sets all-frozen.
-- Any modification clears the bits for that page.

-- Check visibility map coverage:
SELECT
  relname,
  pg_size_pretty(pg_relation_size(oid)) AS size,
  pg_stat_get_live_tuples(oid) AS live_tuples,
  pg_stat_get_dead_tuples(oid) AS dead_tuples
FROM pg_class
WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace;

-- For Index Only Scan performance, you need high visibility map coverage.
-- Run VACUUM before relying on Index Only Scans.
```

## Transaction ID Wraparound -- Emergency Procedures

```sql
-- PostgreSQL uses 32-bit XIDs. ~4.2 billion total, ~2.1 billion in each direction.
-- If a table's relfrozenxid age reaches 2 billion, PostgreSQL SHUTS DOWN to prevent data loss.
-- This is called "wraparound protection shutdown."

-- Check wraparound distance (CRITICAL monitoring query):
SELECT
  c.relnamespace::regnamespace AS schema,
  c.relname,
  age(c.relfrozenxid) AS xid_age,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
  round(age(c.relfrozenxid)::numeric / 2147483647 * 100, 2) AS pct_to_wraparound
FROM pg_class c
WHERE c.relkind = 'r'
ORDER BY age(c.relfrozenxid) DESC
LIMIT 20;
-- Alert at: pct_to_wraparound > 50%
-- Panic at: pct_to_wraparound > 75%

-- Autovacuum anti-wraparound kicks in at:
-- autovacuum_freeze_max_age (default 200M XIDs)
-- This is NON-CANCELLABLE and ignores cost delays.
-- If it can't complete (table locked, or too slow), XIDs keep advancing.

-- Emergency vacuum when approaching wraparound:
-- PG 14+: vacuum_failsafe_age (default 1.6 billion)
-- At this age, VACUUM skips index cleanup and non-essential work to freeze ASAP.

-- Manual emergency:
VACUUM (FREEZE, INDEX_CLEANUP OFF, TRUNCATE OFF, VERBOSE) problematic_table;
-- Fastest possible freeze. Skips index cleanup and page truncation.
-- Check progress:
SELECT * FROM pg_stat_progress_vacuum;
```

### pg_stat_progress_vacuum Phases

```sql
SELECT pid, datname, relid::regclass, phase,
  heap_blks_total, heap_blks_scanned, heap_blks_vacuumed,
  index_vacuum_count,  -- How many index passes so far
  max_dead_tuples      -- work_mem determines this buffer size
FROM pg_stat_progress_vacuum;

-- Phases in order:
-- 1. "initializing" -- setup
-- 2. "scanning heap" -- finding dead tuples (slow on large tables)
-- 3. "vacuuming indexes" -- removing dead index entries (can repeat if dead_tuples > work_mem buffer)
-- 4. "vacuuming heap" -- removing dead heap tuples
-- 5. "cleaning up indexes" -- final index cleanup
-- 6. "truncating heap" -- releasing trailing empty pages
-- 7. "performing final cleanup"

-- If index_vacuum_count > 1, VACUUM is making multiple passes because
-- maintenance_work_mem is too small to hold all dead tuple TIDs at once.
-- Fix: increase maintenance_work_mem (or autovacuum_work_mem per-table)
-- autovacuum_work_mem = '1GB'  -- Default -1 means use maintenance_work_mem
```

## TOAST Vacuum

```sql
-- TOAST tables store large values (> ~2KB) out-of-line.
-- VACUUM on the main table vacuums TOAST by default.

-- Skip TOAST vacuum when main table is urgent (PG 14+):
VACUUM (PROCESS_TOAST OFF) large_documents;
-- Saves time when TOAST is fine but main table needs urgent freeze

-- Check if TOAST is the bottleneck:
SELECT
  c.relname AS table,
  pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
  pg_size_pretty(pg_relation_size(t.oid)) AS toast_size,
  round(100.0 * pg_relation_size(t.oid) /
    NULLIF(pg_relation_size(c.oid) + pg_relation_size(t.oid), 0), 1) AS toast_pct
FROM pg_class c
JOIN pg_class t ON t.oid = c.reltoastrelid
ORDER BY pg_relation_size(t.oid) DESC;

-- If TOAST table is bloated beyond repair:
-- pg_repack handles TOAST automatically
-- pg_repack -d mydb -t documents
```

## Bloat Detection and Remediation

```sql
-- Quick dead tuple check:
SELECT schemaname, relname,
  n_live_tup, n_dead_tup,
  round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,
  last_vacuum, last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC;

-- Accurate bloat with pgstattuple (slow, scans table):
-- SELECT * FROM pgstattuple('tablename');
-- dead_tuple_percent > 20% = significant bloat

-- Remediation options:
-- 1. VACUUM: reclaims space for reuse within the file (doesn't shrink file)
-- 2. pg_repack: online table rewrite, no exclusive lock, reclaims disk space
--    pg_repack -d mydb -t bloated_table
-- 3. VACUUM FULL: offline rewrite, ACCESS EXCLUSIVE lock. Last resort.
-- 4. REINDEX CONCURRENTLY: for index bloat specifically (PG 12+)
REINDEX INDEX CONCURRENTLY idx_orders_status;

-- Trade-offs:
-- pg_repack: needs ~2x table size in free disk, takes EXCLUSIVE lock briefly at end
-- VACUUM FULL: needs ~1x table size, locks table entire duration
-- REINDEX CONCURRENTLY: needs ~2x index size, no blocking, but can fail and leave invalid index
```

## Monitoring Queries

```sql
-- Long-running queries blocking vacuum or causing bloat:
SELECT pid, usename, state,
  now() - query_start AS duration,
  left(query, 80) AS query
FROM pg_stat_activity
WHERE state != 'idle'
  AND query NOT LIKE '%pg_stat%'
  AND now() - query_start > interval '5 minutes'
ORDER BY duration DESC;

-- Idle-in-transaction: holds back VACUUM xmin, causes bloat:
SELECT pid, usename, state,
  now() - state_change AS idle_duration,
  left(query, 80) AS last_query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND now() - state_change > interval '1 minute';
-- FIX: set idle_in_transaction_session_timeout = '5min' in postgresql.conf

-- Blocking lock chains:
SELECT
  blocked.pid AS blocked_pid,
  blocked.query AS blocked_query,
  blocker.pid AS blocker_pid,
  blocker.query AS blocker_query,
  blocked.wait_event_type,
  blocked.wait_event
FROM pg_stat_activity blocked
JOIN pg_locks bl ON bl.pid = blocked.pid AND NOT bl.granted
JOIN pg_locks gl ON gl.locktype = bl.locktype
  AND gl.database IS NOT DISTINCT FROM bl.database
  AND gl.relation IS NOT DISTINCT FROM bl.relation
  AND gl.pid != bl.pid AND gl.granted
JOIN pg_stat_activity blocker ON blocker.pid = gl.pid;

-- Table size and growth:
SELECT
  schemaname || '.' || tablename AS table,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total,
  pg_size_pretty(pg_relation_size(schemaname || '.' || tablename)) AS table,
  pg_size_pretty(pg_indexes_size((schemaname || '.' || tablename)::regclass)) AS indexes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
LIMIT 20;
```

## Failure Modes

**Autovacuum not keeping up**: dead_pct rising, queries slowing. Check `autovacuum_vacuum_cost_delay` (lower it), `autovacuum_max_workers` (increase), or add per-table tuning. Check for long-running transactions holding back the xmin horizon.

**Wraparound emergency**: PostgreSQL logs "WARNING: database must be vacuumed within N transactions." Run `VACUUM (FREEZE, INDEX_CLEANUP OFF)` on the offending table immediately. If PostgreSQL has already shut down, start in single-user mode: `postgres --single -D /pgdata mydb`.

**VACUUM blocked by idle-in-transaction**: Even a SELECT in an open transaction prevents VACUUM from removing dead tuples visible to that transaction. Set `idle_in_transaction_session_timeout`.

**VACUUM runs forever on huge table**: Check `pg_stat_progress_vacuum`. If `index_vacuum_count > 1`, increase `maintenance_work_mem`. If phase is "vacuuming indexes" and table has many indexes, consider `VACUUM (INDEX_CLEANUP OFF)` for emergency, then schedule full vacuum in maintenance window.
