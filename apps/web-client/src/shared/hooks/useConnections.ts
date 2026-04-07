import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/lib/api-client';

interface Connection {
  id: string;
  name: string;
  engine: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  useSsl: boolean;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  isActive: boolean;
  createdAt: string;
}

interface TestResult {
  success: boolean;
  latencyMs: number;
  serverVersion?: string;
  errorMessage?: string;
  objectCounts?: { procedures: number; functions: number; triggers: number; views: number };
}

type ApiResponse<T> = { success: boolean; data: T };

export function useConnections() {
  return useQuery({
    queryKey: ['connections'],
    queryFn: () => api.get<ApiResponse<Connection[]>>('/connections').then((r) => r.data),
  });
}

export function useCreateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string; engine: string; host: string; port: number;
      databaseName: string; username: string; password: string; useSsl?: boolean;
    }) => api.post<ApiResponse<Connection>>('/connections', data).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['connections'] }); },
  });
}

export function useTestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post<ApiResponse<TestResult>>(`/connections/${id}/test`, { password }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['connections'] }); },
  });
}

export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/connections/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['connections'] }); },
  });
}
