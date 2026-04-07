import { DependencyType } from '../enums/analysis-status';

export interface Dependency {
  id: string;
  tenantId: string;
  sourceId: string;
  targetId?: string;
  targetExternalName?: string;
  dependencyType: DependencyType;
  context: DependencyContext;
  isDynamic: boolean;
  confidence: number;
  createdAt: string;
}

export interface DependencyContext {
  lineNumber?: number;
  column?: number;
  statementType?: string;
  conditionalPath?: string;
  snippet?: string;
}

export interface DependencyGraphNode {
  id: string;
  label: string;
  objectType: string;
  schemaName: string;
  complexity?: number;
  securityIssues: number;
  group?: string;
}

export interface DependencyGraphEdge {
  id: string;
  source: string;
  target: string;
  dependencyType: DependencyType;
  isDynamic: boolean;
  confidence: number;
  label?: string;
}

export interface DependencyGraph {
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
  metadata: {
    totalNodes: number;
    totalEdges: number;
    maxDepth: number;
    rootNodes: string[];
    leafNodes: string[];
    circularDependencies: string[][];
  };
}

export interface CallTreeNode {
  procedureId: string;
  name: string;
  objectType: string;
  depth: number;
  children: CallTreeNode[];
  dependencyType: DependencyType;
  isCircular: boolean;
  metadata?: {
    lineNumber?: number;
    conditionalPath?: string;
    complexity?: number;
  };
}
