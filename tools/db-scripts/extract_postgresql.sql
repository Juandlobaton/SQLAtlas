-- ============================================================
-- SQLAtlas: PostgreSQL Extraction Scripts
-- Extract schemas, tables, columns, FKs, indexes, functions
-- ============================================================

-- 1. SCHEMAS
SELECT
    n.nspname AS schema_name,
    pg_catalog.pg_get_userbyid(n.nspowner) AS owner,
    pg_catalog.obj_description(n.oid) AS description,
    (SELECT COUNT(*) FROM pg_proc p WHERE p.pronamespace = n.oid AND p.prokind = 'f') AS function_count,
    (SELECT COUNT(*) FROM pg_proc p WHERE p.pronamespace = n.oid AND p.prokind = 'p') AS procedure_count,
    (SELECT COUNT(*) FROM pg_class c WHERE c.relnamespace = n.oid AND c.relkind = 'r') AS table_count,
    (SELECT COUNT(*) FROM pg_class c WHERE c.relnamespace = n.oid AND c.relkind = 'v') AS view_count,
    (SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid WHERE c.relnamespace = n.oid AND NOT t.tgisinternal) AS trigger_count,
    (SELECT COUNT(*) FROM pg_class c WHERE c.relnamespace = n.oid AND c.relkind = 'S') AS sequence_count,
    (SELECT COUNT(*) FROM pg_class c WHERE c.relnamespace = n.oid AND c.relkind = 'i') AS index_count
FROM pg_namespace n
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  AND n.nspname NOT LIKE 'pg_temp%'
ORDER BY n.nspname;

-- 2. TABLES with row counts and sizes
SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    n.nspname || '.' || c.relname AS full_name,
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized_view'
        WHEN 'f' THEN 'external'
    END AS table_type,
    c.reltuples::BIGINT AS estimated_row_count,
    pg_total_relation_size(c.oid) AS size_bytes,
    pg_catalog.obj_description(c.oid) AS description
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relkind IN ('r', 'v', 'm', 'f')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  AND n.nspname NOT LIKE 'pg_temp%'
ORDER BY n.nspname, c.relname;

-- 3. COLUMNS
SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    a.attname AS column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
    a.attnum AS ordinal_position,
    NOT a.attnotnull AS is_nullable,
    pg_get_expr(d.adbin, d.adrelid) AS default_value,
    CASE WHEN pk.contype = 'p' THEN TRUE ELSE FALSE END AS is_primary_key,
    CASE WHEN fk.contype = 'f' THEN TRUE ELSE FALSE END AS is_foreign_key,
    CASE WHEN a.atttypmod > 0 AND a.atttypid IN (1042, 1043) THEN a.atttypmod - 4 ELSE NULL END AS max_length,
    information_schema._pg_numeric_precision(a.atttypid, a.atttypmod) AS precision,
    information_schema._pg_numeric_scale(a.atttypid, a.atttypmod) AS scale,
    pg_catalog.col_description(c.oid, a.attnum) AS description
FROM pg_attribute a
JOIN pg_class c ON a.attrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
LEFT JOIN LATERAL (
    SELECT con.contype FROM pg_constraint con
    WHERE con.conrelid = c.oid AND con.contype = 'p' AND a.attnum = ANY(con.conkey)
    LIMIT 1
) pk ON TRUE
LEFT JOIN LATERAL (
    SELECT con.contype FROM pg_constraint con
    WHERE con.conrelid = c.oid AND con.contype = 'f' AND a.attnum = ANY(con.conkey)
    LIMIT 1
) fk ON TRUE
WHERE a.attnum > 0
  AND NOT a.attisdropped
  AND c.relkind IN ('r', 'v', 'm')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname, a.attnum;

-- 4. FOREIGN KEYS
SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    con.conname AS constraint_name,
    ARRAY(SELECT a.attname FROM pg_attribute a WHERE a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)) AS columns,
    fn.nspname || '.' || fc.relname AS referenced_table,
    ARRAY(SELECT a.attname FROM pg_attribute a WHERE a.attrelid = con.confrelid AND a.attnum = ANY(con.confkey)) AS referenced_columns,
    CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete,
    CASE con.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_update
FROM pg_constraint con
JOIN pg_class c ON con.conrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_class fc ON con.confrelid = fc.oid
JOIN pg_namespace fn ON fc.relnamespace = fn.oid
WHERE con.contype = 'f'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname, con.conname;

-- 5. INDEXES
SELECT
    n.nspname AS schema_name,
    t.relname AS table_name,
    i.relname AS index_name,
    ARRAY(
        SELECT a.attname FROM pg_attribute a
        WHERE a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
    ) AS columns,
    ix.indisunique AS is_unique,
    ix.indisprimary AS is_primary,
    am.amname AS index_type
FROM pg_index ix
JOIN pg_class i ON ix.indexrelid = i.oid
JOIN pg_class t ON ix.indrelid = t.oid
JOIN pg_namespace n ON t.relnamespace = n.oid
JOIN pg_am am ON i.relam = am.oid
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, t.relname, i.relname;

-- 6. FUNCTIONS & PROCEDURES
SELECT
    n.nspname AS schema_name,
    p.proname AS function_name,
    CASE p.prokind WHEN 'f' THEN 'function' WHEN 'p' THEN 'procedure' END AS object_type,
    pg_get_functiondef(p.oid) AS definition,
    l.lanname AS language,
    p.provolatile AS volatility,
    p.prosecdef AS security_definer,
    pg_catalog.obj_description(p.oid) AS description
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_language l ON p.prolang = l.oid
WHERE p.prokind IN ('f', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_%'
ORDER BY n.nspname, p.proname;
