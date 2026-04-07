import { useState, useMemo, useRef } from 'react';
import {
  Workflow, Loader2, Database, Key, Link2,
  Maximize2, Info, ZoomIn, ZoomOut, X, Search, Group,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { useConnections } from '@/shared/hooks/useConnections';
import { useERDiagram, type ERTable } from '@/shared/hooks/useTables';
import { ERDiagram, type ERDiagramHandle } from '@/features/visualization/components/ERDiagram';

const LAYOUT_IDS = ['fcose', 'dagre', 'cola', 'grid', 'concentric'] as const;
const LAYOUT_LABELS: Record<string, string> = {
  fcose: 'Force',
  dagre: 'Hierarchy',
  cola: 'Constraint',
  grid: 'Grid',
  concentric: 'Radial',
};

const SCHEMA_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#e11d48'];

export function ERDiagramPage() {
  const { t } = useTranslation(['common', 'nav']);
  const { data: connections } = useConnections();
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const activeId = connectionId || (connections?.[0] as any)?.id || null;

  const [schemaFilter, setSchemaFilter] = useState('');
  const [layout, setLayout] = useState<string>('fcose');
  const [selectedTable, setSelectedTable] = useState<ERTable | null>(null);
  const [tableSearch, setTableSearch] = useState('');
  const [groupBySchema, setGroupBySchema] = useState(false);
  const [isLayouting, setIsLayouting] = useState(false);
  const diagramRef = useRef<ERDiagramHandle>(null);

  const { data: erData, isLoading } = useERDiagram(activeId, schemaFilter || undefined);

  const schemas = useMemo(() => {
    if (!erData) return [];
    const counts = new Map<string, number>();
    for (const t of erData.tables) {
      counts.set(t.schemaName, (counts.get(t.schemaName) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [erData]);

  // Tables matching search (for the quick-find list)
  const searchResults = useMemo(() => {
    if (!tableSearch || tableSearch.length < 2 || !erData) return [];
    const q = tableSearch.toLowerCase();
    return erData.tables
      .filter(t => t.tableName.toLowerCase().includes(q) || t.schemaName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [tableSearch, erData]);

  const schemaColor = (schema: string) => {
    const idx = schemas.findIndex(([s]) => s === schema);
    return SCHEMA_COLORS[idx >= 0 ? idx % SCHEMA_COLORS.length : 0];
  };

  const isLargeGraph = (erData?.tables.length || 0) > 50;

  // Find FK relationships for selected table
  const selectedTableFKs = useMemo(() => {
    if (!selectedTable || !erData) return [];
    return erData.relationships.filter(
      r => r.sourceTableId === selectedTable.id || r.targetTableId === selectedTable.id
    );
  }, [selectedTable, erData]);

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Workflow className="w-5 h-5 text-brand-500" />
            {t('nav:erDiagram')}
          </h1>
          <p className="text-surface-500 text-xs mt-0.5">
            {erData
              ? `${erData.tables.length} tables, ${erData.relationships.length} relationships`
              : t('common:loading')}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Connection */}
          {connections && (connections as any[]).length > 0 && (
            <select
              value={activeId || ''}
              onChange={(e) => { setConnectionId(e.target.value); setSelectedTable(null); setSchemaFilter(''); }}
              className="input w-44 text-xs"
            >
              {(connections as any[]).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          {/* Schema filter */}
          <select
            value={schemaFilter}
            onChange={(e) => { setSchemaFilter(e.target.value); setSelectedTable(null); }}
            className="input w-44 text-xs"
          >
            <option value="">All schemas ({erData?.tables.length || 0})</option>
            {schemas.map(([s, count]) => (
              <option key={s} value={s}>{s} ({count})</option>
            ))}
          </select>

          {/* Layout buttons */}
          <div className="flex items-center gap-0.5 bg-surface-100 rounded-lg p-0.5">
            {LAYOUT_IDS.map(id => (
              <button
                key={id}
                onClick={() => setLayout(id)}
                className={cn(
                  'px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer',
                  layout === id
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-surface-500 hover:text-surface-700 hover:bg-surface-200/60',
                )}
              >
                {LAYOUT_LABELS[id]}
              </button>
            ))}
          </div>

          {/* Group by schema toggle */}
          <button
            onClick={() => setGroupBySchema(!groupBySchema)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer border',
              groupBySchema
                ? 'bg-brand-600/10 border-brand-500/30 text-brand-500'
                : 'bg-surface-100 border-surface-200/50 text-surface-500 hover:text-surface-700',
            )}
          >
            <Group className="w-3.5 h-3.5" />
            Group
          </button>
        </div>
      </div>

      {/* Hint for large graphs */}
      {isLargeGraph && !schemaFilter && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-brand-500/5 border border-brand-500/15 text-xs text-brand-500">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Filter by schema for a clearer view — {erData?.tables.length} tables loaded</span>
          <div className="ml-auto flex gap-1">
            {schemas.slice(0, 3).map(([s, count]) => (
              <button key={s} onClick={() => setSchemaFilter(s)}
                className="px-2 py-0.5 rounded bg-brand-500/10 hover:bg-brand-500/20 transition-colors cursor-pointer font-medium">
                {s} ({count})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Graph + Controls + Detail Panel */}
      <div className="flex-1 flex rounded-xl border border-surface-200 overflow-hidden">
        <div className="flex-1 relative">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center animate-fade-in">
                <Loader2 className="w-8 h-8 animate-spin text-brand-500 mx-auto mb-3" />
                <p className="text-sm text-surface-500 animate-pulse-subtle">Loading schema diagram...</p>
                <p className="text-xs text-surface-400 mt-1">Analyzing table relationships</p>
              </div>
            </div>
          ) : !erData || erData.tables.length === 0 ? (
            <div className="flex items-center justify-center h-full text-surface-400">
              <div className="text-center">
                <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No tables found</p>
                <p className="text-xs mt-1">Run an analysis to extract table metadata</p>
              </div>
            </div>
          ) : (
            <ERDiagram
              ref={diagramRef}
              tables={erData.tables}
              relationships={erData.relationships}
              onTableSelect={setSelectedTable}
              layout={layout}
              groupBySchema={groupBySchema}
              onLayoutingChange={setIsLayouting}
            />
          )}

          {/* ── Layout computing overlay ── */}
          {isLayouting && (
            <div className="absolute inset-0 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-10 animate-fade-in">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-brand-500 mx-auto mb-3" />
                <p className="text-sm text-surface-600 font-medium">Computing layout...</p>
                <p className="text-xs text-surface-400 mt-1">{erData?.tables.length} tables, {erData?.relationships.length} relationships</p>
              </div>
            </div>
          )}

          {/* ── Floating controls (top-right) ── */}
          {erData && erData.tables.length > 0 && (
            <div className="absolute top-3 right-3 flex flex-col gap-1.5">
              {/* Zoom controls */}
              <div className="glass rounded-lg flex flex-col overflow-hidden">
                <button onClick={() => diagramRef.current?.zoomIn()}
                  className="p-2 hover:bg-surface-200/60 transition-colors cursor-pointer" title="Zoom in">
                  <ZoomIn className="w-4 h-4 text-surface-600" />
                </button>
                <div className="h-px bg-surface-200/60" />
                <button onClick={() => diagramRef.current?.zoomOut()}
                  className="p-2 hover:bg-surface-200/60 transition-colors cursor-pointer" title="Zoom out">
                  <ZoomOut className="w-4 h-4 text-surface-600" />
                </button>
                <div className="h-px bg-surface-200/60" />
                <button onClick={() => diagramRef.current?.fit()}
                  className="p-2 hover:bg-surface-200/60 transition-colors cursor-pointer" title="Fit to screen">
                  <Maximize2 className="w-4 h-4 text-surface-600" />
                </button>
              </div>

              {/* Quick table search */}
              <div className="glass rounded-lg overflow-hidden w-48">
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <Search className="w-3 h-3 text-surface-400 flex-shrink-0" />
                  <input
                    className="bg-transparent text-2xs outline-none w-full placeholder:text-surface-400"
                    placeholder="Find table..."
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                  />
                  {tableSearch && (
                    <button onClick={() => setTableSearch('')} className="cursor-pointer">
                      <X className="w-3 h-3 text-surface-400" />
                    </button>
                  )}
                </div>
                {searchResults.length > 0 && (
                  <div className="border-t border-surface-200/40 max-h-40 overflow-y-auto">
                    {searchResults.map(t => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setSelectedTable(t);
                          diagramRef.current?.center(t.id);
                          setTableSearch('');
                        }}
                        className="w-full text-left px-2 py-1.5 text-2xs hover:bg-surface-200/40 transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: schemaColor(t.schemaName) }} />
                        <span className="font-mono font-medium truncate">{t.tableName}</span>
                        <span className="text-surface-400 ml-auto">{t.columns.length}c</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Legend (bottom-left) ── */}
          {erData && erData.tables.length > 0 && (
            <div className="absolute bottom-3 left-3 glass rounded-lg px-3 py-2.5 text-xs space-y-1.5 max-w-md">
              <div className="flex items-center gap-2 flex-wrap">
                {schemas.slice(0, 10).map(([s, count]) => (
                  <button
                    key={s}
                    onClick={() => setSchemaFilter(schemaFilter === s ? '' : s)}
                    className={cn(
                      'flex items-center gap-1 cursor-pointer transition-all px-1.5 py-0.5 rounded',
                      schemaFilter === s
                        ? 'bg-surface-200/60 ring-1 ring-brand-500/40'
                        : schemaFilter ? 'opacity-30 hover:opacity-60' : 'hover:bg-surface-200/40',
                    )}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: schemaColor(s) }} />
                    <span className="text-2xs text-surface-600 dark:text-surface-400">{s}</span>
                    <span className="text-2xs text-surface-400">({count})</span>
                  </button>
                ))}
                {schemas.length > 10 && <span className="text-2xs text-surface-400">+{schemas.length - 10}</span>}
              </div>
              <div className="flex items-center gap-4 text-2xs text-surface-400 border-t border-surface-200/30 pt-1">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-indigo-400 rounded" /> FK</span>
                <span>Click: highlight &middot; Double-click: zoom &middot; Hover edge: FK name</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Selected table detail panel ── */}
        {selectedTable && (
          <div className="w-72 border-l border-surface-200 bg-surface-50 flex flex-col overflow-hidden animate-slide-in-right">
            {/* Header */}
            <div className="p-4 border-b border-surface-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: schemaColor(selectedTable.schemaName) }} />
                  <h3 className="font-mono font-bold text-sm truncate">{selectedTable.tableName}</h3>
                </div>
                <button onClick={() => setSelectedTable(null)} className="p-1 rounded hover:bg-surface-200 text-surface-400 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-surface-500 mt-0.5">{selectedTable.schemaName}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="badge-info text-2xs">{selectedTable.columns.length} cols</span>
                {selectedTable.estimatedRowCount != null && (
                  <span className="badge-success text-2xs">~{selectedTable.estimatedRowCount.toLocaleString()} rows</span>
                )}
                {selectedTableFKs.length > 0 && (
                  <span className="badge-medium text-2xs">{selectedTableFKs.length} FKs</span>
                )}
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              {/* Columns */}
              <div className="p-4 border-b border-surface-200/40">
                <p className="text-[10px] uppercase text-surface-400 font-semibold mb-2">Columns</p>
                <div className="space-y-0.5">
                  {selectedTable.columns.map((col, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-2xs py-0.5">
                      {col.isPK && <Key className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                      {col.isFK && !col.isPK && <Link2 className="w-3 h-3 text-blue-400 flex-shrink-0" />}
                      {!col.isPK && !col.isFK && <span className="w-3 flex-shrink-0" />}
                      <span className={cn('font-mono', col.isPK && 'font-bold text-amber-500', col.isFK && 'text-blue-400')}>
                        {col.name}
                      </span>
                      <span className="text-surface-400 ml-auto font-mono text-[10px]">{col.type}</span>
                      {!col.isNullable && <span className="text-amber-400 text-[9px] font-bold">!</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* FK Relationships */}
              {selectedTableFKs.length > 0 && (
                <div className="p-4">
                  <p className="text-[10px] uppercase text-surface-400 font-semibold mb-2">Relationships</p>
                  <div className="space-y-1.5">
                    {selectedTableFKs.map((fk, i) => {
                      const isSource = fk.sourceTableId === selectedTable.id;
                      const otherTable = erData?.tables.find(
                        t => t.id === (isSource ? fk.targetTableId : fk.sourceTableId)
                      );
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            if (otherTable) {
                              setSelectedTable(otherTable);
                              diagramRef.current?.center(otherTable.id);
                            }
                          }}
                          className="w-full text-left px-2 py-1.5 rounded bg-indigo-500/5 border border-indigo-500/10 hover:border-indigo-500/25 transition-colors cursor-pointer"
                        >
                          <p className="text-2xs font-medium text-indigo-400">{fk.constraintName}</p>
                          <p className="text-[10px] text-surface-500 mt-0.5">
                            {isSource ? '→' : '←'} {otherTable?.schemaName}.{otherTable?.tableName || '?'}
                          </p>
                          <p className="text-[10px] text-surface-400">
                            ({fk.sourceColumns.join(', ')}) → ({fk.targetColumns.join(', ')})
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
