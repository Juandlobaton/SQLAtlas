import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Network, RotateCcw, Loader2, Database } from 'lucide-react';
import { DependencyGraph } from '@/features/visualization/components/DependencyGraph';
import { NodeDetailPanel } from '@/features/visualization/components/NodeDetailPanel';
import { useGraphData, type GraphData } from '@/features/visualization/hooks/useGraphData';
import { useConnections } from '@/shared/hooks/useConnections';
import { cn } from '@/shared/lib/utils';

const LAYOUT_IDS = ['etl-flow', 'hierarchical', 'concentric', 'force', 'circle'] as const;

type ViewMode = 'connected' | 'all' | 'business' | 'high-complexity';
const VIEW_MODE_IDS: ViewMode[] = ['connected', 'business', 'high-complexity', 'all'];

// Schemas that are business logic (not PostGIS/system)
const BUSINESS_SCHEMAS = new Set(['billing', 'components', 'products', 'inventory', 'sales', 'users', 'store', 'services', 'social', 'vehicles', 'scheduling', 'subscriptions', 'saga', 'storage', 'app', 'audit', 'catalog', 'marketplace']);

export function GraphPage() {
  const { t } = useTranslation(['graph', 'common']);
  const { data: connections } = useConnections();
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const activeConnectionId = selectedConnectionId || (connections?.[0] as any)?.id || null;

  const { data, isLoading, selectedNode, setSelectedNode, highlightedPath, highlightCallChain, clearHighlight } = useGraphData(activeConnectionId);
  const [layout, setLayout] = useState('etl-flow');
  const [viewMode, setViewMode] = useState<ViewMode>('connected');
  const [schemaFilter, setSchemaFilter] = useState<string>('');

  // Get unique schemas for filter dropdown
  const schemas = useMemo(() => {
    const s = new Set(data.nodes.map((n) => n.schema));
    return Array.from(s).sort();
  }, [data]);

  // Apply view mode filtering
  const filteredData = useMemo<GraphData>(() => {
    const connectedNodeIds = new Set<string>();
    for (const e of data.edges) {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    }

    let nodes = data.nodes;

    // View mode filter
    if (viewMode === 'connected') {
      nodes = nodes.filter((n) => connectedNodeIds.has(n.id));
    } else if (viewMode === 'business') {
      nodes = nodes.filter((n) => BUSINESS_SCHEMAS.has(n.schema.toLowerCase()));
    } else if (viewMode === 'high-complexity') {
      nodes = nodes.filter((n) => (n.complexity || 0) >= 10);
    }

    // Schema filter
    if (schemaFilter) {
      nodes = nodes.filter((n) => n.schema === schemaFilter);
    }

    // Only keep edges between visible nodes
    const visibleIds = new Set(nodes.map((n) => n.id));
    const edges = data.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));

    return { nodes, edges };
  }, [data, viewMode, schemaFilter]);

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Network className="w-6 h-6 text-brand-500" />
            {t('graph:title')}
          </h1>
          <p className="text-surface-500 text-sm mt-1">
            {isLoading ? t('common:loading') : (
              <>
                {t('graph:subtitle', { nodes: filteredData.nodes.length, total: data.nodes.length, edges: filteredData.edges.length })}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Connection selector */}
          {connections && connections.length > 0 && (
            <select value={activeConnectionId || ''} onChange={(e) => setSelectedConnectionId(e.target.value || null)} className="input w-44 text-xs">
              {(connections as any[]).map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          )}

          {/* Schema filter */}
          <select value={schemaFilter} onChange={(e) => setSchemaFilter(e.target.value)} className="input w-36 text-xs">
            <option value="">{t('graph:allSchemas')}</option>
            {schemas.map((s) => (<option key={s} value={s}>{s} ({data.nodes.filter((n) => n.schema === s).length})</option>))}
          </select>

          {/* View mode */}
          <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-1">
            {VIEW_MODE_IDS.map((id) => (
              <button key={id} onClick={() => setViewMode(id)}
                title={id === 'high-complexity' ? t('common:tooltips.cc') : undefined}
                className={cn('px-2 py-1 rounded-md text-[11px] font-medium transition-colors',
                  id === 'high-complexity' && 'cursor-help',
                  viewMode === id ? 'bg-brand-600 text-white' : 'text-surface-500 hover:text-surface-700')}>
                {id === 'connected' && t('graph:views.connected')}
                {id === 'business' && t('graph:views.businessLogic')}
                {id === 'high-complexity' && t('graph:views.highComplexity')}
                {id === 'all' && t('graph:views.all', { count: data.nodes.length })}
              </button>
            ))}
          </div>

          {/* Layout */}
          <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-1">
            {LAYOUT_IDS.map((id) => (
              <button key={id} onClick={() => setLayout(id)}
                title={id === 'etl-flow' ? t('common:tooltips.etl') : undefined}
                className={cn('px-2 py-1 rounded-md text-[11px] font-medium transition-colors',
                  id === 'etl-flow' && 'cursor-help',
                  layout === id ? 'bg-surface-700 text-white dark:bg-surface-300 dark:text-surface-900' : 'text-surface-500 hover:text-surface-700')}>
                {id === 'etl-flow' && t('graph:layouts.etl')}
                {id === 'hierarchical' && t('graph:layouts.hierarchy')}
                {id === 'concentric' && t('graph:layouts.concentric')}
                {id === 'force' && t('graph:layouts.force')}
                {id === 'circle' && t('graph:layouts.circle')}
              </button>
            ))}
          </div>

          {highlightedPath.size > 0 && (
            <button onClick={clearHighlight} className="btn-ghost text-xs">
              <RotateCcw className="w-3.5 h-3.5" /> {t('graph:clearTrace')}
            </button>
          )}
        </div>
      </div>

      {/* Graph + Panel */}
      <div className="flex-1 flex rounded-xl border border-surface-200 overflow-hidden">
        <div className="flex-1 relative">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center animate-fade-in">
                <Loader2 className="w-8 h-8 animate-spin text-brand-500 mx-auto mb-3" />
                <p className="text-sm text-surface-500 animate-pulse-subtle">{t('common:loading')}</p>
                <p className="text-xs text-surface-400 mt-1">{t('graph:emptyHint')}</p>
              </div>
            </div>
          ) : filteredData.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-surface-400">
              <div className="text-center">
                <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">{t('graph:emptyState')}</p>
                <p className="text-xs mt-1">{t('graph:emptyHint')}</p>
              </div>
            </div>
          ) : (
            <>
              <DependencyGraph
                data={filteredData}
                highlightedPath={highlightedPath}
                onNodeSelect={setSelectedNode}
                onNodeDoubleClick={highlightCallChain}
                layout={layout}
              />

              {/* Legend + stats */}
              <div className="absolute bottom-4 left-4 glass rounded-lg px-4 py-3 text-xs space-y-2">
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-surface-600">{t('graph:legend.nodes')}</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500" /> {t('common:nodeTypes.procedure')}</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-purple-500" /> {t('common:nodeTypes.function')}</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500" /> {t('common:nodeTypes.table')}</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500" /> {t('common:nodeTypes.trigger')}</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500" /> {t('common:nodeTypes.external')}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-surface-600">{t('graph:legend.edges')}</span>
                  <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-blue-500" /> {t('common:edgeTypes.calls')}</span>
                  <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-emerald-500" /> {t('common:edgeTypes.read')}</span>
                  <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-amber-500" /> {t('common:edgeTypes.write')}</span>
                  <span className="flex items-center gap-1 cursor-help" title={t('common:tooltips.dynamic')}><span className="w-4 h-0.5 bg-gray-400 border-t border-dashed border-gray-400" /> {t('common:edgeTypes.dynamic')}</span>
                </div>
                <div className="flex items-center gap-4 text-surface-500">
                  <span>{t('common:badges.nodes', { count: filteredData.nodes.length })}</span>
                  <span>{t('common:badges.edges', { count: filteredData.edges.length })}</span>
                  {filteredData.nodes.some((n) => n.securityIssues > 0) && (
                    <span>{t('common:badges.issues', { count: filteredData.nodes.filter((n) => n.securityIssues > 0).length })}</span>
                  )}
                </div>
              </div>
            </>
          )}

          {!selectedNode && highlightedPath.size === 0 && filteredData.nodes.length > 0 && (
            <div className="absolute top-4 right-4 glass rounded-lg px-3 py-2 text-xs text-surface-500 max-w-48">
              {t('graph:hint')}
            </div>
          )}
        </div>

        {selectedNode && (
          <NodeDetailPanel
            node={selectedNode}
            connectionId={activeConnectionId}
            onClose={() => setSelectedNode(null)}
            onTraceCallChain={highlightCallChain}
          />
        )}
      </div>
    </div>
  );
}
