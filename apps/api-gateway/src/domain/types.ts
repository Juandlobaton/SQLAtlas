/**
 * Data-only Props interfaces for each domain entity.
 * Separates data shape from domain behavior (methods/getters).
 * Repository create/upsert methods use Create* types (Props minus auto-generated fields).
 */

import type { TenantPlan, TenantSettings } from './entities/tenant.entity';
import type { UserRole, AuthProvider } from './entities/user.entity';
import type { DbEngine } from './entities/db-connection.entity';
import type { AnalysisStatus } from './entities/analysis-job.entity';
import type { ObjectType, ProcedureParameter, SecurityFinding } from './entities/procedure.entity';
import type { DependencyType, DependencyContext } from './entities/dependency.entity';
import type { SchemaObjectCounts } from './entities/discovered-schema.entity';
import type { TableType, TableColumn, ForeignKey, TableIndex } from './entities/discovered-table.entity';
import type { TableOperation } from './entities/table-access.entity';

// ── Data-only interfaces ──────────────────────────────────────

export interface TenantProps {
  id: string; name: string; slug: string; plan: TenantPlan;
  settings: TenantSettings; maxConnections: number; maxUsers: number;
  isActive: boolean; createdAt: Date; updatedAt: Date;
}

export interface UserProps {
  id: string; tenantId: string; email: string; displayName: string;
  passwordHash: string | null; avatarUrl: string | null; role: UserRole;
  authProvider: AuthProvider; externalId: string | null;
  lastLoginAt: Date | null; isActive: boolean; createdAt: Date; updatedAt: Date;
}

export interface DbConnectionProps {
  id: string; tenantId: string; name: string; engine: DbEngine;
  host: string; port: number; databaseName: string; username: string;
  vaultSecretPath: string | null; encryptedPassword: string | null;
  useSsl: boolean; sslCaCert: string | null;
  connectionOptions: Record<string, unknown>; lastTestedAt: Date | null;
  lastTestStatus: 'success' | 'failed' | null; isActive: boolean;
  createdBy: string | null; createdAt: Date; updatedAt: Date;
}

export interface AnalysisJobProps {
  id: string; tenantId: string; connectionId: string; status: AnalysisStatus;
  progress: number; totalObjects: number | null; processedObjects: number;
  errorMessage: string | null; errorDetails: Record<string, unknown> | null;
  startedAt: Date | null; completedAt: Date | null;
  triggeredBy: string | null; createdAt: Date;
}

export interface ProcedureProps {
  id: string; tenantId: string; connectionId: string; schemaId: string | null;
  analysisJobId: string | null; objectType: ObjectType; schemaName: string;
  objectName: string; fullQualifiedName: string; rawDefinition: string;
  definitionHash: string; language: string; parameters: ProcedureParameter[];
  returnType: string | null; isDeterministic: boolean | null;
  estimatedComplexity: number | null; lineCount: number;
  autoDoc: Record<string, unknown> | null; securityFindings: SecurityFinding[];
  sourceCreatedAt: Date | null; sourceModifiedAt: Date | null;
  firstSeenAt: Date; lastSeenAt: Date; isDeleted: boolean;
  createdAt: Date; updatedAt: Date;
}

export interface DependencyProps {
  id: string; tenantId: string; sourceId: string; targetId: string | null;
  targetExternalName: string | null; dependencyType: DependencyType;
  context: DependencyContext; isDynamic: boolean; confidence: number;
  analysisJobId: string | null; createdAt: Date;
}

export interface AuditLogProps {
  id: string; tenantId: string; userId: string | null; action: string;
  resourceType: string; resourceId: string | null;
  details: Record<string, unknown>; ipAddress: string | null;
  userAgent: string | null; createdAt: Date;
}

export interface DiscoveredSchemaProps {
  id: string; tenantId: string; connectionId: string; schemaName: string;
  catalogName: string | null; objectCounts: SchemaObjectCounts;
  sizeBytes: number | null; owner: string | null;
  firstSeenAt: Date; lastSeenAt: Date; createdAt: Date;
}

export interface DiscoveredTableProps {
  id: string; tenantId: string; connectionId: string; schemaId: string;
  schemaName: string; tableName: string; fullQualifiedName: string;
  tableType: TableType; estimatedRowCount: number | null; sizeBytes: number | null;
  columns: TableColumn[]; primaryKey: string[]; foreignKeys: ForeignKey[];
  indexes: TableIndex[]; referencedByCount: number;
  firstSeenAt: Date; lastSeenAt: Date; isDeleted: boolean;
  createdAt: Date; updatedAt: Date;
}

export interface TableAccessProps {
  id: string; tenantId: string; procedureId: string; tableId: string | null;
  tableName: string; fullTableName: string; operation: TableOperation;
  columns: string[]; lineNumber: number | null; isTempTable: boolean;
  isDynamic: boolean; confidence: number; analysisJobId: string | null;
  createdAt: Date;
}

// ── Create types: Props minus auto-generated fields ───────────

export type CreateTenant = Omit<TenantProps, 'id' | 'createdAt' | 'updatedAt'>;
export type CreateUser = Omit<UserProps, 'id' | 'createdAt' | 'updatedAt'>;
export type CreateDbConnection = Omit<DbConnectionProps, 'id' | 'createdAt' | 'updatedAt'>;
export type CreateAnalysisJob = Omit<AnalysisJobProps, 'id' | 'createdAt'>;
export type CreateProcedure = Omit<ProcedureProps, 'id' | 'createdAt' | 'updatedAt'>;
export type CreateDependency = Omit<DependencyProps, 'id' | 'createdAt'>;
export type CreateAuditLog = Omit<AuditLogProps, 'id' | 'createdAt'>;
export type CreateDiscoveredSchema = Omit<DiscoveredSchemaProps, 'id' | 'createdAt'>;
export type CreateDiscoveredTable = Omit<DiscoveredTableProps, 'id' | 'createdAt' | 'updatedAt'>;
export type CreateTableAccess = Omit<TableAccessProps, 'id' | 'createdAt'>;
