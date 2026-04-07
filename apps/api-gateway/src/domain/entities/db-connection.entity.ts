/**
 * Domain Entity: Database Connection.
 * Represents a registered target database to analyze.
 */
export class DbConnection {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly name: string,
    public readonly engine: DbEngine,
    public readonly host: string,
    public readonly port: number,
    public readonly databaseName: string,
    public readonly username: string,
    public readonly vaultSecretPath: string | null,
    public readonly encryptedPassword: string | null = null,
    public readonly useSsl: boolean,
    public readonly sslCaCert: string | null,
    public readonly connectionOptions: Record<string, unknown>,
    public readonly lastTestedAt: Date | null,
    public readonly lastTestStatus: 'success' | 'failed' | null,
    public readonly isActive: boolean,
    public readonly createdBy: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  get dialect(): string {
    return ENGINE_DIALECT_MAP[this.engine];
  }

  isHealthy(): boolean {
    return this.lastTestStatus === 'success';
  }
}

export enum DbEngine {
  SQL_SERVER = 'sqlserver',
  POSTGRESQL = 'postgresql',
  ORACLE = 'oracle',
}

export const ENGINE_DIALECT_MAP: Record<DbEngine, string> = {
  [DbEngine.SQL_SERVER]: 'tsql',
  [DbEngine.POSTGRESQL]: 'plpgsql',
  [DbEngine.ORACLE]: 'plsql',
};

export const ENGINE_DEFAULT_PORTS: Record<DbEngine, number> = {
  [DbEngine.SQL_SERVER]: 1433,
  [DbEngine.POSTGRESQL]: 5432,
  [DbEngine.ORACLE]: 1521,
};
