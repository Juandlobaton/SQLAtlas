/**
 * Domain Entity: Analysis Job.
 */
export class AnalysisJob {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly connectionId: string,
    public readonly status: AnalysisStatus,
    public readonly progress: number,
    public readonly totalObjects: number | null,
    public readonly processedObjects: number,
    public readonly errorMessage: string | null,
    public readonly errorDetails: Record<string, unknown> | null,
    public readonly startedAt: Date | null,
    public readonly completedAt: Date | null,
    public readonly triggeredBy: string | null,
    public readonly createdAt: Date,
  ) {}

  isRunning(): boolean {
    return [
      AnalysisStatus.PENDING,
      AnalysisStatus.EXTRACTING,
      AnalysisStatus.PARSING,
      AnalysisStatus.ANALYZING,
    ].includes(this.status);
  }

  isFinished(): boolean {
    return [AnalysisStatus.COMPLETED, AnalysisStatus.FAILED, AnalysisStatus.CANCELLED].includes(
      this.status,
    );
  }

  get progressPercent(): number {
    if (!this.totalObjects || this.totalObjects === 0) return 0;
    return Math.round((this.processedObjects / this.totalObjects) * 100);
  }
}

export enum AnalysisStatus {
  PENDING = 'pending',
  EXTRACTING = 'extracting',
  PARSING = 'parsing',
  ANALYZING = 'analyzing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}
