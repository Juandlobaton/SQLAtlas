/**
 * Application Port: Database connector contract.
 * Infrastructure implements this for each database engine.
 */

export interface IDbConnector {
  testConnection(config: ConnectionConfig): Promise<ConnectionTestResult>;
  extractProcedures(config: ConnectionConfig, schemas?: string[]): Promise<ExtractedObject[]>;
  extractTableMetadata(config: ConnectionConfig, schemas?: string[]): Promise<ExtractedTableMetadata[]>;
  getServerVersion(config: ConnectionConfig): Promise<string>;
}

export interface ConnectionConfig {
  engine: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  useSsl: boolean;
  sslCaCert?: string;
  options?: Record<string, unknown>;
}

export interface ConnectionTestResult {
  success: boolean;
  latencyMs: number;
  serverVersion?: string;
  errorMessage?: string;
  objectCounts?: {
    procedures: number;
    functions: number;
    triggers: number;
    views: number;
  };
}

export interface ExtractedObject {
  objectType: string;
  schemaName: string;
  objectName: string;
  definition: string;
  createdAt?: Date;
  modifiedAt?: Date;
}

export interface ExtractedTableMetadata {
  schemaName: string;
  tableName: string;
  tableType: 'table' | 'view' | 'materialized_view';
  estimatedRowCount: number | null;
  columns: ExtractedColumn[];
  primaryKey: string[];
  foreignKeys: ExtractedForeignKey[];
  indexes: ExtractedIndex[];
}

export interface ExtractedColumn {
  columnName: string;
  dataType: string;
  ordinalPosition: number;
  isNullable: boolean;
  defaultValue: string | null;
  maxLength: number | null;
  precision: number | null;
  scale: number | null;
}

export interface ExtractedForeignKey {
  constraintName: string;
  columns: string[];
  referencedSchema: string;
  referencedTable: string;
  referencedColumns: string[];
  onDelete: string;
  onUpdate: string;
}

export interface ExtractedIndex {
  indexName: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
  indexType: string;
}

export const DB_CONNECTOR = Symbol('IDbConnector');
