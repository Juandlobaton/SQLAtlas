import { useState, useCallback, useMemo } from 'react';
import { useDependencyGraph, type GraphNode as ApiGraphNode, type GraphEdge as ApiGraphEdge } from '@/shared/hooks/useAnalysis';

export interface GraphNode {
  id: string;
  label: string;
  objectType: 'procedure' | 'function' | 'trigger' | 'view' | 'table' | 'external';
  schema: string;
  complexity?: number;
  riskLevel?: string;
  securityIssues: number;
  lineCount?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'calls' | 'reads_from' | 'writes_to' | 'references';
  isDynamic: boolean;
  confidence: number;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function getRiskLevel(complexity?: number): string {
  if (!complexity) return 'low';
  if (complexity <= 5) return 'low';
  if (complexity <= 10) return 'moderate';
  if (complexity <= 20) return 'high';
  return 'critical';
}

function mapApiToGraphData(apiNodes: ApiGraphNode[], apiEdges: ApiGraphEdge[]): GraphData {
  const nodes: GraphNode[] = apiNodes.map((n) => ({
    id: n.id,
    label: n.label,
    objectType: (n.objectType || 'procedure') as GraphNode['objectType'],
    schema: n.schemaName,
    complexity: n.complexity,
    riskLevel: getRiskLevel(n.complexity),
    securityIssues: n.securityIssueCount || 0,
  }));

  const edges: GraphEdge[] = apiEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: (e.dependencyType || 'calls') as GraphEdge['type'],
    isDynamic: e.isDynamic,
    confidence: e.confidence,
  }));

  return { nodes, edges };
}

const EMPTY_DATA: GraphData = { nodes: [], edges: [] };

export function useGraphData(connectionId?: string | null) {
  const { data: apiData, isLoading } = useDependencyGraph(connectionId ?? null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<Set<string>>(new Set());

  const data = useMemo<GraphData>(() => {
    if (!apiData) return EMPTY_DATA;
    return mapApiToGraphData(apiData.nodes || [], apiData.edges || []);
  }, [apiData]);

  const highlightCallChain = useCallback((nodeId: string) => {
    const visited = new Set<string>();
    const edgeIds = new Set<string>();

    const traverse = (id: string, direction: 'down' | 'up') => {
      if (visited.has(`${id}-${direction}`)) return;
      visited.add(`${id}-${direction}`);
      edgeIds.add(id);

      data.edges.forEach((e) => {
        if (direction === 'down' && e.source === id) {
          edgeIds.add(e.id);
          traverse(e.target, 'down');
        }
        if (direction === 'up' && e.target === id) {
          edgeIds.add(e.id);
          traverse(e.source, 'up');
        }
      });
    };

    traverse(nodeId, 'down');
    traverse(nodeId, 'up');

    const nodeIds = new Set<string>();
    data.edges
      .filter((e) => edgeIds.has(e.id))
      .forEach((e) => { nodeIds.add(e.source); nodeIds.add(e.target); });
    nodeIds.add(nodeId);

    setHighlightedPath(new Set([...nodeIds, ...edgeIds]));
  }, [data]);

  const clearHighlight = useCallback(() => {
    setHighlightedPath(new Set());
  }, []);

  return { data, isLoading, selectedNode, setSelectedNode, highlightedPath, highlightCallChain, clearHighlight };
}
