import { useTranslation } from 'react-i18next';
import {
  Database, Shield, Activity, Workflow, Loader2,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useDashboard } from '@/shared/hooks/useDashboard';

export function DashboardPage() {
  const { t } = useTranslation(['dashboard', 'common']);
  const { data: stats, isLoading } = useDashboard();

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    );
  }

  const statCards = [
    { labelKey: 'dashboard:stats.connections', value: stats.connections, icon: Database, color: 'text-brand-500' },
    { labelKey: 'dashboard:stats.procedures', value: stats.procedures, icon: Workflow, color: 'text-purple-500' },
    { labelKey: 'dashboard:stats.securityIssues', value: stats.securityIssues, icon: Shield, color: 'text-red-500' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">{t('dashboard:title')}</h1>
        <p className="text-surface-500 text-sm mt-1">{t('dashboard:subtitle')}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {statCards.map(({ labelKey, value, icon: Icon, color }) => (
          <div key={labelKey} className="card p-4">
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded-lg bg-surface-100', color)}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-surface-500">{t(labelKey)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Analyses */}
      {stats.recentJobs.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-surface-400" />
            <h3 className="font-semibold text-sm">{t('dashboard:recentAnalyses')}</h3>
          </div>
          <div className="divide-y divide-surface-200">
            {stats.recentJobs.map((job) => (
              <div key={job.id} className="px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Database className="w-4 h-4 text-surface-400" />
                  <div>
                    <p className="text-sm font-medium">{job.connectionName || job.connectionId}</p>
                    <p className="text-xs text-surface-500">{job.engine}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {job.totalObjects != null && (
                    <span className="text-xs text-surface-500">{t('common:badges.objects', { count: job.totalObjects })}</span>
                  )}
                  <span className={cn(
                    'badge',
                    job.status === 'completed' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                    job.status === 'running' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                    job.status === 'pending' && 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
                    job.status === 'failed' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                  )}>
                    {job.status === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                    {t(`common:status.${job.status}`, { defaultValue: job.status })}
                  </span>
                  <span className="text-xs text-surface-400">{new Date(job.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {stats.connections === 0 && (
        <div className="card p-8 text-center">
          <Database className="w-10 h-10 text-surface-300 mx-auto mb-3" />
          <p className="text-surface-500 text-sm">{t('common:noData', { defaultValue: 'No data yet. Add a connection and run an analysis.' })}</p>
        </div>
      )}
    </div>
  );
}
