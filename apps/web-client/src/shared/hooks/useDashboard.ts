import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/lib/api-client';

interface DashboardStats {
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

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<{ success: boolean; data: DashboardStats }>('/analysis/dashboard').then((r) => r.data),
    staleTime: 30_000,
  });
}
