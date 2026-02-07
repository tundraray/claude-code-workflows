# Transactions and Locking

## Isolation Levels

PostgreSQL implements all four SQL standard levels. Default is READ COMMITTED.

### Anomaly Table

| Anomaly | READ COMMITTED | REPEATABLE READ | SERIALIZABLE |
|---------|:---:|:---:|:---:|
| Dirty read | No | No | No |
| Non-repeatable read | **Yes** | No | No |
| Phantom read | **Yes** | No | No |
| Serialization anomaly | **Yes** | **Yes** | No |

PG never allows dirty reads (even READ UNCOMMITTED behaves as READ COMMITTED).

### READ COMMITTED (Default)

```sql
-- Each statement sees a new snapshot (committed data at statement start).
-- Two consecutive SELECTs in same transaction can see different data.

-- Gotcha: UPDATE with subquery can see inconsistent state
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
-- Another transaction commits between these two statements:
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
-- The SET value uses a snapshot from statement start, but the WHERE
-- re-evaluates rows after waiting for locks. Can cause lost updates.

-- When to use: default OLTP. Fast, minimal contention.
-- Most applications work correctly with this.
```

### REPEATABLE READ

```sql
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
-- Snapshot taken at first statement in transaction. All statements see same data.
-- Prevents non-repeatable reads and phantom reads.

-- If a concurrent transaction modifies a row this transaction also modifies:
-- ERROR: could not serialize access due to concurrent update
-- Application MUST retry the transaction.

-- When to use: reporting queries that need consistent point-in-time snapshot,
-- batch operations that read-then-write the same data.
-- Trade-off: retries on conflict, slightly more memory for snapshot management.
```

### SERIALIZABLE (SSI)

```sql
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
-- Serializable Snapshot Isolation (SSI). Detects serialization anomalies.
-- All concurrent serializable transactions behave as if executed one-at-a-time.

-- Classic example that Serializable prevents (write skew):
-- Two doctors on call. Rule: at least 1 must remain on call.
-- T1: SELECT count(*) FROM oncall WHERE on_duty = true; -- sees 2
-- T2: SELECT count(*) FROM oncall WHERE on_duty = true; -- sees 2
-- T1: UPDATE oncall SET on_duty = false WHERE doctor = 'Alice';
-- T2: UPDATE oncall SET on_duty = false WHERE doctor = 'Bob';
-- Without SERIALIZABLE: both succeed, 0 doctors on call.
-- With SERIALIZABLE: one transaction gets serialization_failure, must retry.

-- Key parameters:
max_pred_locks_per_transaction = 64      -- Default. Predicate lock slots.
max_pred_locks_per_relation = -2         -- Escalation threshold.
-- If too many fine-grained locks, PG escalates to page/relation level
-- which increases false-positive serialization failures.

-- Trade-offs:
-- CPU overhead: ~5-10% for tracking read/write dependencies
-- False positives: PG may abort transactions that wouldn't actually conflict
-- ALL concurrent transactions should use SERIALIZABLE for guarantees
-- Mixing SERIALIZABLE and READ COMMITTED gives no SSI benefit

-- When to use: financial transactions, inventory management,
-- any case where application-level locking is too complex.
-- When NOT to use: read-heavy workloads, high-throughput OLTP (too many retries).
```

## MVCC Internals

```sql
-- Every row has hidden system columns:
-- xmin: transaction ID that created this row version
-- xmax: transaction ID that deleted/updated this row (0 if alive)
-- ctid: physical location (page, offset) -- changes on UPDATE

-- Inspect (for debugging only):
SELECT xmin, xmax, ctid, * FROM users WHERE id = 1;

-- Visibility rule (simplified):
-- Row is visible if: xmin is committed AND (xmax is 0 OR xmax is aborted)

-- CLOG (Commit Log, now pg_xact/):
-- 2 bits per transaction: in_progress, committed, aborted, sub-committed
-- Consulted when xmin/xmax status is unknown (first check after restart)
-- Cached in shared memory after first lookup (pg_xact hint bits)

-- Hint bits: after first visibility check, PG sets bits directly on the tuple
-- to avoid re-checking CLOG. This means SELECT can cause writes (dirty pages).
-- First SELECT after restart may be slow (setting hint bits = I/O).
```

## Advisory Locks

```sql
-- Application-level cooperative locks. PostgreSQL doesn't enforce them on data --
-- your application must check for them explicitly.

-- Session-level: held until explicitly released or session ends
SELECT pg_advisory_lock(12345);          -- Blocks until acquired
SELECT pg_try_advisory_lock(12345);      -- Returns false if can't acquire immediately
SELECT pg_advisory_unlock(12345);        -- Release

-- Transaction-level: released at COMMIT/ROLLBACK
SELECT pg_advisory_xact_lock(12345);     -- Released at end of transaction

-- Two-key version (for composite IDs):
SELECT pg_advisory_lock(schema_id, table_id);

-- Use cases:
-- 1. Distributed job queue: lock job_id before processing
SELECT pg_try_advisory_lock(hashtext('job:' || job_id::text))
FROM jobs WHERE status = 'pending' LIMIT 1 FOR UPDATE SKIP LOCKED;

-- 2. Rate limiting: lock on user_id, try_advisory prevents concurrent requests
-- 3. Schema migrations: prevent concurrent ALTER TABLE from multiple deployers
-- 4. Cache invalidation: lock key before rebuilding expensive cache

-- Monitoring:
SELECT classid, objid, mode, granted, pid
FROM pg_locks WHERE locktype = 'advisory';

-- Failure mode: session-level locks leak if application crashes without releasing.
-- Always prefer transaction-level locks unless you specifically need cross-transaction locking.
-- Set idle_in_transaction_session_timeout to auto-kill leaked sessions.

-- When NOT to use: if you need the lock to survive server restart (use a table-based lock).
-- When NOT to use: if lock contention is high (advisory locks use shared memory, limited slots).
```

## Deadlock Detection and Prevention

```sql
-- PostgreSQL detects deadlocks automatically and kills one transaction.
-- Detection runs every deadlock_timeout (default 1s).

-- Key parameters:
deadlock_timeout = '1s'          -- Check interval. Don't lower below 500ms (CPU cost).
log_lock_waits = on              -- Log when a query waits > deadlock_timeout for a lock
-- Logs: "process 12345 still waiting for ShareLock on relation 16384 after 1000.123 ms"
-- Essential for production. Shows which queries are contending.

-- Prevention strategies:
-- 1. Always acquire locks in the same order across all transactions
--    Bad:  T1 locks A then B; T2 locks B then A
--    Good: T1 locks A then B; T2 locks A then B

-- 2. Use SELECT ... FOR UPDATE with ORDER BY to lock rows in consistent order:
SELECT * FROM accounts WHERE id IN (5, 3, 7)
ORDER BY id  -- Always lock in id order
FOR UPDATE;

-- 3. Keep transactions short. Long transactions hold locks longer = more deadlock risk.
-- Set lock_timeout to fail fast instead of waiting:
SET lock_timeout = '5s';  -- Fail if can't acquire lock in 5s

-- 4. Use SKIP LOCKED for queue-like patterns (PG 9.5+):
SELECT * FROM tasks WHERE status = 'pending'
ORDER BY created_at
LIMIT 1
FOR UPDATE SKIP LOCKED;
-- Skips already-locked rows instead of waiting. Eliminates contention entirely.

-- Diagnosing deadlocks from logs:
-- PG logs full deadlock detail: which PIDs, which locks, which queries
-- "Process 12345 waits for ShareLock on tuple; blocked by process 67890"
-- "Process 67890 waits for ExclusiveLock on tuple; blocked by process 12345"
-- "Process 12345 detected deadlock, aborting"
```

## Lock Levels Compatibility Matrix

PostgreSQL has 8 lock levels (lightest to heaviest):

| Lock Mode | SELECT | INSERT | UPDATE | DELETE | CREATE INDEX | ALTER TABLE | VACUUM |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| ACCESS SHARE | yes | yes | yes | yes | yes | **blocks** | yes |
| ROW SHARE | yes | yes | yes | yes | yes | **blocks** | yes |
| ROW EXCLUSIVE | yes | yes | yes | yes | yes | **blocks** | yes |
| SHARE UPDATE EXCLUSIVE | yes | yes | yes | yes | yes | **blocks** | **blocks** |
| SHARE | yes | yes | **blocks** | **blocks** | yes | **blocks** | yes |
| SHARE ROW EXCLUSIVE | yes | yes | **blocks** | **blocks** | **blocks** | **blocks** | yes |
| EXCLUSIVE | yes | **blocks** | **blocks** | **blocks** | **blocks** | **blocks** | **blocks** |
| ACCESS EXCLUSIVE | **blocks** | **blocks** | **blocks** | **blocks** | **blocks** | **blocks** | **blocks** |

```sql
-- Which operations take which locks:
-- SELECT:                ACCESS SHARE
-- INSERT/UPDATE/DELETE:  ROW EXCLUSIVE
-- CREATE INDEX:          SHARE (blocks writes for entire duration!)
-- CREATE INDEX CONCURRENTLY: SHARE UPDATE EXCLUSIVE (allows reads AND writes)
-- VACUUM:                SHARE UPDATE EXCLUSIVE
-- ALTER TABLE:           ACCESS EXCLUSIVE (blocks everything)
-- VACUUM FULL:           ACCESS EXCLUSIVE

-- Critical insight: ALTER TABLE blocks ALL queries.
-- For zero-downtime DDL, see:
-- ALTER TABLE ... ADD COLUMN (no default): instant, metadata-only (PG 11+)
-- ALTER TABLE ... ADD COLUMN ... DEFAULT val: instant (PG 11+, was slow before)
-- ALTER TABLE ... ALTER COLUMN TYPE: rewrites table, ACCESS EXCLUSIVE, SLOW
-- ALTER TABLE ... DROP COLUMN: instant (marks invisible, space not reclaimed)

-- Use lock_timeout for DDL to fail fast:
SET lock_timeout = '3s';
ALTER TABLE users ADD COLUMN phone text;
-- If any long-running SELECT holds ACCESS SHARE, this waits.
-- With lock_timeout, it fails after 3s instead of blocking other queries
-- that queue behind the pending ACCESS EXCLUSIVE lock.
```

## Long Transaction Impact on VACUUM

```sql
-- ANY open transaction (even idle SELECT) prevents VACUUM from removing
-- row versions that were visible to that transaction.

-- The xmin horizon = oldest xmin across all running transactions + replication slots.
-- VACUUM can only remove dead tuples with xmax < xmin horizon.

-- Find the oldest transaction blocking vacuum:
SELECT pid, usename, state,
  backend_xmin,
  age(backend_xmin) AS xmin_age,
  now() - xact_start AS duration,
  left(query, 60) AS query
FROM pg_stat_activity
WHERE backend_xmin IS NOT NULL
ORDER BY age(backend_xmin) DESC
LIMIT 5;

-- Prevention:
idle_in_transaction_session_timeout = '5min'  -- Kill idle-in-transaction after 5 min
statement_timeout = '30min'                    -- Kill long-running statements
-- For reporting: use a REPEATABLE READ snapshot on a standby, not the primary.
```

## Two-Phase Commit (2PC)

```sql
-- For distributed transactions across multiple databases/services.

-- Phase 1: PREPARE
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
PREPARE TRANSACTION 'transfer_001';
-- Transaction is now durable on disk but not committed.
-- Survives server restart.

-- Phase 2: COMMIT or ROLLBACK
COMMIT PREPARED 'transfer_001';
-- Or: ROLLBACK PREPARED 'transfer_001';

-- Required config:
max_prepared_transactions = 10  -- Default 0 (disabled). Set to max expected concurrent 2PC.

-- Orphaned prepared transactions are DANGEROUS:
-- They hold locks and prevent VACUUM like any open transaction.
-- They survive restarts, so they can persist forever.

-- Find orphaned transactions:
SELECT gid, prepared, owner, database
FROM pg_prepared_xacts;
-- If any are old (hours/days), they're probably orphaned:
ROLLBACK PREPARED 'orphaned_gid';

-- When to use: cross-database consistency (rare).
-- When NOT to use: within a single database (regular transactions are sufficient).
-- Prefer saga pattern or outbox pattern over 2PC for microservices.
```

## Failure Modes

**Symptom**: Queries queuing, application timeouts.
**Cause**: One ALTER TABLE waiting for ACCESS EXCLUSIVE lock, blocking all subsequent queries that queue behind it.
**Fix**: Always use `SET lock_timeout = '3s'` before DDL. Retry in a loop during low-traffic window.

**Symptom**: Deadlock errors in application logs.
**Cause**: Transactions acquire locks in inconsistent order.
**Fix**: Enable `log_lock_waits`, analyze the lock graph, enforce consistent ordering.

**Symptom**: Table bloat growing despite autovacuum running.
**Cause**: Long-running transaction or abandoned prepared transaction holding back xmin horizon.
**Fix**: Check `pg_stat_activity` for old `backend_xmin`, check `pg_prepared_xacts` for orphans.

**Symptom**: Serialization failures spiking.
**Cause**: High contention on SERIALIZABLE isolation, or predicate lock escalation.
**Fix**: Implement retry logic with exponential backoff. Consider if REPEATABLE READ + explicit locking is sufficient.
