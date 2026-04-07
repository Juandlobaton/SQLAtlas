-- ============================================================
-- SQLAtlas: Oracle PL/SQL Extraction Scripts
-- ============================================================

-- 1. SCHEMAS (users with objects)
SELECT
    u.username AS schema_name,
    (SELECT COUNT(*) FROM all_procedures p WHERE p.owner = u.username AND p.object_type = 'PROCEDURE') AS procedure_count,
    (SELECT COUNT(*) FROM all_procedures p WHERE p.owner = u.username AND p.object_type = 'FUNCTION') AS function_count,
    (SELECT COUNT(*) FROM all_tables t WHERE t.owner = u.username) AS table_count,
    (SELECT COUNT(*) FROM all_views v WHERE v.owner = u.username) AS view_count,
    (SELECT COUNT(*) FROM all_triggers tr WHERE tr.owner = u.username) AS trigger_count
FROM all_users u
WHERE u.username NOT IN ('SYS','SYSTEM','DBSNMP','OUTLN','MDSYS','CTXSYS','XDB','WMSYS','ORDDATA','ORDSYS')
  AND EXISTS (SELECT 1 FROM all_objects o WHERE o.owner = u.username)
ORDER BY u.username;

-- 2. TABLES
SELECT
    t.owner AS schema_name,
    t.table_name,
    t.owner || '.' || t.table_name AS full_name,
    'table' AS table_type,
    t.num_rows AS estimated_row_count,
    s.bytes AS size_bytes
FROM all_tables t
LEFT JOIN dba_segments s ON t.owner = s.owner AND t.table_name = s.segment_name AND s.segment_type = 'TABLE'
WHERE t.owner NOT IN ('SYS','SYSTEM','DBSNMP','OUTLN','MDSYS','CTXSYS','XDB')
ORDER BY t.owner, t.table_name;

-- 3. COLUMNS
SELECT
    c.owner AS schema_name,
    c.table_name,
    c.column_name,
    c.data_type || CASE
        WHEN c.data_type IN ('VARCHAR2','CHAR','NVARCHAR2') THEN '(' || c.data_length || ')'
        WHEN c.data_type = 'NUMBER' AND c.data_precision IS NOT NULL THEN '(' || c.data_precision || ',' || c.data_scale || ')'
        ELSE ''
    END AS data_type,
    c.column_id AS ordinal_position,
    CASE c.nullable WHEN 'Y' THEN 1 ELSE 0 END AS is_nullable,
    c.data_default AS default_value,
    c.data_length AS max_length,
    c.data_precision AS precision,
    c.data_scale AS scale
FROM all_tab_columns c
WHERE c.owner NOT IN ('SYS','SYSTEM','DBSNMP','OUTLN','MDSYS','CTXSYS','XDB')
ORDER BY c.owner, c.table_name, c.column_id;

-- 4. FUNCTIONS & PROCEDURES (source code)
SELECT
    s.owner AS schema_name,
    s.name AS object_name,
    s.type AS object_type,
    LISTAGG(s.text, '') WITHIN GROUP (ORDER BY s.line) AS definition
FROM all_source s
WHERE s.owner NOT IN ('SYS','SYSTEM','DBSNMP','OUTLN','MDSYS','CTXSYS','XDB')
  AND s.type IN ('PROCEDURE', 'FUNCTION', 'TRIGGER', 'PACKAGE', 'PACKAGE BODY')
GROUP BY s.owner, s.name, s.type
ORDER BY s.owner, s.name;

-- 5. DEPENDENCIES (native)
SELECT
    d.owner AS source_schema,
    d.name AS source_name,
    d.type AS source_type,
    d.referenced_owner AS target_schema,
    d.referenced_name AS target_name,
    d.referenced_type AS target_type,
    d.dependency_type
FROM all_dependencies d
WHERE d.owner NOT IN ('SYS','SYSTEM','DBSNMP','OUTLN','MDSYS','CTXSYS','XDB')
ORDER BY d.owner, d.name;
