import { useState, useCallback, useEffect } from 'react';
import { Waypoints, Code, FileText, Shield, Loader2, GitBranch } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useProcedure } from '@/shared/hooks/useAnalysis';
import { parserApi } from '@/shared/lib/api-client';
import { PipelineCanvas } from './PipelineCanvas';
import { FlowTreeView } from '@/features/visualization/components/FlowTreeView';
import { parseFlowTree } from '@/features/visualization/types/parse-flow-tree';
import { useStudioStore } from '@/shared/stores/studio.store';

type SubTab = 'flow' | 'tree' | 'source' | 'docs' | 'security';

interface ProcedureTabProps {
  procedureId: string;
  connectionId: string;
  defaultView?: SubTab;
}

export function ProcedureTab({ procedureId, connectionId, defaultView }: ProcedureTabProps) {
  const { data: procedure } = useProcedure(connectionId, procedureId);
  const { openTab } = useStudioStore();

  const [subTab, setSubTab] = useState<SubTab>(defaultView || 'flow');
  const [parsed, setParsed] = useState<Record<string, unknown> | null>(null);
  const [parsing, setParsing] = useState(false);

  // On-demand parse only when flowTree/autoDoc are not pre-stored
  useEffect(() => {
    if (!procedure?.rawDefinition) return;
    if (procedure.flowTree && procedure.autoDoc) return; // already stored
    setParsing(true);
    const dialect = procedure.language === 'plpgsql' ? 'plpgsql' : procedure.language === 'plsql' ? 'plsql' : 'tsql';
    parserApi.parse(procedure.rawDefinition, dialect)
      .then((res) => setParsed(res.data?.[0] as Record<string, unknown> ?? null))
      .catch(() => setParsed(null))
      .finally(() => setParsing(false));
  }, [procedure?.rawDefinition, procedure?.language, procedure?.flowTree, procedure?.autoDoc]);

  const flowTree = parseFlowTree(procedure?.flowTree ?? parsed?.flowTree);
  const autoDoc = (procedure?.autoDoc ?? parsed?.autoDoc) as Record<string, unknown> | null;
  const securityFindings = (procedure?.securityFindings ?? parsed?.securityFindings ?? []) as { severity: string; message: string; line?: number; recommendation?: string }[];

  // Drill-down handler
  const handleDrillDown = useCallback((procName: string) => {
    // This is a simplified version — in practice we'd search the procedure list
    openTab({
      id: `proc-search-${procName}`,
      type: 'procedure',
      label: procName.split('.').pop() || procName,
      connectionId,
      procedureId: '',
      schemaName: '',
      objectType: 'PROCEDURE',
    });
  }, [openTab, connectionId]);

  if (!procedure) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
      </div>
    );
  }

  const SUB_TABS: { key: SubTab; label: string; icon: typeof Waypoints }[] = [
    { key: 'flow', label: 'Flow', icon: Waypoints },
    { key: 'tree', label: 'Tree', icon: GitBranch },
    { key: 'source', label: 'Source', icon: Code },
    { key: 'docs', label: 'Docs', icon: FileText },
    { key: 'security', label: `Security${securityFindings.length ? ` (${securityFindings.length})` : ''}`, icon: Shield },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab bar */}
      <div className="h-8 flex-shrink-0 flex items-center gap-0.5 px-2 bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800">
        {SUB_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
              subTab === key
                ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                : 'text-surface-500 hover:text-surface-700 hover:bg-surface-100 dark:hover:bg-surface-800',
            )}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}

        {/* Procedure info */}
        <div className="ml-auto flex items-center gap-2 text-[10px] text-surface-400">
          <span className="font-mono">{procedure.schemaName}.{procedure.objectName}</span>
          <span>{procedure.lineCount} lines</span>
          {procedure.estimatedComplexity != null && (
            <span className="px-1 py-0.5 rounded bg-surface-100 dark:bg-surface-800">CC: {procedure.estimatedComplexity}</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {parsing && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          </div>
        )}

        {!parsing && subTab === 'flow' && flowTree && (
          <PipelineCanvas flowTree={flowTree} onDrillDown={handleDrillDown} />
        )}

        {!parsing && subTab === 'flow' && !flowTree && (
          <div className="flex items-center justify-center h-full text-surface-400 text-sm">
            No flow data available
          </div>
        )}

        {!parsing && subTab === 'tree' && flowTree && (
          <div className="h-full overflow-y-auto p-4">
            <FlowTreeView tree={flowTree} defaultExpandDepth={3} />
          </div>
        )}

        {!parsing && subTab === 'source' && (
          <div className="h-full overflow-auto">
            <pre className="text-[11px] font-mono leading-relaxed min-h-full">
              {procedure.rawDefinition.split('\n').map((line, i) => (
                <div key={i} className="flex hover:bg-surface-100 dark:hover:bg-surface-800/40 px-2">
                  <span className="text-surface-400 text-right pr-4 select-none w-12 flex-shrink-0 border-r border-surface-200 dark:border-surface-700 mr-3">{i + 1}</span>
                  <span className="text-surface-700 dark:text-surface-300 whitespace-pre">{line}</span>
                </div>
              ))}
            </pre>
          </div>
        )}

        {!parsing && subTab === 'docs' && autoDoc && (
          <div className="h-full overflow-y-auto p-6 max-w-3xl">
            <h3 className="font-semibold mb-2">{String(autoDoc.summary ?? '')}</h3>
            {autoDoc.description ? <p className="text-sm text-surface-600 mb-4">{String(autoDoc.description)}</p> : null}

            {/* Parameters */}
            {procedure.parameters.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-surface-500 uppercase mb-2">Parameters</h4>
                <div className="space-y-1">
                  {procedure.parameters.map((p) => (
                    <div key={p.name} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-brand-600">{p.name}</span>
                      <span className="text-surface-500">{p.dataType}</span>
                      <span className="badge text-[9px]">{p.mode}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Side effects */}
            {((autoDoc.sideEffects ?? []) as string[]).length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-surface-500 uppercase mb-2">Side Effects</h4>
                <ul className="space-y-1">
                  {(autoDoc.sideEffects as string[]).map((e, i) => (
                    <li key={i} className="text-sm text-surface-600 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{e}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!parsing && subTab === 'security' && (
          <div className="h-full overflow-y-auto p-4">
            {securityFindings.length === 0 ? (
              <div className="flex items-center justify-center h-full text-surface-400 text-sm">
                <Shield className="w-5 h-5 mr-2" />No security issues found
              </div>
            ) : (
              <div className="space-y-2 max-w-3xl">
                {securityFindings.map((f, i) => (
                  <div key={i} className="rounded-lg border border-surface-200 dark:border-surface-700 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        'badge text-[9px]',
                        f.severity === 'critical' && 'badge-critical',
                        f.severity === 'high' && 'badge-high',
                        f.severity === 'medium' && 'badge-medium',
                      )}>
                        {f.severity}
                      </span>
                      {f.line && <span className="text-[10px] text-surface-400 font-mono">L{f.line}</span>}
                    </div>
                    <p className="text-sm">{f.message}</p>
                    {f.recommendation && <p className="text-xs text-surface-500 mt-1">{f.recommendation}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
