import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  GitBranch, Search, Loader2, ChevronRight, ChevronDown,
  Table2, Workflow, Shield, ArrowRight, Eye, Zap,
  PenTool, Trash2, ExternalLink, Variable, Code,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { useGlobalConnection } from '@/shared/hooks/useGlobalConnection';
import { useStudioContext } from '@/shared/hooks/useStudioContext';
import { useProcedures, type ProcedureItem } from '@/shared/hooks/useAnalysis';
import { Skeleton } from '@/shared/components/Skeleton';
import { parserApi } from '@/shared/lib/api-client';
import { FlowBreadcrumb, type BreadcrumbItem } from '@/features/visualization/components/FlowBreadcrumb';
import { VariableTracePanel } from '@/features/visualization/components/VariableTracePanel';
import { FlowTreeView } from '@/features/visualization/components/FlowTreeView';
import type { FlowTreeNode } from '@/features/visualization/types/flow-tree';

const OP_ICON: Record<string, { icon: typeof Eye; color: string; label: string }> = {
  SELECT: { icon: Eye, color: 'text-emerald-400', label: 'READ' },
  INSERT: { icon: PenTool, color: 'text-blue-400', label: 'INSERT' },
  UPDATE: { icon: Zap, color: 'text-amber-400', label: 'UPDATE' },
  DELETE: { icon: Trash2, color: 'text-red-400', label: 'DELETE' },
  MERGE: { icon: GitBranch, color: 'text-purple-400', label: 'MERGE' },
};

interface CallStackEntry {
  proc: ProcedureItem;
  parsedData: any;
}

export function FlowPage() {
  const { t } = useTranslation(['flow', 'common']);
  const navigate = useNavigate();
  const { procedureId: urlProcedureId } = useParams();
  const { connectionId: activeId, setConnectionId, connections } = useGlobalConnection();

  const [search, setSearch] = useStudioContext('flow', 'search', '');
  const [selectedProc, setSelectedProc] = useStudioContext<ProcedureItem | null>('flow', 'selectedProc', null);
  const [parsedData, setParsedData] = useStudioContext<Record<string, any>>('flow', 'parsedData', {});
  const [loading, setLoading] = useState(false);
  const [callStack, setCallStack] = useStudioContext<CallStackEntry[]>('flow', 'callStack', []);
  const [showVariableTrace, setShowVariableTrace] = useState(false);
  const [flowViewTab, setFlowViewTab] = useStudioContext<'pipeline' | 'controlFlow'>('flow', 'flowViewTab', 'pipeline');

  // Reset when connection changes
  const prevConn = useRef(activeId);
  useEffect(() => {
    if (prevConn.current !== activeId && prevConn.current !== null) {
      setSelectedProc(null);
      setParsedData({});
      setCallStack([]);
    }
    prevConn.current = activeId;
  }, [activeId, setSelectedProc, setParsedData, setCallStack]);

  const { data: procData, isLoading } = useProcedures(activeId, { limit: 500, search: search || undefined });
  const procedures = procData?.items || [];

  // Ref to avoid stale closure in parseProc
  const parsedDataRef = useRef(parsedData);
  parsedDataRef.current = parsedData;

  // AbortController for in-flight parse requests
  const abortRef = useRef<AbortController | null>(null);

  // Abort on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const MAX_PARSED_CACHE = 20;

  // Build a lookup: procedure name -> ProcedureItem
  const procByName = useMemo(() => {
    const map = new Map<string, ProcedureItem>();
    for (const p of procedures) {
      map.set(p.objectName, p);
      map.set(p.fullQualifiedName, p);
    }
    return map;
  }, [procedures]);

  // Helper to parse a proc and its children
  const parseProc = useCallback(async (proc: ProcedureItem) => {
    if (parsedDataRef.current[proc.id] || !proc.rawDefinition) return;

    // Abort previous parse
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await parserApi.parse(proc.rawDefinition, proc.language || 'tsql', controller.signal);
      if (controller.signal.aborted) return;
      if (!result.success || !result.data?.[0]) return;

      setParsedData(prev => {
        const next = { ...prev, [proc.id]: result.data[0] };
        const keys = Object.keys(next);
        if (keys.length > MAX_PARSED_CACHE) {
          const toRemove = keys.slice(0, keys.length - MAX_PARSED_CACHE);
          for (const k of toRemove) delete next[k];
        }
        return next;
      });

      // Also parse child SPs for drill-down
      const deps = (result.data[0].dependencies || []) as any[];
      for (const dep of deps) {
        if (controller.signal.aborted) return;
        const targetName = dep.targetName?.split('.').pop();
        const childProc = procByName.get(targetName) || procByName.get(dep.targetName);
        if (childProc && !parsedDataRef.current[childProc.id] && childProc.rawDefinition) {
          try {
            const childResult = await parserApi.parse(childProc.rawDefinition, childProc.language || 'tsql', controller.signal);
            if (controller.signal.aborted) return;
            if (childResult.success && childResult.data?.[0]) {
              setParsedData(prev => {
                const next = { ...prev, [childProc.id]: childResult.data[0] };
                const keys = Object.keys(next);
                if (keys.length > MAX_PARSED_CACHE) {
                  const toRemove = keys.slice(0, keys.length - MAX_PARSED_CACHE);
                  for (const k of toRemove) delete next[k];
                }
                return next;
              });
            }
          } catch (e) {
            if ((e as Error).name === 'AbortError') return;
            /* skip */
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      throw e;
    }
  }, [procByName]);

  // Auto-select procedure from URL params
  useEffect(() => {
    if (urlProcedureId && procedures.length > 0 && !selectedProc) {
      const proc = procedures.find(p => p.id === urlProcedureId);
      if (proc) handleSelect(proc);
    }
  }, [urlProcedureId, procedures.length]);

  // Build call tree for selected procedure
  const callTree = useMemo(() => {
    if (!selectedProc) return null;
    const pd = parsedData[selectedProc.id];
    if (!pd) return null;

    const deps = (pd.dependencies || []) as any[];
    const tables = (pd.tableReferences || []) as any[];
    const params = (pd.parameters || []) as any[];

    return {
      name: selectedProc.objectName,
      schema: selectedProc.schemaName,
      type: selectedProc.objectType,
      params,
      complexity: pd.complexity,
      tables,
      calls: deps.filter((d: any) => d.dependencyType === 'calls'),
      security: (pd.securityFindings || []) as any[],
      autoDoc: pd.autoDoc,
    };
  }, [selectedProc, parsedData]);

  // Extract flow tree for selected procedure
  const flowTree = useMemo<FlowTreeNode | null>(() => {
    if (!selectedProc) return null;
    const pd = parsedData[selectedProc.id];
    return pd?.flowTree as FlowTreeNode | null ?? null;
  }, [selectedProc, parsedData]);

  const handleSelect = useCallback(async (proc: ProcedureItem) => {
    setSelectedProc(proc);
    setCallStack([]);
    if (!parsedDataRef.current[proc.id] && proc.rawDefinition) {
      setLoading(true);
      try { await parseProc(proc); } catch { /* skip */ }
      finally { setLoading(false); }
    }
  }, [parseProc]);

  // Drill-down: navigate into a child SP
  const handleDrillDown = useCallback(async (childProc: ProcedureItem) => {
    if (!selectedProc) return;

    // Push current state onto call stack
    const currentParsed = parsedDataRef.current[selectedProc.id];
    setCallStack(prev => [...prev, { proc: selectedProc, parsedData: currentParsed }]);
    setSelectedProc(childProc);

    if (!parsedDataRef.current[childProc.id] && childProc.rawDefinition) {
      setLoading(true);
      try { await parseProc(childProc); } catch { /* skip */ }
      finally { setLoading(false); }
    }
  }, [selectedProc, parseProc]);

  // Breadcrumb navigation: pop back to a level
  const handleBreadcrumbNavigate = useCallback((index: number) => {
    if (index === -1) {
      // Go to root
      if (callStack.length > 0) {
        setSelectedProc(callStack[0].proc);
        setCallStack([]);
      }
      return;
    }
    setSelectedProc(callStack[index].proc);
    setCallStack(prev => prev.slice(0, index));
  }, [callStack]);

  // Build breadcrumb items
  const breadcrumbItems: BreadcrumbItem[] = useMemo(() => {
    if (callStack.length === 0) return [];
    const items: BreadcrumbItem[] = callStack.map(entry => ({
      id: entry.proc.id,
      name: entry.proc.objectName,
      schema: entry.proc.schemaName,
    }));
    if (selectedProc) {
      items.push({
        id: selectedProc.id,
        name: selectedProc.objectName,
        schema: selectedProc.schemaName,
      });
    }
    return items;
  }, [callStack, selectedProc]);

  return (
    <div className="h-full flex flex-col">
      {/* Compact toolbar */}
      <div className="h-10 flex-none flex items-center justify-between px-3 border-b border-surface-200 bg-surface-50/80">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-brand-500 flex-shrink-0" />
            <span className="text-sm font-semibold truncate">{t('flow:title')}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedProc && parsedData[selectedProc.id] && (
            <button
              onClick={() => setShowVariableTrace(!showVariableTrace)}
              className={cn('btn-ghost text-xs', showVariableTrace && 'bg-brand-500/10 text-brand-500')}
            >
              <Variable className="w-3.5 h-3.5" />
              {t('flow:variableTrace.title')}
            </button>
          )}
          {connections && (connections as any[]).length > 0 && (
            <select value={activeId || ''} onChange={(e) => setConnectionId(e.target.value || null)}
              className="input w-44 text-xs h-7">
              {connections.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Procedure list */}
        <div className="w-72 flex-shrink-0 card flex flex-col overflow-hidden">
          <div className="p-2 border-b border-surface-200/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
              <input className="input pl-8 text-xs py-1.5" placeholder={t('flow:searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-3 space-y-2 animate-fade-in">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="px-2 py-1.5 space-y-1">
                    <Skeleton width={`${75 - (i % 3) * 10}%`} className="h-3" />
                    <Skeleton width="45%" className="h-2" />
                  </div>
                ))}
              </div>
            ) : procedures.length === 0 ? (
              <div className="p-4 text-center text-surface-400 text-xs">{t('flow:noResults')}</div>
            ) : procedures.map((proc) => (
              <button key={proc.id} onClick={() => handleSelect(proc)}
                className={cn('w-full flex items-center justify-between px-3 py-2 text-xs border-b border-surface-200/30 hover:bg-surface-100/60 transition-all cursor-pointer',
                  selectedProc?.id === proc.id && 'bg-brand-500/8 border-l-2 border-l-brand-500')}>
                <div className="min-w-0 text-left">
                  <p className="font-mono font-medium truncate text-[12px]">{proc.objectName}</p>
                  <p className="text-2xs text-surface-500">{proc.schemaName} / {proc.objectType}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                  {proc.estimatedComplexity && (
                    <span title={t('common:tooltips.cc')} className={cn('text-2xs px-1.5 py-0.5 rounded-md font-bold cursor-help',
                      proc.estimatedComplexity <= 5 ? 'badge-success' :
                      proc.estimatedComplexity <= 10 ? 'badge-medium' :
                      proc.estimatedComplexity <= 20 ? 'badge-high' : 'badge-critical')}>
                      CC={proc.estimatedComplexity}
                    </span>
                  )}
                  <ChevronRight className="w-3 h-3 text-surface-300" />
                </div>
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-surface-200/60 text-2xs text-surface-400 text-center">
            {t('flow:total', { count: procData?.total || 0 })}
          </div>
        </div>

        {/* Pipeline view */}
        <div className="flex-1 card overflow-y-auto">
          {!selectedProc ? (
            <div className="flex items-center justify-center h-full text-surface-400">
              <div className="text-center"><Workflow className="w-10 h-10 mx-auto mb-3 opacity-20" /><p className="text-xs">{t('flow:emptyState')}</p></div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
          ) : callTree ? (
            <div className="p-5 animate-fade-in">
              {/* Breadcrumb */}
              {breadcrumbItems.length > 0 && (
                <FlowBreadcrumb items={breadcrumbItems} onNavigate={handleBreadcrumbNavigate} />
              )}

              {/* Header */}
              <div className="mb-5 pb-4 border-b border-surface-200/60">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                    <Workflow className="w-4.5 h-4.5 text-brand-500" />
                  </div>
                  <div className="flex-1">
                    <h2 className="font-mono font-bold text-base">{callTree.schema}.{callTree.name}</h2>
                    <p className="text-2xs text-surface-500">{callTree.type} / {selectedProc.lineCount} lines / {callTree.calls.length} calls / {callTree.tables.length} table refs</p>
                  </div>
                  <button
                    onClick={() => navigate(`/explorer/${activeId}/${selectedProc.id}`)}
                    className="btn-ghost text-xs flex items-center gap-1.5 px-2 py-1"
                    title={t('flow:actions.openInExplorer')}
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t('flow:actions.openInExplorer')}</span>
                  </button>
                </div>

                {/* Parameters */}
                {callTree.params.length > 0 && (
                  <div className="mt-3">
                    <p className="text-2xs font-semibold text-surface-500 uppercase mb-1.5">{t('flow:sections.parameters')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {callTree.params.map((p: any, i: number) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface-100/80 border border-surface-200/50 text-2xs font-mono">
                          <span className="text-brand-400 font-bold">{p.name}</span>
                          <span className="text-surface-500">{p.dataType}</span>
                          {p.mode !== 'IN' && <span className="badge-medium text-2xs">{p.mode}</span>}
                          {p.defaultValue && <span className="text-surface-400">= {p.defaultValue}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Complexity + Security */}
                <div className="flex items-center gap-2 mt-3">
                  {callTree.complexity && (
                    <>
                      <span title={t('common:tooltips.cc')} className={cn('badge text-2xs cursor-help',
                        callTree.complexity.riskLevel === 'low' ? 'badge-success' :
                        callTree.complexity.riskLevel === 'moderate' ? 'badge-medium' :
                        callTree.complexity.riskLevel === 'high' ? 'badge-high' : 'badge-critical')}>
                        CC={callTree.complexity.cyclomaticComplexity} {callTree.complexity.riskLevel}
                      </span>
                      <span title={t('common:tooltips.depth')} className="badge-info text-2xs cursor-help">depth={callTree.complexity.nestingDepth}</span>
                      <span title={t('common:tooltips.branches')} className="badge-info text-2xs cursor-help">branches={callTree.complexity.branchCount}</span>
                    </>
                  )}
                  {callTree.security.length > 0 && (
                    <span className="badge-critical text-2xs">
                      <Shield className="w-3 h-3" /> {callTree.security.length} security issues
                    </span>
                  )}
                </div>
              </div>

              {/* View tabs */}
              <div className="flex border-b border-surface-200/60 mb-4">
                <button
                  onClick={() => setFlowViewTab('pipeline')}
                  className={cn(
                    'px-3 py-2 text-xs font-medium border-b-2 transition-colors',
                    flowViewTab === 'pipeline'
                      ? 'border-brand-500 text-brand-600'
                      : 'border-transparent text-surface-500 hover:text-surface-700',
                  )}
                >
                  <Workflow className="w-3.5 h-3.5 inline mr-1.5" />
                  {t('flow:tabs.pipeline', { defaultValue: 'Pipeline' })}
                </button>
                <button
                  onClick={() => setFlowViewTab('controlFlow')}
                  className={cn(
                    'px-3 py-2 text-xs font-medium border-b-2 transition-colors',
                    flowViewTab === 'controlFlow'
                      ? 'border-brand-500 text-brand-600'
                      : 'border-transparent text-surface-500 hover:text-surface-700',
                  )}
                >
                  <GitBranch className="w-3.5 h-3.5 inline mr-1.5" />
                  {t('flow:tabs.controlFlow', { defaultValue: 'Flujo de Control' })}
                </button>
              </div>

              {/* Pipeline view (existing) */}
              {flowViewTab === 'pipeline' && (
                <>
                  <div className="space-y-1">
                    <p className="text-2xs font-semibold text-surface-500 uppercase mb-2">{t('flow:sections.pipeline')}</p>

                    {/* Table operations */}
                    {callTree.tables.map((tbl: any, i: number) => {
                      const op = OP_ICON[tbl.operation] || OP_ICON.SELECT;
                      const Icon = op.icon;
                      return (
                        <div key={`t-${i}`} className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-surface-100/40 border border-surface-200/30">
                          <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', op.color)} />
                          <span className={cn('text-2xs font-bold uppercase', op.color)}>{op.label}</span>
                          <span className="font-mono text-xs text-surface-700">{tbl.fullName || tbl.tableName}</span>
                          {tbl.isTempTable && <span className="badge-info text-2xs">{t('common:badges.temp')}</span>}
                        </div>
                      );
                    })}

                    {/* SP calls — the main pipeline */}
                    {callTree.calls.map((call: any, i: number) => (
                      <CallNode
                        key={`c-${i}`}
                        call={call}
                        depth={0}
                        procByName={procByName}
                        parsedData={parsedData}
                        onDrillDown={handleDrillDown}
                        connectionId={activeId}
                      />
                    ))}
                  </div>

                  {/* Auto-doc */}
                  {callTree.autoDoc && (
                    <div className="mt-6 pt-4 border-t border-surface-200/60">
                      <p className="text-2xs font-semibold text-surface-500 uppercase mb-2">{t('flow:sections.autoDoc')}</p>
                      <div className="card p-3 space-y-1.5">
                        <p className="text-xs text-surface-700">{(callTree.autoDoc as any).summary}</p>
                        {(callTree.autoDoc as any).sideEffects?.length > 0 && (
                          <div className="pt-1.5">
                            <p className="text-2xs font-semibold text-surface-500 mb-1">{t('flow:sections.sideEffects')}</p>
                            {(callTree.autoDoc as any).sideEffects.map((e: string, j: number) => (
                              <p key={j} className="text-2xs text-amber-400 flex items-center gap-1">
                                <ArrowRight className="w-3 h-3" /> {e}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Control Flow view (new) */}
              {flowViewTab === 'controlFlow' && (
                <div className="animate-fade-in">
                  {flowTree ? (
                    <FlowTreeView
                      tree={flowTree}
                      defaultExpandDepth={3}
                    />
                  ) : (
                    <p className="text-xs text-surface-400 text-center py-8">
                      {t('flow:flowTree.noFlow', { defaultValue: 'No hay datos de flujo de control disponibles' })}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-surface-400">
              <p className="text-xs">{t('flow:parseError')}</p>
            </div>
          )}
        </div>

        {/* Variable Trace Panel */}
        {showVariableTrace && selectedProc && parsedData[selectedProc.id] && (
          <VariableTracePanel
            variableReferences={parsedData[selectedProc.id].variableReferences || []}
            onClose={() => setShowVariableTrace(false)}
          />
        )}
      </div>
    </div>
  );
}

/* ── Recursive Call Node ── */
function CallNode({ call, depth, procByName, parsedData, onDrillDown, connectionId }: {
  call: any;
  depth: number;
  procByName: Map<string, ProcedureItem>;
  parsedData: Record<string, any>;
  onDrillDown: (proc: ProcedureItem) => void;
  connectionId: string | null;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation(['flow', 'common']);
  const [expanded, setExpanded] = useState(depth < 2);
  const targetName = call.targetName || '';
  const shortName = targetName.split('.').pop() || targetName;

  // Find the child procedure and its parsed data
  const childProc = procByName.get(shortName) || procByName.get(targetName);
  const childParsed = childProc ? parsedData[childProc.id] : null;
  const childDeps = childParsed ? (childParsed.dependencies || []).filter((d: any) => d.dependencyType === 'calls') : [];
  const childTables = childParsed ? (childParsed.tableReferences || []) : [];
  const childParams = childParsed ? (childParsed.parameters || []) : [];
  const hasChildren = childDeps.length > 0 || childTables.length > 0;
  const cc = childParsed?.complexity?.cyclomaticComplexity;

  return (
    <div className={cn('mt-1', depth > 0 && 'ml-5 border-l-2 border-surface-200/30 pl-3')}>
      <div className={cn(
        'flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-all duration-150',
        'bg-blue-500/6 border border-blue-500/15 hover:border-blue-400/30 hover:bg-blue-500/10',
      )} onClick={() => hasChildren && setExpanded(!expanded)}>
        {/* Expand/collapse */}
        {hasChildren ? (
          expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
            : <ChevronRight className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
        ) : (
          <ArrowRight className="w-3.5 h-3.5 text-surface-300 flex-shrink-0" />
        )}

        <Workflow className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
        <span className="text-2xs font-bold text-blue-400 uppercase cursor-help" title={t('common:tooltips.exec')}>{t('common:operations.exec')}</span>
        <span className="font-mono text-xs font-medium text-surface-800">{targetName}</span>

        {/* Params preview */}
        {childParams.length > 0 && (
          <span className="text-2xs text-surface-500">
            ({childParams.map((p: any) => p.name).join(', ')})
          </span>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          {/* Open in SQL Explorer */}
          {childProc && connectionId && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/explorer/${connectionId}/${childProc.id}`); }}
              className="p-1 rounded hover:bg-emerald-500/15 text-surface-400 hover:text-emerald-500 transition-colors cursor-pointer"
              title={t('flow:actions.openInExplorer')}
            >
              <Code className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Drill-down button */}
          {childProc && (
            <button
              onClick={(e) => { e.stopPropagation(); onDrillDown(childProc); }}
              className="p-1 rounded hover:bg-brand-500/15 text-surface-400 hover:text-brand-500 transition-colors cursor-pointer"
              title={t('flow:drillDownHint', { name: shortName })}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
          {call.isDynamic && <span className="badge-high text-2xs cursor-help" title={t('common:tooltips.dynamic')}>{t('common:badges.dynamic')}</span>}
          {cc && (
            <span title={t('common:tooltips.cc')} className={cn('text-2xs px-1.5 py-0.5 rounded-md font-bold cursor-help',
              cc <= 5 ? 'badge-success' : cc <= 10 ? 'badge-medium' : cc <= 20 ? 'badge-high' : 'badge-critical')}>
              CC={cc}
            </span>
          )}
          {childTables.length > 0 && (
            <span className="badge-info text-2xs"><Table2 className="w-3 h-3" /> {childTables.length}</span>
          )}
          {childDeps.length > 0 && (
            <span className="badge-info text-2xs"><Workflow className="w-3 h-3" /> {childDeps.length}</span>
          )}
          <span className="text-2xs text-surface-400">L{call.lineNumber || '?'}</span>
        </div>
      </div>

      {/* Expanded children */}
      {expanded && hasChildren && (
        <div className="animate-fade-in">
          {/* Child tables */}
          {childTables.map((tbl: any, i: number) => {
            const op = OP_ICON[tbl.operation] || OP_ICON.SELECT;
            const Icon = op.icon;
            return (
              <div key={`ct-${i}`} className="ml-5 border-l-2 border-surface-200/30 pl-3 mt-1">
                <div className="flex items-center gap-2 py-1 px-2 rounded bg-surface-100/30">
                  <Icon className={cn('w-3 h-3', op.color)} />
                  <span className={cn('text-2xs font-bold uppercase', op.color)}>{op.label}</span>
                  <span className="font-mono text-2xs text-surface-600">{tbl.fullName || tbl.tableName}</span>
                </div>
              </div>
            );
          })}
          {/* Child calls (recursive) */}
          {childDeps.map((childCall: any, i: number) => (
            <CallNode key={`cc-${i}`} call={childCall} depth={depth + 1} procByName={procByName} parsedData={parsedData} onDrillDown={onDrillDown} connectionId={connectionId} />
          ))}
        </div>
      )}
    </div>
  );
}
