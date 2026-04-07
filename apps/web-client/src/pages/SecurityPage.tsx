import { useState, useMemo } from 'react';
import { Shield, Search, Loader2, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { useConnections } from '@/shared/hooks/useConnections';
import { useProcedures, type ProcedureItem } from '@/shared/hooks/useAnalysis';

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

export function SecurityPage() {
  const { t } = useTranslation(['security', 'common']);
  const { data: connections } = useConnections();
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const activeId = connectionId || (connections?.[0] as any)?.id || null;
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const { data: procData, isLoading } = useProcedures(activeId, { limit: 100 });
  const procedures = procData?.items || [];

  // Flatten all findings across all procedures
  const allFindings = useMemo(() => {
    const findings: { procedure: ProcedureItem; finding: ProcedureItem['securityFindings'][0] }[] = [];
    for (const proc of procedures) {
      for (const f of proc.securityFindings || []) {
        findings.push({ procedure: proc, finding: f });
      }
    }
    return findings.sort((a, b) =>
      SEVERITY_ORDER.indexOf(a.finding.severity) - SEVERITY_ORDER.indexOf(b.finding.severity),
    );
  }, [procedures]);

  const filtered = allFindings.filter((f) => {
    if (severityFilter !== 'all' && f.finding.severity !== severityFilter) return false;
    if (search && !f.procedure.objectName.toLowerCase().includes(search.toLowerCase()) && !f.finding.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Stats
  const stats = useMemo(() => {
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of allFindings) counts[f.finding.severity] = (counts[f.finding.severity] || 0) + 1;
    return counts;
  }, [allFindings]);

  // Complexity stats
  const complexityStats = useMemo(() => {
    const levels = { low: 0, moderate: 0, high: 0, critical: 0 };
    for (const p of procedures) {
      const cc = p.estimatedComplexity || 0;
      if (cc <= 5) levels.low++;
      else if (cc <= 10) levels.moderate++;
      else if (cc <= 20) levels.high++;
      else levels.critical++;
    }
    return levels;
  }, [procedures]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-brand-500" />
            {t('security:title')}
          </h1>
          <p className="text-surface-500 text-sm mt-1">
            {t('security:subtitle', { count: allFindings.length, procedures: procedures.length })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {connections && connections.length > 0 && (
            <select value={activeId || ''} onChange={(e) => setConnectionId(e.target.value || null)} className="input w-48 text-xs">
              {(connections as any[]).map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {SEVERITY_ORDER.map((sev) => (
          <div key={sev} className={cn('card p-4 cursor-pointer transition-all',
            severityFilter === sev && 'ring-2 ring-brand-500')}
            onClick={() => setSeverityFilter(severityFilter === sev ? 'all' : sev)}>
            <div className="flex items-center justify-between">
              <span className={cn('badge',
                sev === 'critical' && 'badge-critical', sev === 'high' && 'badge-high',
                sev === 'medium' && 'badge-medium', sev === 'low' && 'badge-low',
                sev === 'info' && 'badge-info')}>{t(`common:severity.${sev}`)}</span>
              <span className="text-2xl font-bold">{stats[sev]}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Complexity overview */}
      <div className="card p-5">
        <h3 className="font-semibold text-sm mb-3">{t('security:complexityDistribution', { count: procedures.length })}</h3>
        <div className="grid grid-cols-4 gap-4">
          {Object.entries(complexityStats).map(([level, count]) => (
            <div key={level} className="text-center">
              <div className="h-2 rounded-full bg-surface-200 mb-2">
                <div className={cn('h-full rounded-full',
                  level === 'low' && 'bg-complexity-low', level === 'moderate' && 'bg-complexity-moderate',
                  level === 'high' && 'bg-complexity-high', level === 'critical' && 'bg-complexity-critical')}
                  style={{ width: `${procedures.length ? (count / procedures.length) * 100 : 0}%` }} />
              </div>
              <p className="text-lg font-bold">{count}</p>
              <p className="text-[10px] text-surface-500 uppercase">{t(`common:complexity.${level}`)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
        <input className="input pl-10" placeholder={t('security:searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Findings list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="text-center animate-fade-in">
            <Loader2 className="w-6 h-6 animate-spin text-brand-500 mx-auto mb-2" />
            <p className="text-xs text-surface-400 animate-pulse-subtle">{t('common:loading')}</p>
          </div>
        </div>
      ) : allFindings.length === 0 ? (
        <div className="card p-8 text-center">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
          <h3 className="font-semibold text-lg">{t('security:emptyState.title')}</h3>
          <p className="text-surface-500 text-sm mt-1">{t('security:emptyState.message', { count: procedures.length })}</p>
          <p className="text-surface-400 text-xs mt-3">{t('security:emptyState.hint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item, i) => (
            <div key={i} className="card p-4">
              <div className="flex items-start gap-3">
                <span className={cn('badge mt-0.5',
                  item.finding.severity === 'critical' && 'badge-critical', item.finding.severity === 'high' && 'badge-high',
                  item.finding.severity === 'medium' && 'badge-medium', item.finding.severity === 'low' && 'badge-low',
                  item.finding.severity === 'info' && 'badge-info')}>
                  {t(`common:severity.${item.finding.severity}`)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.finding.message}</p>
                  <p className="text-xs font-mono text-surface-500 mt-1">{item.procedure.fullQualifiedName}</p>
                  {item.finding.line && <p className="text-xs text-surface-400">{t('security:line', { number: item.finding.line })}</p>}
                  {item.finding.recommendation && (
                    <p className="text-xs text-brand-600 dark:text-brand-400 mt-1">{t('security:fix', { recommendation: item.finding.recommendation })}</p>
                  )}
                </div>
                <span className="badge-info text-[10px]">{item.finding.findingType}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
