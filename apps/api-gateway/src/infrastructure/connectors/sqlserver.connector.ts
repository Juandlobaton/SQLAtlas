import {
  IDbConnector,
  ConnectionConfig,
  ConnectionTestResult,
  ExtractedObject,
  ExtractedTableMetadata,
  ExtractedColumn,
  ExtractedForeignKey,
  ExtractedIndex,
} from '../../application/ports/db-connector.port';

export class SqlServerConnector implements IDbConnector {
  async testConnection(config: ConnectionConfig): Promise<ConnectionTestResult> {
    const start = Date.now();

    try {
      const sql = await this.loadDriver();
      const pool = await this.connect(sql, config);

      const versionResult = await pool.request().query('SELECT @@VERSION AS version');
      const latencyMs = Date.now() - start;

      const countsResult = await pool.request().query(`
        SELECT
          (SELECT COUNT(*) FROM sys.procedures WHERE is_ms_shipped = 0) AS procedures,
          (SELECT COUNT(*) FROM sys.objects WHERE type IN ('FN','IF','TF') AND is_ms_shipped = 0) AS functions,
          (SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped = 0) AS tables,
          (SELECT COUNT(*) FROM sys.views WHERE is_ms_shipped = 0) AS views,
          (SELECT COUNT(*) FROM sys.triggers WHERE is_ms_shipped = 0) AS triggers
      `);

      const counts = countsResult.recordset[0];
      await pool.close();

      return {
        success: true,
        latencyMs,
        serverVersion: versionResult.recordset[0].version,
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
    }
  }

  async extractProcedures(config: ConnectionConfig, schemas?: string[]): Promise<ExtractedObject[]> {
    const sql = await this.loadDriver();
    const pool = await this.connect(sql, config);

    try {
      const request = pool.request();
      let schemaFilter = "s.name NOT IN ('sys')";

      if (schemas && schemas.length > 0) {
        schemas.forEach((s, i) => {
          request.input(`schema${i}`, sql.VarChar, s);
        });
        const placeholders = schemas.map((_, i) => `@schema${i}`).join(',');
        schemaFilter = `s.name IN (${placeholders})`;
      }

      const result = await request.query(`
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
          AND ${schemaFilter}
          AND o.is_ms_shipped = 0
        ORDER BY s.name, o.name
      `);

      await pool.close();

      return result.recordset
        .filter((row: any) => row.definition)
        .map((row: any) => ({
          objectType: row.object_type,
          schemaName: row.schema_name,
          objectName: row.object_name,
          definition: row.definition,
          createdAt: row.created_at,
          modifiedAt: row.modified_at,
        }));
    } catch (err) {
      await pool.close();
      throw err;
    }
  }

  async extractTableMetadata(config: ConnectionConfig, schemas?: string[]): Promise<ExtractedTableMetadata[]> {
    const sql = await this.loadDriver();
    const pool = await this.connect(sql, config);

    try {
      const request = pool.request();
      let schemaFilter = "s.name NOT IN ('sys','INFORMATION_SCHEMA')";
      if (schemas && schemas.length > 0) {
        schemas.forEach((s, i) => request.input(`s${i}`, sql.VarChar, s));
        schemaFilter = `s.name IN (${schemas.map((_, i) => `@s${i}`).join(',')})`;
      }

      // Columns
      const colResult = await request.query(`
        SELECT s.name AS schema_name, t.name AS table_name,
          CASE WHEN t.type = 'V' THEN 'view' ELSE 'table' END AS table_type,
          c.name AS column_name, tp.name AS data_type, c.column_id AS ordinal,
          c.is_nullable, OBJECT_DEFINITION(c.default_object_id) AS default_value,
          c.max_length, c.precision, c.scale
        FROM sys.columns c
        JOIN sys.objects t ON c.object_id = t.object_id
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        JOIN sys.types tp ON c.user_type_id = tp.user_type_id
        WHERE t.type IN ('U','V') AND t.is_ms_shipped = 0 AND ${schemaFilter}
        ORDER BY s.name, t.name, c.column_id
      `);

      // Primary keys
      const pkResult = await pool.request().query(`
        SELECT s.name AS schema_name, t.name AS table_name, c.name AS column_name
        FROM sys.index_columns ic
        JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        JOIN sys.objects t ON i.object_id = t.object_id
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE i.is_primary_key = 1 AND t.is_ms_shipped = 0
        ORDER BY s.name, t.name, ic.key_ordinal
      `);

      // Foreign keys
      const fkResult = await pool.request().query(`
        SELECT s.name AS schema_name, t.name AS table_name,
          fk.name AS constraint_name,
          COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS column_name,
          rs.name AS ref_schema, rt.name AS ref_table,
          COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS ref_column,
          fk.delete_referential_action_desc AS on_delete,
          fk.update_referential_action_desc AS on_update
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
        JOIN sys.objects t ON fk.parent_object_id = t.object_id
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        JOIN sys.objects rt ON fk.referenced_object_id = rt.object_id
        JOIN sys.schemas rs ON rt.schema_id = rs.schema_id
        WHERE t.is_ms_shipped = 0
        ORDER BY s.name, t.name, fk.name, fkc.constraint_column_id
      `);

      // Indexes
      const idxResult = await pool.request().query(`
        SELECT s.name AS schema_name, t.name AS table_name,
          i.name AS index_name, c.name AS column_name,
          i.is_unique, i.is_primary_key, i.type_desc AS index_type
        FROM sys.indexes i
        JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        JOIN sys.objects t ON i.object_id = t.object_id
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE t.type = 'U' AND t.is_ms_shipped = 0 AND i.name IS NOT NULL
        ORDER BY s.name, t.name, i.name, ic.key_ordinal
      `);

      // Row counts
      const rowCountResult = await pool.request().query(`
        SELECT s.name AS schema_name, t.name AS table_name,
          SUM(p.rows) AS row_count
        FROM sys.tables t
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
        WHERE t.is_ms_shipped = 0
        GROUP BY s.name, t.name
      `);

      await pool.close();
      return this.assembleMetadata(colResult.recordset, pkResult.recordset, fkResult.recordset, idxResult.recordset, rowCountResult.recordset);
    } catch (err) {
      await pool.close();
      throw err;
    }
  }

  private assembleMetadata(columns: any[], pks: any[], fks: any[], indexes: any[], rowCounts: any[]): ExtractedTableMetadata[] {
    const tables = new Map<string, ExtractedTableMetadata>();

    const key = (s: string, t: string) => `${s}.${t}`;

    // Build tables from columns
    for (const row of columns) {
      const k = key(row.schema_name, row.table_name);
      if (!tables.has(k)) {
        tables.set(k, {
          schemaName: row.schema_name,
          tableName: row.table_name,
          tableType: row.table_type,
          estimatedRowCount: null,
          columns: [],
          primaryKey: [],
          foreignKeys: [],
          indexes: [],
        });
      }
      tables.get(k)!.columns.push({
        columnName: row.column_name,
        dataType: row.data_type,
        ordinalPosition: row.ordinal,
        isNullable: row.is_nullable,
        defaultValue: row.default_value,
        maxLength: row.max_length,
        precision: row.precision,
        scale: row.scale,
      });
    }

    // PKs
    for (const row of pks) {
      const t = tables.get(key(row.schema_name, row.table_name));
      if (t) t.primaryKey.push(row.column_name);
    }

    // FKs — group by constraint name
    const fkGroups = new Map<string, { meta: any; cols: string[]; refCols: string[] }>();
    for (const row of fks) {
      const gk = `${row.schema_name}.${row.table_name}.${row.constraint_name}`;
      if (!fkGroups.has(gk)) {
        fkGroups.set(gk, { meta: row, cols: [], refCols: [] });
      }
      fkGroups.get(gk)!.cols.push(row.column_name);
      fkGroups.get(gk)!.refCols.push(row.ref_column);
    }
    for (const [, g] of fkGroups) {
      const t = tables.get(key(g.meta.schema_name, g.meta.table_name));
      if (t) {
        t.foreignKeys.push({
          constraintName: g.meta.constraint_name,
          columns: g.cols,
          referencedSchema: g.meta.ref_schema,
          referencedTable: g.meta.ref_table,
          referencedColumns: g.refCols,
          onDelete: g.meta.on_delete,
          onUpdate: g.meta.on_update,
        });
      }
    }

    // Indexes — group by index name
    const idxGroups = new Map<string, { meta: any; cols: string[] }>();
    for (const row of indexes) {
      const gk = `${row.schema_name}.${row.table_name}.${row.index_name}`;
      if (!idxGroups.has(gk)) {
        idxGroups.set(gk, { meta: row, cols: [] });
      }
      idxGroups.get(gk)!.cols.push(row.column_name);
    }
    for (const [, g] of idxGroups) {
      const t = tables.get(key(g.meta.schema_name, g.meta.table_name));
      if (t) {
        t.indexes.push({
          indexName: g.meta.index_name,
          columns: g.cols,
          isUnique: g.meta.is_unique,
          isPrimary: g.meta.is_primary_key,
          indexType: g.meta.index_type,
        });
      }
    }

    // Row counts
    for (const row of rowCounts) {
      const t = tables.get(key(row.schema_name, row.table_name));
      if (t) t.estimatedRowCount = row.row_count;
    }

    // Mark PK/FK on columns
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
    const sql = await this.loadDriver();
    const pool = await this.connect(sql, config);
    try {
      const result = await pool.request().query('SELECT @@VERSION AS version');
      return result.recordset[0].version;
    } finally {
      await pool.close();
    }
  }

  private async loadDriver(): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('mssql');
  }

  private async connect(sql: any, config: ConnectionConfig) {
    return sql.connect({
      server: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      options: {
        encrypt: config.useSsl,
        trustServerCertificate: false,
        connectTimeout: 10000,
      },
    });
  }
}
