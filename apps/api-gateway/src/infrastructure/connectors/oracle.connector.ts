import {
  IDbConnector,
  ConnectionConfig,
  ConnectionTestResult,
  ExtractedObject,
  ExtractedTableMetadata,
} from '../../application/ports/db-connector.port';

export class OracleConnector implements IDbConnector {
  async testConnection(config: ConnectionConfig): Promise<ConnectionTestResult> {
    const start = Date.now();
    const oracledb = await this.loadDriver();
    let conn: any;

    try {
      conn = await oracledb.getConnection({
        user: config.username,
        password: config.password,
        connectString: `${config.host}:${config.port}/${config.database}`,
      });

      const versionResult = await conn.execute('SELECT banner FROM v$version WHERE ROWNUM = 1');
      const latencyMs = Date.now() - start;

      const countsResult = await conn.execute(`
        SELECT
          (SELECT COUNT(*) FROM all_procedures WHERE owner NOT IN ('SYS','SYSTEM') AND object_type = 'PROCEDURE') AS procedures,
          (SELECT COUNT(*) FROM all_procedures WHERE owner NOT IN ('SYS','SYSTEM') AND object_type = 'FUNCTION') AS functions,
          (SELECT COUNT(*) FROM all_tables WHERE owner NOT IN ('SYS','SYSTEM')) AS tables,
          (SELECT COUNT(*) FROM all_views WHERE owner NOT IN ('SYS','SYSTEM')) AS views
        FROM dual
      `);

      const rows = countsResult.rows as any[];

      return {
        success: true,
        latencyMs,
        serverVersion: (versionResult.rows as any[])?.[0]?.[0] || 'Oracle',
        objectCounts: {
          procedures: rows?.[0]?.[0] || 0,
          functions: rows?.[0]?.[1] || 0,
          triggers: 0,
          views: rows?.[0]?.[3] || 0,
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        errorMessage: err instanceof Error ? err.message : 'Connection failed',
      };
    } finally {
      if (conn) {
        await conn.close();
      }
    }
  }

  async extractProcedures(config: ConnectionConfig, schemas?: string[]): Promise<ExtractedObject[]> {
    const oracledb = await this.loadDriver();
    // Fetch CLOBs as strings instead of Lob objects (avoids circular ref in JSON.stringify)
    oracledb.fetchAsString = [oracledb.CLOB];
    const conn = await oracledb.getConnection({
      user: config.username,
      password: config.password,
      connectString: `${config.host}:${config.port}/${config.database}`,
    });

    try {
      const excludeOwners = "('SYS','SYSTEM','DBSNMP','OUTLN','MDSYS','CTXSYS','XDB','WMSYS','ORDDATA','ORDSYS')";
      let ownerFilter = `s.owner NOT IN ${excludeOwners}`;
      let binds: Record<string, string> = {};

      if (schemas && schemas.length > 0) {
        const bindNames = schemas.map((_, i) => `:s${i}`);
        schemas.forEach((s, i) => { binds[`s${i}`] = s; });
        ownerFilter = `s.owner IN (${bindNames.join(',')})`;
      }

      const result = await conn.execute(
        `SELECT s.owner, s.name, s.type,
           RTRIM(XMLAGG(XMLELEMENT(e, s.text, '').EXTRACT('//text()') ORDER BY s.line).GetClobVal(), CHR(0)) AS definition
         FROM all_source s
         WHERE ${ownerFilter}
           AND s.type IN ('PROCEDURE', 'FUNCTION', 'TRIGGER', 'PACKAGE BODY')
         GROUP BY s.owner, s.name, s.type
         ORDER BY s.owner, s.name`,
        binds,
      );

      const rows = result.rows as any[];

      return (rows || []).map((row) => ({
        objectType: (row[2] as string).toLowerCase().replace(' body', ''),
        schemaName: row[0] as string,
        objectName: row[1] as string,
        definition: row[3] as string,
      }));
    } finally {
      await conn.close();
    }
  }

  async extractTableMetadata(config: ConnectionConfig, schemas?: string[]): Promise<ExtractedTableMetadata[]> {
    const oracledb = await this.loadDriver();
    const conn = await oracledb.getConnection({
      user: config.username,
      password: config.password,
      connectString: `${config.host}:${config.port}/${config.database}`,
    });

    try {
      const excludeOwners = "('SYS','SYSTEM','DBSNMP','OUTLN','MDSYS','CTXSYS','XDB','WMSYS','ORDDATA','ORDSYS')";
      let ownerFilter = `t.owner NOT IN ${excludeOwners}`;
      let binds: Record<string, string> = {};
      if (schemas && schemas.length > 0) {
        const bindNames = schemas.map((_, i) => `:s${i}`);
        schemas.forEach((s, i) => { binds[`s${i}`] = s; });
        ownerFilter = `t.owner IN (${bindNames.join(',')})`;
      }

      // Columns
      const colResult = await conn.execute(
        `SELECT t.owner, t.table_name, c.column_name, c.data_type,
          c.column_id, c.nullable, c.data_default, c.data_length, c.data_precision, c.data_scale
        FROM all_tab_columns c
        JOIN all_tables t ON c.owner = t.owner AND c.table_name = t.table_name
        WHERE ${ownerFilter}
        ORDER BY t.owner, t.table_name, c.column_id`, binds);

      // Primary keys
      const pkResult = await conn.execute(
        `SELECT cc.owner, cc.table_name, cc.column_name
        FROM all_cons_columns cc
        JOIN all_constraints c ON cc.constraint_name = c.constraint_name AND cc.owner = c.owner
        WHERE c.constraint_type = 'P' AND ${ownerFilter.replace(/t\.owner/g, 'cc.owner')}
        ORDER BY cc.owner, cc.table_name, cc.position`, binds);

      // Foreign keys
      const fkResult = await conn.execute(
        `SELECT c.owner AS schema_name, c.table_name, c.constraint_name,
          cc.column_name, rc.owner AS ref_schema, rc.table_name AS ref_table,
          rcc.column_name AS ref_column, c.delete_rule AS on_delete
        FROM all_constraints c
        JOIN all_cons_columns cc ON c.constraint_name = cc.constraint_name AND c.owner = cc.owner
        JOIN all_constraints rc ON c.r_constraint_name = rc.constraint_name AND c.r_owner = rc.owner
        JOIN all_cons_columns rcc ON rc.constraint_name = rcc.constraint_name AND rc.owner = rcc.owner AND cc.position = rcc.position
        WHERE c.constraint_type = 'R' AND ${ownerFilter.replace(/t\.owner/g, 'c.owner')}
        ORDER BY c.owner, c.table_name, c.constraint_name, cc.position`, binds);

      // Indexes
      const idxResult = await conn.execute(
        `SELECT i.table_owner AS schema_name, i.table_name, i.index_name,
          ic.column_name, i.uniqueness, i.index_type
        FROM all_indexes i
        JOIN all_ind_columns ic ON i.index_name = ic.index_name AND i.owner = ic.index_owner
        WHERE ${ownerFilter.replace(/t\.owner/g, 'i.table_owner')}
        ORDER BY i.table_owner, i.table_name, i.index_name, ic.column_position`, binds);

      // Row estimates
      const rowResult = await conn.execute(
        `SELECT owner, table_name, num_rows FROM all_tables WHERE ${ownerFilter.replace(/t\.owner/g, 'owner')}`, binds);

      await conn.close();

      const tables = new Map<string, ExtractedTableMetadata>();
      const key = (s: string, t: string) => `${s}.${t}`;

      for (const row of (colResult.rows as any[]) || []) {
        const k = key(row[0], row[1]);
        if (!tables.has(k)) {
          tables.set(k, { schemaName: row[0], tableName: row[1], tableType: 'table', estimatedRowCount: null, columns: [], primaryKey: [], foreignKeys: [], indexes: [] });
        }
        tables.get(k)!.columns.push({
          columnName: row[2], dataType: row[3], ordinalPosition: row[4],
          isNullable: row[5] === 'Y', defaultValue: row[6] ? String(row[6]).trim() : null,
          maxLength: row[7], precision: row[8], scale: row[9],
        });
      }

      for (const row of (pkResult.rows as any[]) || []) {
        const t = tables.get(key(row[0], row[1]));
        if (t) t.primaryKey.push(row[2]);
      }

      const fkGroups = new Map<string, { meta: any[]; cols: string[]; refCols: string[] }>();
      for (const row of (fkResult.rows as any[]) || []) {
        const gk = `${row[0]}.${row[1]}.${row[2]}`;
        if (!fkGroups.has(gk)) fkGroups.set(gk, { meta: row, cols: [], refCols: [] });
        fkGroups.get(gk)!.cols.push(row[3]);
        fkGroups.get(gk)!.refCols.push(row[6]);
      }
      for (const [, g] of fkGroups) {
        const t = tables.get(key(g.meta[0], g.meta[1]));
        if (t) {
          t.foreignKeys.push({
            constraintName: g.meta[2], columns: g.cols,
            referencedSchema: g.meta[4], referencedTable: g.meta[5],
            referencedColumns: g.refCols, onDelete: g.meta[7] || 'NO ACTION', onUpdate: 'NO ACTION',
          });
        }
      }

      const idxGroups = new Map<string, { meta: any[]; cols: string[] }>();
      for (const row of (idxResult.rows as any[]) || []) {
        const gk = `${row[0]}.${row[1]}.${row[2]}`;
        if (!idxGroups.has(gk)) idxGroups.set(gk, { meta: row, cols: [] });
        idxGroups.get(gk)!.cols.push(row[3]);
      }
      for (const [, g] of idxGroups) {
        const t = tables.get(key(g.meta[0], g.meta[1]));
        if (t) {
          t.indexes.push({
            indexName: g.meta[2], columns: g.cols,
            isUnique: g.meta[4] === 'UNIQUE', isPrimary: false, indexType: g.meta[5],
          });
        }
      }

      for (const row of (rowResult.rows as any[]) || []) {
        const t = tables.get(key(row[0], row[1]));
        if (t) t.estimatedRowCount = row[2];
      }

      // Mark PK/FK on columns + isPrimary on indexes
      for (const t of tables.values()) {
        const pkSet = new Set(t.primaryKey);
        const fkCols = new Set(t.foreignKeys.flatMap(fk => fk.columns));
        for (const col of t.columns) {
          (col as any).isPrimaryKey = pkSet.has(col.columnName);
          (col as any).isForeignKey = fkCols.has(col.columnName);
        }
        for (const idx of t.indexes) {
          if (idx.columns.length === t.primaryKey.length && idx.columns.every(c => pkSet.has(c))) {
            idx.isPrimary = true;
          }
        }
      }

      return Array.from(tables.values());
    } catch (err) {
      await conn.close();
      throw err;
    }
  }

  async getServerVersion(config: ConnectionConfig): Promise<string> {
    const oracledb = await this.loadDriver();
    const conn = await oracledb.getConnection({
      user: config.username,
      password: config.password,
      connectString: `${config.host}:${config.port}/${config.database}`,
    });
    try {
      const result = await conn.execute('SELECT banner FROM v$version WHERE ROWNUM = 1');
      return (result.rows as any[])?.[0]?.[0] || 'Oracle';
    } finally {
      await conn.close();
    }
  }

  private async loadDriver(): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('oracledb');
  }
}
