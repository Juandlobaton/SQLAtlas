import { IConnectionRepository } from '../../../domain/repositories/connection.repository';
import { IProcedureRepository } from '../../../domain/repositories/procedure.repository';
import { IAnalysisJobRepository } from '../../../domain/repositories/analysis-job.repository';

export interface DashboardStats {
  connections: number;
  procedures: number;
  securityIssues: number;
  recentJobs: {
    id: string;
    connectionId: string;
    connectionName: string;
    engine: string;
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
    const connMap = new Map(connections.map((c) => [c.id, c]));

    let totalProcedures = 0;
    let totalSecurityIssues = 0;

    for (const conn of connections) {
      const result = await this.procedureRepo.findByConnection(tenantId, conn.id, undefined, {
        page: 1,
        limit: 500,
      });
      totalProcedures += result.total;

      // Count security issues from parsed procedures
      for (const proc of result.items) {
        totalSecurityIssues += proc.securityFindings?.length ?? 0;
      }
    }

    const recentJobs: DashboardStats['recentJobs'] = [];
    for (const conn of connections) {
      const jobs = await this.analysisJobRepo.findByConnection(conn.id);
      for (const job of jobs.slice(0, 3)) {
        recentJobs.push({
          id: job.id,
          connectionId: job.connectionId,
          connectionName: connMap.get(job.connectionId)?.name ?? '',
          engine: connMap.get(job.connectionId)?.engine ?? '',
          status: job.status,
          progress: job.progress,
          totalObjects: job.totalObjects,
          createdAt: job.createdAt.toISOString(),
        });
      }
    }

    // Sort by most recent
    recentJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      connections: connections.length,
      procedures: totalProcedures,
      securityIssues: totalSecurityIssues,
      recentJobs: recentJobs.slice(0, 5),
    };
  }
}
