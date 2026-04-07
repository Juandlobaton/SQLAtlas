import {
  IDbConnector,
  ConnectionConfig,
  ConnectionTestResult,
  ExtractedObject,
  ExtractedTableMetadata,
} from '../../application/ports/db-connector.port';
import { PostgreSqlConnector } from './postgresql.connector';
import { SqlServerConnector } from './sqlserver.connector';
import { OracleConnector } from './oracle.connector';

export class DbConnectorFactory implements IDbConnector {
  private readonly pg = new PostgreSqlConnector();
  private readonly mssql = new SqlServerConnector();
  private readonly oracle = new OracleConnector();

  async testConnection(config: ConnectionConfig): Promise<ConnectionTestResult> {
    return this.getConnector(config.engine).testConnection(config);
  }

  async extractProcedures(config: ConnectionConfig, schemas?: string[]): Promise<ExtractedObject[]> {
    return this.getConnector(config.engine).extractProcedures(config, schemas);
  }

  async extractTableMetadata(config: ConnectionConfig, schemas?: string[]): Promise<ExtractedTableMetadata[]> {
    return this.getConnector(config.engine).extractTableMetadata(config, schemas);
  }

  async getServerVersion(config: ConnectionConfig): Promise<string> {
    return this.getConnector(config.engine).getServerVersion(config);
  }

  private getConnector(engine: string): IDbConnector {
    switch (engine) {
      case 'postgresql':
      case 'postgres':
        return this.pg;
      case 'sqlserver':
      case 'mssql':
        return this.mssql;
      case 'oracle':
      case 'plsql':
        return this.oracle;
      default:
        throw new Error(`Unsupported database engine: ${engine}`);
    }
  }
}
