import { useNavigate } from 'react-router-dom';
import { X, GitBranch, Shield, Code, Layers, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GraphNode } from '../hooks/useGraphData';
import { cn } from '@/shared/lib/utils';

interface Props {
  node: GraphNode;
  connectionId?: string | null;
  onClose: () => void;
  onTraceCallChain: (nodeId: string) => void;
}

export function NodeDetailPanel({ node, connectionId, onClose, onTraceCallChain }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  return (
    <div className="w-80 border-l border-surface-200 bg-surface-50 flex flex-col animate-slide-up">
      {/* Header */}
      <div className="p-4 border-b border-surface-200 flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
              {node.objectType}
            </span>
            {node.securityIssues > 0 && (
              <span className="badge-critical">
                <Shield className="w-3 h-3" />
                {node.securityIssues}
              </span>
            )}
          </div>
          <h3 className="font-mono font-bold text-sm truncate">{node.label}</h3>
          <p className="text-xs text-surface-500 mt-0.5">{node.schema || 'unknown'} schema</p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-surface-200 text-surface-400">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Metrics */}
      {node.objectType !== 'table' && node.objectType !== 'external' && (
        <div className="p-4 border-b border-surface-200 grid grid-cols-2 gap-3">
          <MetricCard
            label={t('metrics.complexity')}
            value={`CC=${node.complexity || 0}`}
            tooltip={t('tooltips.cc')}
            color={
              node.riskLevel === 'critical' ? 'text-red-500' :
              node.riskLevel === 'high' ? 'text-orange-500' :
              node.riskLevel === 'moderate' ? 'text-yellow-500' :
              'text-emerald-500'
            }
          />
          <MetricCard label={t('metrics.risk')} value={node.riskLevel ? t(`complexity.${node.riskLevel}`) : t('complexity.low')} />
          <MetricCard label={t('metrics.lines')} value={String(node.lineCount || 0)} />
          <MetricCard label={t('metrics.security')} value={node.securityIssues > 0 ? `${node.securityIssues} ${t('metrics.issues')}` : t('metrics.clean')} color={node.securityIssues > 0 ? 'text-red-500' : 'text-emerald-500'} />
        </div>
      )}

      {/* Actions */}
      <div className="p-4 space-y-2">
        <button
          onClick={() => onTraceCallChain(node.id)}
          className="btn-secondary w-full text-xs"
        >
          <GitBranch className="w-3.5 h-3.5" />
          {t('actions.traceCallChain')}
        </button>
        <button className="btn-ghost w-full text-xs">
          <Code className="w-3.5 h-3.5" />
          {t('actions.viewSource')}
        </button>
        <button
          onClick={() => connectionId && navigate(`/flow/${connectionId}/${node.id}`)}
          className={cn('btn-ghost w-full text-xs', !connectionId && 'opacity-50 pointer-events-none')}
        >
          <Activity className="w-3.5 h-3.5" />
          {t('actions.viewFlow')}
        </button>
        <button className="btn-ghost w-full text-xs">
          <Layers className="w-3.5 h-3.5" />
          {t('actions.viewDocs')}
        </button>
      </div>

      {/* Legend */}
      <div className="mt-auto p-4 border-t border-surface-200">
        <p className="text-[10px] uppercase text-surface-400 font-semibold mb-2">{t('legend.nodeTypes')}</p>
        <div className="grid grid-cols-2 gap-1">
          {Object.entries({
            procedure: '#3b82f6',
            function: '#8b5cf6',
            trigger: '#f59e0b',
            table: '#10b981',
            external: '#ef4444',
          }).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-surface-500 capitalize">{t(`nodeTypes.${type}`)}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] uppercase text-surface-400 font-semibold mb-2 mt-3">{t('legend.edgeTypes')}</p>
        <div className="grid grid-cols-2 gap-1">
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 bg-gray-400" />
            <span className="text-[10px] text-surface-500">{t('edgeTypes.calls')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 bg-emerald-500" />
            <span className="text-[10px] text-surface-500">{t('edgeTypes.reads')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 bg-amber-500" />
            <span className="text-[10px] text-surface-500">{t('edgeTypes.writes')}</span>
          </div>
          <div className="flex items-center gap-2 cursor-help" title={t('tooltips.dynamic')}>
            <span className="w-4 h-0.5 bg-gray-400 border-t-2 border-dashed" />
            <span className="text-[10px] text-surface-500">{t('edgeTypes.dynamic')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color, tooltip }: { label: string; value: string; color?: string; tooltip?: string }) {
  return (
    <div className={cn('rounded-lg bg-surface-100 p-2', tooltip && 'cursor-help')} title={tooltip}>
      <p className="text-[10px] text-surface-400 uppercase">{label}</p>
      <p className={cn('text-sm font-semibold', color || 'text-surface-800')}>{value}</p>
    </div>
  );
}
