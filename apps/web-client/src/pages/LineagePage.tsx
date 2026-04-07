import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Network, Search, Loader2, Database, Table2, GitBranch, ChevronRight,
  ArrowRight, Workflow, Shield, Eye, Code,
  LayoutGrid, List, Columns,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { useConnections } from '@/shared/hooks/useConnections';
import { useProcedures, useDependencyGraph, type ProcedureItem, type GraphNode, type GraphEdge } from '@/shared/hooks/useAnalysis';
import { parserApi } from '@/shared/lib/api-client';

type ViewMode = 'explorer' | 'lineage' | 'matrix' | 'impact';

const TYPE_ICONS: Record<string, { icon: typeof Database; color: string; bg: string; label: string }> = {
  procedure: { icon: Workflow, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', label: 'PROC' },
  function:  { icon: Code, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30', label: 'FUNC' },
  trigger:   { icon: GitBranch, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', label: 'TRIG' },
  view:      { icon: Eye, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30', label: 'VIEW' },
  table:     { icon: Table2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', label: 'TABLE' },
};

// Schema color palette — each schema gets a distinct accent
const SCHEMA_COLORS = [
  'border-l-blue-500', 'border-l-emerald-500', 'border-l-purple-500',
  'border-l-amber-500', 'border-l-rose-500', 'border-l-cyan-500',
  'border-l-indigo-500', 'border-l-orange-500', 'border-l-teal-500',
  'border-l-pink-500', 'border-l-lime-500', 'border-l-sky-500',
];
const SCHEMA_DOT_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500',
  'bg-indigo-500', 'bg-orange-500', 'bg-teal-500',
  'bg-pink-500', 'bg-lime-500', 'bg-sky-500',
];
function schemaColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return Math.abs(hash) % SCHEMA_COLORS.length;
}

const OP_COLORS: Record<string, string> = {
  calls: 'text-blue-400 bg-blue-500/10',
  reads_from: 'text-emerald-400 bg-emerald-500/10',
  writes_to: 'text-amber-400 bg-amber-500/10',
  references: 'text-purple-400 bg-purple-500/10',
};

export function LineagePage() {
  const { t } = useTranslation(['lineage', 'common']);
  const { data: connections } = useConnections();
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const activeId = connectionId || (connections?.[0] as any)?.id || null;

  const [view, setView] = useState<ViewMode>('explorer');
  const [search, setSearch] = useState('');
  const [schemaFilter, setSchemaFilter] = useState('');
  const [selectedProc, setSelectedProc] = useState<ProcedureItem | null>(null);
  const [flowData, setFlowData] = useState<any>(null);
  const [loadingFlow, setLoadingFlow] = useState(false);

  const { data: procData, isLoading: procsLoading } = useProcedures(activeId, { limit: 500, search: search || undefined, schema: schemaFilter || undefined });
  const { data: graphData } = useDependencyGraph(activeId);

  const procedures = procData?.items || [];
  const nodes = graphData?.nodes || [];
  const edges = graphData?.edges || [];

  // Group by schema
  const schemas = useMemo(() => {
    const map = new Map<string, ProcedureItem[]>();
    for (const p of procedures) {
      const list = map.get(p.schemaName) || [];
      list.push(p);
      map.set(p.schemaName, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [procedures]);

  // Lineage for selected procedure (deduplicated)
  const lineage = useMemo(() => {
    if (!selectedProc) return { upstream: [] as GraphEdge[], downstream: [] as GraphEdge[], tables: [] as GraphEdge[] };
    const nodeId = nodes.find(n => n.label === selectedProc.objectName)?.id;
    if (!nodeId) return { upstream: [], downstream: [], tables: [] };

    // Deduplicate by target to avoid repeated edges
    const dedup = (arr: GraphEdge[]) => {
      const seen = new Set<string>();
      return arr.filter(e => {
        const key = `${e.source}-${e.target}-${e.dependencyType}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    return {
      upstream: dedup(edges.filter(e => e.target === nodeId)),
      downstream: dedup(edges.filter(e => e.source === nodeId && e.dependencyType === 'calls')),
      tables: dedup(edges.filter(e => e.source === nodeId && e.dependencyType !== 'calls')),
    };
  }, [selectedProc, nodes, edges]);

  const handleSelectProc = async (proc: ProcedureItem) => {
    setSelectedProc(proc);
    if (view === 'lineage') {
      setLoadingFlow(true);
      try {
        const result = await parserApi.parse(proc.rawDefinition, proc.language || 'postgres');
        if (result.success && result.data?.[0]) setFlowData(result.data[0]);
      } catch { /* */ }
      finally { setLoadingFlow(false); }
    }
  };

  const findNodeLabel = (id: string) => nodes.find(n => n.id === id)?.label || id.replace('ext_', '').replace(/_/g, '.').slice(0, 30);
  const findNodeType = (id: string) => nodes.find(n => n.id === id)?.objectType || (id.startsWith('ext_') ? 'external' : 'procedure');

  const views: { id: ViewMode; labelKey: string; icon: typeof Network }[] = [
    { id: 'explorer', labelKey: 'tabs.explorer', icon: LayoutGrid },
    { id: 'lineage', labelKey: 'tabs.lineage', icon: Columns },
    { id: 'matrix', labelKey: 'tabs.matrix', icon: List },
    { id: 'impact', labelKey: 'tabs.impact', icon: GitBranch },
  ];

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Network className="w-6 h-6 text-brand-500" />
            {t('title')}
          </h1>
          <p className="text-surface-500 text-sm mt-1">
            {t('subtitle', { objects: procData?.total || 0, deps: edges.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connections && (connections as any[]).length > 0 && (
            <select value={activeId || ''} onChange={(e) => { setConnectionId(e.target.value); setSelectedProc(null); setFlowData(null); }} className="input w-44 text-xs">
              {(connections as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <div className="flex bg-surface-100 rounded-lg p-0.5">
            {views.map(({ id, labelKey, icon: Icon }) => (
              <button key={id} onClick={() => setView(id)} title={t(`descriptions.${id}`)}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  view === id ? 'bg-brand-600 text-white shadow-sm' : 'text-surface-500 hover:text-surface-700')}>
                <Icon className="w-3.5 h-3.5" /> {t(labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Description bar */}
      <div className="mb-3 px-3 py-2 rounded-lg bg-surface-100/50 border border-surface-200/50">
        <p className="text-xs text-surface-500">{t(`descriptions.${view}`)}</p>
      </div>

      {/* Search + Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input className="input pl-9 text-xs" placeholder={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select value={schemaFilter} onChange={(e) => setSchemaFilter(e.target.value)} className="input w-40 text-xs">
          <option value="">{t('allSchemas')}</option>
          {schemas.map(([s, items]) => <option key={s} value={s}>{s} ({items.length})</option>)}
        </select>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden rounded-xl border border-surface-200">
        {procsLoading ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>
        ) : view === 'explorer' ? (
          <ExplorerView schemas={schemas} selectedProc={selectedProc} onSelect={handleSelectProc} connectionId={activeId} />
        ) : view === 'lineage' ? (
          <LineageView
            selectedProc={selectedProc}
            procedures={procedures}
            lineage={lineage}
            flowData={flowData}
            loadingFlow={loadingFlow}
            findNodeLabel={findNodeLabel}
            findNodeType={findNodeType}
            onSelect={handleSelectProc}
          />
        ) : view === 'matrix' ? (
          <MatrixView edges={edges} nodes={schemaFilter ? nodes.filter(n => n.schemaName === schemaFilter) : nodes} findNodeLabel={findNodeLabel} />
        ) : (
          <ImpactView edges={edges} findNodeLabel={findNodeLabel} findNodeType={findNodeType} />
        )}
      </div>
    </div>
  );
}

/* ── SCHEMA EXPLORER VIEW ── */
function ExplorerView({ schemas, selectedProc, onSelect, connectionId }: {
  schemas: [string, ProcedureItem[]][];
  selectedProc: ProcedureItem | null;
  onSelect: (p: ProcedureItem) => void;
  connectionId: string | null;
}) {
  const { t } = useTranslation(['lineage', 'common']);
  const [expandedSchema, setExpandedSchema] = useState<string | null>(schemas[0]?.[0] || null);

  return (
    <div className="flex h-full">
      {/* Schema list */}
      <div className="w-64 border-r border-surface-200 overflow-y-auto bg-surface-50">
        <div className="p-3 border-b border-surface-200">
          <h3 className="text-xs font-semibold text-surface-500 uppercase">{t('schemas')}</h3>
        </div>
        {schemas.map(([schema, items]) => (
          <div key={schema}>
            <button onClick={() => setExpandedSchema(expandedSchema === schema ? null : schema)}
              className={cn('w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-surface-100 transition-colors border-l-2',
                SCHEMA_COLORS[schemaColorIndex(schema)],
                expandedSchema === schema && 'bg-brand-50 dark:bg-brand-900/20')}>
              <div className="flex items-center gap-2">
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0', SCHEMA_DOT_COLORS[schemaColorIndex(schema)])} />
                <span className="font-medium">{schema}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-surface-200 dark:bg-surface-300 text-surface-600 px-1.5 py-0.5 rounded">{items.length}</span>
                <ChevronRight className={cn('w-3 h-3 text-surface-400 transition-transform', expandedSchema === schema && 'rotate-90')} />
              </div>
            </button>
            {expandedSchema === schema && (
              <div className="bg-surface-100/50">
                {items.map((proc) => {
                  const cfg = TYPE_ICONS[proc.objectType] || TYPE_ICONS.procedure;
                  const Icon = cfg.icon;
                  return (
                    <button key={proc.id} onClick={() => onSelect(proc)}
                      className={cn('w-full flex items-center gap-2 px-6 py-2 text-xs hover:bg-surface-200/50 transition-colors',
                        selectedProc?.id === proc.id && 'bg-brand-100 dark:bg-brand-900/30')}>
                      <Icon className={cn('w-3.5 h-3.5', cfg.color)} />
                      <span className="font-mono truncate flex-1 text-left">{proc.objectName}</span>
                      {proc.estimatedComplexity && proc.estimatedComplexity > 10 && (
                        <span title={t('common:tooltips.cc')} className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 cursor-help">CC={proc.estimatedComplexity}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedProc ? (
          <div className="flex items-center justify-center h-full text-surface-400">
            <div className="text-center">
              <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t('selectProcedure')}</p>
            </div>
          </div>
        ) : (
          <ProcedureDetail proc={selectedProc} connectionId={connectionId} />
        )}
      </div>
    </div>
  );
}

/* ── PROCEDURE DETAIL CARD ── */
function ProcedureDetail({ proc, connectionId }: { proc: ProcedureItem; connectionId: string | null }) {
  const { t } = useTranslation(['lineage', 'common']);
  const navigate = useNavigate();
  const cfg = TYPE_ICONS[proc.objectType] || TYPE_ICONS.procedure;
  const Icon = cfg.icon;
  const cc = proc.estimatedComplexity || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className={cn('w-12 h-12 rounded-xl border flex items-center justify-center', cfg.bg)}>
          <Icon className={cn('w-6 h-6', cfg.color)} />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold font-mono">{proc.fullQualifiedName}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-surface-500">{proc.objectType} / {proc.language}</span>
            <span className="text-xs text-surface-500">{t('detail.lines', { count: proc.lineCount })}</span>
            <span title={t('common:tooltips.cc')} className={cn('text-xs px-1.5 py-0.5 rounded font-medium cursor-help',
              cc <= 5 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
              cc <= 10 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
              cc <= 20 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
              'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400')}>
              CC={cc}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => connectionId && navigate(`/explorer/${connectionId}/${proc.id}`)}
              className="btn-ghost text-xs"
              title={t('detail.openInExplorer', { defaultValue: 'Open in SQL Explorer' })}
            >
              <Code className="w-3.5 h-3.5" />
              <span>{t('detail.openInExplorer', { defaultValue: 'SQL Explorer' })}</span>
            </button>
            <button
              onClick={() => connectionId && navigate(`/flow/${connectionId}/${proc.id}`)}
              className="btn-ghost text-xs"
              title={t('detail.openInFlow', { defaultValue: 'View in Flow Analysis' })}
            >
              <Workflow className="w-3.5 h-3.5" />
              <span>{t('detail.openInFlow', { defaultValue: 'Flow Analysis' })}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Params */}
      {proc.parameters?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-surface-500 uppercase mb-2">{t('detail.parameters')}</h4>
          <div className="rounded-lg border border-surface-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-surface-100"><tr>
                <th className="px-3 py-2 text-left text-surface-500 font-medium">{t('detail.paramName')}</th>
                <th className="px-3 py-2 text-left text-surface-500 font-medium">{t('detail.paramType')}</th>
                <th className="px-3 py-2 text-left text-surface-500 font-medium">{t('detail.paramMode')}</th>
              </tr></thead>
              <tbody className="divide-y divide-surface-200">
                {proc.parameters.map((p, i) => (
                  <tr key={i}><td className="px-3 py-1.5 font-mono">{p.name}</td><td className="px-3 py-1.5 text-surface-600">{p.dataType}</td><td className="px-3 py-1.5"><span className="badge-info">{p.mode}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Auto-doc */}
      {proc.autoDoc && (
        <div>
          <h4 className="text-xs font-semibold text-surface-500 uppercase mb-2">{t('detail.documentation')}</h4>
          <div className="card p-4 space-y-2">
            <p className="text-sm">{(proc.autoDoc as any).summary}</p>
            <p className="text-xs text-surface-500">{(proc.autoDoc as any).description}</p>
            {(proc.autoDoc as any).sideEffects?.length > 0 && (
              <div className="pt-2">
                <p className="text-[10px] font-semibold text-surface-500 uppercase">{t('detail.sideEffects')}</p>
                {(proc.autoDoc as any).sideEffects.map((e: string, i: number) => (
                  <p key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                    <ArrowRight className="w-3 h-3" /> {e}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Security */}
      {proc.securityFindings?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-red-500 uppercase mb-2">{t('detail.securityFindings')}</h4>
          {proc.securityFindings.map((f, i) => (
            <div key={i} className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 mb-2">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase">{f.severity}</span>
                <span className="text-xs text-red-600 dark:text-red-400">{f.message}</span>
              </div>
              {f.recommendation && <p className="text-[11px] text-red-500 ml-5">{t('detail.fix', { recommendation: f.recommendation })}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Source preview */}
      <div>
        <h4 className="text-xs font-semibold text-surface-500 uppercase mb-2">{t('detail.sourceCode')}</h4>
        <pre className="bg-surface-100 dark:bg-surface-200/50 rounded-lg p-4 overflow-x-auto text-[11px] font-mono leading-relaxed text-surface-700 max-h-64 overflow-y-auto">
          {proc.rawDefinition?.split('\n').map((line, i) => (
            <div key={i} className="flex hover:bg-surface-200/50 dark:hover:bg-surface-300/20">
              <span className="text-surface-400 w-8 text-right mr-3 select-none flex-shrink-0">{i + 1}</span>
              <span>{line}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

/* ── LINEAGE VIEW ── */
function LineageView({ selectedProc, procedures, lineage, flowData, loadingFlow, findNodeLabel, findNodeType, onSelect }: {
  selectedProc: ProcedureItem | null;
  procedures: ProcedureItem[];
  lineage: { upstream: GraphEdge[]; downstream: GraphEdge[]; tables: GraphEdge[] };
  flowData: any;
  loadingFlow: boolean;
  findNodeLabel: (id: string) => string;
  findNodeType: (id: string) => string;
  onSelect: (p: ProcedureItem) => void;
}) {
  const { t } = useTranslation(['lineage', 'common']);
  if (!selectedProc) {
    return (
      <div className="flex h-full">
        {/* Quick select list */}
        <div className="w-72 border-r border-surface-200 overflow-y-auto">
          <div className="p-3 border-b border-surface-200"><h3 className="text-xs font-semibold text-surface-500">{t('lineageView.selectToViewLineage')}</h3></div>
          {procedures.slice(0, 50).map(p => {
            const cfg = TYPE_ICONS[p.objectType] || TYPE_ICONS.procedure;
            const Icon = cfg.icon;
            return (
              <button key={p.id} onClick={() => onSelect(p)} className="w-full flex items-center gap-2 px-4 py-2.5 text-xs hover:bg-surface-100 border-b border-surface-200/50">
                <Icon className={cn('w-3.5 h-3.5', cfg.color)} />
                <span className="font-mono truncate">{p.objectName}</span>
              </button>
            );
          })}
        </div>
        <div className="flex-1 flex items-center justify-center text-surface-400">
          <div className="text-center"><Columns className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm">{t('lineageView.selectToSeeLineage')}</p></div>
        </div>
      </div>
    );
  }

  const cfg = TYPE_ICONS[selectedProc.objectType] || TYPE_ICONS.procedure;
  const Icon = cfg.icon;

  return (
    <div className="p-6 overflow-y-auto h-full">
      {/* Lineage diagram: upstream → [SELECTED] → downstream */}
      <div className="flex items-start gap-6 justify-center min-h-[300px]">
        {/* Upstream (who calls me) */}
        <div className="space-y-2 min-w-[200px]">
          <h4 className="text-[10px] font-semibold text-surface-500 uppercase text-center mb-3 cursor-help" title={t('common:tooltips.upstream')}>{t('lineageView.upstream')}</h4>
          {lineage.upstream.length === 0 ? (
            <div className="text-center text-xs text-surface-400 py-8">{t('lineageView.noCallers')}</div>
          ) : lineage.upstream.map(e => (
            <NodeCard key={e.id} label={findNodeLabel(e.source)} type={findNodeType(e.source)} edgeType={e.dependencyType} direction="right" />
          ))}
        </div>

        {/* Center: selected procedure */}
        <div className="flex flex-col items-center gap-3 min-w-[220px]">
          <div className="text-[10px] font-semibold text-surface-500 uppercase mb-1">{t('lineageView.selected')}</div>
          <div className={cn('rounded-xl border-2 p-5 text-center shadow-lg', cfg.bg, 'border-brand-500')}>
            <Icon className={cn('w-8 h-8 mx-auto mb-2', cfg.color)} />
            <p className="font-mono font-bold text-sm">{selectedProc.objectName}</p>
            <p className="text-[10px] text-surface-500 mt-1">{selectedProc.schemaName} / {selectedProc.objectType}</p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="badge-info text-[9px] cursor-help" title={t('common:tooltips.cc')}>CC={selectedProc.estimatedComplexity || 0}</span>
              <span className="badge-info text-[9px]">{t('detail.lines', { count: selectedProc.lineCount })}</span>
            </div>
          </div>
          {/* Flow tree preview */}
          {loadingFlow ? (
            <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          ) : flowData?.flowTree?.children && (
            <div className="w-full max-w-[220px]">
              <h5 className="text-[10px] font-semibold text-surface-500 uppercase mb-2 text-center">{t('lineageView.executionFlow')}</h5>
              <div className="space-y-1">
                {flowData.flowTree.children.slice(0, 8).map((node: any, i: number) => (
                  <div key={i} className={cn('text-[10px] px-2 py-1 rounded font-mono truncate',
                    node.nodeType === 'condition' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' :
                    node.nodeType === 'call' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' :
                    node.nodeType === 'statement' ? 'bg-surface-100 text-surface-600' :
                    node.nodeType === 'error_handler' ? 'bg-red-50 dark:bg-red-900/20 text-red-600' :
                    'bg-surface-100 text-surface-500')}>
                    L{node.lineNumber} {node.label?.slice(0, 30)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Downstream (what I call + tables) */}
        <div className="space-y-2 min-w-[200px]">
          <h4 className="text-[10px] font-semibold text-surface-500 uppercase text-center mb-3 cursor-help" title={t('common:tooltips.downstream')}>{t('lineageView.downstream')}</h4>
          {lineage.downstream.length === 0 && lineage.tables.length === 0 ? (
            <div className="text-center text-xs text-surface-400 py-8">{t('lineageView.noDeps')}</div>
          ) : (
            <>
              {lineage.downstream.map(e => (
                <NodeCard key={e.id} label={findNodeLabel(e.target)} type={findNodeType(e.target)} edgeType="calls" direction="left" />
              ))}
              {lineage.tables.map(e => (
                <NodeCard key={e.id} label={findNodeLabel(e.target)} type="table" edgeType={e.dependencyType} direction="left" />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── NODE CARD (for lineage) ── */
function NodeCard({ label, type, edgeType, direction }: { label: string; type: string; edgeType: string; direction: 'left' | 'right' }) {
  const { t } = useTranslation(['lineage', 'common']);
  const cfg = TYPE_ICONS[type] || TYPE_ICONS.procedure;
  const Icon = cfg.icon;
  const opCfg = OP_COLORS[edgeType] || OP_COLORS.calls;
  const edgeLabel = edgeType === 'calls' ? 'EXEC' : edgeType === 'reads_from' ? 'READ' : edgeType === 'writes_to' ? 'WRITE' : edgeType;
  const edgeTooltip = edgeType === 'calls' ? t('common:tooltips.exec') : edgeType === 'reads_from' ? t('common:tooltips.crud') : edgeType === 'writes_to' ? t('common:tooltips.crud') : '';

  return (
    <div className="flex items-center gap-2">
      {direction === 'left' && <div className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold cursor-help', opCfg)} title={edgeTooltip}>{edgeLabel}</div>}
      <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 min-w-[160px] cursor-pointer hover:shadow-md transition-shadow', cfg.bg)}>
        <Icon className={cn('w-4 h-4 flex-shrink-0', cfg.color)} />
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium truncate">{label}</p>
          <p className="text-[9px] text-surface-500 uppercase">{cfg.label}</p>
        </div>
      </div>
      {direction === 'right' && <div className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold cursor-help', opCfg)} title={edgeTooltip}>{edgeLabel}</div>}
    </div>
  );
}

/* ── CRUD MATRIX VIEW ── */
function MatrixView({ edges, nodes, findNodeLabel }: {
  edges: GraphEdge[];
  nodes: GraphNode[];
  findNodeLabel: (id: string) => string;
}) {
  const { t } = useTranslation(['lineage', 'common']);
  // Build matrix: procedure → targets with types
  const matrix = useMemo(() => {
    const rows: { proc: string; targets: { name: string; type: string; op: string }[] }[] = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    for (const node of nodes) {
      const outEdges = edges.filter(e => e.source === node.id);
      if (outEdges.length === 0) continue;
      // Deduplicate targets
      const seenTargets = new Set<string>();
      const targets = outEdges
        .map(e => ({
          name: (e as any).targetLabel || findNodeLabel(e.target),
          type: nodeMap.get(e.target)?.objectType || (e.target.startsWith('ext_') ? 'external' : 'unknown'),
          op: e.dependencyType,
        }))
        .filter(t => {
          const key = `${t.name}-${t.op}`;
          if (seenTargets.has(key)) return false;
          seenTargets.add(key);
          return true;
        });
      rows.push({ proc: node.label, targets });
    }
    return rows;
  }, [nodes, edges, findNodeLabel]);

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs">
        <thead className="bg-surface-100 sticky top-0">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-surface-600 border-b border-surface-200">{t('matrix.procedureFunction')}</th>
            <th className="px-4 py-3 text-left font-semibold text-surface-600 border-b border-surface-200">{t('matrix.dependencies')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-200">
          {matrix.length === 0 ? (
            <tr><td colSpan={2} className="px-4 py-8 text-center text-surface-400">{t('matrix.empty')}</td></tr>
          ) : matrix.map((row, i) => (
            <tr key={i} className="hover:bg-surface-50 dark:hover:bg-surface-100/50">
              <td className="px-4 py-3">
                <span className="font-mono font-medium">{row.proc}</span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {row.targets.map((tgt, j) => {
                    const opColor = tgt.op === 'calls' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                   tgt.op === 'reads_from' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                   tgt.op === 'writes_to' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                   'bg-purple-100 text-purple-700';
                    const opLabel = tgt.op === 'calls' ? 'EXEC' : tgt.op === 'reads_from' ? 'R' : tgt.op === 'writes_to' ? 'W' : tgt.op.charAt(0).toUpperCase();
                    const opTooltip = tgt.op === 'calls' ? t('common:tooltips.exec') : t('common:tooltips.crud');
                    return (
                      <span key={j} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium cursor-help', opColor)} title={opTooltip}>
                        <span className="font-bold">{opLabel}</span> {tgt.name}
                      </span>
                    );
                  })}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── IMPACT ANALYSIS VIEW ── */
function ImpactView({ edges, findNodeLabel, findNodeType }: {
  edges: GraphEdge[];
  findNodeLabel: (id: string) => string;
  findNodeType: (id: string) => string;
}) {
  const { t } = useTranslation(['lineage', 'common']);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);

  // Find all unique targets (things that get called/read/written)
  const targets = useMemo(() => {
    const map = new Map<string, { id: string; label: string; type: string; incomingCount: number }>();
    for (const e of edges) {
      const id = e.target;
      if (!map.has(id)) {
        const label = (e as any).targetLabel || findNodeLabel(id);
        map.set(id, { id, label, type: findNodeType(id), incomingCount: 0 });
      }
      map.get(id)!.incomingCount++;
    }
    return Array.from(map.values()).sort((a, b) => b.incomingCount - a.incomingCount);
  }, [edges, findNodeLabel, findNodeType]);

  const impactEdges = selectedTarget ? edges.filter(e => e.target === selectedTarget) : [];

  return (
    <div className="flex h-full">
      {/* Target list */}
      <div className="w-72 border-r border-surface-200 overflow-y-auto">
        <div className="p-3 border-b border-surface-200">
          <h3 className="text-xs font-semibold text-surface-500">{t('impact.selectObject')}</h3>
        </div>
        {targets.map(t => {
          const cfg = TYPE_ICONS[t.type] || TYPE_ICONS.procedure;
          const Icon = cfg.icon;
          return (
            <button key={t.id} onClick={() => setSelectedTarget(t.id)}
              className={cn('w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-surface-100 border-b border-surface-200/50',
                selectedTarget === t.id && 'bg-brand-50 dark:bg-brand-900/20')}>
              <div className="flex items-center gap-2">
                <Icon className={cn('w-3.5 h-3.5', cfg.color)} />
                <span className="font-mono truncate">{t.label}</span>
              </div>
              <span className="text-[10px] bg-surface-200 text-surface-600 px-1.5 py-0.5 rounded">{t.incomingCount}</span>
            </button>
          );
        })}
      </div>

      {/* Impact detail */}
      <div className="flex-1 p-6 overflow-y-auto">
        {!selectedTarget ? (
          <div className="flex items-center justify-center h-full text-surface-400">
            <div className="text-center"><GitBranch className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm">{t('impact.selectToSeeImpact')}</p></div>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <span className="font-mono">{findNodeLabel(selectedTarget)}</span>
              <span className="badge-info text-xs">{t('impact.deps', { count: impactEdges.length })}</span>
            </h3>
            <p className="text-xs text-surface-500">{t('impact.description')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {impactEdges.map(e => {
                const sourceType = findNodeType(e.source);
                const cfg = TYPE_ICONS[sourceType] || TYPE_ICONS.procedure;
                const Icon = cfg.icon;
                const opLabel = e.dependencyType === 'calls' ? 'EXEC' : e.dependencyType === 'reads_from' ? 'READ' : e.dependencyType === 'writes_to' ? 'WRITE' : e.dependencyType;
                return (
                  <div key={e.id} className={cn('rounded-lg border p-3 flex items-center gap-3', cfg.bg)}>
                    <Icon className={cn('w-5 h-5', cfg.color)} />
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-medium truncate">{(e as any).sourceLabel || findNodeLabel(e.source)}</p>
                      <p className="text-[10px] text-surface-500">{opLabel} / <span className="cursor-help" title={t('common:tooltips.confidence')}>{t('impact.confidence', { pct: Math.round(e.confidence * 100) })}</span></p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
