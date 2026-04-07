export interface StartAnalysisInput {
  tenantId: string;
  connectionId: string;
  triggeredBy: string;
  schemas?: string[];
  objectTypes?: string[];
  forceRefresh?: boolean;
}

export interface AnalysisProgressOutput {
  jobId: string;
  status: string;
  progress: number;
  currentObject?: string;
  totalObjects: number;
  processedObjects: number;
  errors: { objectName: string; message: string }[];
}

export interface GraphQueryInput {
  tenantId: string;
  connectionId: string;
  rootProcedureId?: string;
  maxDepth?: number;
  dependencyTypes?: string[];
}
