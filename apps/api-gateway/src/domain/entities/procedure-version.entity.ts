/**
 * Domain Entity: Version history of a procedure.
 * Tracks changes over time for auditing.
 */
export class ProcedureVersion {
  constructor(
    public readonly id: string,
    public readonly procedureId: string,
    public readonly versionNumber: number,
    public readonly rawDefinition: string,
    public readonly definitionHash: string,
    public readonly diffFromPrevious: string | null,
    public readonly parameters: Record<string, unknown>[],
    public readonly autoDoc: Record<string, unknown> | null,
    public readonly detectedAt: Date,
    public readonly analysisJobId: string | null,
  ) {}

  get hasChanges(): boolean {
    return this.diffFromPrevious !== null && this.diffFromPrevious.length > 0;
  }
}
