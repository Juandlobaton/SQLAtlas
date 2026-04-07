import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Database, Plus, TestTube, Trash2, RefreshCw, CheckCircle, XCircle,
  Server, AlertCircle, Plug, Eye, EyeOff, Loader2,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  useConnections, useCreateConnection, useTestConnection, useDeleteConnection,
} from '@/shared/hooks/useConnections';
import { useStartAnalysis } from '@/shared/hooks/useAnalysis';
import { useToast } from '@/shared/components/Toast';
import { SkeletonCard } from '@/shared/components/Skeleton';

const ENGINE_META: Record<string, { label: string; color: string; icon: string; defaultPort: number }> = {
  sqlserver: { label: 'SQL Server', color: 'bg-red-500', icon: 'SS', defaultPort: 1433 },
  postgresql: { label: 'PostgreSQL', color: 'bg-blue-500', icon: 'PG', defaultPort: 5432 },
  oracle: { label: 'Oracle', color: 'bg-orange-500', icon: 'OR', defaultPort: 1521 },
};

export function ConnectionsPage() {
  const { t } = useTranslation(['connections', 'common']);
  const { data: connections, isLoading } = useConnections();
  const createMutation = useCreateConnection();
  const testMutation = useTestConnection();
  const deleteMutation = useDeleteConnection();
  const analysisMutation = useStartAnalysis();

  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formEngine, setFormEngine] = useState('postgresql');
  const [form, setForm] = useState({ name: '', host: 'localhost', port: 5432, databaseName: '', username: '', password: '' });
  const [testPassword, setTestPassword] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const toast = useToast();

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync({
        name: form.name,
        engine: formEngine,
        host: form.host,
        port: form.port,
        databaseName: form.databaseName,
        username: form.username,
        password: form.password,
        useSsl: false,
      });
      setShowForm(false);
      setForm({ name: '', host: 'localhost', port: 5432, databaseName: '', username: '', password: '' });
      toast.success(t('connections:toast.created'), t('connections:toast.createdMsg', { name: form.name }));
    } catch (err: any) {
      toast.error(t('connections:toast.createFailed'), err.message);
    }
  };

  const handleTest = async (connId: string) => {
    const pwd = testPassword[connId];
    if (!pwd) {
      toast.warning(t('connections:toast.passwordRequired'), t('connections:toast.passwordRequiredMsg'));
      return;
    }
    try {
      const result = await testMutation.mutateAsync({ id: connId, password: pwd });
      setTestResults((prev) => ({ ...prev, [connId]: result }));
      if (result.success) {
        const counts = result.objectCounts;
        toast.success(t('connections:toast.testSuccess'),
          `${result.latencyMs}ms — ${counts?.functions || 0} functions, ${counts?.procedures || 0} procedures`);
      } else {
        toast.error(t('connections:toast.testFailed'), result.errorMessage || t('connections:toast.unableToConnect'));
      }
    } catch (err: any) {
      toast.error(t('connections:toast.testFailed'), err.message);
    }
  };

  const handleAnalyze = async (connId: string) => {
    try {
      const result = await analysisMutation.mutateAsync({ connectionId: connId });
      toast.success(t('connections:toast.analysisStarted'), t('connections:toast.analysisStartedMsg', { jobId: result.jobId.slice(0, 8) }));
    } catch (err: any) {
      toast.error(t('connections:toast.analysisFailed'), err.message);
    }
  };

  const handleDelete = async (connId: string, connName: string) => {
    try {
      await deleteMutation.mutateAsync(connId);
      toast.info(t('connections:toast.deleted'), t('connections:toast.deletedMsg', { name: connName }));
    } catch (err: any) {
      toast.error(t('connections:toast.deleteFailed'), err.message);
    }
  };

  const getStatus = (conn: any): 'connected' | 'failed' | 'untested' => {
    if (!conn.lastTestStatus) return 'untested';
    return conn.lastTestStatus === 'success' ? 'connected' : 'failed';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('connections:title')}</h1>
          <p className="text-surface-500 text-sm mt-1">{t('connections:subtitle')}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus className="w-4 h-4" />
          {t('connections:addConnection')}
        </button>
      </div>

      {/* New Connection Form */}
      {showForm && (
        <div className="card p-6 animate-slide-up">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Plug className="w-4 h-4 text-brand-500" />
            {t('connections:newConnection')}
          </h3>

          <div className="grid grid-cols-3 gap-3 mb-6">
            {Object.entries(ENGINE_META).map(([key, { label, color, icon }]) => (
              <button key={key} onClick={() => { setFormEngine(key); setForm((f) => ({ ...f, port: ENGINE_META[key].defaultPort })); }}
                className={cn('p-4 rounded-lg border-2 text-center transition-all',
                  formEngine === key ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-surface-200 hover:border-surface-300')}>
                <div className={cn('w-10 h-10 rounded-lg mx-auto mb-2 flex items-center justify-center text-white font-bold text-sm', color)}>{icon}</div>
                <p className="text-sm font-medium">{label}</p>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">{t('connections:form.name')}</label>
              <input className="input" placeholder={t('connections:form.namePlaceholder')} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">{t('connections:form.host')}</label>
              <input className="input" placeholder="localhost" value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">{t('connections:form.port')}</label>
              <input className="input" type="number" value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">{t('connections:form.database')}</label>
              <input className="input" placeholder={t('connections:form.databasePlaceholder')} value={form.databaseName} onChange={(e) => setForm((f) => ({ ...f, databaseName: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">{t('connections:form.username')}</label>
              <input className="input" placeholder={t('connections:form.usernamePlaceholder')} value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">{t('connections:form.password')}</label>
              <div className="relative">
                <input className="input pr-10" type={showPassword ? 'text' : 'password'} placeholder="********"
                  value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                <button onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {createMutation.error && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-400">
              {(createMutation.error as Error).message}
            </div>
          )}

          <div className="flex items-center gap-3 mt-6">
            <button onClick={handleCreate} disabled={createMutation.isPending} className="btn-primary">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
              {createMutation.isPending ? t('connections:form.saving') : t('connections:form.save')}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">{t('common:cancel')}</button>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} lines={4} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && connections?.length === 0 && (
        <div className="text-center py-12">
          <Database className="w-12 h-12 mx-auto mb-3 text-surface-300" />
          <p className="text-surface-500">{t('connections:empty')}</p>
        </div>
      )}

      {/* Connection Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {(connections || []).map((conn: any) => {
          const meta = ENGINE_META[conn.engine] || ENGINE_META.postgresql;
          const status = getStatus(conn);
          const testResult = testResults[conn.id];
          return (
            <div key={conn.id} className="card-hover p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm', meta.color)}>
                    {meta.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{conn.name}</h3>
                    <p className="text-xs text-surface-500">{meta.label}</p>
                  </div>
                </div>
                <span className={cn('badge',
                  status === 'connected' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                  status === 'failed' && 'badge-critical',
                  status === 'untested' && 'badge-info')}>
                  {status === 'connected' && <CheckCircle className="w-3 h-3" />}
                  {status === 'failed' && <XCircle className="w-3 h-3" />}
                  {status === 'untested' && <AlertCircle className="w-3 h-3" />}
                  {t(`connections:status.${status}`)}
                </span>
              </div>

              <div className="space-y-1 mb-4">
                <div className="flex items-center gap-2 text-xs text-surface-500">
                  <Server className="w-3 h-3" />
                  {conn.host}:{conn.port} / {conn.databaseName}
                </div>
                {conn.lastTestedAt && (
                  <p className="text-[11px] text-surface-400">{t('connections:tested')} {new Date(conn.lastTestedAt).toLocaleString()}</p>
                )}
              </div>

              {/* Test result counts */}
              {testResult?.objectCounts && (
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {Object.entries(testResult.objectCounts).map(([key, val]: [string, any]) => (
                    <div key={key} className="text-center p-2 rounded bg-surface-100">
                      <p className="text-sm font-bold">{val.toLocaleString()}</p>
                      <p className="text-[10px] text-surface-500 capitalize">{key}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Test password input */}
              <div className="flex items-center gap-2 mb-3">
                <input className="input text-xs flex-1" type="password" placeholder={t('connections:passwordPlaceholder')}
                  value={testPassword[conn.id] || ''}
                  onChange={(e) => setTestPassword((p) => ({ ...p, [conn.id]: e.target.value }))} />
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => handleAnalyze(conn.id)} disabled={analysisMutation.isPending}
                  className="btn-secondary flex-1 text-xs">
                  {analysisMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {t('common:analyze')}
                </button>
                <button onClick={() => handleTest(conn.id)} disabled={testMutation.isPending || !testPassword[conn.id]}
                  className="btn-ghost text-xs">
                  {testMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
                  {t('connections:test')}
                </button>
                <button onClick={() => handleDelete(conn.id, conn.name)} disabled={deleteMutation.isPending}
                  className="btn-ghost text-xs text-red-500 hover:text-red-600">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              {/* Test result message */}
              {testResult && (
                <div className={cn('mt-3 p-2 rounded text-xs',
                  testResult.success ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400')}>
                  {testResult.success
                    ? t('connections:connectedIn', { latency: testResult.latencyMs, version: testResult.serverVersion?.split(' ').slice(0, 2).join(' ') })
                    : testResult.errorMessage || t('connections:toast.testFailed')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
