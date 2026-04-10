import { useState, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Network, Search, Loader2, Database, Table2, GitBranch, ChevronRight,
  ArrowRight, Workflow, Shield, Eye, Code,
  LayoutGrid, List, Columns, Key, Link2, Hash,
  FolderOpen, Folder, ExternalLink, Play, AlertTriangle,
  TrendingUp, ArrowDown, ArrowUp,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useGlobalConnection } from '@/shared/hooks/useGlobalConnection';
import { useStudioContext } from '@/shared/hooks/useStudioContext';
import { ModuleToolbar } from '@/shared/components/layout/ModuleToolbar';
import { ModulePageLayout } from '@/shared/components/layout/ModulePageLayout';
import { ConnectionSelector } from '@/shared/components/ConnectionSelector';
import { Dropdown } from '@/shared/components/Dropdown';
import { ButtonGroup } from '@/shared/components/ButtonGroup';
import { SidePanelSearch } from '@/shared/components/SidePanelSearch';
import { useProcedures, useDependencyGraph, type ProcedureItem, type GraphNode, type GraphEdge } from '@/shared/hooks/useAnalysis';
import { useTables, useTableDetail, type TableItem } from '@/shared/hooks/useTables';
import { useOpenProcedureTab } from '@/shared/hooks/useOpenProcedureTab';

type ViewMode = 'explorer' | 'lineage' | 'matrix' | 'impact';
type OpFilter = 'all' | 'calls' | 'reads_from' | 'writes_to';

type SelectedItem =
  | { kind: 'procedure'; data: ProcedureItem }
  | { kind: 'table'; data: TableItem }
  | null;

const TYPE_ICONS: Record<string, { icon: typeof Database; color: string; bg: string; label: string }> = {
  procedure: { icon: Workflow, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', label: 'PROC' },
  function:  { icon: Code, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30', label: 'FUNC' },
  trigger:   { icon: GitBranch, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', label: 'TRIG' },
  view:      { icon: Eye, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30', label: 'VIEW' },
  table:     { icon: Table2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', label: 'TABLE' },
};

const SCHEMA_COLORS = [
  'border-l-blue-500', 'border-l-emerald-500', 'border-l-purple-500',
  'border-l-amber-500', 'border-l-rose-500', 'border-l-cyan-500',
  'border-l-indigo-500', 'border-l-orange-500', 'border-l-teal-500',
  'border-l-pink-500', 'border-l-lime-500', 'border-l-sky-500',
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

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */

export function LineagePage() {
  const { t } = useTranslation(['lineage', 'common']);
  const { connectionId: activeId } = useGlobalConnection();
  const openProcTab = useOpenProcedureTab();

  const [view, setView] = useStudioContext<ViewMode>('lineage', 'view', 'explorer');
  const [search, setSearch] = useStudioContext('lineage', 'search', '');
  const [schemaFilter, setSchemaFilter] = useStudioContext('lineage', 'schemaFilter', '');
  const [selected, setSelected] = useStudioContext<SelectedItem>('lineage', 'selected', null);
  const [impactTarget, setImpactTarget] = useStudioContext<string | null>('lineage', 'impactTarget', null);

  const { data: procData, isLoading: procsLoading } = useProcedures(activeId, { limit: 500, search: search || undefined, schema: schemaFilter || undefined });
  const { data: tablesData, isLoading: tablesLoading } = useTables(activeId, { search: search || undefined, schema: schemaFilter || undefined });
  const { data: graphData } = useDependencyGraph(activeId);

  const procedures = procData?.items || [];
  const tables = tablesData || [];
  const nodes = graphData?.nodes || [];
  const edges = graphData?.edges || [];
  const isLoading = procsLoading || tablesLoading;

  const schemas = useMemo(() => {
    const map = new Map<string, { procedures: ProcedureItem[]; tables: TableItem[] }>();
    for (const p of procedures) {
      if (!map.has(p.schemaName)) map.set(p.schemaName, { procedures: [], tables: [] });
      map.get(p.schemaName)!.procedures.push(p);
    }
    for (const tbl of tables) {
      if (!map.has(tbl.schemaName)) map.set(tbl.schemaName, { procedures: [], tables: [] });
      map.get(tbl.schemaName)!.tables.push(tbl);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [procedures, tables]);

  const selectedProc = selected?.kind === 'procedure' ? selected.data : null;

  const lineage = useMemo(() => {
    if (!selectedProc) return { upstream: [] as GraphEdge[], downstream: [] as GraphEdge[], tables: [] as GraphEdge[] };
    const nodeId = nodes.find(n => n.label === selectedProc.objectName)?.id;
    if (!nodeId) return { upstream: [], downstream: [], tables: [] };

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

  const handleSelectProc = useCallback((proc: ProcedureItem) => {
    setSelected({ kind: 'procedure', data: proc });
  }, [setSelected]);

  const handleSelectTable = useCallback((tbl: TableItem) => {
    setSelected({ kind: 'table', data: tbl });
  }, [setSelected]);

  const findNodeLabel = (id: string) => nodes.find(n => n.id === id)?.label || id.replace('ext_', '').replace(/_/g, '.').slice(0, 30);
  const findNodeType = (id: string) => nodes.find(n => n.id === id)?.objectType || (id.startsWith('ext_') ? 'external' : 'procedure');
  const findNodeSchema = (id: string) => nodes.find(n => n.id === id)?.schemaName || '';

  const resolveProc = useCallback((label: string) => {
    return procedures.find(p => p.objectName === label);
  }, [procedures]);

  const viewOptions: { id: ViewMode; label: string; icon: typeof Network; title: string }[] = [
    { id: 'explorer', label: t('tabs.explorer'), icon: LayoutGrid, title: t('descriptions.explorer') },
    { id: 'lineage', label: t('tabs.lineage'), icon: Columns, title: t('descriptions.lineage') },
    { id: 'matrix', label: t('tabs.matrix'), icon: List, title: t('descriptions.matrix') },
    { id: 'impact', label: t('tabs.impact'), icon: GitBranch, title: t('descriptions.impact') },
  ];

  return (
    <ModulePageLayout
      toolbar={
        <ModuleToolbar
          icon={Network}
          title={t('title')}
          subtitle={<>{procedures.length} procs &middot; {tables.length} tables &middot; {edges.length} deps</>}
          actions={
            <>
              <ConnectionSelector onConnectionChange={() => { setSelected(null); setImpactTarget(null); }} />
              <ButtonGroup<ViewMode> value={view} onChange={setView} options={viewOptions} />
            </>
          }
        >
          {/* Global search + schema filter (Fase 0A) */}
          <div className="flex items-center gap-2 px-3 py-1.5">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                className="input pl-8 text-xs h-7 w-full"
                placeholder={t('search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Dropdown
              value={schemaFilter}
              onChange={setSchemaFilter}
              options={[
                { value: '', label: t('allSchemas') },
                ...schemas.map(([s]) => ({ value: s, label: s })),
              ]}
              className="w-[160px]"
            />
          </div>
        </ModuleToolbar>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
      ) : view === 'explorer' ? (
        <ExplorerView
          schemas={schemas}
          selected={selected}
          onSelectProc={handleSelectProc}
          onSelectTable={handleSelectTable}
          connectionId={activeId}
          edges={edges}
          nodes={nodes}
          openProcTab={openProcTab}
        />
      ) : view === 'lineage' ? (
        <LineageView
          selectedProc={selectedProc}
          procedures={procedures}
          lineage={lineage}
          findNodeLabel={findNodeLabel}
          findNodeType={findNodeType}
          onSelect={handleSelectProc}
          resolveProc={resolveProc}
          openProcTab={openProcTab}
        />
      ) : view === 'matrix' ? (
        <MatrixView
          edges={edges}
          nodes={schemaFilter ? nodes.filter(n => n.schemaName === schemaFilter) : nodes}
          findNodeLabel={findNodeLabel}
          search={search}
          selected={selected}
          onSelectProc={handleSelectProc}
          resolveProc={resolveProc}
        />
      ) : (
        <ImpactView
          edges={edges}
          findNodeLabel={findNodeLabel}
          findNodeType={findNodeType}
          findNodeSchema={findNodeSchema}
          selectedTarget={impactTarget}
          setSelectedTarget={setImpactTarget}
          onSelectProc={handleSelectProc}
          resolveProc={resolveProc}
          openProcTab={openProcTab}
        />
      )}
    </ModulePageLayout>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EXPLORER VIEW — VS Code-style tree + workspace
   ═══════════════════════════════════════════════════════════════ */

function ExplorerView({
  schemas, selected, onSelectProc, onSelectTable, connectionId, edges, nodes, openProcTab,
}: {
  schemas: [string, { procedures: ProcedureItem[]; tables: TableItem[] }][];
  selected: SelectedItem;
  onSelectProc: (p: ProcedureItem) => void;
  onSelectTable: (t: TableItem) => void;
  connectionId: string | null;
  edges: GraphEdge[];
  nodes: GraphNode[];
  openProcTab: ReturnType<typeof useOpenProcedureTab>;
}) {
  const { t } = useTranslation(['lineage', 'common']);
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(() => new Set(schemas[0] ? [schemas[0][0]] : []));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    if (schemas[0]) {
      const s = schemas[0][0];
      return new Set([`${s}:procs`, `${s}:tables`]);
    }
    return new Set();
  });

  const toggleSchema = (name: string) => {
    setExpandedSchemas(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
        setExpandedGroups(g => {
          const ng = new Set(g);
          ng.add(`${name}:procs`);
          ng.add(`${name}:tables`);
          return ng;
        });
      }
      return next;
    });
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="flex h-full">
      {/* Sidebar tree */}
      <div className="w-64 flex-none flex flex-col border-r border-surface-200 bg-surface-50">
        {/* Tree */}
        <div className="flex-1 overflow-y-auto">
          {schemas.length === 0 && (
            <div className="p-4 text-center text-surface-400 text-xs">
              {t('selectProcedure', { defaultValue: 'No objects found' })}
            </div>
          )}
          {schemas.map(([schema, { procedures: procs, tables: tbls }]) => {
            const isExpanded = expandedSchemas.has(schema);
            const ci = schemaColorIndex(schema);
            const totalCount = procs.length + tbls.length;

            return (
              <div key={schema}>
                <button
                  onClick={() => toggleSchema(schema)}
                  className={cn(
                    'w-full flex items-center gap-1.5 px-2 py-1.5 text-xs hover:bg-surface-100 transition-colors border-l-2',
                    SCHEMA_COLORS[ci],
                    isExpanded && 'bg-surface-100/60',
                  )}
                >
                  <ChevronRight className={cn('w-3 h-3 text-surface-400 transition-transform flex-shrink-0', isExpanded && 'rotate-90')} />
                  {isExpanded
                    ? <FolderOpen className="w-3.5 h-3.5 text-surface-500 flex-shrink-0" />
                    : <Folder className="w-3.5 h-3.5 text-surface-500 flex-shrink-0" />
                  }
                  <span className="font-medium flex-1 text-left truncate">{schema}</span>
                  <span className="text-[9px] text-surface-400 tabular-nums flex-shrink-0">{totalCount}</span>
                </button>

                {isExpanded && (
                  <div>
                    {procs.length > 0 && (
                      <>
                        <button
                          onClick={() => toggleGroup(`${schema}:procs`)}
                          className="w-full flex items-center gap-1.5 pl-6 pr-2 py-1 text-[10px] text-surface-500 hover:bg-surface-100/80 transition-colors uppercase font-semibold tracking-wider"
                        >
                          <ChevronRight className={cn('w-2.5 h-2.5 transition-transform', expandedGroups.has(`${schema}:procs`) && 'rotate-90')} />
                          <span className="flex-1 text-left">{t('common:objectTypes.procedures', { defaultValue: 'Procedures' })}</span>
                          <span className="text-[9px] font-normal text-surface-400 tabular-nums">{procs.length}</span>
                        </button>
                        {expandedGroups.has(`${schema}:procs`) && procs.map(proc => {
                          const cfg = TYPE_ICONS[proc.objectType] || TYPE_ICONS.procedure;
                          const ProcIcon = cfg.icon;
                          const isSelected = selected?.kind === 'procedure' && selected.data.id === proc.id;
                          return (
                            <button
                              key={proc.id}
                              onClick={() => onSelectProc(proc)}
                              className={cn(
                                'w-full flex items-center gap-1.5 pl-10 pr-2 py-1 text-[11px] hover:bg-surface-200/50 transition-colors',
                                isSelected && 'bg-brand-500/10 text-brand-700 dark:text-brand-300',
                              )}
                            >
                              <ProcIcon className={cn('w-3.5 h-3.5 flex-shrink-0', cfg.color)} />
                              <span className="font-mono truncate flex-1 text-left">{proc.objectName}</span>
                              {proc.estimatedComplexity != null && proc.estimatedComplexity > 10 && (
                                <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-500 font-bold flex-shrink-0">
                                  CC{proc.estimatedComplexity}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </>
                    )}

                    {tbls.length > 0 && (
                      <>
                        <button
                          onClick={() => toggleGroup(`${schema}:tables`)}
                          className="w-full flex items-center gap-1.5 pl-6 pr-2 py-1 text-[10px] text-surface-500 hover:bg-surface-100/80 transition-colors uppercase font-semibold tracking-wider"
                        >
                          <ChevronRight className={cn('w-2.5 h-2.5 transition-transform', expandedGroups.has(`${schema}:tables`) && 'rotate-90')} />
                          <span className="flex-1 text-left">{t('common:objectTypes.tables', { defaultValue: 'Tables' })}</span>
                          <span className="text-[9px] font-normal text-surface-400 tabular-nums">{tbls.length}</span>
                        </button>
                        {expandedGroups.has(`${schema}:tables`) && tbls.map(tbl => {
                          const isView = tbl.tableType === 'view';
                          const cfg = isView ? TYPE_ICONS.view : TYPE_ICONS.table;
                          const TblIcon = cfg.icon;
                          const isSelected = selected?.kind === 'table' && selected.data.id === tbl.id;
                          return (
                            <button
                              key={tbl.id}
                              onClick={() => onSelectTable(tbl)}
                              className={cn(
                                'w-full flex items-center gap-1.5 pl-10 pr-2 py-1 text-[11px] hover:bg-surface-200/50 transition-colors',
                                isSelected && 'bg-brand-500/10 text-brand-700 dark:text-brand-300',
                              )}
                            >
                              <TblIcon className={cn('w-3.5 h-3.5 flex-shrink-0', cfg.color)} />
                              <span className="font-mono truncate flex-1 text-left">{tbl.tableName}</span>
                              <span className="text-[8px] text-surface-400 flex-shrink-0">{tbl.columns.length}c</span>
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Workspace panel */}
      <div className="flex-1 overflow-y-auto p-5">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-surface-400">
            <div className="text-center">
              <Database className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">{t('selectProcedure', { defaultValue: 'Select an object from the tree' })}</p>
            </div>
          </div>
        ) : selected.kind === 'procedure' ? (
          <ProcedureDetail proc={selected.data} connectionId={connectionId} edges={edges} nodes={nodes} openProcTab={openProcTab} />
        ) : (
          <TableDetail table={selected.data} connectionId={connectionId} />
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PROCEDURE DETAIL — Compact summary + quick actions (Fase 1)
   ═══════════════════════════════════════════════════════════════ */

function ProcedureDetail({ proc, edges, nodes, openProcTab }: {
  proc: ProcedureItem;
  connectionId: string | null;
  edges: GraphEdge[];
  nodes: GraphNode[];
  openProcTab: ReturnType<typeof useOpenProcedureTab>;
}) {
  const { t } = useTranslation(['lineage', 'common']);
  const cfg = TYPE_ICONS[proc.objectType] || TYPE_ICONS.procedure;
  const Icon = cfg.icon;
  const cc = proc.estimatedComplexity || 0;

  const depsCount = useMemo(() => {
    const nodeId = nodes.find(n => n.label === proc.objectName)?.id;
    if (!nodeId) return 0;
    return edges.filter(e => e.source === nodeId || e.target === nodeId).length;
  }, [proc.objectName, nodes, edges]);

  const [paramsExpanded, setParamsExpanded] = useState(proc.parameters?.length <= 5);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn('w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0', cfg.bg)}>
          <Icon className={cn('w-5 h-5', cfg.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold font-mono truncate">{proc.fullQualifiedName}</h2>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-surface-500">{proc.objectType} / {proc.language}</span>
          </div>
        </div>
      </div>

      {/* Quick actions (Fase 1) */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => openProcTab(proc, 'flow')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors border border-blue-500/20"
        >
          <Play className="w-3.5 h-3.5" />
          {t('detail.openInFlow')}
        </button>
        <button
          onClick={() => openProcTab(proc, 'source')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-100 text-surface-600 dark:text-surface-400 hover:bg-surface-200 transition-colors border border-surface-200"
        >
          <Code className="w-3.5 h-3.5" />
          {t('detail.sourceCode')}
        </button>
        {proc.securityFindings?.length > 0 && (
          <button
            onClick={() => openProcTab(proc, 'security')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors border border-red-500/20"
          >
            <Shield className="w-3.5 h-3.5" />
            {t('detail.securityFindings')} ({proc.securityFindings.length})
          </button>
        )}
      </div>

      {/* Compact metrics (Fase 1) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Complexity"
          value={`CC=${cc}`}
          color={cc <= 5 ? 'emerald' : cc <= 10 ? 'yellow' : cc <= 20 ? 'orange' : 'red'}
          tooltip={t('common:tooltips.cc')}
        />
        <MetricCard label={t('detail.lines', { count: proc.lineCount })} value={String(proc.lineCount)} color="surface" />
        <MetricCard label={t('detail.parameters')} value={String(proc.parameters?.length || 0)} color="blue" />
        <MetricCard label={t('detail.depsCount', { count: depsCount, defaultValue: `${depsCount} deps` })} value={String(depsCount)} color="purple" />
      </div>

      {/* Compact auto-doc summary (Fase 1 — just summary, no full expansion) */}
      {proc.autoDoc && (proc.autoDoc as any).summary && (
        <div className="card p-4">
          <h4 className="text-xs font-semibold text-surface-500 uppercase mb-1.5">{t('detail.documentation')}</h4>
          <p className="text-sm text-surface-700 dark:text-surface-300">{(proc.autoDoc as any).summary}</p>
        </div>
      )}

      {/* Collapsible parameters (Fase 1) */}
      {proc.parameters?.length > 0 && (
        <div>
          <button
            onClick={() => setParamsExpanded(!paramsExpanded)}
            className="flex items-center gap-1.5 text-xs font-semibold text-surface-500 uppercase mb-2 hover:text-surface-700 transition-colors"
          >
            <ChevronRight className={cn('w-3 h-3 transition-transform', paramsExpanded && 'rotate-90')} />
            {t('detail.parameters')} ({proc.parameters.length})
          </button>
          {paramsExpanded && (
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
          )}
        </div>
      )}

      {/* Security summary badge (Fase 1 — compact, not full cards) */}
      {proc.securityFindings?.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          onClick={() => openProcTab(proc, 'security')}
        >
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-xs font-medium text-red-700 dark:text-red-400">
            {proc.securityFindings.length} {t('detail.securityFindings').toLowerCase()}
          </span>
          <ExternalLink className="w-3 h-3 text-red-400 ml-auto" />
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, color, tooltip }: { label: string; value: string; color: string; tooltip?: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
    yellow: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
    orange: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
    red: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
    purple: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
    surface: 'bg-surface-100 text-surface-700 dark:bg-surface-200/50 dark:text-surface-300',
  };
  return (
    <div className={cn('rounded-lg p-3 text-center', colorMap[color] || colorMap.surface)} title={tooltip}>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wider opacity-80 truncate">{label}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TABLE DETAIL (workspace view)
   ═══════════════════════════════════════════════════════════════ */

function TableDetail({ table, connectionId }: { table: TableItem; connectionId: string | null }) {
  const { data: detail } = useTableDetail(connectionId, table.id);
  const isView = table.tableType === 'view';
  const cfg = isView ? TYPE_ICONS.view : TYPE_ICONS.table;
  const Icon = cfg.icon;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className={cn('w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0', cfg.bg)}>
          <Icon className={cn('w-5 h-5', cfg.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold font-mono truncate">{table.schemaName}.{table.tableName}</h2>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-bold uppercase',
              isView ? 'bg-cyan-500/10 text-cyan-500' : 'bg-emerald-500/10 text-emerald-500')}>
              {isView ? 'VIEW' : 'TABLE'}
            </span>
            <span className="text-xs text-surface-500">{table.columns.length} columns</span>
            {table.primaryKey.length > 0 && (
              <span className="text-xs text-surface-500">PK: {table.primaryKey.join(', ')}</span>
            )}
            {table.estimatedRowCount != null && (
              <span className="text-xs text-surface-500">~{table.estimatedRowCount.toLocaleString()} rows</span>
            )}
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-surface-500 uppercase mb-2">Columns</h4>
        <div className="rounded-lg border border-surface-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-surface-100">
              <tr>
                <th className="px-3 py-2 text-left text-surface-500 font-medium">Name</th>
                <th className="px-3 py-2 text-left text-surface-500 font-medium">Type</th>
                <th className="px-3 py-2 text-left text-surface-500 font-medium">Nullable</th>
                <th className="px-3 py-2 text-left text-surface-500 font-medium">Default</th>
                <th className="px-3 py-2 text-left text-surface-500 font-medium">Key</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {table.columns.map((col, i) => (
                <tr key={i} className="hover:bg-surface-50 dark:hover:bg-surface-100/50">
                  <td className="px-3 py-1.5 font-mono font-medium">{col.columnName}</td>
                  <td className="px-3 py-1.5 text-surface-500 font-mono">
                    {col.dataType}{col.maxLength && col.maxLength > 0 ? `(${col.maxLength})` : ''}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={cn('text-[10px]', col.isNullable ? 'text-surface-400' : 'text-amber-400 font-bold')}>
                      {col.isNullable ? 'YES' : 'NOT NULL'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-surface-400 font-mono text-[10px] max-w-[120px] truncate">{col.defaultValue || '-'}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1">
                      {col.isPrimaryKey && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[9px] font-bold">
                          <Key className="w-2.5 h-2.5" /> PK
                        </span>
                      )}
                      {col.isForeignKey && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 text-[9px] font-bold">
                          <Link2 className="w-2.5 h-2.5" /> FK
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {table.foreignKeys.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-surface-500 uppercase mb-2">
            <Link2 className="w-3 h-3 inline mr-1" />Foreign Keys
          </h4>
          <div className="space-y-1.5">
            {table.foreignKeys.map((fk, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/15">
                <Link2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium">{fk.constraintName}</p>
                  <p className="text-[10px] text-surface-500">
                    ({fk.columns.join(', ')}) &rarr; {fk.referencedTable} ({fk.referencedColumns.join(', ')})
                  </p>
                  <p className="text-[10px] text-surface-400">ON DELETE {fk.onDelete} / ON UPDATE {fk.onUpdate}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {table.indexes.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-surface-500 uppercase mb-2">
            <Hash className="w-3 h-3 inline mr-1" />Indexes
          </h4>
          <div className="space-y-1.5">
            {table.indexes.map((idx, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-100/40 border border-surface-200/30">
                <Hash className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium">{idx.indexName}</span>
                    {idx.isPrimary && <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-bold">PRIMARY</span>}
                    {idx.isUnique && !idx.isPrimary && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-500 font-bold">UNIQUE</span>}
                  </div>
                  <p className="text-[10px] text-surface-500">({idx.columns.join(', ')}) &mdash; {idx.indexType}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {detail?.accessedBy && detail.accessedBy.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-surface-500 uppercase mb-2">Accessed by</h4>
          <div className="space-y-1">
            {detail.accessedBy.map((access, i) => {
              const opColor = access.operation === 'SELECT' ? 'text-emerald-400' :
                              access.operation === 'INSERT' ? 'text-blue-400' :
                              access.operation === 'UPDATE' ? 'text-amber-400' :
                              access.operation === 'DELETE' ? 'text-red-400' : 'text-surface-400';
              return (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded bg-surface-100/30">
                  <span className={cn('text-[10px] font-bold uppercase', opColor)}>{access.operation}</span>
                  <span className="font-mono text-[10px] text-surface-600">{access.procedureId}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LINEAGE VIEW — Sidebar + 3-column with SVG arrows (Fase 2)
   ═══════════════════════════════════════════════════════════════ */

function LineageView({ selectedProc, procedures, lineage, findNodeLabel, findNodeType, onSelect, resolveProc, openProcTab }: {
  selectedProc: ProcedureItem | null;
  procedures: ProcedureItem[];
  lineage: { upstream: GraphEdge[]; downstream: GraphEdge[]; tables: GraphEdge[] };
  findNodeLabel: (id: string) => string;
  findNodeType: (id: string) => string;
  onSelect: (p: ProcedureItem) => void;
  resolveProc: (label: string) => ProcedureItem | undefined;
  openProcTab: ReturnType<typeof useOpenProcedureTab>;
}) {
  const { t } = useTranslation(['lineage', 'common']);
  const [sidebarSearch, setSidebarSearch] = useState('');

  const filteredProcs = useMemo(() => {
    if (!sidebarSearch) return procedures.slice(0, 100);
    const q = sidebarSearch.toLowerCase();
    return procedures.filter(p => p.objectName.toLowerCase().includes(q)).slice(0, 100);
  }, [procedures, sidebarSearch]);

  const handleNodeClick = useCallback((label: string) => {
    const proc = resolveProc(label);
    if (proc) onSelect(proc);
  }, [resolveProc, onSelect]);

  // SVG arrow refs
  const containerRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const upstreamRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const downstreamRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [arrows, setArrows] = useState<{ id: string; x1: number; y1: number; x2: number; y2: number; color: string; type: string }[]>([]);

  useLayoutEffect(() => {
    if (!selectedProc || !containerRef.current || !centerRef.current) {
      setArrows([]);
      return;
    }

    const calculate = () => {
      const container = containerRef.current!.getBoundingClientRect();
      const center = centerRef.current!.getBoundingClientRect();
      const newArrows: typeof arrows = [];

      upstreamRefs.current.forEach((el, id) => {
        const rect = el.getBoundingClientRect();
        newArrows.push({
          id: `up-${id}`,
          x1: rect.right - container.left,
          y1: rect.top + rect.height / 2 - container.top,
          x2: center.left - container.left,
          y2: center.top + center.height / 2 - container.top,
          color: '#3b82f6',
          type: 'calls',
        });
      });

      downstreamRefs.current.forEach((el, id) => {
        const rect = el.getBoundingClientRect();
        const edge = lineage.downstream.find(e => e.id === id) || lineage.tables.find(e => e.id === id);
        const isTable = edge && edge.dependencyType !== 'calls';
        newArrows.push({
          id: `dn-${id}`,
          x1: center.right - container.left,
          y1: center.top + center.height / 2 - container.top,
          x2: rect.left - container.left,
          y2: rect.top + rect.height / 2 - container.top,
          color: isTable ? (edge?.dependencyType === 'reads_from' ? '#10b981' : '#f59e0b') : '#3b82f6',
          type: edge?.dependencyType || 'calls',
        });
      });

      setArrows(newArrows);
    };

    // Small delay to let DOM settle
    const timer = setTimeout(calculate, 50);
    return () => clearTimeout(timer);
  }, [selectedProc, lineage]);

  return (
    <div className="flex h-full">
      {/* Persistent sidebar (Fase 2A) */}
      <div className="w-64 flex-none flex flex-col border-r border-surface-200 bg-surface-50">
        <SidePanelSearch
          value={sidebarSearch}
          onChange={setSidebarSearch}
          placeholder={t('lineageView.searchProcedures', { defaultValue: 'Filter procedures...' })}
        />
        <div className="flex-1 overflow-y-auto">
          {filteredProcs.map(p => {
            const cfg = TYPE_ICONS[p.objectType] || TYPE_ICONS.procedure;
            const PIcon = cfg.icon;
            const isSelected = selectedProc?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-surface-100 border-b border-surface-200/50 transition-colors',
                  isSelected && 'bg-brand-50 dark:bg-brand-900/20 border-l-2 border-l-brand-500',
                )}
              >
                <PIcon className={cn('w-3.5 h-3.5 flex-shrink-0', cfg.color)} />
                <span className="font-mono truncate flex-1 text-left">{p.objectName}</span>
                <span className="text-[9px] text-surface-400">{p.schemaName}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lineage columns */}
      <div className="flex-1 overflow-auto">
        {!selectedProc ? (
          <div className="flex items-center justify-center h-full text-surface-400">
            <div className="text-center"><Columns className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm">{t('lineageView.selectToSeeLineage')}</p></div>
          </div>
        ) : (
          <div ref={containerRef} className="relative p-6 min-h-full">
            {/* SVG arrows overlay (Fase 2B) */}
            <svg className="absolute inset-0 pointer-events-none z-0" style={{ overflow: 'visible', width: '100%', height: '100%' }}>
              <defs>
                <marker id="arrow-blue" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <path d="M 0 0 L 8 3 L 0 6 z" fill="#3b82f6" opacity="0.6" />
                </marker>
                <marker id="arrow-green" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <path d="M 0 0 L 8 3 L 0 6 z" fill="#10b981" opacity="0.6" />
                </marker>
                <marker id="arrow-amber" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <path d="M 0 0 L 8 3 L 0 6 z" fill="#f59e0b" opacity="0.6" />
                </marker>
              </defs>
              {arrows.map(a => {
                const dx = a.x2 - a.x1;
                const markerId = a.color === '#10b981' ? 'arrow-green' : a.color === '#f59e0b' ? 'arrow-amber' : 'arrow-blue';
                return (
                  <path
                    key={a.id}
                    d={`M ${a.x1},${a.y1} C ${a.x1 + dx * 0.4},${a.y1} ${a.x2 - dx * 0.4},${a.y2} ${a.x2},${a.y2}`}
                    stroke={a.color}
                    strokeWidth={1.5}
                    strokeOpacity={0.4}
                    fill="none"
                    markerEnd={`url(#${markerId})`}
                  />
                );
              })}
            </svg>

            <div className="flex items-start gap-8 justify-center relative z-10">
              {/* Upstream */}
              <div className="space-y-2 min-w-[200px]">
                <h4 className="text-[10px] font-semibold text-surface-500 uppercase text-center mb-3 cursor-help" title={t('common:tooltips.upstream')}>
                  <ArrowDown className="w-3 h-3 inline mr-1" />{t('lineageView.upstream')}
                </h4>
                {lineage.upstream.length === 0 ? (
                  <div className="text-center text-xs text-surface-400 py-8">{t('lineageView.noCallers')}</div>
                ) : lineage.upstream.map(e => (
                  <NodeCard
                    key={e.id}
                    ref={(el: HTMLDivElement | null) => { if (el) upstreamRefs.current.set(e.id, el); else upstreamRefs.current.delete(e.id); }}
                    label={findNodeLabel(e.source)}
                    type={findNodeType(e.source)}
                    edgeType={e.dependencyType}
                    direction="right"
                    onClick={() => handleNodeClick(findNodeLabel(e.source))}
                  />
                ))}
              </div>

              {/* Center — selected procedure */}
              <div className="flex flex-col items-center gap-3 min-w-[220px]">
                <div className="text-[10px] font-semibold text-surface-500 uppercase mb-1">{t('lineageView.selected')}</div>
                <div
                  ref={centerRef}
                  className={cn('rounded-xl border-2 p-5 text-center shadow-lg', (TYPE_ICONS[selectedProc.objectType] || TYPE_ICONS.procedure).bg, 'border-brand-500')}
                >
                  {(() => { const c = TYPE_ICONS[selectedProc.objectType] || TYPE_ICONS.procedure; const CIcon = c.icon; return <CIcon className={cn('w-8 h-8 mx-auto mb-2', c.color)} />; })()}
                  <p className="font-mono font-bold text-sm">{selectedProc.objectName}</p>
                  <p className="text-[10px] text-surface-500 mt-1">{selectedProc.schemaName} / {selectedProc.objectType}</p>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <span className="badge-info text-[9px] cursor-help" title={t('common:tooltips.cc')}>CC={selectedProc.estimatedComplexity || 0}</span>
                    <span className="badge-info text-[9px]">{t('detail.lines', { count: selectedProc.lineCount })}</span>
                  </div>
                  <button
                    onClick={() => openProcTab(selectedProc, 'flow')}
                    className="mt-2 text-[9px] text-brand-500 hover:text-brand-600 flex items-center gap-1 mx-auto"
                  >
                    <ExternalLink className="w-3 h-3" /> {t('detail.openInFlow')}
                  </button>
                </div>
              </div>

              {/* Downstream — separated calls + tables (Fase 2E) */}
              <div className="space-y-2 min-w-[200px]">
                {lineage.downstream.length > 0 && (
                  <>
                    <h4 className="text-[10px] font-semibold text-surface-500 uppercase text-center mb-3 cursor-help" title={t('common:tooltips.downstream')}>
                      <ArrowUp className="w-3 h-3 inline mr-1" />{t('lineageView.calledProcedures', { defaultValue: 'Called Procedures' })}
                    </h4>
                    {lineage.downstream.map(e => (
                      <NodeCard
                        key={e.id}
                        ref={(el: HTMLDivElement | null) => { if (el) downstreamRefs.current.set(e.id, el); else downstreamRefs.current.delete(e.id); }}
                        label={findNodeLabel(e.target)}
                        type={findNodeType(e.target)}
                        edgeType="calls"
                        direction="left"
                        onClick={() => handleNodeClick(findNodeLabel(e.target))}
                      />
                    ))}
                  </>
                )}
                {lineage.tables.length > 0 && (
                  <>
                    <h4 className={cn('text-[10px] font-semibold text-surface-500 uppercase text-center mb-3', lineage.downstream.length > 0 && 'mt-4 pt-4 border-t border-surface-200')}>
                      <Table2 className="w-3 h-3 inline mr-1" />{t('lineageView.tableOperations', { defaultValue: 'Table Operations' })}
                    </h4>
                    {lineage.tables.map(e => (
                      <NodeCard
                        key={e.id}
                        ref={(el: HTMLDivElement | null) => { if (el) downstreamRefs.current.set(e.id, el); else downstreamRefs.current.delete(e.id); }}
                        label={findNodeLabel(e.target)}
                        type="table"
                        edgeType={e.dependencyType}
                        direction="left"
                      />
                    ))}
                  </>
                )}
                {lineage.downstream.length === 0 && lineage.tables.length === 0 && (
                  <>
                    <h4 className="text-[10px] font-semibold text-surface-500 uppercase text-center mb-3">{t('lineageView.downstream')}</h4>
                    <div className="text-center text-xs text-surface-400 py-8">{t('lineageView.noDeps')}</div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── NODE CARD — clickable (Fase 2C) ── */
import { forwardRef } from 'react';

const NodeCard = forwardRef<HTMLDivElement, {
  label: string; type: string; edgeType: string; direction: 'left' | 'right'; onClick?: () => void;
}>(({ label, type, edgeType, direction, onClick }, ref) => {
  const { t } = useTranslation(['lineage', 'common']);
  const cfg = TYPE_ICONS[type] || TYPE_ICONS.procedure;
  const NIcon = cfg.icon;
  const opCfg = OP_COLORS[edgeType] || OP_COLORS.calls;
  const edgeLabel = edgeType === 'calls' ? 'EXEC' : edgeType === 'reads_from' ? 'READ' : edgeType === 'writes_to' ? 'WRITE' : edgeType;
  const edgeTooltip = edgeType === 'calls' ? t('common:tooltips.exec') : t('common:tooltips.crud');

  return (
    <div ref={ref} className="flex items-center gap-2" onClick={onClick}>
      {direction === 'left' && <div className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold cursor-help', opCfg)} title={edgeTooltip}>{edgeLabel}</div>}
      <div className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 min-w-[160px] transition-all',
        cfg.bg,
        onClick ? 'cursor-pointer hover:shadow-md hover:ring-1 hover:ring-brand-500/30' : '',
      )}>
        <NIcon className={cn('w-4 h-4 flex-shrink-0', cfg.color)} />
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium truncate">{label}</p>
          <p className="text-[9px] text-surface-500 uppercase">{cfg.label}</p>
        </div>
      </div>
      {direction === 'right' && <div className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold cursor-help', opCfg)} title={edgeTooltip}>{edgeLabel}</div>}
    </div>
  );
});
NodeCard.displayName = 'NodeCard';

/* ═══════════════════════════════════════════════════════════════
   CRUD MATRIX VIEW — with search, selection, sub-columns (Fase 3)
   ═══════════════════════════════════════════════════════════════ */

function MatrixView({ edges, nodes, findNodeLabel, search, selected, onSelectProc, resolveProc }: {
  edges: GraphEdge[];
  nodes: GraphNode[];
  findNodeLabel: (id: string) => string;
  search: string;
  selected: SelectedItem;
  onSelectProc: (p: ProcedureItem) => void;
  resolveProc: (label: string) => ProcedureItem | undefined;
}) {
  const { t } = useTranslation(['lineage', 'common']);

  const matrix = useMemo(() => {
    const rows: { proc: string; schema: string; exec: { name: string }[]; reads: { name: string }[]; writes: { name: string }[]; refs: { name: string }[] }[] = [];

    for (const node of nodes) {
      const outEdges = edges.filter(e => e.source === node.id);
      if (outEdges.length === 0) continue;

      const seen = new Set<string>();
      const exec: { name: string }[] = [];
      const reads: { name: string }[] = [];
      const writes: { name: string }[] = [];
      const refs: { name: string }[] = [];

      for (const e of outEdges) {
        const name = (e as any).targetLabel || findNodeLabel(e.target);
        const key = `${name}-${e.dependencyType}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const item = { name };
        if (e.dependencyType === 'calls') exec.push(item);
        else if (e.dependencyType === 'reads_from') reads.push(item);
        else if (e.dependencyType === 'writes_to') writes.push(item);
        else refs.push(item);
      }

      rows.push({ proc: node.label, schema: node.schemaName, exec, reads, writes, refs });
    }
    return rows;
  }, [nodes, edges, findNodeLabel]);

  const filteredMatrix = useMemo(() => {
    if (!search) return matrix;
    const q = search.toLowerCase();
    return matrix.filter(row => row.proc.toLowerCase().includes(q));
  }, [matrix, search]);

  const selectedName = selected?.kind === 'procedure' ? selected.data.objectName : null;

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs">
        <thead className="bg-surface-100 sticky top-0 z-10">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-surface-600 border-b border-surface-200 min-w-[180px]">
              {t('matrix.procedureFunction')}
            </th>
            <th className="px-3 py-3 text-left font-semibold text-blue-600 dark:text-blue-400 border-b border-surface-200">
              <span className="flex items-center gap-1"><Workflow className="w-3 h-3" /> EXEC</span>
            </th>
            <th className="px-3 py-3 text-left font-semibold text-emerald-600 dark:text-emerald-400 border-b border-surface-200">
              <span className="flex items-center gap-1"><ArrowDown className="w-3 h-3" /> READ</span>
            </th>
            <th className="px-3 py-3 text-left font-semibold text-amber-600 dark:text-amber-400 border-b border-surface-200">
              <span className="flex items-center gap-1"><ArrowUp className="w-3 h-3" /> WRITE</span>
            </th>
            <th className="px-3 py-3 text-left font-semibold text-purple-600 dark:text-purple-400 border-b border-surface-200">
              <span className="flex items-center gap-1"><Link2 className="w-3 h-3" /> REF</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-200">
          {filteredMatrix.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-surface-400">{t('matrix.empty')}</td></tr>
          ) : filteredMatrix.map((row, i) => {
            const isSelected = selectedName === row.proc;
            return (
              <tr
                key={i}
                onClick={() => {
                  const proc = resolveProc(row.proc);
                  if (proc) onSelectProc(proc);
                }}
                className={cn(
                  'hover:bg-surface-50 dark:hover:bg-surface-100/50 cursor-pointer transition-colors',
                  isSelected && 'bg-brand-50 dark:bg-brand-900/20 ring-1 ring-inset ring-brand-500/30',
                )}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{row.proc}</span>
                    <span className="text-[9px] text-surface-400">{row.schema}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {row.exec.map((tgt, j) => (
                      <DepBadge key={j} name={tgt.name} color="blue" onClick={(e) => { e.stopPropagation(); const p = resolveProc(tgt.name); if (p) onSelectProc(p); }} />
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {row.reads.map((tgt, j) => (
                      <DepBadge key={j} name={tgt.name} color="emerald" onClick={(e) => { e.stopPropagation(); const p = resolveProc(tgt.name); if (p) onSelectProc(p); }} />
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {row.writes.map((tgt, j) => (
                      <DepBadge key={j} name={tgt.name} color="amber" onClick={(e) => { e.stopPropagation(); const p = resolveProc(tgt.name); if (p) onSelectProc(p); }} />
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {row.refs.map((tgt, j) => (
                      <DepBadge key={j} name={tgt.name} color="purple" onClick={(e) => { e.stopPropagation(); const p = resolveProc(tgt.name); if (p) onSelectProc(p); }} />
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DepBadge({ name, color, onClick }: { name: string; color: string; onClick?: (e: React.MouseEvent) => void }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:ring-blue-500/50',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:ring-emerald-500/50',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:ring-amber-500/50',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 hover:ring-purple-500/50',
  };
  return (
    <span
      onClick={onClick}
      className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium cursor-pointer hover:ring-1 transition-all', colorMap[color] || colorMap.blue)}
    >
      {name}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   IMPACT ANALYSIS VIEW — search, filters, rich cards, stats (Fase 4)
   ═══════════════════════════════════════════════════════════════ */

function ImpactView({ edges, findNodeLabel, findNodeType, findNodeSchema, selectedTarget, setSelectedTarget, onSelectProc, resolveProc, openProcTab }: {
  edges: GraphEdge[];
  findNodeLabel: (id: string) => string;
  findNodeType: (id: string) => string;
  findNodeSchema: (id: string) => string;
  selectedTarget: string | null;
  setSelectedTarget: (t: string | null) => void;
  onSelectProc: (p: ProcedureItem) => void;
  resolveProc: (label: string) => ProcedureItem | undefined;
  openProcTab: ReturnType<typeof useOpenProcedureTab>;
}) {
  const { t } = useTranslation(['lineage', 'common']);
  const [impactSearch, setImpactSearch] = useState('');
  const [opFilter, setOpFilter] = useState<OpFilter>('all');

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

  const filteredTargets = useMemo(() => {
    if (!impactSearch) return targets;
    const q = impactSearch.toLowerCase();
    return targets.filter(t => t.label.toLowerCase().includes(q));
  }, [targets, impactSearch]);

  const impactEdges = useMemo(() => {
    if (!selectedTarget) return [];
    return edges.filter(e => e.target === selectedTarget && (opFilter === 'all' || e.dependencyType === opFilter));
  }, [edges, selectedTarget, opFilter]);

  const outgoingEdges = useMemo(() => {
    if (!selectedTarget) return [];
    return edges.filter(e => e.source === selectedTarget && (opFilter === 'all' || e.dependencyType === opFilter));
  }, [edges, selectedTarget, opFilter]);

  // Stats
  const stats = useMemo(() => {
    if (!selectedTarget) return { total: 0, exec: 0, read: 0, write: 0 };
    const all = edges.filter(e => e.target === selectedTarget);
    return {
      total: all.length,
      exec: all.filter(e => e.dependencyType === 'calls').length,
      read: all.filter(e => e.dependencyType === 'reads_from').length,
      write: all.filter(e => e.dependencyType === 'writes_to').length,
    };
  }, [edges, selectedTarget]);

  const opFilterOptions: { id: OpFilter; label: string }[] = [
    { id: 'all', label: t('impact.filterAll', { defaultValue: 'All' }) },
    { id: 'calls', label: 'EXEC' },
    { id: 'reads_from', label: 'READ' },
    { id: 'writes_to', label: 'WRITE' },
  ];

  return (
    <div className="flex h-full">
      {/* Sidebar with search and filter (Fase 4A, 4B) */}
      <div className="w-72 flex-none flex flex-col border-r border-surface-200 bg-surface-50">
        <SidePanelSearch
          value={impactSearch}
          onChange={setImpactSearch}
          placeholder={t('impact.searchObjects', { defaultValue: 'Filter objects...' })}
        />
        {/* Operation type filter (Fase 4B) */}
        <div className="px-2 py-1.5 border-b border-surface-200/60">
          <div className="flex bg-surface-100 rounded-md p-0.5">
            {opFilterOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => setOpFilter(opt.id)}
                className={cn(
                  'flex-1 px-2 py-1 rounded text-[10px] font-medium transition-all',
                  opFilter === opt.id ? 'bg-brand-600 text-white shadow-sm' : 'text-surface-500 hover:text-surface-700',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-2 border-b border-surface-200/60">
          <p className="text-[10px] text-surface-400">{t('impact.selectObject')}</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredTargets.map(tItem => {
            const cfg = TYPE_ICONS[tItem.type] || TYPE_ICONS.procedure;
            const TIcon = cfg.icon;
            return (
              <button key={tItem.id} onClick={() => setSelectedTarget(tItem.id)}
                className={cn('w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-surface-100 border-b border-surface-200/50 transition-colors',
                  selectedTarget === tItem.id && 'bg-brand-50 dark:bg-brand-900/20 border-l-2 border-l-brand-500')}>
                <div className="flex items-center gap-2 min-w-0">
                  <TIcon className={cn('w-3.5 h-3.5 flex-shrink-0', cfg.color)} />
                  <span className="font-mono truncate">{tItem.label}</span>
                </div>
                <span className="text-[10px] bg-surface-200 text-surface-600 px-1.5 py-0.5 rounded ml-2 flex-shrink-0">{tItem.incomingCount}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 p-6 overflow-y-auto">
        {!selectedTarget ? (
          <div className="flex items-center justify-center h-full text-surface-400">
            <div className="text-center"><GitBranch className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm">{t('impact.selectToSeeImpact')}</p></div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-lg font-mono">{findNodeLabel(selectedTarget)}</h3>
              <span className="badge-info text-xs">{t('impact.deps', { count: stats.total })}</span>
              {findNodeSchema(selectedTarget) && (
                <span className="text-xs text-surface-400">{findNodeSchema(selectedTarget)}</span>
              )}
            </div>

            {/* Summary stats (Fase 4D) */}
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg bg-surface-100 p-3 text-center">
                <div className="text-lg font-bold tabular-nums">{stats.total}</div>
                <div className="text-[10px] text-surface-500 font-medium uppercase">Total</div>
              </div>
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3 text-center">
                <div className="text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums">{stats.exec}</div>
                <div className="text-[10px] text-blue-500 font-medium uppercase">EXEC</div>
              </div>
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-3 text-center">
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{stats.read}</div>
                <div className="text-[10px] text-emerald-500 font-medium uppercase">READ</div>
              </div>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 text-center">
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">{stats.write}</div>
                <div className="text-[10px] text-amber-500 font-medium uppercase">WRITE</div>
              </div>
            </div>

            {/* Incoming dependencies (Fase 4C) */}
            <div>
              <h4 className="text-xs font-semibold text-surface-500 uppercase mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                {t('impact.incomingDeps', { defaultValue: 'Depends on this object' })}
                <span className="text-[10px] bg-surface-200 text-surface-600 px-1.5 py-0.5 rounded">{impactEdges.length}</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {impactEdges.map(e => {
                  const sourceType = findNodeType(e.source);
                  const cfg = TYPE_ICONS[sourceType] || TYPE_ICONS.procedure;
                  const EIcon = cfg.icon;
                  const opLabel = e.dependencyType === 'calls' ? 'EXEC' : e.dependencyType === 'reads_from' ? 'READ' : e.dependencyType === 'writes_to' ? 'WRITE' : e.dependencyType;
                  const opColor = e.dependencyType === 'calls' ? 'text-blue-500' : e.dependencyType === 'reads_from' ? 'text-emerald-500' : 'text-amber-500';
                  const confidencePct = Math.round(e.confidence * 100);
                  const sourceLabel = (e as any).sourceLabel || findNodeLabel(e.source);
                  const sourceSchema = findNodeSchema(e.source);

                  return (
                    <div
                      key={e.id}
                      onClick={() => { const p = resolveProc(sourceLabel); if (p) onSelectProc(p); }}
                      className={cn('rounded-lg border p-3 flex items-start gap-3 cursor-pointer hover:shadow-md hover:ring-1 hover:ring-brand-500/30 transition-all', cfg.bg)}
                    >
                      <EIcon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', cfg.color)} />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs font-medium truncate">{sourceLabel}</p>
                        {sourceSchema && <p className="text-[9px] text-surface-400">{sourceSchema}</p>}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={cn('text-[10px] font-bold', opColor)}>{opLabel}</span>
                          <div className="flex-1 h-1 rounded bg-surface-200 dark:bg-surface-300/30">
                            <div
                              className={cn('h-1 rounded', confidencePct >= 80 ? 'bg-emerald-500' : confidencePct >= 50 ? 'bg-amber-500' : 'bg-red-500')}
                              style={{ width: `${confidencePct}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-surface-400 tabular-nums">{confidencePct}%</span>
                        </div>
                      </div>
                      <button
                        onClick={(ev) => { ev.stopPropagation(); const p = resolveProc(sourceLabel); if (p) openProcTab(p, 'flow'); }}
                        className="text-surface-400 hover:text-brand-500 transition-colors flex-shrink-0"
                        title={t('detail.openInFlow')}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Outgoing dependencies (Fase 4E) */}
            {outgoingEdges.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-surface-500 uppercase mb-3 flex items-center gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5" />
                  {t('impact.outgoingDeps', { defaultValue: 'This object depends on' })}
                  <span className="text-[10px] bg-surface-200 text-surface-600 px-1.5 py-0.5 rounded">{outgoingEdges.length}</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {outgoingEdges.map(e => {
                    const targetType = findNodeType(e.target);
                    const cfg = TYPE_ICONS[targetType] || TYPE_ICONS.procedure;
                    const TIcon = cfg.icon;
                    const opLabel = e.dependencyType === 'calls' ? 'EXEC' : e.dependencyType === 'reads_from' ? 'READ' : e.dependencyType === 'writes_to' ? 'WRITE' : e.dependencyType;
                    const opColor = e.dependencyType === 'calls' ? 'text-blue-500' : e.dependencyType === 'reads_from' ? 'text-emerald-500' : 'text-amber-500';
                    const targetLabel = (e as any).targetLabel || findNodeLabel(e.target);

                    return (
                      <div
                        key={e.id}
                        onClick={() => { setSelectedTarget(e.target); }}
                        className={cn('rounded-lg border border-dashed p-3 flex items-center gap-3 cursor-pointer hover:shadow-md transition-all', cfg.bg)}
                      >
                        <TIcon className={cn('w-5 h-5 flex-shrink-0', cfg.color)} />
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-medium truncate">{targetLabel}</p>
                          <span className={cn('text-[10px] font-bold', opColor)}>{opLabel}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
