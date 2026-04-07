/**
 * Domain Entity: Dependency between database objects.
 */
export class Dependency {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly sourceId: string,
    public readonly targetId: string | null,
    public readonly targetExternalName: string | null,
    public readonly dependencyType: DependencyType,
    public readonly context: DependencyContext,
    public readonly isDynamic: boolean,
    public readonly confidence: number,
    public readonly analysisJobId: string | null,
    public readonly createdAt: Date,
  ) {}

  isReliable(): boolean {
    return this.confidence >= 0.8 && !this.isDynamic;
  }

  isResolved(): boolean {
    return this.targetId !== null;
  }
}

export enum DependencyType {
  CALLS = 'calls',
  READS_FROM = 'reads_from',
  WRITES_TO = 'writes_to',
  REFERENCES = 'references',
}

export interface DependencyContext {
  lineNumber?: number;
  column?: number;
  statementType?: string;
  conditionalPath?: string;
  snippet?: string;
}
