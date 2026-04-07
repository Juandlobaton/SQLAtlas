-- ============================================================
-- SQLAtlas: SQL Server Extraction Scripts
-- ============================================================

-- 1. SCHEMAS
SELECT
    s.name AS schema_name,
    p.name AS owner,
    (SELECT COUNT(*) FROM sys.procedures p2 WHERE p2.schema_id = s.schema_id) AS procedure_count,
    (SELECT COUNT(*) FROM sys.objects o WHERE o.schema_id = s.schema_id AND o.type = 'FN') AS function_count,
    (SELECT COUNT(*) FROM sys.tables t WHERE t.schema_id = s.schema_id) AS table_count,
    (SELECT COUNT(*) FROM sys.views v WHERE v.schema_id = s.schema_id) AS view_count,
    (SELECT COUNT(*) FROM sys.triggers tr JOIN sys.objects o ON tr.parent_id = o.object_id WHERE o.schema_id = s.schema_id) AS trigger_count
FROM sys.schemas s
JOIN sys.database_principals p ON s.principal_id = p.principal_id
WHERE s.name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')
ORDER BY s.name;

-- 2. TABLES with sizes
SELECT
    s.name AS schema_name,
    t.name AS table_name,
    s.name + '.' + t.name AS full_name,
    'table' AS table_type,
    p.rows AS estimated_row_count,
    SUM(a.total_pages) * 8192 AS size_bytes
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.indexes i ON t.object_id = i.object_id AND i.index_id <= 1
JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
JOIN sys.allocation_units a ON p.partition_id = a.container_id
WHERE s.name NOT IN ('sys')
GROUP BY s.name, t.name, p.rows
ORDER BY s.name, t.name;

-- 3. COLUMNS
SELECT
    s.name AS schema_name,
    t.name AS table_name,
    c.name AS column_name,
    tp.name + CASE
        WHEN tp.name IN ('varchar','nvarchar','char','nchar') THEN '(' + CASE WHEN c.max_length = -1 THEN 'MAX' ELSE CAST(c.max_length AS VARCHAR) END + ')'
        WHEN tp.name IN ('decimal','numeric') THEN '(' + CAST(c.precision AS VARCHAR) + ',' + CAST(c.scale AS VARCHAR) + ')'
        ELSE ''
    END AS data_type,
    c.column_id AS ordinal_position,
    c.is_nullable,
    dc.definition AS default_value,
    CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key,
    CASE WHEN fk.parent_column_id IS NOT NULL THEN 1 ELSE 0 END AS is_foreign_key,
    c.max_length,
    c.precision,
    c.scale
FROM sys.columns c
JOIN sys.tables t ON c.object_id = t.object_id
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.types tp ON c.user_type_id = tp.user_type_id
LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
LEFT JOIN (
    SELECT ic.column_id, ic.object_id FROM sys.index_columns ic
    JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    WHERE i.is_primary_key = 1
) pk ON pk.object_id = c.object_id AND pk.column_id = c.column_id
LEFT JOIN sys.foreign_key_columns fk ON fk.parent_object_id = c.object_id AND fk.parent_column_id = c.column_id
ORDER BY s.name, t.name, c.column_id;

-- 4. STORED PROCEDURES & FUNCTIONS
SELECT
    s.name AS schema_name,
    o.name AS object_name,
    CASE o.type
        WHEN 'P' THEN 'procedure'
        WHEN 'FN' THEN 'function'
        WHEN 'IF' THEN 'function'
        WHEN 'TF' THEN 'function'
        WHEN 'TR' THEN 'trigger'
        WHEN 'V' THEN 'view'
    END AS object_type,
    m.definition,
    o.create_date AS created_at,
    o.modify_date AS modified_at
FROM sys.objects o
JOIN sys.schemas s ON o.schema_id = s.schema_id
JOIN sys.sql_modules m ON o.object_id = m.object_id
WHERE o.type IN ('P', 'FN', 'IF', 'TF', 'TR', 'V')
  AND s.name NOT IN ('sys')
  AND o.is_ms_shipped = 0
ORDER BY s.name, o.name;

-- 5. DEPENDENCIES (native)
SELECT
    OBJECT_SCHEMA_NAME(d.referencing_id) AS source_schema,
    OBJECT_NAME(d.referencing_id) AS source_name,
    d.referenced_schema_name AS target_schema,
    d.referenced_entity_name AS target_name,
    d.referenced_class_desc AS target_type,
    d.is_ambiguous
FROM sys.sql_expression_dependencies d
WHERE OBJECT_SCHEMA_NAME(d.referencing_id) NOT IN ('sys')
ORDER BY source_schema, source_name;
