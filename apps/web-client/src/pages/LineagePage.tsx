import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Network, Search, Loader2, Database, Table2, GitBranch, ChevronRight,
  ArrowRight, Workflow, Shield, Eye, Code,
  LayoutGrid, List, Columns, Key, Link2, Hash,
  FolderOpen, Folder,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useConnections } from '@/shared/hooks/useConnections';
import { useProcedures, useDependencyGraph, type ProcedureItem, type GraphNode, type GraphEdge } from '@/shared/hooks/useAnalysis';
import { useTables, useTableDetail, type TableItem } from '@/shared/hooks/useTables';
import { parserApi } from '@/shared/lib/api-client';

type ViewMode = 'explorer' | 'lineage' | 'matrix' | 'impact';

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
  const { data: connections } = useConnections();
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const activeId = connectionId || (connections?.[0] as any)?.id || null;

  const [view, setView] = useState<ViewMode>('explorer');
  const [search, setSearch] = useState('');
  const [schemaFilter, setSchemaFilter] = useState('');
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [flowData, setFlowData] = useState<any>(null);
  const [loadingFlow, setLoadingFlow] = useState(false);

  const { data: procData, isLoading: procsLoading } = useProcedures(activeId, { limit: 500, search: search || undefined, schema: schemaFilter || undefined });
  const { data: tablesData, isLoading: tablesLoading } = useTables(activeId, { search: search || undefined, schema: schemaFilter || undefined });
  const { data: graphData } = useDependencyGraph(activeId);

  const procedures = procData?.items || [];
  const tables = tablesData || [];
  const nodes = graphData?.nodes || [];
  const edges = graphData?.edges || [];
  const isLoading = procsLoading || tablesLoading;

  // Unified schema grouping: schemas -> { procedures, tables }
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

  // Lineage for selected procedure (deduplicated)
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

  const handleSelectProc = async (proc: ProcedureItem) => {
    setSelected({ kind: 'procedure', data: proc });
    if (view === 'lineage') {
      setLoadingFlow(true);
      try {
        const result = await parserApi.parse(proc.rawDefinition, proc.language || 'postgres');
        if (result.success && result.data?.[0]) setFlowData(result.data[0]);
      } catch { /* */ }
      finally { setLoadingFlow(false); }
    }
  };

  const handleSelectTable = (tbl: TableItem) => {
    setSelected({ kind: 'table', data: tbl });
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
    <div className="h-full flex flex-col">
      {/* Compact toolbar */}
      <div className="h-10 flex-none flex items-center justify-between px-3 border-b border-surface-200 bg-surface-50/80">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-brand-500 flex-shrink-0" />
            <span className="text-sm font-semibold truncate">{t('title')}</span>
          </div>
          <span className="text-[10px] text-surface-400 tabular-nums hidden sm:inline">
            {procedures.length} procs &middot; {tables.length} tables &middot; {edges.length} deps
          </span>
        </div>
        <div className="flex items-center gap-2">
          {connections && (connections as any[]).length > 0 && (
            <select value={activeId || ''} onChange={(e) => { setConnectionId(e.target.value); setSelected(null); setFlowData(null); }}
              className="input w-44 text-xs h-7">
              {(connections as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <div className="flex bg-surface-100 rounded-md p-0.5">
            {views.map(({ id, labelKey, icon: Icon }) => (
              <button key={id} onClick={() => setView(id)} title={t(`descriptions.${id}`)}
                className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-all',
                  view === id ? 'bg-brand-600 text-white shadow-sm' : 'text-surface-500 hover:text-surface-700')}>
                <Icon className="w-3.5 h-3.5" /> <span className="hidden lg:inline">{t(labelKey)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
        ) : view === 'explorer' ? (
          <ExplorerView
            schemas={schemas}
            selected={selected}
            onSelectProc={handleSelectProc}
            onSelectTable={handleSelectTable}
            connectionId={activeId}
            search={search}
            onSearchChange={setSearch}
            schemaFilter={schemaFilter}
            onSchemaFilterChange={setSchemaFilter}
            allSchemaNames={schemas.map(([s]) => s)}
          />
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

/* ═══════════════════════════════════════════════════════════════
   EXPLORER VIEW — VS Code-style tree + workspace
   ═══════════════════════════════════════════════════════════════ */

function ExplorerView({
  schemas, selected, onSelectProc, onSelectTable, connectionId,
  search, onSearchChange, schemaFilter, onSchemaFilterChange, allSchemaNames,
}: {
  schemas: [string, { procedures: ProcedureItem[]; tables: TableItem[] }][];
  selected: SelectedItem;
  onSelectProc: (p: ProcedureItem) => void;
  onSelectTable: (t: TableItem) => void;
  connectionId: string | null;
  search: string;
  onSearchChange: (s: string) => void;
  schemaFilter: string;
  onSchemaFilterChange: (s: string) => void;
  allSchemaNames: string[];
}) {
  const { t } = useTranslation(['lineage', 'common']);
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(() => new Set(schemas[0] ? [schemas[0][0]] : []));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    // Auto-expand first schema's groups
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
        // Auto-expand sub-groups when opening schema
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
        {/* Search + filter */}
        <div className="p-2 space-y-1.5 border-b border-surface-200">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              className="input pl-8 text-xs h-7 w-full"
              placeholder={t('search')}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <select
            value={schemaFilter}
            onChange={(e) => onSchemaFilterChange(e.target.value)}
            className="input text-xs h-7 w-full"
          >
            <option value="">{t('allSchemas')}</option>
            {allSchemaNames.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

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
                {/* Schema header */}
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

                {/* Schema children */}
                {isExpanded && (
                  <div>
                    {/* Procedures group */}
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

                    {/* Tables group */}
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
          <ProcedureDetail proc={selected.data} connectionId={connectionId} />
        ) : (
          <TableDetail table={selected.data} connectionId={connectionId} />
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PROCEDURE DETAIL (workspace view)
   ═══════════════════════════════════════════════════════════════ */

function ProcedureDetail({ proc }: { proc: ProcedureItem; connectionId: string | null }) {
  const { t } = useTranslation(['lineage', 'common']);
  const cfg = TYPE_ICONS[proc.objectType] || TYPE_ICONS.procedure;
  const Icon = cfg.icon;
  const cc = proc.estimatedComplexity || 0;

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
            <span className="text-xs text-surface-500">{t('detail.lines', { count: proc.lineCount })}</span>
            <span title={t('common:tooltips.cc')} className={cn('text-xs px-1.5 py-0.5 rounded font-medium cursor-help',
              cc <= 5 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
              cc <= 10 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
              cc <= 20 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
              'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400')}>
              CC={cc}
            </span>
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
        <pre className="bg-surface-100 dark:bg-surface-200/50 rounded-lg p-4 overflow-x-auto text-[11px] font-mono leading-relaxed text-surface-700 max-h-80 overflow-y-auto">
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
      {/* Header */}
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

      {/* Columns */}
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

      {/* Foreign Keys */}
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

      {/* Indexes */}
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

      {/* Accessed by procedures */}
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
   LINEAGE VIEW
   ═══════════════════════════════════════════════════════════════ */

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
        <div className="w-72 border-r border-surface-200 overflow-y-auto">
          <div className="p-3 border-b border-surface-200"><h3 className="text-xs font-semibold text-surface-500">{t('lineageView.selectToViewLineage')}</h3></div>
          {procedures.slice(0, 50).map(p => {
            const cfg = TYPE_ICONS[p.objectType] || TYPE_ICONS.procedure;
            const PIcon = cfg.icon;
            return (
              <button key={p.id} onClick={() => onSelect(p)} className="w-full flex items-center gap-2 px-4 py-2.5 text-xs hover:bg-surface-100 border-b border-surface-200/50">
                <PIcon className={cn('w-3.5 h-3.5', cfg.color)} />
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
  const CIcon = cfg.icon;

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="flex items-start gap-6 justify-center min-h-[300px]">
        {/* Upstream */}
        <div className="space-y-2 min-w-[200px]">
          <h4 className="text-[10px] font-semibold text-surface-500 uppercase text-center mb-3 cursor-help" title={t('common:tooltips.upstream')}>{t('lineageView.upstream')}</h4>
          {lineage.upstream.length === 0 ? (
            <div className="text-center text-xs text-surface-400 py-8">{t('lineageView.noCallers')}</div>
          ) : lineage.upstream.map(e => (
            <NodeCard key={e.id} label={findNodeLabel(e.source)} type={findNodeType(e.source)} edgeType={e.dependencyType} direction="right" />
          ))}
        </div>

        {/* Center */}
        <div className="flex flex-col items-center gap-3 min-w-[220px]">
          <div className="text-[10px] font-semibold text-surface-500 uppercase mb-1">{t('lineageView.selected')}</div>
          <div className={cn('rounded-xl border-2 p-5 text-center shadow-lg', cfg.bg, 'border-brand-500')}>
            <CIcon className={cn('w-8 h-8 mx-auto mb-2', cfg.color)} />
            <p className="font-mono font-bold text-sm">{selectedProc.objectName}</p>
            <p className="text-[10px] text-surface-500 mt-1">{selectedProc.schemaName} / {selectedProc.objectType}</p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="badge-info text-[9px] cursor-help" title={t('common:tooltips.cc')}>CC={selectedProc.estimatedComplexity || 0}</span>
              <span className="badge-info text-[9px]">{t('detail.lines', { count: selectedProc.lineCount })}</span>
            </div>
          </div>
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

        {/* Downstream */}
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

/* ── NODE CARD ── */
function NodeCard({ label, type, edgeType, direction }: { label: string; type: string; edgeType: string; direction: 'left' | 'right' }) {
  const { t } = useTranslation(['lineage', 'common']);
  const cfg = TYPE_ICONS[type] || TYPE_ICONS.procedure;
  const NIcon = cfg.icon;
  const opCfg = OP_COLORS[edgeType] || OP_COLORS.calls;
  const edgeLabel = edgeType === 'calls' ? 'EXEC' : edgeType === 'reads_from' ? 'READ' : edgeType === 'writes_to' ? 'WRITE' : edgeType;
  const edgeTooltip = edgeType === 'calls' ? t('common:tooltips.exec') : edgeType === 'reads_from' ? t('common:tooltips.crud') : edgeType === 'writes_to' ? t('common:tooltips.crud') : '';

  return (
    <div className="flex items-center gap-2">
      {direction === 'left' && <div className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold cursor-help', opCfg)} title={edgeTooltip}>{edgeLabel}</div>}
      <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 min-w-[160px] cursor-pointer hover:shadow-md transition-shadow', cfg.bg)}>
        <NIcon className={cn('w-4 h-4 flex-shrink-0', cfg.color)} />
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium truncate">{label}</p>
          <p className="text-[9px] text-surface-500 uppercase">{cfg.label}</p>
        </div>
      </div>
      {direction === 'right' && <div className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold cursor-help', opCfg)} title={edgeTooltip}>{edgeLabel}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CRUD MATRIX VIEW
   ═══════════════════════════════════════════════════════════════ */

function MatrixView({ edges, nodes, findNodeLabel }: {
  edges: GraphEdge[];
  nodes: GraphNode[];
  findNodeLabel: (id: string) => string;
}) {
  const { t } = useTranslation(['lineage', 'common']);
  const matrix = useMemo(() => {
    const rows: { proc: string; targets: { name: string; type: string; op: string }[] }[] = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    for (const node of nodes) {
      const outEdges = edges.filter(e => e.source === node.id);
      if (outEdges.length === 0) continue;
      const seenTargets = new Set<string>();
      const targets = outEdges
        .map(e => ({
          name: (e as any).targetLabel || findNodeLabel(e.target),
          type: nodeMap.get(e.target)?.objectType || (e.target.startsWith('ext_') ? 'external' : 'unknown'),
          op: e.dependencyType,
        }))
        .filter(tItem => {
          const key = `${tItem.name}-${tItem.op}`;
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

/* ═══════════════════════════════════════════════════════════════
   IMPACT ANALYSIS VIEW
   ═══════════════════════════════════════════════════════════════ */

function ImpactView({ edges, findNodeLabel, findNodeType }: {
  edges: GraphEdge[];
  findNodeLabel: (id: string) => string;
  findNodeType: (id: string) => string;
}) {
  const { t } = useTranslation(['lineage', 'common']);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);

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
      <div className="w-72 border-r border-surface-200 overflow-y-auto">
        <div className="p-3 border-b border-surface-200">
          <h3 className="text-xs font-semibold text-surface-500">{t('impact.selectObject')}</h3>
        </div>
        {targets.map(tItem => {
          const cfg = TYPE_ICONS[tItem.type] || TYPE_ICONS.procedure;
          const TIcon = cfg.icon;
          return (
            <button key={tItem.id} onClick={() => setSelectedTarget(tItem.id)}
              className={cn('w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-surface-100 border-b border-surface-200/50',
                selectedTarget === tItem.id && 'bg-brand-50 dark:bg-brand-900/20')}>
              <div className="flex items-center gap-2">
                <TIcon className={cn('w-3.5 h-3.5', cfg.color)} />
                <span className="font-mono truncate">{tItem.label}</span>
              </div>
              <span className="text-[10px] bg-surface-200 text-surface-600 px-1.5 py-0.5 rounded">{tItem.incomingCount}</span>
            </button>
          );
        })}
      </div>

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
                const EIcon = cfg.icon;
                const opLabel = e.dependencyType === 'calls' ? 'EXEC' : e.dependencyType === 'reads_from' ? 'READ' : e.dependencyType === 'writes_to' ? 'WRITE' : e.dependencyType;
                return (
                  <div key={e.id} className={cn('rounded-lg border p-3 flex items-center gap-3', cfg.bg)}>
                    <EIcon className={cn('w-5 h-5', cfg.color)} />
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
