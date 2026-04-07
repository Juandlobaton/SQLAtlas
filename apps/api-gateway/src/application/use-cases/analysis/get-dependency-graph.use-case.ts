import { GraphQueryInput } from '../../dto/analysis.dto';
import { IDependencyRepository, GraphNode, GraphEdge } from '../../../domain/repositories/dependency.repository';
import { ICacheService } from '../../ports/cache.port';

export class GetDependencyGraphUseCase {
  constructor(
    private readonly dependencyRepo: IDependencyRepository,
    private readonly cache: ICacheService,
  ) {}

  async execute(input: GraphQueryInput): Promise<{
    nodes: GraphNode[];
    edges: GraphEdge[];
    metadata: GraphMetadata;
  }> {
    const cacheKey = `graph:${input.connectionId}:${input.maxDepth ?? 10}:${input.rootProcedureId || 'all'}`;

    // Try cache first
    const cached = await this.cache.get<{ nodes: GraphNode[]; edges: GraphEdge[]; metadata: GraphMetadata }>(cacheKey);
    if (cached) return cached;

    const { nodes, edges } = await this.dependencyRepo.getCallGraph(
      input.tenantId,
      input.connectionId,
      input.rootProcedureId,
      input.maxDepth ?? 10,
    );

    const filteredEdges = input.dependencyTypes
      ? edges.filter((e) => input.dependencyTypes!.includes(e.dependencyType))
      : edges;

    const connectedNodeIds = new Set<string>();
    for (const edge of filteredEdges) {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    }

    const filteredNodes = input.rootProcedureId
      ? nodes.filter((n) => connectedNodeIds.has(n.id))
      : nodes;

    const rootNodes = this.findRootNodes(filteredNodes, filteredEdges);
    const leafNodes = this.findLeafNodes(filteredNodes, filteredEdges);
    const circularDeps = this.detectCircularDependencies(filteredEdges);
    const maxDepth = this.calculateMaxDepth(rootNodes, filteredEdges);

    const result = {
      nodes: filteredNodes,
      edges: filteredEdges,
      metadata: {
        totalNodes: filteredNodes.length,
        totalEdges: filteredEdges.length,
        maxDepth,
        rootNodeIds: rootNodes,
        leafNodeIds: leafNodes,
        circularDependencies: circularDeps,
      },
    };

    // Cache the result for 5 minutes
    await this.cache.set(cacheKey, result, 5 * 60 * 1000);

    return result;
  }

  private findRootNodes(nodes: GraphNode[], edges: GraphEdge[]): string[] {
    const targets = new Set(edges.map((e) => e.target));
    return nodes.filter((n) => !targets.has(n.id)).map((n) => n.id);
  }

  private findLeafNodes(nodes: GraphNode[], edges: GraphEdge[]): string[] {
    const sources = new Set(edges.map((e) => e.source));
    return nodes.filter((n) => !sources.has(n.id)).map((n) => n.id);
  }

  private detectCircularDependencies(edges: GraphEdge[]): string[][] {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }

    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (node: string, path: string[]) => {
      if (stack.has(node)) {
        const cycleStart = path.indexOf(node);
        cycles.push(path.slice(cycleStart));
        return;
      }
      if (visited.has(node)) return;

      visited.add(node);
      stack.add(node);
      path.push(node);

      for (const neighbor of adj.get(node) ?? []) {
        dfs(neighbor, [...path]);
      }

      stack.delete(node);
    };

    for (const node of adj.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return cycles;
  }

  private calculateMaxDepth(rootNodes: string[], edges: GraphEdge[]): number {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }

    let maxDepth = 0;
    const bfs = (start: string) => {
      const queue: [string, number][] = [[start, 0]];
      const seen = new Set<string>([start]);
      while (queue.length > 0) {
        const [node, depth] = queue.shift()!;
        maxDepth = Math.max(maxDepth, depth);
        for (const neighbor of adj.get(node) ?? []) {
          if (!seen.has(neighbor)) {
            seen.add(neighbor);
            queue.push([neighbor, depth + 1]);
          }
        }
      }
    };

    for (const root of rootNodes) {
      bfs(root);
    }

    return maxDepth;
  }
}

export interface GraphMetadata {
  totalNodes: number;
  totalEdges: number;
  maxDepth: number;
  rootNodeIds: string[];
  leafNodeIds: string[];
  circularDependencies: string[][];
}
