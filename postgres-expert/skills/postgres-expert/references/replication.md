# PostgreSQL Replication

## Streaming Replication (Physical)

### Primary Configuration

```sql
-- postgresql.conf
wal_level = replica                -- Minimum for streaming replication
max_wal_senders = 10               -- Max concurrent replication connections
max_replication_slots = 10         -- Slots prevent WAL deletion until consumed
hot_standby = on                   -- Allow read queries on standby
archive_mode = on
archive_command = 'test ! -f /backup/wal/%f && cp %p /backup/wal/%f'

-- pg_hba.conf
host replication replicator 10.0.0.0/24 scram-sha-256
```

```sql
-- Create dedicated replication user
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'secure_password';

-- Create physical replication slot (prevents WAL recycling before standby consumes it)
SELECT * FROM pg_create_physical_replication_slot('replica_1');

-- DANGER: Slot retains WAL indefinitely if standby is down.
-- max_slot_wal_keep_size (PG 13+) prevents disk full:
-- postgresql.conf:
max_slot_wal_keep_size = '50GB'  -- Cap WAL retention per slot
-- If standby falls behind 50GB, slot is invalidated and standby must re-clone
```

### Standby Setup

```bash
# Base backup from primary (creates standby.signal and recovery config with -R)
pg_basebackup -h primary-host -D /var/lib/postgresql/16/main \
  -U replicator -P -v -R -X stream -S replica_1 --checkpoint=fast
# --checkpoint=fast: don't wait for next checkpoint, start immediately
# -X stream: stream WAL during backup (no WAL gap)
```

### Monitoring

```sql
-- On primary: replication lag in bytes and estimated time
SELECT
  client_addr,
  application_name,
  state,
  sync_state,
  pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS lag_bytes,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) AS lag_pretty,
  write_lag,    -- Time since WAL was written to standby
  flush_lag,    -- Time since WAL was flushed on standby
  replay_lag    -- Time since WAL was replayed on standby
FROM pg_stat_replication;

-- Replication slot disk usage (CRITICAL to monitor):
SELECT
  slot_name,
  active,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained_wal,
  pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS retained_bytes
FROM pg_replication_slots;
-- If retained_wal grows while active=false, the slot is holding WAL for a dead standby
-- Drop abandoned slots: SELECT pg_drop_replication_slot('dead_replica');
```

### Synchronous Replication

```sql
-- postgresql.conf on primary:
synchronous_commit = on

-- FIRST N: wait for N named standbys in priority order
synchronous_standby_names = 'FIRST 1 (replica_1, replica_2)'
-- Commits wait for replica_1. If replica_1 is down, falls to replica_2.

-- ANY N (PG 10+): quorum-based, wait for any N of the listed standbys
synchronous_standby_names = 'ANY 2 (replica_1, replica_2, replica_3)'
-- Commits wait for ANY 2 of 3 to confirm. Tolerates 1 standby failure.
-- Trade-off: higher latency per commit (~1-5ms network RTT)
-- Guarantees: zero data loss on failover IF sync standby is promoted

-- Per-transaction override (mix sync and async):
SET LOCAL synchronous_commit = 'off';
-- Use for bulk inserts, logging, non-critical writes
```

## Logical Replication

### Publisher

```sql
-- postgresql.conf
wal_level = logical  -- Higher than 'replica', generates more WAL

-- Publication options:
CREATE PUBLICATION my_pub FOR ALL TABLES;

-- Specific tables with row filter (PG 15+):
CREATE PUBLICATION active_orders FOR TABLE orders WHERE (status != 'archived');
-- Only replicates rows matching the filter. Reduces network and subscriber storage.

-- Schema-level (PG 15+):
CREATE PUBLICATION schema_pub FOR TABLES IN SCHEMA public;
-- Automatically includes new tables added to the schema
```

### Subscriber

```sql
CREATE SUBSCRIPTION my_sub
  CONNECTION 'host=publisher port=5432 dbname=mydb user=replicator'
  PUBLICATION my_pub
  WITH (
    copy_data = true,            -- Initial snapshot
    create_slot = true,
    streaming = 'parallel'       -- PG 16+: apply large transactions in parallel
  );

-- Monitor subscription:
SELECT subname, pid, received_lsn, latest_end_lsn,
  latest_end_time - last_msg_send_time AS apply_lag
FROM pg_stat_subscription;
```

### Conflict Resolution in Logical Replication

```sql
-- Logical replication has NO built-in conflict resolution.
-- INSERT conflicts: unique violation on subscriber kills the apply worker.

-- Detection: check subscriber logs for:
-- "ERROR: duplicate key value violates unique constraint"

-- Manual resolution:
-- 1. Fix the conflicting row on subscriber
DELETE FROM orders WHERE id = 12345;
-- 2. Restart apply:
ALTER SUBSCRIPTION my_sub ENABLE;

-- Prevention strategies:
-- 1. Use non-overlapping sequences (odd/even, ranges per node)
-- 2. Use UUIDs for primary keys
-- 3. Publish only specific tables that don't receive writes on subscriber
-- 4. Use ON CONFLICT in triggers (PG 15+ logical replication does NOT support this natively)

-- PG 15+: disable subscription on error and log the conflict:
ALTER SUBSCRIPTION my_sub SET (disable_on_error = true);
-- Check: SELECT * FROM pg_stat_subscription_stats;
```

## pg_rewind -- Rejoin Former Primary After Failover (PG 13+)

```sql
-- Scenario: Primary A fails, Standby B is promoted.
-- After fixing A, you want A to become the new standby of B.
-- Problem: A has WAL that B never received (diverged timeline).

-- pg_rewind rewinds A to the point of divergence, then replays B's WAL.
-- Much faster than full pg_basebackup (only copies changed blocks).
```

```bash
# Prerequisites: wal_log_hints = on (or data checksums) on the OLD primary
# Run on the former primary (A), which is stopped:
pg_rewind --target-pgdata=/var/lib/postgresql/16/main \
  --source-server='host=new-primary-B port=5432 user=replicator' \
  --progress

# Then configure A as standby of B:
# Create standby.signal, set primary_conninfo pointing to B
touch /var/lib/postgresql/16/main/standby.signal

# Start A -- it will catch up from B
systemctl start postgresql
```

```
-- When NOT to use pg_rewind:
-- If former primary has been running for a long time after failover (too much divergence)
-- If data checksums are off and wal_log_hints is off (can't detect changed pages)
-- If you suspect data corruption on the former primary (use pg_basebackup instead)
```

## Split-Brain Prevention

Split-brain = two nodes both accept writes. **Data loss is inevitable.**

### Fencing Strategies

```
-- 1. STONITH (Shoot The Other Node In The Head)
-- Before promoting standby, ensure the old primary is dead:
-- - Power off via IPMI/iLO/DRAC
-- - Revoke network access via SDN/firewall
-- - Only then promote standby

-- 2. Watchdog timer
-- Patroni uses Linux watchdog: if Patroni process dies, kernel reboots the node
-- postgresql.conf (Patroni-managed):
-- watchdog.safety_margin = 5  -- seconds before kernel panic

-- 3. Lease-based fencing
-- Primary holds a lease in etcd/consul. If it can't renew, it shuts itself down.
-- Standby only promotes if it can acquire the lease.
```

### Patroni -- Production HA Standard

```yaml
# patroni.yml -- critical settings for split-brain prevention
scope: pg-cluster
name: node1

etcd3:
  hosts: etcd1:2379,etcd2:2379,etcd3:2379  # 3-node etcd for quorum

bootstrap:
  dcs:
    ttl: 30                          # Leader key TTL in seconds
    loop_wait: 10                    # Patroni check interval
    retry_timeout: 10                # Retry before giving up leader
    maximum_lag_on_failover: 1048576 # 1MB -- don't promote lagging replica
    postgresql:
      use_pg_rewind: true            # Enable fast rejoin of old primary
      parameters:
        wal_level: replica
        max_wal_senders: 10
        max_replication_slots: 10
        wal_log_hints: 'on'          # Required for pg_rewind
        hot_standby: 'on'

# Watchdog (Linux only, prevents zombie primary):
watchdog:
  mode: required    # Patroni refuses to start without watchdog
  device: /dev/watchdog
  safety_margin: 5
```

```bash
# Check cluster status:
patronictl -c /etc/patroni.yml list
# Shows: Member, Host, Role, State, TL (timeline), Lag

# Manual switchover (planned maintenance):
patronictl -c /etc/patroni.yml switchover
# Graceful: drains connections, promotes replica, reconfigures old primary as standby

# Failover (emergency, current primary is dead):
patronictl -c /etc/patroni.yml failover
```

## Delayed Replication

```sql
-- On standby: postgresql.conf
recovery_min_apply_delay = '4h'
-- Standby replays WAL with 4-hour delay
-- Use case: "undo" accidental DELETE/DROP by promoting delayed standby

-- Trade-off: 4 hours of potential data loss if you promote this standby
-- Monitor: SELECT now() - pg_last_xact_replay_timestamp() AS current_delay;
```

## Backup and PITR

```bash
# pg_basebackup with compression (PG 15+: server-side compression)
pg_basebackup -h localhost -U replicator \
  -D /backup/base/$(date +%Y%m%d) \
  --compress=server-zstd:5 \
  -Ft -P -X stream --checkpoint=fast

# For PG < 15:
pg_basebackup -h localhost -U replicator \
  -D /backup/base/$(date +%Y%m%d) \
  -Ft -z -P -X stream
```

```sql
-- PITR recovery:
-- 1. Stop PostgreSQL
-- 2. Restore base backup
-- 3. Create recovery.signal
-- 4. Configure:
restore_command = 'cp /backup/wal/%f %p'
recovery_target_time = '2024-12-01 14:30:00+00'
recovery_target_action = 'promote'  -- Automatically promote after reaching target

-- Target options:
-- recovery_target_time: specific timestamp
-- recovery_target_lsn: specific WAL position (most precise)
-- recovery_target_xid: specific transaction
-- recovery_target_name: named restore point (pg_create_restore_point('before_migration'))
```

## Failure Modes

**Replication slot disk full**: Inactive slot retains WAL forever. Monitor `pg_replication_slots`. Set `max_slot_wal_keep_size` (PG 13+). Alert when retained WAL > 10GB.

**Standby promoted but old primary still running**: Split-brain. Use fencing (STONITH/Patroni). Never rely on application-level detection.

**Logical replication apply worker crash-looping**: Usually a unique constraint violation. Check subscriber logs. Fix conflicting row, then `ALTER SUBSCRIPTION ... ENABLE`.

**Timeline divergence after failover**: Old primary can't rejoin. Use `pg_rewind` (if `wal_log_hints=on`) or full `pg_basebackup`.
