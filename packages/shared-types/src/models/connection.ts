import { DbEngine } from '../enums/db-engine';

export interface DbConnection {
  id: string;
  tenantId: string;
  name: string;
  engine: DbEngine;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  useSsl: boolean;
  connectionOptions: Record<string, unknown>;
  lastTestedAt?: string;
  lastTestStatus?: 'success' | 'failed';
  isActive: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
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
