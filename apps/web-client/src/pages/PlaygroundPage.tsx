import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Play, Shield, GitBranch, Table2, Workflow, AlertTriangle, ChevronDown, Copy, Check,
  Database, Search, Loader2,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { parserApi, type ParseResponse } from '@/shared/lib/api-client';
import { useConnections } from '@/shared/hooks/useConnections';
import { useProcedures, type ProcedureItem } from '@/shared/hooks/useAnalysis';

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
  const [sql, setSql] = useState(SAMPLE_SQL);
  const [dialect, setDialect] = useState('tsql');
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('dependencies');
  const [copied, setCopied] = useState(false);

  // Procedure picker state
  const { data: connections = [] } = useConnections();
  const [connectionId, setConnectionId] = useState<string | null>(urlConnectionId || null);
  const [procSearch, setProcSearch] = useState('');
  const [showProcPicker, setShowProcPicker] = useState(!urlConnectionId);

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
    setShowProcPicker(false);

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
    <div className="space-y-4 animate-fade-in h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('playground:title')}</h1>
          <p className="text-surface-500 text-sm mt-1">{t('playground:subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={dialect}
              onChange={(e) => setDialect(e.target.value)}
              className="input pr-8 w-40 appearance-none"
            >
              <option value="tsql">{t('common:dialects.tsql')}</option>
              <option value="postgres">{t('common:dialects.plpgsql')}</option>
              <option value="oracle">{t('common:dialects.plsql')}</option>
            </select>
            <ChevronDown className="w-4 h-4 text-surface-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <button onClick={handleParse} disabled={loading || !sql.trim()} className="btn-primary">
            <Play className="w-4 h-4" />
            {loading ? t('common:analyzing') : t('common:analyze')}
          </button>
        </div>
      </div>

      {/* Procedure picker */}
      <div className="mb-4 rounded-xl border border-surface-200 bg-surface-50 dark:bg-surface-100/30">
        <button
          onClick={() => setShowProcPicker(!showProcPicker)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-surface-600 hover:bg-surface-100 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            {t('playground:procPicker.title')}
          </span>
          <ChevronDown className={cn('w-4 h-4 transition-transform', showProcPicker && 'rotate-180')} />
        </button>

        {showProcPicker && (
          <div className="px-4 pb-3 border-t border-surface-200">
            <div className="flex items-center gap-3 mt-3">
              {/* Connection selector */}
              <select
                value={connectionId || ''}
                onChange={(e) => setConnectionId(e.target.value || null)}
                className="input w-48 text-xs"
              >
                <option value="">{t('playground:procPicker.selectConnection')}</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {/* Procedure search */}
              {connectionId && (
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
                  <input
                    className="input pl-8 text-xs"
                    placeholder={t('playground:procPicker.searchPlaceholder')}
                    value={procSearch}
                    onChange={(e) => setProcSearch(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Procedure list */}
            {connectionId && (
              <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-surface-200">
                {procsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                  </div>
                ) : procedures.length === 0 ? (
                  <div className="text-center py-6 text-xs text-surface-400">
                    {t('playground:procPicker.noResults')}
                  </div>
                ) : (
                  <div className="divide-y divide-surface-200">
                    {procedures.map((proc) => (
                      <button
                        key={proc.id}
                        onClick={() => handleLoadProcedure(proc)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-xs hover:bg-surface-100 transition-colors text-left"
                      >
                        <Workflow className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span className="font-mono font-medium truncate block">{proc.objectName}</span>
                          <span className="text-[10px] text-surface-400">{proc.schemaName} · {proc.objectType} · {proc.lineCount} {t('playground:procPicker.lines')}</span>
                        </div>
                        {proc.estimatedComplexity != null && proc.estimatedComplexity > 10 && (
                          <span title={t('common:tooltips.cc')} className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 cursor-help">
                            CC={proc.estimatedComplexity}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        {/* Editor */}
        <div className="card flex flex-col min-h-[400px]">
          <div className="px-4 py-2 border-b border-surface-200 flex items-center justify-between">
            <span className="text-xs font-medium text-surface-500">{t('playground:sqlInput')}</span>
            <span className="text-xs text-surface-400">
              {t('playground:charCount', { current: sql.length.toLocaleString(), lines: sql.split('\n').length })}
            </span>
          </div>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            className="flex-1 w-full p-4 bg-transparent font-mono text-sm resize-none focus:outline-none text-surface-800 leading-relaxed"
            placeholder={t('playground:placeholder')}
            spellCheck={false}
            maxLength={500000}
          />
        </div>

        {/* Results */}
        <div className="card flex flex-col min-h-[400px]">
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
                        <div key={`tbl-${(tbl.fullName as string) || i}`} className="flex items-center gap-3 p-3 rounded-lg bg-surface-100">
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
                  <div className="space-y-1">
                    {((flowTree.children as Record<string, unknown>[]) || []).map((node, i) => (
                      <div
                        key={`flow-${(node.lineNumber as number) || i}-${(node.nodeType as string) || ''}`}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-mono',
                          (node.nodeType as string) === 'condition' && 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
                          (node.nodeType as string) === 'loop' && 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400',
                          (node.nodeType as string) === 'call' && 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
                          (node.nodeType as string) === 'statement' && 'bg-surface-100',
                          (node.nodeType as string) === 'return' && 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400',
                          (node.nodeType as string) === 'error_handler' && 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
                          (node.nodeType as string) === 'end' && 'bg-surface-200 text-surface-500',
                        )}
                      >
                        <span className="text-xs text-surface-400 w-8">L{node.lineNumber as number}</span>
                        <span className={cn(
                          'badge text-[10px]',
                          (node.nodeType as string) === 'condition' && 'bg-amber-200 text-amber-800',
                          (node.nodeType as string) === 'call' && 'bg-blue-200 text-blue-800',
                          (node.nodeType as string) === 'statement' && 'bg-gray-200 text-gray-800',
                          (node.nodeType as string) === 'error_handler' && 'bg-red-200 text-red-800',
                          (node.nodeType as string) === 'return' && 'bg-emerald-200 text-emerald-800',
                          (node.nodeType as string) === 'end' && 'bg-gray-200 text-gray-600',
                        )}>
                          {t(`playground:flowNodeTypes.${node.nodeType}`, { defaultValue: node.nodeType as string })}
                        </span>
                        <span className="truncate text-xs">{node.label as string}</span>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'docs' && autoDoc && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs font-semibold text-surface-500 uppercase mb-1">{t('playground:autoDocLabels.summary')}</h4>
                      <p className="text-sm">{autoDoc.summary as string}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-surface-500 uppercase mb-1">{t('playground:autoDocLabels.description')}</h4>
                      <p className="text-sm text-surface-600">{autoDoc.description as string}</p>
                    </div>
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
                                <tr key={`param-${(p.name as string) || i}`}>
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
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
