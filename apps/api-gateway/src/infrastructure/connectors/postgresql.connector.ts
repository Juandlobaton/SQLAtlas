import { Pool } from 'pg';
import {
  IDbConnector,
  ConnectionConfig,
  ConnectionTestResult,
  ExtractedObject,
  ExtractedTableMetadata,
} from '../../application/ports/db-connector.port';

export class PostgreSqlConnector implements IDbConnector {
  async testConnection(config: ConnectionConfig): Promise<ConnectionTestResult> {
    const pool = this.createPool(config);
    const start = Date.now();

    try {
      const versionResult = await pool.query('SELECT version()');
      const latencyMs = Date.now() - start;

      const countsResult = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
           WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prokind = 'p')::int AS procedures,
          (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
           WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prokind = 'f')::int AS functions,
          (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
           WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') AND c.relkind = 'r')::int AS tables,
          (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
           WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') AND c.relkind = 'v')::int AS views,
          (SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid
           JOIN pg_namespace n ON c.relnamespace = n.oid
           WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND NOT t.tgisinternal)::int AS triggers
      `);

      const counts = countsResult.rows[0];

      return {
        success: true,
        latencyMs,
        serverVersion: versionResult.rows[0].version,
        objectCounts: {
          procedures: counts.procedures,
          functions: counts.functions,
          triggers: counts.triggers,
          views: counts.views,
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        errorMessage: err instanceof Error ? err.message : 'Connection failed',
      };
    } finally {
      await pool.end();
    }
  }

  async extractProcedures(config: ConnectionConfig, schemas?: string[]): Promise<ExtractedObject[]> {
    const pool = this.createPool(config);

    try {
      let schemaFilter = "n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_%'";
      const params: string[] = [];

      if (schemas && schemas.length > 0) {
        const placeholders = schemas.map((_, i) => `$${i + 1}`).join(', ');
        schemaFilter = `n.nspname IN (${placeholders})`;
        params.push(...schemas);
      }

      const result = await pool.query(
        `SELECT
          n.nspname AS schema_name,
          p.proname AS function_name,
          CASE p.prokind WHEN 'f' THEN 'function' WHEN 'p' THEN 'procedure' END AS object_type,
          pg_get_functiondef(p.oid) AS definition,
          l.lanname AS language
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        JOIN pg_language l ON p.prolang = l.oid
        WHERE p.prokind IN ('f', 'p')
          AND ${schemaFilter}
          AND pg_get_functiondef(p.oid) IS NOT NULL
        ORDER BY n.nspname, p.proname`,
        params,
      );

      const objects: ExtractedObject[] = result.rows.map((row) => ({
        objectType: row.object_type,
        schemaName: row.schema_name,
        objectName: row.function_name,
        definition: row.definition,
      }));

      // Also extract triggers with their function bodies
      const triggerSchemaFilter = schemas && schemas.length > 0
        ? `n.nspname IN (${schemas.map((_, i) => `$${i + 1}`).join(', ')})`
        : "n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_%'";

      const triggerResult = await pool.query(
        `SELECT
          n.nspname AS schema_name,
          t.tgname AS trigger_name,
          c.relname AS table_name,
          pg_get_triggerdef(t.oid, true) AS definition
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE NOT t.tgisinternal
          AND ${triggerSchemaFilter}
        ORDER BY n.nspname, t.tgname`,
        schemas && schemas.length > 0 ? schemas : [],
      );

      for (const row of triggerResult.rows) {
        objects.push({
          objectType: 'trigger',
          schemaName: row.schema_name,
          objectName: row.trigger_name,
          definition: row.definition || `-- Trigger ${row.trigger_name} on ${row.table_name}`,
        });
      }

      return objects;
    } finally {
      await pool.end();
    }
  }

  async extractTableMetadata(config: ConnectionConfig, schemas?: string[]): Promise<ExtractedTableMetadata[]> {
    const pool = this.createPool(config);

    try {
      const excludeSchemas = "('pg_catalog','information_schema')";
      let schemaFilter = `n.nspname NOT IN ${excludeSchemas} AND n.nspname NOT LIKE 'pg_%'`;
      const params: string[] = [];
      if (schemas && schemas.length > 0) {
        const placeholders = schemas.map((_, i) => `$${i + 1}`).join(', ');
        schemaFilter = `n.nspname IN (${placeholders})`;
        params.push(...schemas);
      }

      // Columns with table type
      const colResult = await pool.query(`
        SELECT n.nspname AS schema_name, c.relname AS table_name,
          CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view' END AS table_type,
          a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS data_type,
          a.attnum AS ordinal, NOT a.attnotnull AS is_nullable,
          pg_get_expr(d.adbin, d.adrelid) AS default_value,
          CASE WHEN a.atttypmod > 0 AND format_type(a.atttypid, a.atttypmod) LIKE '%char%' THEN a.atttypmod - 4 ELSE NULL END AS max_length,
          CASE WHEN a.atttypid IN (1700) THEN ((a.atttypmod - 4) >> 16) & 65535 ELSE NULL END AS precision,
          CASE WHEN a.atttypid IN (1700) THEN (a.atttypmod - 4) & 65535 ELSE NULL END AS scale
        FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        JOIN pg_attribute a ON c.oid = a.attrelid
        LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        WHERE c.relkind IN ('r','v','m') AND a.attnum > 0 AND NOT a.attisdropped
          AND ${schemaFilter}
        ORDER BY n.nspname, c.relname, a.attnum
      `, params);

      // Primary keys
      const pkResult = await pool.query(`
        SELECT n.nspname AS schema_name, c.relname AS table_name, a.attname AS column_name
        FROM pg_constraint con
        JOIN pg_class c ON con.conrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(con.conkey)
        WHERE con.contype = 'p' AND ${schemaFilter}
        ORDER BY n.nspname, c.relname, array_position(con.conkey, a.attnum)
      `, params);

      // Foreign keys
      const fkResult = await pool.query(`
        SELECT n.nspname AS schema_name, c.relname AS table_name,
          con.conname AS constraint_name,
          a.attname AS column_name,
          rn.nspname AS ref_schema, rc.relname AS ref_table,
          ra.attname AS ref_column,
          CASE con.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' WHEN 'r' THEN 'RESTRICT' ELSE 'NO ACTION' END AS on_delete,
          CASE con.confupdtype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' WHEN 'r' THEN 'RESTRICT' ELSE 'NO ACTION' END AS on_update
        FROM pg_constraint con
        JOIN pg_class c ON con.conrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        JOIN pg_class rc ON con.confrelid = rc.oid
        JOIN pg_namespace rn ON rc.relnamespace = rn.oid
        JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ck.attnum
        JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS fk(attnum, ord) ON fk.ord = ck.ord
        JOIN pg_attribute ra ON ra.attrelid = rc.oid AND ra.attnum = fk.attnum
        WHERE con.contype = 'f' AND ${schemaFilter}
        ORDER BY n.nspname, c.relname, con.conname, ck.ord
      `, params);

      // Indexes
      const idxResult = await pool.query(`
        SELECT n.nspname AS schema_name, t.relname AS table_name,
          ic.relname AS index_name, a.attname AS column_name,
          i.indisunique AS is_unique, i.indisprimary AS is_primary,
          am.amname AS index_type
        FROM pg_index i
        JOIN pg_class ic ON i.indexrelid = ic.oid
        JOIN pg_class t ON i.indrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        JOIN pg_am am ON ic.relam = am.oid
        JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS idx(attnum, ord) ON true
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = idx.attnum
        WHERE ${schemaFilter} AND t.relkind = 'r'
        ORDER BY n.nspname, t.relname, ic.relname, idx.ord
      `, params);

      // Row estimates
      const rowResult = await pool.query(`
        SELECT n.nspname AS schema_name, c.relname AS table_name,
          c.reltuples::bigint AS row_count
        FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'r' AND ${schemaFilter}
      `, params);

      return this.assembleMetadata(colResult.rows, pkResult.rows, fkResult.rows, idxResult.rows, rowResult.rows);
    } finally {
      await pool.end();
    }
  }

  private assembleMetadata(columns: any[], pks: any[], fks: any[], indexes: any[], rowCounts: any[]): ExtractedTableMetadata[] {
    const tables = new Map<string, ExtractedTableMetadata>();
    const key = (s: string, t: string) => `${s}.${t}`;

    for (const row of columns) {
      const k = key(row.schema_name, row.table_name);
      if (!tables.has(k)) {
        tables.set(k, {
          schemaName: row.schema_name, tableName: row.table_name,
          tableType: row.table_type, estimatedRowCount: null,
          columns: [], primaryKey: [], foreignKeys: [], indexes: [],
        });
      }
      tables.get(k)!.columns.push({
        columnName: row.column_name, dataType: row.data_type,
        ordinalPosition: row.ordinal, isNullable: row.is_nullable,
        defaultValue: row.default_value, maxLength: row.max_length,
        precision: row.precision, scale: row.scale,
      });
    }

    for (const row of pks) {
      const t = tables.get(key(row.schema_name, row.table_name));
      if (t) t.primaryKey.push(row.column_name);
    }

    const fkGroups = new Map<string, { meta: any; cols: string[]; refCols: string[] }>();
    for (const row of fks) {
      const gk = `${row.schema_name}.${row.table_name}.${row.constraint_name}`;
      if (!fkGroups.has(gk)) fkGroups.set(gk, { meta: row, cols: [], refCols: [] });
      fkGroups.get(gk)!.cols.push(row.column_name);
      fkGroups.get(gk)!.refCols.push(row.ref_column);
    }
    for (const [, g] of fkGroups) {
      const t = tables.get(key(g.meta.schema_name, g.meta.table_name));
      if (t) {
        t.foreignKeys.push({
          constraintName: g.meta.constraint_name, columns: g.cols,
          referencedSchema: g.meta.ref_schema, referencedTable: g.meta.ref_table,
          referencedColumns: g.refCols, onDelete: g.meta.on_delete, onUpdate: g.meta.on_update,
        });
      }
    }

    const idxGroups = new Map<string, { meta: any; cols: string[] }>();
    for (const row of indexes) {
      const gk = `${row.schema_name}.${row.table_name}.${row.index_name}`;
      if (!idxGroups.has(gk)) idxGroups.set(gk, { meta: row, cols: [] });
      idxGroups.get(gk)!.cols.push(row.column_name);
    }
    for (const [, g] of idxGroups) {
      const t = tables.get(key(g.meta.schema_name, g.meta.table_name));
      if (t) {
        t.indexes.push({
          indexName: g.meta.index_name, columns: g.cols,
          isUnique: g.meta.is_unique, isPrimary: g.meta.is_primary,
          indexType: g.meta.index_type,
        });
      }
    }

    for (const row of rowCounts) {
      const t = tables.get(key(row.schema_name, row.table_name));
      if (t) t.estimatedRowCount = row.row_count;
    }

    for (const t of tables.values()) {
      const pkSet = new Set(t.primaryKey);
      const fkCols = new Set(t.foreignKeys.flatMap(fk => fk.columns));
      for (const col of t.columns) {
        (col as any).isPrimaryKey = pkSet.has(col.columnName);
        (col as any).isForeignKey = fkCols.has(col.columnName);
      }
    }

    return Array.from(tables.values());
  }

  async getServerVersion(config: ConnectionConfig): Promise<string> {
    const pool = this.createPool(config);
    try {
      const result = await pool.query('SELECT version()');
      return result.rows[0].version;
    } finally {
      await pool.end();
    }
  }

  private createPool(config: ConnectionConfig): Pool {
    return new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.useSsl ? { rejectUnauthorized: true } : false,
      connectionTimeoutMillis: 10000,
      max: 3,
    });
  }
}
