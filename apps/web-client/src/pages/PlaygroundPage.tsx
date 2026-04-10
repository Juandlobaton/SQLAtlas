import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Play, Shield, GitBranch, Table2, Workflow, AlertTriangle, ChevronDown, Copy, Check,
  Loader2, Code,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { parserApi, type ParseResponse } from '@/shared/lib/api-client';
import { useGlobalConnection } from '@/shared/hooks/useGlobalConnection';
import { useStudioContext } from '@/shared/hooks/useStudioContext';
import { useProcedures, type ProcedureItem } from '@/shared/hooks/useAnalysis';
import { FlowTreeView } from '@/features/visualization/components/FlowTreeView';
import type { FlowTreeNode } from '@/features/visualization/types/flow-tree';
import { Dropdown } from '@/shared/components/Dropdown';
import { ModuleToolbar } from '@/shared/components/layout/ModuleToolbar';
import { ModulePageLayout } from '@/shared/components/layout/ModulePageLayout';
import { SidePanel } from '@/shared/components/layout/SidePanel';
import { SidePanelSearch } from '@/shared/components/SidePanelSearch';
import { ConnectionSelector } from '@/shared/components/ConnectionSelector';

const SAMPLE_SQL = `CREATE PROCEDURE dbo.sp_ProcessOrder
  @OrderId INT,
  @UserId INT,
  @ApplyDiscount BIT = 0
AS
BEGIN
  SET NOCOUNT ON;

  BEGIN TRY
    BEGIN TRANSACTION;

    -- Validate order exists
    IF NOT EXISTS (SELECT 1 FROM dbo.Orders WHERE OrderId = @OrderId)
    BEGIN
      RAISERROR('Order not found', 16, 1);
      RETURN;
    END

    -- Update order status
    UPDATE dbo.Orders
    SET Status = 'processing',
        ProcessedBy = @UserId,
        ProcessedAt = GETDATE()
    WHERE OrderId = @OrderId;

    -- Apply discount if requested
    IF @ApplyDiscount = 1
    BEGIN
      EXEC dbo.sp_ApplyDiscount @OrderId;
    END

    -- Calculate totals
    EXEC dbo.sp_RecalculateTotals @OrderId;

    -- Log the action
    INSERT INTO dbo.AuditLog (Action, EntityId, UserId, CreatedAt)
    VALUES ('ORDER_PROCESSED', @OrderId, @UserId, GETDATE());

    -- Notify downstream systems
    EXEC dbo.sp_SendNotification @OrderId, 'order_processed';

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    EXEC dbo.sp_HandleError;
    THROW;
  END CATCH
END;`;

type Tab = 'dependencies' | 'security' | 'flow' | 'tables' | 'docs';

export function PlaygroundPage() {
  const { t } = useTranslation(['playground', 'common']);
  const { connectionId: urlConnectionId, procedureId: urlProcedureId } = useParams();
  const [sql, setSql] = useStudioContext('sql-explorer', 'sql', SAMPLE_SQL);
  const [dialect, setDialect] = useStudioContext('sql-explorer', 'dialect', 'tsql');
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useStudioContext<Tab>('sql-explorer', 'activeTab', 'dependencies');
  const [copied, setCopied] = useState(false);
  const [editorWidth, setEditorWidth] = useState(50); // percentage

  // Procedure picker state
  const { connectionId } = useGlobalConnection();
  const [procSearch, setProcSearch] = useState('');

  const { data: procData, isLoading: procsLoading } = useProcedures(
    connectionId,
    { limit: 50, search: procSearch || undefined },
  );
  const procedures = procData?.items ?? [];

  // AbortController for in-flight parse requests
  const abortRef = useRef<AbortController | null>(null);

  // Abort on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Auto-load procedure from URL params
  useEffect(() => {
    if (urlConnectionId && urlProcedureId && procedures.length > 0) {
      const proc = procedures.find(p => p.id === urlProcedureId);
      if (proc && proc.rawDefinition) {
        handleLoadProcedure(proc);
      }
    }
  }, [urlProcedureId, procedures.length]);

  const handleLoadProcedure = useCallback(async (proc: ProcedureItem) => {
    if (!proc.rawDefinition) return;
    const dialectMap: Record<string, string> = {
      'tsql': 'tsql', 'plpgsql': 'plpgsql', 'plsql': 'plsql',
      'postgres': 'plpgsql', 'oracle': 'plsql', 'sqlserver': 'tsql',
    };
    const newDialect = dialectMap[proc.language] || dialect;
    setSql(proc.rawDefinition);
    setDialect(newDialect);
    // Abort previous parse
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Parse directly instead of waiting for state update
    setLoading(true);
    try {
      const data = await parserApi.parse(proc.rawDefinition, newDialect, controller.signal);
      if (!controller.signal.aborted) setResult(data);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      console.error('Parse failed');
      setResult({ success: false, data: [], errors: ['Failed to parse'], metadata: {} });
    } finally {
      setLoading(false);
    }
  }, [dialect]);

  const handleParse = async () => {
    // Abort previous parse
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const data = await parserApi.parse(sql, dialect, controller.signal);
      if (!controller.signal.aborted) setResult(data);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Parse request failed:', e);
        setResult({ success: false, data: [], errors: [t('playground:parseError')], metadata: {} });
      }
    } finally {
      setLoading(false);
    }
  };

  const obj = result?.success ? result.data[0] : undefined;
  const deps = ((obj?.dependencies as Record<string, unknown>[]) || []) as Record<string, unknown>[];
  const tables = ((obj?.tableReferences as Record<string, unknown>[]) || []) as Record<string, unknown>[];
  const security = ((obj?.securityFindings as Record<string, unknown>[]) || []) as Record<string, unknown>[];
  const complexity = (obj?.complexity as Record<string, unknown>) ?? null;
  const flowTree = (obj?.flowTree as Record<string, unknown>) ?? null;
  const autoDoc = (obj?.autoDoc as Record<string, unknown>) ?? null;
  const params = ((obj?.parameters as Record<string, unknown>[]) || []) as Record<string, unknown>[];

  const tabs: { id: Tab; label: string; icon: typeof GitBranch; count?: number }[] = [
    { id: 'dependencies', label: t('playground:tabs.dependencies'), icon: GitBranch, count: deps.length },
    { id: 'tables', label: t('playground:tabs.tables'), icon: Table2, count: tables.length },
    { id: 'security', label: t('playground:tabs.security'), icon: Shield, count: security.length },
    { id: 'flow', label: t('playground:tabs.flow'), icon: Workflow },
    { id: 'docs', label: t('playground:tabs.autoDoc'), icon: Workflow },
  ];

  const copyResult = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ModulePageLayout
      toolbar={
        <ModuleToolbar
          icon={Code}
          title={t('playground:title')}
          subtitle={t('playground:subtitle')}
          actions={
            <>
              <ConnectionSelector />
              <Dropdown
                value={dialect}
                onChange={setDialect}
                options={[
                  { value: 'tsql', label: t('common:dialects.tsql') },
                  { value: 'postgres', label: t('common:dialects.plpgsql') },
                  { value: 'oracle', label: t('common:dialects.plsql') },
                ]}
                className="w-[200px]"
              />
              <button onClick={handleParse} disabled={loading || !sql.trim()} className="btn-primary text-xs h-7 px-3">
                <Play className="w-3.5 h-3.5" />
                {loading ? t('common:analyzing') : t('common:analyze')}
              </button>
            </>
          }
        />
      }
      sidebar={
        <SidePanel>
          <SidePanelSearch
            value={procSearch}
            onChange={setProcSearch}
            placeholder={t('playground:procPicker.searchPlaceholder')}
          />
          <div className="flex-1 overflow-y-auto">
            {procsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
              </div>
            ) : procedures.length === 0 ? (
              <div className="p-4 text-center text-surface-400 text-xs">
                {connectionId ? t('playground:procPicker.noResults') : t('playground:procPicker.selectConnection')}
              </div>
            ) : (
              procedures.map((proc) => (
                <button
                  key={proc.id}
                  onClick={() => handleLoadProcedure(proc)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 text-xs border-b border-surface-200/30 hover:bg-surface-100/60 transition-all cursor-pointer',
                    sql === proc.rawDefinition && 'bg-brand-500/8 border-l-2 border-l-brand-500',
                  )}
                >
                  <div className="min-w-0 text-left">
                    <p className="font-mono font-medium truncate text-[12px]">{proc.objectName}</p>
                    <p className="text-2xs text-surface-500">{proc.schemaName} / {proc.objectType} / {proc.lineCount}L</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                    {proc.estimatedComplexity != null && (
                      <span title={t('common:tooltips.cc')} className={cn('text-2xs px-1.5 py-0.5 rounded-md font-bold cursor-help',
                        proc.estimatedComplexity <= 5 ? 'badge-success' :
                        proc.estimatedComplexity <= 10 ? 'badge-medium' :
                        proc.estimatedComplexity <= 20 ? 'badge-high' : 'badge-critical')}>
                        CC={proc.estimatedComplexity}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t border-surface-200/60 text-2xs text-surface-400 text-center">
            {procedures.length} {t('playground:procPicker.results', { defaultValue: 'procedures' })}
          </div>
        </SidePanel>
      }
    >
      <div className="h-full flex min-h-0 overflow-hidden">
        {/* Editor */}
        <div
          className="flex flex-col min-h-0 min-w-0 overflow-hidden"
          style={result ? { flex: `0 0 ${editorWidth}%` } : { flex: '1 1 auto' }}
        >
          <div className="px-4 py-2 border-b border-surface-200 flex items-center justify-between flex-none">
            <span className="text-xs font-medium text-surface-500">{t('playground:sqlInput')}</span>
            <span className="text-xs text-surface-400">
              {t('playground:charCount', { current: sql.length.toLocaleString(), lines: sql.split('\n').length })}
            </span>
          </div>
          <SqlEditor value={sql} onChange={setSql} placeholder={t('playground:placeholder')} />
        </div>

        {/* Resizable divider + Results panel */}
        {result && (
          <ResizeDivider onDrag={(delta) => setEditorWidth(w => Math.max(25, Math.min(75, w + delta)))} />
        )}
        <div className={cn(
          'flex flex-col min-h-0 overflow-hidden',
          result ? 'flex-1 min-w-[250px]' : 'w-0 min-w-0',
        )}>
          {!result ? (
            <div className="flex-1 flex items-center justify-center text-surface-400">
              <div className="text-center">
                <Workflow className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{t('playground:emptyState')}</p>
              </div>
            </div>
          ) : !result.success ? (
            <div className="p-4">
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-400">
                  {(result.errors as string[])?.join(', ')}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div className="px-4 py-3 border-b border-surface-200 flex items-center gap-4 flex-wrap">
                <span className="text-xs font-medium text-surface-500">
                  {(obj?.objectName as string) || t('playground:anonymous')}
                </span>
                {complexity && (
                  <span title={t('common:tooltips.cc')} className={cn(
                    'badge cursor-help',
                    complexity.riskLevel === 'low' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                    complexity.riskLevel === 'moderate' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                    complexity.riskLevel === 'high' && 'badge-high',
                    complexity.riskLevel === 'critical' && 'badge-critical',
                  )}>
                    {t('playground:complexity', { cc: complexity.cyclomaticComplexity as number, level: t(`common:complexity.${complexity.riskLevel}`) })}
                  </span>
                )}
                {params.length > 0 && (
                  <span className="badge-info">{t('common:badges.params', { count: params.length })}</span>
                )}
                {security.length > 0 && (
                  <span className="badge-critical">
                    <AlertTriangle className="w-3 h-3" />
                    {t('common:badges.issues', { count: security.length })}
                  </span>
                )}
                <button onClick={copyResult} className="btn-ghost text-xs ml-auto p-1">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-surface-200 px-2">
                {tabs.map(({ id, label, icon: Icon, count }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors',
                      activeTab === id
                        ? 'border-brand-500 text-brand-600'
                        : 'border-transparent text-surface-500 hover:text-surface-700',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                    {count !== undefined && count > 0 && (
                      <span className="bg-surface-200 text-surface-600 px-1.5 py-0.5 rounded-full text-[10px]">
                        {count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab description */}
              {result?.success && (
                <p className="text-[11px] text-surface-400 mt-1.5 mb-3 px-4">{t(`playground:descriptions.${activeTab}`)}</p>
              )}

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'dependencies' && (
                  <div className="space-y-2">
                    {deps.length === 0 ? (
                      <p className="text-sm text-surface-400">{t('playground:empty.dependencies')}</p>
                    ) : (
                      deps.map((d, i) => (
                        <div key={`dep-${(d.targetName as string) || i}`} className="flex items-center gap-3 p-3 rounded-lg bg-surface-100">
                          <GitBranch className="w-4 h-4 text-brand-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-mono font-medium truncate">{d.targetName as string}</p>
                            <p className="text-xs text-surface-500">
                              {d.dependencyType as string}
                              {d.lineNumber ? ` ${t('playground:atLine', { line: d.lineNumber })}` : null}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {d.isDynamic ? <span className="badge-high cursor-help" title={t('common:tooltips.dynamic')}>{t('common:badges.dynamic')}</span> : null}
                            <span className="text-xs text-surface-400 cursor-help" title={t('common:tooltips.confidence')}>
                              {Math.round((d.confidence as number) * 100)}%
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'tables' && (
                  <div className="space-y-2">
                    {tables.length === 0 ? (
                      <p className="text-sm text-surface-400">{t('playground:empty.tables')}</p>
                    ) : (
                      tables.map((tbl, i) => (
                        <div key={`tbl-${i}-${(tbl.fullName as string)}`} className="flex items-center gap-3 p-3 rounded-lg bg-surface-100">
                          <Table2 className="w-4 h-4 text-cyan-500 flex-shrink-0" />
                          <span className="text-sm font-mono flex-1">{tbl.fullName as string}</span>
                          <span className={cn(
                            'badge',
                            (tbl.operation as string) === 'SELECT' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                            (tbl.operation as string) === 'INSERT' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                            (tbl.operation as string) === 'UPDATE' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                            (tbl.operation as string) === 'DELETE' && 'badge-critical',
                          )}>
                            {tbl.operation as string}
                          </span>
                          {tbl.isTempTable ? <span className="badge-info">{t('common:badges.temp')}</span> : null}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'security' && (
                  <div className="space-y-2">
                    {security.length === 0 ? (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                        <Shield className="w-4 h-4 text-emerald-500" />
                        <span className="text-sm text-emerald-700 dark:text-emerald-400">{t('playground:empty.security')}</span>
                      </div>
                    ) : (
                      security.map((s, i) => (
                        <div key={`sec-${(s.message as string) || i}`} className="p-3 rounded-lg bg-surface-100 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'badge',
                              (s.severity as string) === 'critical' && 'badge-critical',
                              (s.severity as string) === 'high' && 'badge-high',
                              (s.severity as string) === 'medium' && 'badge-medium',
                              (s.severity as string) === 'low' && 'badge-low',
                            )}>
                              {s.severity as string}
                            </span>
                            <span className="text-sm font-medium">{s.message as string}</span>
                          </div>
                          {s.recommendation ? (
                            <p className="text-xs text-surface-500 pl-1">
                              {t('playground:secFix', { recommendation: s.recommendation as string })}
                            </p>
                          ) : null}
                          {s.line ? (
                            <p className="text-xs text-surface-400 pl-1">{t('playground:secLine', { number: s.line as number })}</p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'flow' && flowTree && (
                  <FlowTreeView
                    tree={flowTree as unknown as FlowTreeNode}
                    defaultExpandDepth={3}
                  />
                )}

                {activeTab === 'docs' && autoDoc && (
                  <div className="space-y-4">
                    {/* Header metadata from SQL comments */}
                    {(autoDoc.header as Record<string, unknown>) && (
                      <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-3 space-y-1.5">
                        {(autoDoc.header as any).author && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold text-surface-500 w-20">Autor:</span>
                            <span className="text-surface-700">{(autoDoc.header as any).author}</span>
                          </div>
                        )}
                        {(autoDoc.header as any).createDate && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold text-surface-500 w-20">Creado:</span>
                            <span className="text-surface-700">{(autoDoc.header as any).createDate}</span>
                          </div>
                        )}
                        {(autoDoc.header as any).updateAuthor && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold text-surface-500 w-20">Modificado:</span>
                            <span className="text-surface-700">
                              {(autoDoc.header as any).updateAuthor}
                              {(autoDoc.header as any).updateDate ? ` (${(autoDoc.header as any).updateDate})` : ''}
                            </span>
                          </div>
                        )}
                        {(autoDoc.header as any).ticket && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold text-surface-500 w-20">Ticket:</span>
                            <span className="badge-info text-2xs">{(autoDoc.header as any).ticket}</span>
                          </div>
                        )}
                        {(autoDoc.header as any).description && (
                          <div className="flex items-start gap-2 text-xs pt-1 border-t border-surface-200/50 mt-1">
                            <span className="font-semibold text-surface-500 w-20 flex-shrink-0">Descripcion:</span>
                            <span className="text-surface-700">{
                              Array.isArray((autoDoc.header as any).description)
                                ? ((autoDoc.header as any).description as string[]).join(' | ')
                                : (autoDoc.header as any).description
                            }</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Comment language badge */}
                    {(autoDoc.commentLanguage as string) && (
                      <div className="flex items-center gap-2">
                        <span className="text-2xs text-surface-400">{t('playground:commentLang.label', { defaultValue: 'Comments' })}:</span>
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 font-medium">
                          {t(`playground:commentLang.${autoDoc.commentLanguage}`, { defaultValue: autoDoc.commentLanguage as string })}
                        </span>
                      </div>
                    )}

                    {/* Summary */}
                    <div>
                      <h4 className="text-xs font-semibold text-surface-500 uppercase mb-1">{t('playground:autoDocLabels.summary')}</h4>
                      <p className="text-sm">{autoDoc.summary as string}</p>
                    </div>

                    {/* Process overview */}
                    {(autoDoc.processOverview as Record<string, unknown>) && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-surface-500 uppercase">Vision General del Proceso</h4>
                        <div className="grid grid-cols-2 gap-2">
                          {((autoDoc.processOverview as any).dataFlow?.reads as string[])?.length > 0 && (
                            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-2">
                              <p className="text-2xs font-semibold text-emerald-500 uppercase mb-1">Tablas Leidas</p>
                              <div className="space-y-0.5">
                                {((autoDoc.processOverview as any).dataFlow.reads as string[]).map((t: string) => (
                                  <p key={t} className="text-2xs font-mono text-surface-600">{t}</p>
                                ))}
                              </div>
                            </div>
                          )}
                          {((autoDoc.processOverview as any).dataFlow?.writes as string[])?.length > 0 && (
                            <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-2">
                              <p className="text-2xs font-semibold text-amber-500 uppercase mb-1">Tablas Escritas</p>
                              <div className="space-y-0.5">
                                {((autoDoc.processOverview as any).dataFlow.writes as string[]).map((t: string) => (
                                  <p key={t} className="text-2xs font-mono text-surface-600">{t}</p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        {((autoDoc.processOverview as any).structure) && (
                          <div className="flex gap-2 flex-wrap">
                            {(autoDoc.processOverview as any).structure.conditions > 0 && (
                              <span className="badge text-2xs bg-amber-500/15 text-amber-500">
                                {(autoDoc.processOverview as any).structure.conditions} condiciones
                              </span>
                            )}
                            {(autoDoc.processOverview as any).structure.loops > 0 && (
                              <span className="badge text-2xs bg-purple-500/15 text-purple-500">
                                {(autoDoc.processOverview as any).structure.loops} bucles
                              </span>
                            )}
                            {(autoDoc.processOverview as any).structure.tryCatches > 0 && (
                              <span className="badge text-2xs bg-blue-500/15 text-blue-500">
                                {(autoDoc.processOverview as any).structure.tryCatches} try/catch
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Description */}
                    <div>
                      <h4 className="text-xs font-semibold text-surface-500 uppercase mb-1">{t('playground:autoDocLabels.description')}</h4>
                      <p className="text-sm text-surface-600">{autoDoc.description as string}</p>
                    </div>

                    {/* Business process documentation */}
                    {(autoDoc.steps as any[])?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-surface-500 uppercase mb-2">{t('playground:stepLabels.processTitle', { defaultValue: 'Execution Process' })}</h4>
                        <p className="text-2xs text-surface-400 mb-3">
                          {t('playground:stepLabels.processHint', { defaultValue: 'Step-by-step process documentation.' })}
                        </p>
                        <div className="space-y-0.5">
                          {(autoDoc.steps as any[]).map((step: any, i: number) => (
                            <StepDocItem key={`step-${step.step || i}`} step={step} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Parameters */}
                    {params.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-surface-500 uppercase mb-2">{t('playground:autoDocLabels.parameters')}</h4>
                        <div className="rounded-lg border border-surface-200 overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-surface-100">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500">{t('playground:autoDocLabels.name')}</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500">{t('playground:autoDocLabels.type')}</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500">{t('playground:autoDocLabels.mode')}</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500">{t('playground:autoDocLabels.default')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-200">
                              {params.map((p, i) => (
                                <tr key={`param-${i}`}>
                                  <td className="px-3 py-2 font-mono text-xs">{p.name as string}</td>
                                  <td className="px-3 py-2 font-mono text-xs text-surface-600">{p.dataType as string}</td>
                                  <td className="px-3 py-2"><span className="badge-info">{p.mode as string}</span></td>
                                  <td className="px-3 py-2 text-xs text-surface-500">{(p.defaultValue as string) || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Side effects */}
                    {(autoDoc.sideEffects as string[])?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-surface-500 uppercase mb-1">{t('playground:autoDocLabels.sideEffects')}</h4>
                        <ul className="space-y-1">
                          {(autoDoc.sideEffects as string[]).map((e, i) => (
                            <li key={`effect-${e || i}`} className="text-sm text-surface-600 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              {e}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Change history */}
                    {(autoDoc.header as any)?.changeHistory?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-surface-500 uppercase mb-2">Historial de Cambios</h4>
                        <div className="space-y-1.5">
                          {((autoDoc.header as any).changeHistory as any[]).map((ch: any, i: number) => (
                            <div key={`ch-${i}`} className="flex items-start gap-2 text-xs p-2 rounded bg-surface-100/60">
                              <span className="text-surface-400 flex-shrink-0">{ch.date}</span>
                              <span className="text-surface-500 flex-shrink-0">{ch.author}</span>
                              <span className="text-surface-700">{ch.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </ModulePageLayout>
  );
}

/* ── Business Process Step (recursive) ── */
const TYPE_STYLES: Record<string, { color: string; bg: string }> = {
  setup:       { color: 'text-slate-500',   bg: 'bg-slate-500/5' },
  query:       { color: 'text-emerald-500', bg: 'bg-emerald-500/5' },
  modify:      { color: 'text-amber-500',   bg: 'bg-amber-500/5' },
  call:        { color: 'text-blue-500',    bg: 'bg-blue-500/5' },
  decision:    { color: 'text-amber-600',   bg: 'bg-amber-500/5' },
  loop:        { color: 'text-purple-500',  bg: 'bg-purple-500/5' },
  protection:  { color: 'text-blue-500',    bg: 'bg-blue-500/5' },
  error:       { color: 'text-red-500',     bg: 'bg-red-500/5' },
  result:      { color: 'text-emerald-500', bg: 'bg-emerald-500/5' },
  transaction: { color: 'text-indigo-500',  bg: 'bg-indigo-500/5' },
  operation:   { color: 'text-surface-500', bg: 'bg-surface-100/40' },
};

function StepDocItem({ step, depth = 0 }: { step: any; depth?: number }) {
  const { t } = useTranslation(['playground']);
  const [expanded, setExpanded] = useState(false);
  const type = (step.type as string) || 'operation';
  const style = TYPE_STYLES[type] || TYPE_STYLES.operation;
  const typeLabel = t(`playground:stepTypes.${type}`, { defaultValue: type });

  // SQL diff view helpers
  const sqlLines: string[] = step.sql ? step.sql.split('\n') : [];
  const startLine = step.line || 1;
  const COLLAPSED_MAX = 4;
  const needsCollapse = sqlLines.length > COLLAPSED_MAX;
  const visibleLines = (!needsCollapse || expanded) ? sqlLines : sqlLines.slice(0, COLLAPSED_MAX);

  // Line range label
  const lineLabel = step.line
    ? step.lineEnd && step.lineEnd !== step.line
      ? t('playground:stepLabels.lines', { start: step.line, end: step.lineEnd, defaultValue: `L${step.line}–L${step.lineEnd}` })
      : t('playground:stepLabels.linesSingle', { line: step.line, defaultValue: `L${step.line}` })
    : null;

  return (
    <div className={cn(depth > 0 && 'ml-4 border-l-2 border-surface-200/40 pl-3 mt-1')}>
      <div className={cn('rounded-lg p-2.5 mb-1', style.bg)}>
        {/* Step header */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn('text-2xs font-bold uppercase px-1.5 py-0.5 rounded', style.color, style.bg)}>{typeLabel}</span>
              {step.step && (
                <span className="text-2xs text-surface-400">#{step.step}</span>
              )}
              {lineLabel && (
                <span className="text-2xs text-surface-400 font-mono">{lineLabel}</span>
              )}
            </div>
            <p className="text-xs font-medium text-surface-800 dark:text-surface-200 mt-0.5">
              {step.title}
            </p>
            {step.detail && (
              <p className="text-2xs text-surface-500 mt-0.5">{step.detail}</p>
            )}
            {step.businessContext && step.businessContext !== step.title && (
              <p className="text-2xs text-brand-500 italic mt-0.5">
                {step.businessContext}
              </p>
            )}
          </div>
        </div>

        {/* Data impact pills */}
        {(step.dataImpact || step.calls || step.outputs) && (
          <div className="flex flex-wrap gap-1 mt-1.5 ml-6">
            {step.dataImpact?.tables?.map((tbl: string) => (
              <span key={tbl} className="text-2xs px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-600 font-mono">
                {step.dataImpact.operation} {tbl}
              </span>
            ))}
            {step.calls && (
              <span className="text-2xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 font-mono">
                → {step.calls}
              </span>
            )}
            {step.outputs?.map((v: string) => (
              <span key={v} className="text-2xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-600 font-mono">
                {v} =
              </span>
            ))}
          </div>
        )}

        {/* SQL diff view — inline with line-number gutter */}
        {sqlLines.length > 0 && (
          <div className="mt-2 rounded overflow-hidden border border-surface-200/30 dark:border-surface-700/40">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-surface-100/80 dark:bg-surface-800/60 border-b border-surface-200/30 dark:border-surface-700/40">
              <Code size={10} className="text-surface-400" />
              <span className="text-[10px] text-surface-400 font-mono">
                {lineLabel || 'SQL'}
              </span>
            </div>
            <div className="bg-surface-900 dark:bg-surface-950 overflow-x-auto">
              <table className="w-full border-collapse">
                <tbody>
                  {visibleLines.map((line: string, i: number) => (
                    <tr key={i} className="hover:bg-surface-800/40">
                      <td className="text-[10px] font-mono text-surface-500 text-right px-2 py-px select-none w-8 border-r border-surface-700/40 bg-surface-900/60 dark:bg-surface-950/60">
                        {startLine + i}
                      </td>
                      <td className="text-[10px] font-mono text-surface-200 px-2.5 py-px whitespace-pre">
                        {line}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {needsCollapse && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-center gap-1 py-0.5 bg-surface-100/80 dark:bg-surface-800/60 border-t border-surface-200/30 dark:border-surface-700/40 text-[10px] text-surface-400 hover:text-surface-600 transition-colors"
              >
                {expanded
                  ? <>{t('playground:stepLabels.showLess', { defaultValue: 'Show less' })} <ChevronDown size={10} className="rotate-180" /></>
                  : <>{t('playground:stepLabels.showMore', { defaultValue: 'Show more' })} ({sqlLines.length - COLLAPSED_MAX}) <ChevronDown size={10} /></>
                }
              </button>
            )}
          </div>
        )}
      </div>

      {/* Condition: SI / SINO */}
      {step.condition && (
        <div className="ml-6 text-2xs text-surface-500 mb-1">
          {t('playground:stepLabels.condition', { defaultValue: 'Condition' })}: <code className="text-amber-500">{step.condition}</code>
        </div>
      )}

      {step.whenTrue?.length > 0 && (
        <div className="ml-2 mt-0.5">
          <div className="flex items-center gap-1.5 mb-0.5 ml-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-2xs font-semibold text-emerald-600">{t('playground:stepLabels.whenTrue', { defaultValue: 'When TRUE' })}:</span>
          </div>
          {step.whenTrue.map((s: any, i: number) => (
            <StepDocItem key={`t-${s.step || i}`} step={s} depth={depth + 1} />
          ))}
        </div>
      )}
      {step.whenFalse?.length > 0 && (
        <div className="ml-2 mt-0.5">
          <div className="flex items-center gap-1.5 mb-0.5 ml-4">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-2xs font-semibold text-red-600">{t('playground:stepLabels.whenFalse', { defaultValue: 'When FALSE' })}:</span>
          </div>
          {step.whenFalse.map((s: any, i: number) => (
            <StepDocItem key={`f-${s.step || i}`} step={s} depth={depth + 1} />
          ))}
        </div>
      )}

      {/* Loop body */}
      {step.repeats?.length > 0 && (
        <div className="ml-2 mt-0.5">
          <div className="flex items-center gap-1.5 mb-0.5 ml-4">
            <span className="text-2xs font-semibold text-purple-600">{t('playground:stepLabels.eachIteration', { defaultValue: 'Each iteration' })}:</span>
          </div>
          {step.repeats.map((s: any, i: number) => (
            <StepDocItem key={`r-${s.step || i}`} step={s} depth={depth + 1} />
          ))}
        </div>
      )}

      {/* TRY/CATCH */}
      {step.protectedSteps?.length > 0 && (
        <div className="ml-2 mt-0.5">
          <div className="flex items-center gap-1.5 mb-0.5 ml-4">
            <span className="text-2xs font-semibold text-blue-600">{t('playground:stepLabels.protectedOps', { defaultValue: 'Protected operations' })}:</span>
          </div>
          {step.protectedSteps.map((s: any, i: number) => (
            <StepDocItem key={`p-${s.step || i}`} step={s} depth={depth + 1} />
          ))}
        </div>
      )}
      {step.errorHandling?.length > 0 && (
        <div className="ml-2 mt-0.5">
          <div className="flex items-center gap-1.5 mb-0.5 ml-4">
            <span className="text-2xs font-semibold text-red-600">{t('playground:stepLabels.onError', { defaultValue: 'On error' })}:</span>
          </div>
          {step.errorHandling.map((s: any, i: number) => (
            <StepDocItem key={`e-${s.step || i}`} step={s} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── SQL Editor with line numbers ── */
function SqlEditor({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const lines = value.split('\n');

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* Line numbers */}
      <div
        ref={lineNumbersRef}
        className="flex-none w-12 overflow-hidden bg-surface-50 dark:bg-surface-900 border-r border-surface-200 select-none"
      >
        <div className="py-4 pr-2">
          {lines.map((_, i) => (
            <div key={i} className="text-right text-[11px] leading-relaxed font-mono text-surface-400 pr-1">
              {i + 1}
            </div>
          ))}
        </div>
      </div>
      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        className="flex-1 w-full py-4 pl-3 pr-4 bg-transparent font-mono text-sm resize-none focus:outline-none text-surface-800 dark:text-surface-200 leading-relaxed"
        placeholder={placeholder}
        spellCheck={false}
        maxLength={500000}
      />
    </div>
  );
}

/* ── Resize Divider ── */
function ResizeDivider({ onDrag }: { onDrag: (deltaPct: number) => void }) {
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
