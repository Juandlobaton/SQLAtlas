import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  GitBranch, Loader2, ChevronRight, ChevronDown, X,
  Table2, Workflow, ArrowRight, Eye, Zap, Waypoints,
  PenTool, Trash2, ExternalLink, Variable, Code, Columns2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { useGlobalConnection } from '@/shared/hooks/useGlobalConnection';
import { useStudioContext } from '@/shared/hooks/useStudioContext';
import { useProcedures, type ProcedureItem } from '@/shared/hooks/useAnalysis';
import { Skeleton } from '@/shared/components/Skeleton';
import { parserApi } from '@/shared/lib/api-client';
import { VariableTracePanel } from '@/features/visualization/components/VariableTracePanel';
import { FlowTreeView } from '@/features/visualization/components/FlowTreeView';
import { PipelineCanvas } from '@/features/studio/components/PipelineCanvas';
import type { FlowTreeNode } from '@/features/visualization/types/flow-tree';
import { ModuleToolbar } from '@/shared/components/layout/ModuleToolbar';
import { ModulePageLayout } from '@/shared/components/layout/ModulePageLayout';
import { SidePanel } from '@/shared/components/layout/SidePanel';
import { SidePanelSearch } from '@/shared/components/SidePanelSearch';
import { ConnectionSelector } from '@/shared/components/ConnectionSelector';
import { EmptyState } from '@/shared/components/EmptyState';
import { PageTabs } from '@/shared/components/PageTabs';
// import { useOpenProcedureTab } from '@/shared/hooks/useOpenProcedureTab';

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
  const { procedureId: urlProcedureId } = useParams();
  const { connectionId: activeId } = useGlobalConnection();
  // const openProcTab = useOpenProcedureTab(); // Available for external tab opening if needed

  const [search, setSearch] = useStudioContext('flow', 'search', '');
  const [selectedProc, setSelectedProc] = useStudioContext<ProcedureItem | null>('flow', 'selectedProc', null);
  const [parsedData, setParsedData] = useStudioContext<Record<string, any>>('flow', 'parsedData', {});
  const [loading, setLoading] = useState(false);
  const [, setCallStack] = useStudioContext<CallStackEntry[]>('flow', 'callStack', []);
  const [showVariableTrace, setShowVariableTrace] = useState(false);
  const [splitProc, setSplitProc] = useState<ProcedureItem | null>(null);
  const [splitWidth, setSplitWidth] = useState(50); // percentage
  const [flowViewTab, setFlowViewTab] = useStudioContext<'pipeline' | 'controlFlow' | 'diagram'>('flow', 'flowViewTab', 'pipeline');
  const [openTabs, setOpenTabs] = useStudioContext<ProcedureItem[]>('flow', 'openTabs', []);

  // Reset when connection changes
  const prevConn = useRef(activeId);
  useEffect(() => {
    if (prevConn.current !== activeId && prevConn.current !== null) {
      setSelectedProc(null);
      setParsedData({});
      setCallStack([]);
      setOpenTabs([]);
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
      map.set(p.objectName.toLowerCase(), p);
      map.set(p.fullQualifiedName, p);
      map.set(p.fullQualifiedName.toLowerCase(), p);
    }
    return map;
  }, [procedures]);

  // Refs for stable closure access in callbacks
  const proceduresRef = useRef(procedures);
  proceduresRef.current = procedures;
  const procByNameRef = useRef(procByName);
  procByNameRef.current = procByName;

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

  // Build call tree for any procedure
  const buildCallTree = useCallback((proc: ProcedureItem | null) => {
    if (!proc) return null;
    const pd = parsedData[proc.id];
    const deps = (pd?.dependencies || []) as any[];
    const tables = (pd?.tableReferences || []) as any[];
    const params = (pd?.parameters || proc.parameters || []) as any[];
    const cc = proc.estimatedComplexity;
    return {
      name: proc.objectName, schema: proc.schemaName, type: proc.objectType, params,
      complexity: pd?.complexity ?? (cc
        ? { cyclomaticComplexity: cc, riskLevel: cc <= 5 ? 'low' : cc <= 10 ? 'moderate' : cc <= 20 ? 'high' : 'critical' }
        : null),
      tables,
      calls: deps.filter((d: any) => d.dependencyType === 'calls'),
      security: (pd?.securityFindings || proc.securityFindings || []) as any[],
      autoDoc: pd?.autoDoc ?? (proc as any).autoDoc ?? null,
    };
  }, [parsedData]);

  // Extract flow tree for any procedure
  const getFlowTree = useCallback((proc: ProcedureItem | null): FlowTreeNode | null => {
    if (!proc) return null;
    const stored = (proc as any).flowTree as FlowTreeNode | null;
    if (stored) return stored;
    const pd = parsedData[proc.id];
    return pd?.flowTree as FlowTreeNode | null ?? null;
  }, [parsedData]);

  const callTree = useMemo(() => buildCallTree(selectedProc), [buildCallTree, selectedProc]);
  const flowTree = useMemo(() => getFlowTree(selectedProc), [getFlowTree, selectedProc]);
  const splitCallTree = useMemo(() => buildCallTree(splitProc), [buildCallTree, splitProc]);
  const splitFlowTree = useMemo(() => getFlowTree(splitProc), [getFlowTree, splitProc]);

  const handleSelect = useCallback(async (proc: ProcedureItem) => {
    setSelectedProc(proc);
    setCallStack([]);
    // Add to open tabs if not already there
    setOpenTabs(prev => prev.some(t => t.id === proc.id) ? prev : [...prev, proc]);
    if (!parsedDataRef.current[proc.id] && proc.rawDefinition) {
      setLoading(true);
      try { await parseProc(proc); } catch { /* skip */ }
      finally { setLoading(false); }
    }
  }, [parseProc]);

  // Drill-down: open child SP in split view
  const handleDrillDown = useCallback(async (childProc: ProcedureItem) => {
    setSplitProc(childProc);
    if (!parsedDataRef.current[childProc.id] && childProc.rawDefinition) {
      try { await parseProc(childProc); } catch { /* skip */ }
    }
  }, [parseProc]);

  // Navigate split → replace main: promote split proc to main panel
  const promoteSplit = useCallback(() => {
    if (!splitProc) return;
    setSelectedProc(splitProc);
    setOpenTabs(prev => prev.some(t => t.id === splitProc.id) ? prev : [...prev, splitProc]);
    setSplitProc(null);
  }, [splitProc]);


  // Close tab
  const closeTab = useCallback((procId: string) => {
    setOpenTabs(prev => {
      const filtered = prev.filter(t => t.id !== procId);
      if (selectedProc?.id === procId) {
        const idx = prev.findIndex(t => t.id === procId);
        const next = filtered[Math.min(idx, filtered.length - 1)] ?? null;
        setSelectedProc(next);
        setCallStack([]);
      }
      return filtered;
    });
  }, [selectedProc]);

  // Switch tab
  const switchTab = useCallback((proc: ProcedureItem) => {
    setSelectedProc(proc);
    setCallStack([]);
  }, []);

  const flowViewTabs = useMemo(() => [
    { id: 'pipeline' as const, label: t('flow:tabs.pipeline', { defaultValue: 'Pipeline' }), icon: Workflow },
    { id: 'controlFlow' as const, label: t('flow:tabs.controlFlow', { defaultValue: 'Flujo de Control' }), icon: GitBranch },
    { id: 'diagram' as const, label: t('flow:tabs.diagram', { defaultValue: 'Diagrama BPMN' }), icon: Waypoints },
  ], [t]);

  // Resolve drill-down name to ProcedureItem
  const resolveDrillDown = useCallback((rawName: string) => {
    const cleaned = rawName
      .replace(/^\s*(EXEC(?:UTE)?|CALL|PERFORM)\s+/i, '')
      .replace(/\s+@.*$/, '').replace(/\s*[;(].*$/, '').trim();
    const shortName = cleaned.split('.').pop() || cleaned;
    const nameLower = shortName.toLowerCase();
    const fqnLower = cleaned.toLowerCase();
    const lookup = procByNameRef.current;
    const procs = proceduresRef.current;
    return lookup.get(shortName) || lookup.get(nameLower) ||
      lookup.get(cleaned) || lookup.get(fqnLower) ||
      procs.find(p =>
        p.objectName.toLowerCase() === nameLower ||
        p.fullQualifiedName.toLowerCase() === fqnLower ||
        p.objectName.toLowerCase().includes(nameLower) ||
        nameLower.includes(p.objectName.toLowerCase())
      ) || null;
  }, []);

  // Reusable panel renderer
  function renderFlowPanel(
    proc: ProcedureItem | null,
    tree: ReturnType<typeof buildCallTree>,
    ft: FlowTreeNode | null,
    isSplit: boolean,
  ): ReactNode {
    if (!proc) return <EmptyState icon={Workflow} title={t('flow:emptyState')} />;
    if (loading && !isSplit) return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>;
    if (!tree) return <div className="flex items-center justify-center h-full text-surface-400"><p className="text-xs">{t('flow:parseError')}</p></div>;

    return (
      <div className={cn('animate-fade-in', flowViewTab === 'diagram' ? 'h-full flex flex-col' : cn('overflow-y-auto h-full', isSplit ? 'p-3' : 'p-5'))}>
        {/* Header — compact in split */}
        {flowViewTab !== 'diagram' && (
          <div className={cn('pb-3 border-b border-surface-200/60', isSplit ? 'mb-3' : 'mb-5 pb-4')}>
            <div className="flex items-center gap-2 mb-1">
              <Workflow className={cn('text-brand-500 flex-shrink-0', isSplit ? 'w-3.5 h-3.5' : 'w-4.5 h-4.5')} />
              <h2 className={cn('font-mono font-bold truncate', isSplit ? 'text-xs' : 'text-base')}>{tree.schema}.{tree.name}</h2>
            </div>
            <p className="text-2xs text-surface-500">{tree.type} / {proc.lineCount} lines / {tree.calls.length} calls / {tree.tables.length} table refs</p>
            {tree.complexity && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className={cn('badge text-2xs',
                  tree.complexity.riskLevel === 'low' ? 'badge-success' :
                  tree.complexity.riskLevel === 'moderate' ? 'badge-medium' :
                  tree.complexity.riskLevel === 'high' ? 'badge-high' : 'badge-critical')}>
                  CC={tree.complexity.cyclomaticComplexity}
                </span>
              </div>
            )}
          </div>
        )}

        {/* View tabs */}
        <div className={flowViewTab === 'diagram' ? 'px-3 pt-2' : 'mb-3'}>
          <PageTabs value={flowViewTab} onChange={setFlowViewTab} tabs={flowViewTabs} />
        </div>

        {/* Pipeline */}
        {flowViewTab === 'pipeline' && (
          <div className="space-y-1">
            {tree.tables.map((tbl: any, i: number) => {
              const op = OP_ICON[tbl.operation] || OP_ICON.SELECT;
              const Icon = op.icon;
              return (
                <div key={`t-${i}`} className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-surface-100/40 border border-surface-200/30">
                  <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', op.color)} />
                  <span className={cn('text-2xs font-bold uppercase', op.color)}>{op.label}</span>
                  <span className="font-mono text-xs text-surface-700 truncate">{tbl.fullName || tbl.tableName}</span>
                </div>
              );
            })}
            {tree.calls.map((call: any, i: number) => (
              <CallNode key={`c-${i}`} call={call} depth={0} procByName={procByName} parsedData={parsedData} onDrillDown={handleDrillDown} connectionId={activeId} />
            ))}
          </div>
        )}

        {/* Control Flow */}
        {flowViewTab === 'controlFlow' && (
          <div className="animate-fade-in">
            {ft ? <FlowTreeView tree={ft} defaultExpandDepth={3} /> : (
              <p className="text-xs text-surface-400 text-center py-8">{t('flow:flowTree.noFlow', { defaultValue: 'No hay datos de flujo disponibles' })}</p>
            )}
          </div>
        )}

        {/* BPMN */}
        {flowViewTab === 'diagram' && (
          <div className="flex-1 min-h-0">
            {ft ? (
              <PipelineCanvas
                key={proc.id}
                flowTree={ft}
                onDrillDown={(rawName) => {
                  const match = resolveDrillDown(rawName);
                  if (match) handleDrillDown(match);
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-surface-400">
                <p className="text-xs">{t('flow:flowTree.noFlow', { defaultValue: 'No hay datos de flujo disponibles' })}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <ModulePageLayout
      toolbar={
        <ModuleToolbar
          icon={GitBranch}
          title={t('flow:title')}
          actions={
            <>
              {splitProc && (
                <button onClick={() => setSplitProc(null)} className="btn-ghost text-xs text-red-400 hover:text-red-500">
                  <X className="w-3.5 h-3.5" /> Cerrar split
                </button>
              )}
              {selectedProc && parsedData[selectedProc.id] && (
                <button
                  onClick={() => setShowVariableTrace(!showVariableTrace)}
                  className={cn('btn-ghost text-xs', showVariableTrace && 'bg-brand-500/10 text-brand-500')}
                >
                  <Variable className="w-3.5 h-3.5" />
                  {t('flow:variableTrace.title')}
                </button>
              )}
              <ConnectionSelector />
            </>
          }
        />
      }
      sidebar={
        <SidePanel>
          <SidePanelSearch value={search} onChange={setSearch} placeholder={t('flow:searchPlaceholder')} />
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
        </SidePanel>
      }
      rightPanel={
        showVariableTrace && selectedProc && parsedData[selectedProc.id] ? (
          <VariableTracePanel
            variableReferences={parsedData[selectedProc.id].variableReferences || []}
            onClose={() => setShowVariableTrace(false)}
          />
        ) : undefined
      }
    >
      {/* SP Tab bar */}
      {openTabs.length > 0 && (
        <div className="h-9 flex-none flex items-end bg-surface-100 border-b border-surface-200 overflow-x-auto">
          {openTabs.map(tab => {
            const isActive = selectedProc?.id === tab.id;
            const tabCfg = tab.objectType === 'function' ? { color: 'text-purple-400', icon: Code }
              : tab.objectType === 'trigger' ? { color: 'text-amber-400', icon: GitBranch }
              : { color: 'text-blue-400', icon: Workflow };
            const TabIcon = tabCfg.icon;
            return (
              <div
                key={tab.id}
                onClick={() => switchTab(tab)}
                className={cn(
                  'group flex items-center gap-1.5 px-3 py-1.5 text-[11px] cursor-pointer min-w-0 max-w-[200px] border-b-2 -mb-px whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-surface-0 text-surface-800 border-brand-500'
                    : 'text-surface-500 hover:text-surface-700 border-transparent hover:bg-surface-50',
                )}
              >
                <TabIcon className={cn('w-3.5 h-3.5 flex-shrink-0', isActive ? tabCfg.color : 'text-surface-400')} />
                <span className="truncate font-medium font-mono">{tab.objectName}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  className={cn(
                    'p-0.5 rounded hover:bg-surface-200 flex-shrink-0 transition-opacity',
                    isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60',
                  )}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Content area — split view support */}
      <div className="h-full flex overflow-hidden">
        {/* Main panel */}
        <div className="flex-1 min-w-0" style={splitProc ? { width: `${splitWidth}%`, flex: 'none' } : undefined}>
          {renderFlowPanel(selectedProc, callTree, flowTree, false)}
        </div>

        {/* Split divider + right panel */}
        {splitProc && (
          <>
            <SplitDivider onDrag={(delta) => setSplitWidth(w => Math.max(25, Math.min(75, w + delta)))} />
            <div className="flex-1 min-w-0 border-l border-surface-200" style={{ width: `${100 - splitWidth}%`, flex: 'none' }}>
              <div className="h-full flex flex-col">
                {/* Split panel header */}
                <div className="h-8 flex-none flex items-center gap-2 px-3 bg-surface-50 border-b border-surface-200">
                  <Columns2 className="w-3.5 h-3.5 text-brand-500" />
                  <span className="text-[11px] font-mono font-medium truncate">{splitProc.schemaName}.{splitProc.objectName}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={promoteSplit} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-brand-100 text-brand-500" title="Abrir como principal">
                      <ExternalLink className="w-3 h-3" />
                    </button>
                    <button onClick={() => setSplitProc(null)} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-red-100 text-red-400">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                {/* Split panel content */}
                <div className="flex-1 min-h-0">
                  {renderFlowPanel(splitProc, splitCallTree, splitFlowTree, true)}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </ModulePageLayout>
  );
}

/* ── Split Divider (drag to resize) ── */
function SplitDivider({ onDrag }: { onDrag: (deltaPct: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    let lastX = e.clientX;
    const parentWidth = ref.current?.parentElement?.clientWidth || 1;

    const onMove = (ev: MouseEvent) => {
      const delta = ((ev.clientX - lastX) / parentWidth) * 100;
      lastX = ev.clientX;
      onDrag(delta);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [onDrag]);

  return (
    <div
      ref={ref}
      onMouseDown={handleMouseDown}
      className="w-1 flex-none cursor-col-resize bg-surface-200 hover:bg-brand-400 active:bg-brand-500 transition-colors relative group"
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-surface-300 group-hover:bg-brand-400 transition-colors" />
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
