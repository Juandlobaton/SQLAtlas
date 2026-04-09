/**
 * Domain Entity: Schema discovered during database analysis.
 */
export class DiscoveredSchema {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly connectionId: string,
    public readonly schemaName: string,
    public readonly slug: string,
    public readonly catalogName: string | null,
    public readonly objectCounts: SchemaObjectCounts,
    public readonly sizeBytes: number | null,
    public readonly owner: string | null,
    public readonly firstSeenAt: Date,
    public readonly lastSeenAt: Date,
    public readonly createdAt: Date,
  ) {}

  get fullName(): string {
    return this.catalogName ? `${this.catalogName}.${this.schemaName}` : this.schemaName;
  }

  get totalObjects(): number {
    return (
      this.objectCounts.procedures +
      this.objectCounts.functions +
      this.objectCounts.triggers +
      this.objectCounts.views +
      this.objectCounts.tables
    );
  }
}

export interface SchemaObjectCounts {
  procedures: number;
  functions: number;
  triggers: number;
  views: number;
  tables: number;
  sequences: number;
  indexes: number;
}
