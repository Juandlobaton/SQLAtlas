import { AnalysisJob } from '../entities/analysis-job.entity';
import type { CreateAnalysisJob } from '../types';

export interface IAnalysisJobRepository {
  findById(id: string): Promise<AnalysisJob | null>;
  findByConnection(connectionId: string): Promise<AnalysisJob[]>;
  findRunningByConnection(connectionId: string): Promise<AnalysisJob | null>;
  create(data: CreateAnalysisJob): Promise<AnalysisJob>;
  updateStatus(id: string, status: string, progress?: number, processedObjects?: number): Promise<void>;
  updateError(id: string, message: string, details?: Record<string, unknown>): Promise<void>;
  complete(id: string, totalObjects: number): Promise<void>;
}

export const ANALYSIS_JOB_REPOSITORY = Symbol('IAnalysisJobRepository');
