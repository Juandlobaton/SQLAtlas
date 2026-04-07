import { ObjectType, SecuritySeverity } from '../enums/analysis-status';
import { SqlDialect } from '../enums/db-engine';

export interface Procedure {
  id: string;
  tenantId: string;
  connectionId: string;
  schemaId?: string;
  objectType: ObjectType;
  schemaName: string;
  objectName: string;
  fullQualifiedName: string;
  rawDefinition: string;
  definitionHash: string;
  language: SqlDialect;
  parameters: ProcedureParameter[];
  returnType?: string;
  isDeterministic?: boolean;
  estimatedComplexity?: number;
  lineCount: number;
  autoDoc?: AutoDocumentation;
  securityFindings: SecurityFinding[];
  sourceCreatedAt?: string;
  sourceModifiedAt?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProcedureParameter {
  name: string;
  dataType: string;
  mode: 'IN' | 'OUT' | 'INOUT';
  defaultValue?: string;
  ordinalPosition: number;
}

export interface AutoDocumentation {
  summary: string;
  description: string;
  parameterDocs: Record<string, string>;
  returns?: string;
  sideEffects: string[];
  tablesAccessed: TableAccessInfo[];
  complexity: ComplexityInfo;
}

export interface TableAccessInfo {
  tableName: string;
  operation: string;
  columns?: string[];
}

export interface ComplexityInfo {
  cyclomaticComplexity: number;
  nestingDepth: number;
  lineCount: number;
  branchCount: number;
  loopCount: number;
}

export interface SecurityFinding {
  severity: SecuritySeverity;
  type: string;
  message: string;
  line?: number;
  column?: number;
  recommendation?: string;
}

export interface ProcedureVersion {
  id: string;
  procedureId: string;
  versionNumber: number;
  rawDefinition: string;
  definitionHash: string;
  diffFromPrevious?: string;
  parameters: ProcedureParameter[];
  autoDoc?: AutoDocumentation;
  detectedAt: string;
}
