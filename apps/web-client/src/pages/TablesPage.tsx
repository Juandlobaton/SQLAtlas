import { useState, useMemo } from 'react';
import {
  Table2, Search, Key, Link2, Hash, ChevronRight,
  Eye, PenTool, Zap, Trash2, Layers,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { useConnections } from '@/shared/hooks/useConnections';
import { useTables, useTableDetail, type TableItem } from '@/shared/hooks/useTables';
import { Skeleton } from '@/shared/components/Skeleton';

const OP_ICON: Record<string, { icon: typeof Eye; color: string }> = {
  SELECT: { icon: Eye, color: 'text-emerald-400' },
  INSERT: { icon: PenTool, color: 'text-blue-400' },
  UPDATE: { icon: Zap, color: 'text-amber-400' },
  DELETE: { icon: Trash2, color: 'text-red-400' },
};

export function TablesPage() {
  const { t } = useTranslation(['tables', 'common']);
  const { data: connections } = useConnections();
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const activeId = connectionId || (connections?.[0] as any)?.id || null;

  const [search, setSearch] = useState('');
  const [schemaFilter, setSchemaFilter] = useState('');
  const [selectedTable, setSelectedTable] = useState<TableItem | null>(null);

  const { data: tables, isLoading } = useTables(activeId, {
    search: search || undefined,
    schema: schemaFilter || undefined,
  });

  const { data: tableDetail } = useTableDetail(activeId, selectedTable?.id || null);

  // Group tables by schema
  const schemas = useMemo(() => {
    if (!tables) return [];
    const s = new Set(tables.map(t => t.schemaName));
    return Array.from(s).sort();
  }, [tables]);

  const SCHEMA_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#e11d48'];
  const schemaColor = (schema: string) => SCHEMA_COLORS[Math.abs([...schema].reduce((a, c) => a + c.charCodeAt(0), 0)) % SCHEMA_COLORS.length];

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Table2 className="w-5 h-5 text-brand-500" />
            {t('tables:title')}
          </h1>
          <p className="text-surface-500 text-xs mt-0.5">{t('tables:subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {connections && (connections as any[]).length > 0 && (
            <select value={activeId || ''} onChange={(e) => { setConnectionId(e.target.value); setSelectedTable(null); }}
              className="input w-44 text-xs">
              {(connections as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <select value={schemaFilter} onChange={(e) => setSchemaFilter(e.target.value)} className="input w-36 text-xs">
            <option value="">{t('tables:allSchemas')}</option>
            {schemas.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Table list */}
        <div className="w-72 flex-shrink-0 card flex flex-col overflow-hidden">
          <div className="p-2 border-b border-surface-200/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
              <input className="input pl-8 text-xs py-1.5" placeholder={t('tables:searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-3 space-y-2 animate-fade-in">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                    <Skeleton variant="circular" width={8} height={8} />
                    <Skeleton width={`${70 - (i % 3) * 10}%`} className="h-3" />
                  </div>
                ))}
              </div>
            ) : !tables || tables.length === 0 ? (
              <div className="p-4 text-center text-surface-400 text-xs">{t('tables:noResults')}</div>
            ) : tables.map((tbl) => (
              <button key={tbl.id} onClick={() => setSelectedTable(tbl)}
                className={cn('w-full flex items-center justify-between px-3 py-2 text-xs border-b border-surface-200/30 hover:bg-surface-100/60 transition-all cursor-pointer',
                  selectedTable?.id === tbl.id && 'bg-brand-500/8 border-l-2 border-l-brand-500')}>
                <div className="min-w-0 text-left flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: schemaColor(tbl.schemaName) }} />
                  <div>
                    <p className="font-mono font-medium truncate text-[12px]">{tbl.tableName}</p>
                    <p className="text-2xs text-surface-500">{tbl.schemaName} / {tbl.columns.length} cols</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                  <span className={cn('text-2xs px-1.5 py-0.5 rounded-md font-bold uppercase',
                    tbl.tableType === 'view' ? 'badge-info' : 'badge-success')}>
                    {tbl.tableType === 'view' ? t('tables:badges.view') : t('tables:badges.table')}
                  </span>
                  <ChevronRight className="w-3 h-3 text-surface-300" />
                </div>
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-surface-200/60 text-2xs text-surface-400 text-center">
            {t('tables:total', { count: tables?.length || 0 })}
          </div>
        </div>

        {/* Table detail */}
        <div className="flex-1 card overflow-y-auto">
          {!selectedTable ? (
            <div className="flex items-center justify-center h-full text-surface-400">
              <div className="text-center"><Layers className="w-10 h-10 mx-auto mb-3 opacity-20" /><p className="text-xs">{t('tables:emptyState')}</p></div>
            </div>
          ) : (
            <div className="p-5 animate-fade-in">
              {/* Header */}
              <div className="mb-5 pb-4 border-b border-surface-200/60">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Table2 className="w-4.5 h-4.5 text-emerald-500" />
                  </div>
                  <div>
                    <h2 className="font-mono font-bold text-base">{selectedTable.schemaName}.{selectedTable.tableName}</h2>
                    <p className="text-2xs text-surface-500">
                      {selectedTable.tableType} / {selectedTable.columns.length} columns
                      {selectedTable.primaryKey.length > 0 && ` / PK: ${selectedTable.primaryKey.join(', ')}`}
                      {selectedTable.estimatedRowCount != null && ` / ~${selectedTable.estimatedRowCount.toLocaleString()} rows`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Columns */}
              <div className="mb-6">
                <p className="text-2xs font-semibold text-surface-500 uppercase mb-2">{t('tables:columns')}</p>
                <div className="border border-surface-200/40 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-surface-100/60 border-b border-surface-200/40">
                        <th className="text-left px-3 py-2 font-semibold text-surface-500">{t('tables:columnHeaders.name')}</th>
                        <th className="text-left px-3 py-2 font-semibold text-surface-500">{t('tables:columnHeaders.type')}</th>
                        <th className="text-left px-3 py-2 font-semibold text-surface-500">{t('tables:columnHeaders.nullable')}</th>
                        <th className="text-left px-3 py-2 font-semibold text-surface-500">{t('tables:columnHeaders.default')}</th>
                        <th className="text-left px-3 py-2 font-semibold text-surface-500">{t('tables:columnHeaders.key')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTable.columns.map((col, i) => (
                        <tr key={i} className="border-b border-surface-200/20 hover:bg-surface-100/30">
                          <td className="px-3 py-1.5 font-mono font-medium">{col.columnName}</td>
                          <td className="px-3 py-1.5 text-surface-500 font-mono">
                            {col.dataType}
                            {col.maxLength && col.maxLength > 0 && `(${col.maxLength})`}
                          </td>
                          <td className="px-3 py-1.5">
                            <span className={cn('text-2xs', col.isNullable ? 'text-surface-400' : 'text-amber-400 font-bold')}>
                              {col.isNullable ? 'YES' : 'NOT NULL'}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-surface-400 font-mono text-2xs">{col.defaultValue || '-'}</td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1">
                              {col.isPrimaryKey && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-2xs font-bold">
                                  <Key className="w-3 h-3" /> {t('tables:badges.pk')}
                                </span>
                              )}
                              {col.isForeignKey && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 text-2xs font-bold">
                                  <Link2 className="w-3 h-3" /> {t('tables:badges.fk')}
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
              <div className="mb-6">
                <p className="text-2xs font-semibold text-surface-500 uppercase mb-2">
                  <Link2 className="w-3 h-3 inline mr-1" />{t('tables:foreignKeys')}
                </p>
                {selectedTable.foreignKeys.length === 0 ? (
                  <p className="text-2xs text-surface-400">{t('tables:noFK')}</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedTable.foreignKeys.map((fk, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/15">
                        <Link2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium">{fk.constraintName}</p>
                          <p className="text-2xs text-surface-500">
                            ({fk.columns.join(', ')}) → {fk.referencedTable} ({fk.referencedColumns.join(', ')})
                          </p>
                          <p className="text-2xs text-surface-400">ON DELETE {fk.onDelete} / ON UPDATE {fk.onUpdate}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Indexes */}
              <div className="mb-6">
                <p className="text-2xs font-semibold text-surface-500 uppercase mb-2">
                  <Hash className="w-3 h-3 inline mr-1" />{t('tables:indexes')}
                </p>
                {selectedTable.indexes.length === 0 ? (
                  <p className="text-2xs text-surface-400">{t('tables:noIndexes')}</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedTable.indexes.map((idx, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-100/40 border border-surface-200/30">
                        <Hash className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium">{idx.indexName}</span>
                            {idx.isPrimary && <span className="badge-success text-2xs">PRIMARY</span>}
                            {idx.isUnique && !idx.isPrimary && <span className="badge-info text-2xs">UNIQUE</span>}
                          </div>
                          <p className="text-2xs text-surface-500">({idx.columns.join(', ')}) — {idx.indexType}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Accessed by procedures */}
              {tableDetail?.accessedBy && (
                <div>
                  <p className="text-2xs font-semibold text-surface-500 uppercase mb-2">{t('tables:accessedBy')}</p>
                  {tableDetail.accessedBy.length === 0 ? (
                    <p className="text-2xs text-surface-400">{t('tables:noAccess')}</p>
                  ) : (
                    <div className="space-y-1">
                      {tableDetail.accessedBy.map((access, i) => {
                        const op = OP_ICON[access.operation] || OP_ICON.SELECT;
                        const Icon = op.icon;
                        return (
                          <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded bg-surface-100/30">
                            <Icon className={cn('w-3 h-3', op.color)} />
                            <span className={cn('text-2xs font-bold uppercase', op.color)}>{access.operation}</span>
                            <span className="font-mono text-2xs text-surface-600">{access.procedureId}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
