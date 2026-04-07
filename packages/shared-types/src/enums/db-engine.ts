export enum DbEngine {
  SQL_SERVER = 'sqlserver',
  POSTGRESQL = 'postgresql',
  ORACLE = 'oracle',
}

export enum SqlDialect {
  TSQL = 'tsql',
  PLPGSQL = 'plpgsql',
  PLSQL = 'plsql',
}

export const ENGINE_DIALECT_MAP: Record<DbEngine, SqlDialect> = {
  [DbEngine.SQL_SERVER]: SqlDialect.TSQL,
  [DbEngine.POSTGRESQL]: SqlDialect.PLPGSQL,
  [DbEngine.ORACLE]: SqlDialect.PLSQL,
};

export const ENGINE_DEFAULT_PORTS: Record<DbEngine, number> = {
  [DbEngine.SQL_SERVER]: 1433,
  [DbEngine.POSTGRESQL]: 5432,
  [DbEngine.ORACLE]: 1521,
};
