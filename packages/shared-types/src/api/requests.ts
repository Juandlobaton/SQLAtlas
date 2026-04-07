import { DbEngine } from '../enums/db-engine';

export interface LoginRequest {
  email: string;
  password: string;
  tenantSlug: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  tenantName: string;
}

export interface CreateConnectionRequest {
  name: string;
  engine: DbEngine;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password: string;
  useSsl?: boolean;
  connectionOptions?: Record<string, unknown>;
}

export interface UpdateConnectionRequest {
  name?: string;
  host?: string;
  port?: number;
  databaseName?: string;
  username?: string;
  password?: string;
  useSsl?: boolean;
  connectionOptions?: Record<string, unknown>;
}

export interface StartAnalysisRequest {
  connectionId: string;
  schemas?: string[];
  objectTypes?: string[];
  forceRefresh?: boolean;
}

export interface ParseRequest {
  sql: string;
  dialect: string;
  extractDependencies?: boolean;
  analyzeFlow?: boolean;
  analyzeComplexity?: boolean;
  analyzeSecurity?: boolean;
}

export interface GraphQueryRequest {
  connectionId: string;
  rootProcedureId?: string;
  maxDepth?: number;
  dependencyTypes?: string[];
  includeExternalDeps?: boolean;
}

export interface ExportRequest {
  connectionId: string;
  procedureIds?: string[];
  format: 'pdf' | 'html' | 'markdown' | 'json';
  includeGraph?: boolean;
  includeSourceCode?: boolean;
  includeAnnotations?: boolean;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}
