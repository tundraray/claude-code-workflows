# JSONB Operations

## When to Use JSONB vs Relational Columns

**Use JSONB when**: Schema varies per row, you need schema-on-read, third-party payloads, feature flags, user preferences, event metadata.

**Use relational columns when**: You query/filter/join on the field frequently, the schema is stable, you need foreign keys or CHECK constraints on the value.

**When NOT to use JSONB**: High-frequency updates to individual keys (full rewrite semantics), storing large arrays (> 1000 elements -- use a junction table), data that needs referential integrity.

## JSONB Update Semantics -- Critical Understanding

```sql
-- EVERY jsonb_set / || / - operation reads the ENTIRE JSONB value,
-- modifies it in memory, and writes the ENTIRE value back.
-- There is no partial update.

-- For a 50KB JSONB document, updating one key:
UPDATE documents SET data = jsonb_set(data, '{status}', '"active"');
-- Reads 50KB, writes 50KB, generates 50KB of WAL.
-- On 1M rows: 50GB of I/O for changing a single key.

-- If you update a JSONB field frequently, extract it to a column:
ALTER TABLE documents ADD COLUMN status text
  GENERATED ALWAYS AS (data ->> 'status') STORED;
-- Now you can't UPDATE status directly, but queries are fast.
-- For mutable hot fields, use a real column instead.
```

## TOAST Implications

```sql
-- JSONB values > ~2KB are compressed and stored in TOAST (out-of-line storage).
-- Consequences:
-- 1. ANY update to a TOASTed value detoasts, modifies, re-toasts the whole thing
-- 2. Sequential scan on JSONB column is slow if values are large (many TOAST fetches)
-- 3. TOAST has its own table -- bloats independently, needs its own VACUUM

-- Check TOAST sizes:
SELECT
  c.relname AS table,
  pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
  pg_size_pretty(pg_relation_size(t.oid)) AS toast_size
FROM pg_class c
JOIN pg_class t ON t.oid = c.reltoastrelid
WHERE c.relkind = 'r' AND pg_relation_size(t.oid) > 0
ORDER BY pg_relation_size(t.oid) DESC;

-- If TOAST is bloated: VACUUM the main table (vacuums TOAST too by default)
-- Or for emergency: VACUUM (PROCESS_TOAST true, VERBOSE) documents;
```

## JSONB Operators -- Production Patterns

### Containment (@>) -- The Only GIN-Friendly Filter

```sql
-- @> is the ONLY operator that uses a standard GIN index efficiently
-- All other operators (->, ->>, #>>) require expression indexes

-- Multi-tenant document query:
SELECT * FROM documents
WHERE data @> '{"tenant_id": "acme", "status": "active"}';
-- With GIN index: ~2ms on 1M rows
-- Without index: ~500ms on 1M rows (full scan + detoast)

-- Nested containment:
SELECT * FROM documents
WHERE data @> '{"user": {"role": "admin"}}';
```

### Expression Extraction for Equality/Range

```sql
-- When you need =, <, >, BETWEEN on JSONB values, extract with B-tree index:
CREATE INDEX CONCURRENTLY idx_docs_created
  ON documents(((data ->> 'created_at')::timestamptz));

SELECT * FROM documents
WHERE (data ->> 'created_at')::timestamptz > NOW() - INTERVAL '1 day';
-- B-tree range scan, same speed as a regular column

-- Integer extraction:
CREATE INDEX CONCURRENTLY idx_docs_score
  ON documents(((data ->> 'score')::int));
```

## JSONB Indexing Strategies

### GIN: Default vs jsonb_path_ops

```sql
-- Default GIN: supports @>, ?, ?|, ?&
CREATE INDEX CONCURRENTLY idx_data_gin ON documents USING GIN(data);
-- Size: ~40% of table size for typical documents

-- jsonb_path_ops: supports ONLY @>, but ~30% smaller and faster
CREATE INDEX CONCURRENTLY idx_data_pathops
  ON documents USING GIN(data jsonb_path_ops);
-- Use when: you ONLY use @> containment queries
-- Do NOT use when: you need ? (key existence) or ?| / ?&

-- Trade-off comparison on 1M rows, avg 500 byte documents:
-- Default GIN:     ~150MB index, @> query ~2ms, ? query ~2ms
-- jsonb_path_ops:  ~105MB index, @> query ~1.5ms, ? query NOT SUPPORTED
```

### GIN on Specific Path

```sql
-- When you only query one nested path, index just that path:
CREATE INDEX CONCURRENTLY idx_data_user_gin
  ON documents USING GIN((data -> 'user'));
-- Much smaller than indexing entire document
-- Only helps queries: WHERE data -> 'user' @> '{"role": "admin"}'
-- Does NOT help: WHERE data @> '{"status": "active"}'
```

## Advanced Functions

### jsonb_to_recordset -- Array to Table Rows

```sql
-- Convert JSONB array to proper table rows for JOINs and aggregation
SELECT r.*
FROM documents d,
  jsonb_to_recordset(d.data -> 'line_items') AS r(
    product_id int,
    quantity int,
    price numeric
  );
-- Each array element becomes a row with typed columns
-- Use when: you need to JOIN JSONB array contents with other tables

-- Aggregate back:
SELECT d.id, SUM(r.price * r.quantity) AS total
FROM documents d,
  jsonb_to_recordset(d.data -> 'line_items') AS r(price numeric, quantity int)
GROUP BY d.id;
```

### jsonb_populate_record -- JSONB to Composite Type

```sql
-- Map JSONB to a table's row type (useful for validation/insertion)
CREATE TABLE users (id int, name text, email text);

SELECT (jsonb_populate_record(NULL::users,
  '{"id": 1, "name": "Alice", "email": "alice@example.com"}'::jsonb)).*;
-- Returns: id=1, name='Alice', email='alice@example.com'
-- Extra keys in JSONB are silently ignored
-- Missing keys become NULL
```

### jsonb_path_query (PG 12+) -- SQL/JSON Path

```sql
-- Flexible filtering inside JSONB arrays
SELECT jsonb_path_query_array(
  data,
  '$.items[*] ? (@.price > 100 && @.in_stock == true)'
) AS expensive_in_stock
FROM documents;

-- Exists check (returns boolean, can use in WHERE):
SELECT * FROM documents
WHERE jsonb_path_exists(data, '$.tags[*] ? (@ == "urgent")');

-- With variables:
SELECT * FROM documents
WHERE jsonb_path_exists(
  data,
  '$.items[*] ? (@.price > $min_price)',
  '{"min_price": 50}'::jsonb
);
```

## Performance Patterns

### Generated Columns for Hot Paths (PG 12+)

```sql
-- Extract frequently queried JSONB values as real columns
ALTER TABLE documents
  ADD COLUMN status text GENERATED ALWAYS AS (data ->> 'status') STORED;
ALTER TABLE documents
  ADD COLUMN tenant_id text GENERATED ALWAYS AS (data ->> 'tenant_id') STORED;

CREATE INDEX CONCURRENTLY idx_docs_status ON documents(status);
CREATE INDEX CONCURRENTLY idx_docs_tenant ON documents(tenant_id);
-- Now queries use B-tree on a real column -- fastest possible
-- Generated column updates automatically when data changes
-- Trade-off: storage overhead, INSERT/UPDATE slightly slower
```

### Partial GIN for Multi-Tenant

```sql
-- If 90% of queries are for active documents, index only those:
CREATE INDEX CONCURRENTLY idx_data_active_gin
  ON documents USING GIN(data jsonb_path_ops)
  WHERE (data ->> 'archived') IS DISTINCT FROM 'true';
-- 10x smaller index for 10% active data
```

## Failure Modes

**Symptom**: JSONB queries suddenly slow.
**Cause**: Table VACUUM not keeping up -- dead tuples force heap checks even on Index Only Scans. Or TOAST table bloated.
**Fix**: `VACUUM (VERBOSE) documents;` and check TOAST size.

**Symptom**: `jsonb_set` UPDATE takes 10x longer than expected.
**Cause**: Document grew past TOAST threshold. Every update now detoasts + retoasts.
**Fix**: Extract hot fields to columns. Keep JSONB documents < 2KB if updated frequently.

**Symptom**: GIN index build takes hours or OOMs.
**Cause**: `maintenance_work_mem` too low for large GIN build, or documents too large.
**Fix**: `SET maintenance_work_mem = '4GB';` before index creation. Consider `jsonb_path_ops` for smaller index.
