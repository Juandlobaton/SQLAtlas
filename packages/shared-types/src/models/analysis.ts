import { AnalysisStatus } from '../enums/analysis-status';

export interface AnalysisJob {
  id: string;
  tenantId: string;
  connectionId: string;
  status: AnalysisStatus;
  progress: number;
  totalObjects?: number;
  processedObjects: number;
  errorMessage?: string;
  errorDetails?: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  triggeredBy?: string;
  createdAt: string;
}

export interface AnalysisProgress {
  jobId: string;
  status: AnalysisStatus;
  progress: number;
  currentObject?: string;
  totalObjects: number;
  processedObjects: number;
  errors: AnalysisError[];
}

export interface AnalysisError {
  objectName: string;
  errorType: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AnalysisSummary {
  jobId: string;
  connectionName: string;
  engine: string;
  completedAt: string;
  duration: number;
  counts: {
    procedures: number;
    functions: number;
    triggers: number;
    views: number;
    dependencies: number;
    securityFindings: number;
  };
  topComplexProcedures: { name: string; complexity: number }[];
  securitySummary: { severity: string; count: number }[];
}
