import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/lib/api-client';

type ApiResponse<T> = { success: boolean; data: T };

interface AnalysisJob { jobId: string }

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: { totalNodes: number; totalEdges: number; maxDepth: number; rootNodeIds: string[]; leafNodeIds: string[]; circularDependencies: string[][] };
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

export interface ProcedureItem {
  id: string;
  objectName: string;
  schemaName: string;
  objectType: string;
  fullQualifiedName: string;
  language: string;
  lineCount: number;
  estimatedComplexity: number | null;
  securityFindings: { severity: string; findingType: string; message: string; line?: number; recommendation?: string }[];
  autoDoc: Record<string, unknown> | null;
  flowTree: Record<string, unknown> | null;
  rawDefinition: string;
  parameters: { name: string; dataType: string; mode: string; defaultValue?: string }[];
}

export interface PaginatedProcedures {
  items: ProcedureItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function useStartAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { connectionId: string }) =>
      api.post<ApiResponse<AnalysisJob>>('/analysis/start', data).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['analysis'] }); },
  });
}

export function useProcedures(connectionId: string | null, options?: { page?: number; limit?: number; search?: string; schema?: string; securityOnly?: boolean }) {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.search) params.set('search', options.search);
  if (options?.schema) params.set('schema', options.schema);
  if (options?.securityOnly) params.set('securityOnly', 'true');
  const qs = params.toString();

  return useQuery({
    queryKey: ['procedures', connectionId, qs],
    queryFn: () => api.get<ApiResponse<PaginatedProcedures>>(`/analysis/procedures/${connectionId}${qs ? `?${qs}` : ''}`).then((r) => r.data),
    gcTime: 2 * 60_000, // 2 minutes instead of default 5 min
    enabled: !!connectionId,
  });
}

export function useProcedure(connectionId: string | null, procedureId: string | null) {
  return useQuery({
    queryKey: ['procedure', procedureId],
    queryFn: () => api.get<ApiResponse<ProcedureItem>>(`/analysis/procedures/${connectionId}/${procedureId}`).then((r) => r.data),
    enabled: !!connectionId && !!procedureId,
  });
}

export function useDependencyGraph(connectionId: string | null) {
  return useQuery({
    queryKey: ['analysis', 'graph', connectionId],
    queryFn: () => api.get<ApiResponse<GraphData>>(`/analysis/graph/${connectionId}`).then((r) => r.data),
    gcTime: 60_000, // 1 minute instead of default 5 min
    enabled: !!connectionId,
  });
}
