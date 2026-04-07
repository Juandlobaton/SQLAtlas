import { useTranslation } from 'react-i18next';
import {
  Database, GitBranch, Shield, AlertTriangle, Activity, Layers, Table2, Workflow,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';

const stats = [
  { labelKey: 'dashboard:stats.connections', value: '3', icon: Database, color: 'text-brand-500' },
  { labelKey: 'dashboard:stats.procedures', value: '127', icon: Workflow, color: 'text-purple-500' },
  { labelKey: 'dashboard:stats.dependencies', value: '117', icon: GitBranch, color: 'text-emerald-500' },
  { labelKey: 'dashboard:stats.tables', value: '185', icon: Table2, color: 'text-cyan-500' },
  { labelKey: 'dashboard:stats.schemas', value: '18', icon: Layers, color: 'text-amber-500' },
  { labelKey: 'dashboard:stats.securityIssues', value: '3', icon: Shield, color: 'text-red-500' },
];

const recentAnalyses = [
  { db: 'Banking Demo', engine: 'PostgreSQL', status: 'completed', objects: 53, time: '5m ago' },
  { db: 'SQL Server Test', engine: 'SQL Server', status: 'completed', objects: 21, time: '12m ago' },
  { db: 'Oracle PL/SQL Test', engine: 'Oracle', status: 'completed', objects: 53, time: '18m ago' },
];

const securityAlerts = [
  { severity: 'high', message: 'Dynamic SQL without parameterization', procedure: 'banking.process_card_transaction' },
  { severity: 'medium', message: 'Missing input validation', procedure: 'fraud.check_transaction' },
  { severity: 'low', message: 'Unused parameter detected', procedure: 'reports.generate_daily_report' },
];

export function DashboardPage() {
  const { t } = useTranslation(['dashboard', 'common']);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">{t('dashboard:title')}</h1>
        <p className="text-surface-500 text-sm mt-1">{t('dashboard:subtitle')}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map(({ labelKey, value, icon: Icon, color }) => (
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Analyses */}
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-surface-400" />
            <h3 className="font-semibold text-sm">{t('dashboard:recentAnalyses')}</h3>
          </div>
          <div className="divide-y divide-surface-200">
            {recentAnalyses.map((a) => (
              <div key={a.db} className="px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Database className="w-4 h-4 text-surface-400" />
                  <div>
                    <p className="text-sm font-medium">{a.db}</p>
                    <p className="text-xs text-surface-500">{a.engine}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-surface-500">{t('common:badges.objects', { count: a.objects })}</span>
                  <span className={cn(
                    'badge',
                    a.status === 'completed' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                    a.status === 'running' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                    a.status === 'pending' && 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
                  )}>
                    {a.status === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                    {t(`common:status.${a.status}`)}
                  </span>
                  <span className="text-xs text-surface-400">{a.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Security Alerts */}
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-severity-high" />
            <h3 className="font-semibold text-sm">{t('dashboard:securityAlerts')}</h3>
            <span className="badge-critical ml-auto">{securityAlerts.length}</span>
          </div>
          <div className="divide-y divide-surface-200">
            {securityAlerts.map((a) => (
              <div key={`${a.severity}-${a.procedure}`} className="px-5 py-3">
                <div className="flex items-start gap-3">
                  <span className={cn(
                    'badge mt-0.5',
                    a.severity === 'critical' && 'badge-critical',
                    a.severity === 'high' && 'badge-high',
                    a.severity === 'medium' && 'badge-medium',
                  )}>
                    {t(`common:severity.${a.severity}`)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm">{a.message}</p>
                    <p className="text-xs text-surface-500 font-mono mt-0.5">{a.procedure}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
