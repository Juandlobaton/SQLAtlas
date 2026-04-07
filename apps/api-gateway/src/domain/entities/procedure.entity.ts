/**
 * Domain Entity: Stored Procedure / Function / Trigger / View.
 */
export class Procedure {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly connectionId: string,
    public readonly schemaId: string | null,
    public readonly analysisJobId: string | null,
    public readonly objectType: ObjectType,
    public readonly schemaName: string,
    public readonly objectName: string,
    public readonly fullQualifiedName: string,
    public readonly rawDefinition: string,
    public readonly definitionHash: string,
    public readonly language: string,
    public readonly parameters: ProcedureParameter[],
    public readonly returnType: string | null,
    public readonly isDeterministic: boolean | null,
    public readonly estimatedComplexity: number | null,
    public readonly lineCount: number,
    public readonly autoDoc: Record<string, unknown> | null,
    public readonly securityFindings: SecurityFinding[],
    public readonly sourceCreatedAt: Date | null,
    public readonly sourceModifiedAt: Date | null,
    public readonly firstSeenAt: Date,
    public readonly lastSeenAt: Date,
    public readonly isDeleted: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  get hasSecurityIssues(): boolean {
    return this.securityFindings.some(
      (f) => f.severity === 'critical' || f.severity === 'high',
    );
  }

  get complexityLevel(): string {
    if (!this.estimatedComplexity) return 'unknown';
    if (this.estimatedComplexity <= 5) return 'low';
    if (this.estimatedComplexity <= 10) return 'moderate';
    if (this.estimatedComplexity <= 20) return 'high';
    return 'critical';
  }
}

export enum ObjectType {
  PROCEDURE = 'procedure',
  FUNCTION = 'function',
  TRIGGER = 'trigger',
  VIEW = 'view',
  PACKAGE = 'package',
}

export interface ProcedureParameter {
  name: string;
  dataType: string;
  mode: 'IN' | 'OUT' | 'INOUT';
  defaultValue?: string;
  ordinalPosition: number;
}

export interface SecurityFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  findingType: string;
  message: string;
  line?: number;
  recommendation?: string;
}
