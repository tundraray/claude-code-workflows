# Security

## Row-Level Security (RLS)

### Fundamentals

```sql
-- RLS restricts which rows a user can see/modify. Applied transparently to all queries.
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- USING clause: filters rows for SELECT, UPDATE (existing rows), DELETE
-- WITH CHECK clause: validates rows for INSERT, UPDATE (new row values)

-- If WITH CHECK is omitted, USING clause is used for both.
```

### Multi-Tenant Pattern

```sql
-- Tenant isolation using application-set session variable:
CREATE POLICY tenant_isolation ON documents
  USING (tenant_id = current_setting('app.tenant_id')::int)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::int);

-- Application sets before every transaction:
SET LOCAL app.tenant_id = '42';  -- SET LOCAL scopes to transaction

-- Apply to all operations:
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
-- FORCE applies RLS even to table owner. Without it, owner bypasses RLS.

-- Performance: RLS predicate is added to every query on this table.
-- With index on tenant_id, overhead is ~0.1ms per query.
-- Without index: full table scan every time. ALWAYS index the RLS column.
CREATE INDEX CONCURRENTLY idx_documents_tenant ON documents(tenant_id);
```

### Role-Based Access

```sql
-- Different policies for different roles:
CREATE POLICY admin_all ON documents
  TO admin_role USING (true);  -- Admins see everything

CREATE POLICY user_own ON documents
  TO app_user USING (owner_id = current_user_id())
  WITH CHECK (owner_id = current_user_id());

-- Multiple policies on same table: combined with OR (any matching policy allows access)
-- To combine with AND, use single policy with AND in USING clause.
```

### RLS Gotchas

```sql
-- 1. Superuser ALWAYS bypasses RLS. No exceptions.
-- 2. Table owner bypasses RLS unless FORCE ROW LEVEL SECURITY is set.
-- 3. pg_dump runs as superuser -- exports ALL rows regardless of RLS.
-- 4. COPY also bypasses RLS for superuser.

-- 5. Information leakage through error messages:
INSERT INTO documents (id, tenant_id, data) VALUES (1, 42, '{}');
-- If id=1 exists in another tenant: "duplicate key value violates unique constraint"
-- Attacker now knows id=1 exists. Use UUIDs to mitigate.

-- 6. Side-channel via execution time:
-- EXISTS subquery against RLS-protected table may leak row existence
-- through timing differences. Not exploitable in most real applications.

-- 7. Leaky functions: a function in WHERE clause called BEFORE RLS filter
-- can see all rows. Mark functions as LEAKPROOF only if they truly are:
CREATE FUNCTION safe_compare(a text, b text) RETURNS boolean
  LANGUAGE sql LEAKPROOF
  AS $$ SELECT a = b $$;
-- PG evaluates LEAKPROOF functions before non-leakproof, but after RLS.
-- Non-LEAKPROOF functions in WHERE with RLS: PG adds a security barrier subquery.
```

### RLS Performance

```sql
-- RLS adds a qual (filter) to every query. Impact depends on:
-- 1. Whether the RLS column is indexed (critical)
-- 2. Complexity of the USING expression
-- 3. Whether the expression is stable/immutable

-- Benchmark (1M rows, B-tree on tenant_id):
-- Without RLS: SELECT count(*) = 3.2ms
-- With RLS (current_setting):  = 3.4ms (+0.2ms, negligible)
-- With RLS (subquery in USING): = 8.1ms (subquery re-evaluated per row group)

-- Rule: keep USING expressions simple. current_setting() or current_user are fast.
-- Avoid subqueries in USING. If needed, use a function marked STABLE.
```

## Column-Level Permissions

```sql
-- Grant SELECT on specific columns only:
GRANT SELECT (id, name, email) ON users TO app_readonly;
-- User can: SELECT id, name, email FROM users
-- User cannot: SELECT * FROM users (includes salary, ssn, etc.)

-- Column-level vs RLS vs Views:
-- Column-level: hide specific columns from specific roles. Simple. No row filtering.
-- RLS: hide specific rows. Per-row granularity. More complex.
-- Views: hide columns AND rows, but must use SECURITY DEFINER or SECURITY INVOKER carefully.

-- When to use column-level: different teams need different column visibility.
-- When to use RLS: multi-tenant, data ownership.
-- When to use views: complex access patterns, backward compatibility.

-- SECURITY DEFINER views (runs with view owner's permissions):
CREATE VIEW public_users WITH (security_barrier = true) AS
  SELECT id, name, email FROM users WHERE active = true;
-- security_barrier prevents optimizer from pushing user-supplied quals
-- past the view's WHERE clause (prevents information leakage).
```

## pg_hba.conf -- Connection Authentication

```
# TYPE  DATABASE  USER      ADDRESS           METHOD

# Local socket connections (Unix domain socket):
local   all       postgres                    peer
# 'peer' checks OS username matches PG username. Secure for local admin.

# Loopback IPv4:
host    all       all       127.0.0.1/32      scram-sha-256

# Application subnet:
host    mydb      app_user  10.0.1.0/24       scram-sha-256

# Replication (specific subnet):
host    replication replicator 10.0.2.0/24    scram-sha-256

# SSL-required connections:
hostssl mydb      all       0.0.0.0/0         scram-sha-256

# Client certificate authentication:
hostssl mydb      all       0.0.0.0/0         cert
# Requires: ssl_ca_file set to CA that signed client certs

# LDAP authentication:
host    mydb      all       10.0.0.0/8        ldap
  ldapserver=ldap.company.com ldapbasedn="dc=company,dc=com" ldapsearchattribute=uid

# Rules evaluated top-to-bottom. First match wins.
# CRITICAL: put restrictive rules BEFORE permissive rules.
# A rule with ADDRESS 0.0.0.0/0 at the top allows everything.

# Reject all other connections (safety net, should be last):
host    all       all       0.0.0.0/0         reject
```

```sql
-- Reload pg_hba.conf without restart:
SELECT pg_reload_conf();
-- Or: pg_ctl reload

-- Test authentication without connecting (PG 14+):
-- No built-in tool, but you can check pg_hba_file_rules:
SELECT * FROM pg_hba_file_rules;
-- Shows parsed rules with line numbers. Check for errors.
```

## SSL/TLS Configuration

```sql
-- postgresql.conf:
ssl = on
ssl_cert_file = '/etc/postgresql/server.crt'
ssl_key_file = '/etc/postgresql/server.key'     -- Permissions: 0600, owned by postgres
ssl_ca_file = '/etc/postgresql/root.ca'          -- For client cert verification
ssl_min_protocol_version = 'TLSv1.2'            -- PG 12+: reject TLS 1.0/1.1
ssl_ciphers = 'HIGH:!aNULL:!MD5'                -- Reject weak ciphers

-- Client certificate authentication (mutual TLS):
-- pg_hba.conf:
hostssl mydb all 0.0.0.0/0 cert clientcert=verify-full
-- verify-full: client must present cert signed by ssl_ca_file, CN must match username

-- Check current SSL status:
SELECT datname, usename, ssl, ssl_version, ssl_cipher, client_addr
FROM pg_stat_ssl JOIN pg_stat_activity USING (pid)
WHERE ssl = true;

-- Certificate rotation:
-- 1. Place new cert/key files
-- 2. SELECT pg_reload_conf();  -- No restart needed, new connections use new cert
-- 3. Existing connections continue with old cert until they reconnect

-- Force all connections to use SSL:
-- pg_hba.conf: use 'hostssl' instead of 'host' for all entries
-- Reject non-SSL: hostnossl all all 0.0.0.0/0 reject
```

## SCRAM-SHA-256 Authentication (PG 10+, Default PG 14+)

```sql
-- SCRAM-SHA-256 is secure password authentication. Replaces md5.
-- postgresql.conf:
password_encryption = 'scram-sha-256'  -- Default in PG 14+

-- Migrate from md5 to SCRAM:
-- 1. Set password_encryption = 'scram-sha-256'
-- 2. Reset passwords for all users:
ALTER USER app_user WITH PASSWORD 'new_password';
-- 3. Update pg_hba.conf: change 'md5' to 'scram-sha-256'
-- 4. Reload: SELECT pg_reload_conf();

-- Check which users still have md5 passwords:
SELECT rolname, rolpassword ~ '^SCRAM-SHA-256' AS is_scram
FROM pg_authid WHERE rolcanlogin;
-- Users with is_scram=false need password reset.

-- SCRAM vs md5:
-- md5: password hash is md5(password+username). Can be cracked offline.
-- SCRAM: salted, iterated hash with server+client nonces. Resistant to replay.
-- SCRAM also protects password during transmission (channel binding in PG 11+).
```

## Role Hierarchy

```sql
-- Create role hierarchy:
CREATE ROLE readonly;
CREATE ROLE readwrite;
CREATE ROLE admin;

GRANT readonly TO readwrite;     -- readwrite inherits readonly's permissions
GRANT readwrite TO admin;        -- admin inherits both

GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO readwrite;

-- Application users:
CREATE USER app_reader WITH LOGIN PASSWORD 'pass' IN ROLE readonly;
CREATE USER app_writer WITH LOGIN PASSWORD 'pass' IN ROLE readwrite;

-- SET ROLE: temporarily assume another role's permissions
SET ROLE readonly;  -- Drop to readonly permissions for this session
RESET ROLE;         -- Revert to original role

-- SECURITY DEFINER vs INVOKER functions:
CREATE FUNCTION get_user_data(uid int) RETURNS TABLE(...) AS $$
  SELECT * FROM users WHERE id = uid;
$$ LANGUAGE sql SECURITY DEFINER;
-- DEFINER: runs with function owner's permissions. Like setuid.
-- INVOKER (default): runs with caller's permissions.
-- DANGER: SECURITY DEFINER with RLS can bypass RLS.
-- Always add: SET search_path = public in SECURITY DEFINER functions
-- to prevent search_path hijacking.

CREATE FUNCTION safe_func() RETURNS void AS $$
  ...
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

## pg_audit -- Audit Logging

```sql
-- postgresql.conf (requires restart for shared_preload):
shared_preload_libraries = 'pgaudit'

CREATE EXTENSION IF NOT EXISTS pgaudit;

-- Session-level logging (logs all statements matching classes):
pgaudit.log = 'ddl, write'
-- Classes: read, write, function, role, ddl, misc, all
-- 'ddl, write' captures schema changes and data modifications

-- Object-level logging (fine-grained, per-role):
pgaudit.role = 'auditor'
GRANT SELECT ON users TO auditor;
-- Now any SELECT on users table is logged, regardless of who runs it

-- Per-role override:
ALTER ROLE app_admin SET pgaudit.log = 'all';
-- Logs everything app_admin does, but not other roles

-- Output goes to PostgreSQL log (stderr/syslog/csvlog):
-- AUDIT: SESSION,1,1,DDL,CREATE TABLE,,,"CREATE TABLE test (id int)",<none>

-- Performance: ~2-5% overhead for session logging on write-heavy workloads.
-- Object-level logging has negligible overhead (only triggers on granted operations).

-- When NOT to use: logging SELECT on high-throughput read tables (log volume explodes).
-- For high-volume: log only DDL and WRITE. Use application-level audit for reads.
```

## Failure Modes

**Symptom**: User can see all rows despite RLS being enabled.
**Cause**: User is table owner and `FORCE ROW LEVEL SECURITY` was not set. Or user is superuser.
**Fix**: `ALTER TABLE t FORCE ROW LEVEL SECURITY;` and never use superuser for application access.

**Symptom**: RLS policy using `current_setting('app.tenant_id')` returns NULL, showing no rows.
**Cause**: Application didn't SET the session variable before the query.
**Fix**: Add `ON_ERROR_USE_DEFAULT` parameter or a default: `current_setting('app.tenant_id', true)` returns NULL instead of error. Ensure your policy handles NULL safely (e.g., `USING (false)` when no tenant is set).

**Symptom**: SSL connection rejected with "no pg_hba.conf entry."
**Cause**: Only `hostssl` rules exist but client isn't using SSL, or client IP doesn't match any rule.
**Fix**: Check `pg_hba_file_rules` for rule order. Ensure client uses `sslmode=require` or higher.

**Symptom**: After PG upgrade, all connections fail with "authentication method not supported."
**Cause**: PG 14+ defaults to SCRAM-SHA-256 but clients/drivers don't support it, or passwords are still md5-hashed.
**Fix**: Update client drivers (libpq 10+), or temporarily set `password_encryption = 'md5'` and `md5` in pg_hba.conf while migrating.
