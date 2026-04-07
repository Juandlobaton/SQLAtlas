import { Dependency } from '../entities/dependency.entity';
import type { CreateDependency } from '../types';

export interface IDependencyRepository {
  findBySource(sourceId: string): Promise<Dependency[]>;
  findByTarget(targetId: string): Promise<Dependency[]>;
  findByConnection(connectionId: string): Promise<Dependency[]>;
  getCallGraph(tenantId: string, connectionId: string, rootId?: string, maxDepth?: number): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  bulkCreate(data: CreateDependency[]): Promise<number>;
  deleteByAnalysisJob(jobId: string): Promise<number>;
}

export interface GraphNode {
  id: string; label: string; objectType: string; schemaName: string;
  complexity?: number; securityIssueCount: number;
}

export interface GraphEdge {
  id: string; source: string; target: string; dependencyType: string;
  isDynamic: boolean; confidence: number;
  sourceLabel: string; targetLabel: string;
}

export const DEPENDENCY_REPOSITORY = Symbol('IDependencyRepository');
