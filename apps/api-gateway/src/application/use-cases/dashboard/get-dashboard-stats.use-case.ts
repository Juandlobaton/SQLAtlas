import { IConnectionRepository } from '../../../domain/repositories/connection.repository';
import { IProcedureRepository } from '../../../domain/repositories/procedure.repository';
import { IDependencyRepository } from '../../../domain/repositories/dependency.repository';
import { IAnalysisJobRepository } from '../../../domain/repositories/analysis-job.repository';

export interface DashboardStats {
  connections: number;
  procedures: number;
  dependencies: number;
  securityIssues: number;
  recentJobs: {
    id: string;
    connectionId: string;
    status: string;
    progress: number;
    totalObjects: number | null;
    createdAt: string;
  }[];
}

export class GetDashboardStatsUseCase {
  constructor(
    private readonly connectionRepo: IConnectionRepository,
    private readonly procedureRepo: IProcedureRepository,
    private readonly analysisJobRepo: IAnalysisJobRepository,
  ) {}

  async execute(tenantId: string): Promise<DashboardStats> {
    const connections = await this.connectionRepo.findByTenant(tenantId);
    const connectionIds = connections.map((c) => c.id);

    let totalProcedures = 0;
    let totalSecurityIssues = 0;

    for (const connId of connectionIds) {
      const result = await this.procedureRepo.findByConnection(tenantId, connId, undefined, {
        page: 1,
        limit: 1,
      });
      totalProcedures += result.total;
    }

    const recentJobs: DashboardStats['recentJobs'] = [];
    for (const connId of connectionIds) {
      const jobs = await this.analysisJobRepo.findByConnection(connId);
      for (const job of jobs.slice(0, 3)) {
        recentJobs.push({
          id: job.id,
          connectionId: job.connectionId,
          status: job.status,
          progress: job.progress,
          totalObjects: job.totalObjects,
          createdAt: job.createdAt.toISOString(),
        });
      }
    }

    return {
      connections: connections.length,
      procedures: totalProcedures,
      dependencies: 0,
      securityIssues: totalSecurityIssues,
      recentJobs: recentJobs.slice(0, 5),
    };
  }
}
