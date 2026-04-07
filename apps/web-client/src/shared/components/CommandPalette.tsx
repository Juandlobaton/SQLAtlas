import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Workflow, Table2, Shield, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { useProcedures } from '@/shared/hooks/useAnalysis';
import { useTables } from '@/shared/hooks/useTables';
import { useConnections } from '@/shared/hooks/useConnections';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { data: connections } = useConnections();
  const activeConnectionId = (connections?.[0] as any)?.id || null;

  const { data: procData, isLoading: procsLoading } = useProcedures(activeConnectionId, {
    limit: 10,
    search: query.length >= 2 ? query : undefined,
  });

  const { data: tables, isLoading: tablesLoading } = useTables(activeConnectionId, {
    search: query.length >= 2 ? query : undefined,
  });

  const isLoading = procsLoading || tablesLoading;

  // Build result items
  const results = useCallback(() => {
    const items: { type: string; id: string; label: string; sublabel: string; path: string }[] = [];

    if (procData?.items) {
      for (const p of procData.items.slice(0, 8)) {
        items.push({
          type: 'procedure',
          id: p.id,
          label: p.objectName,
          sublabel: `${p.schemaName} / ${p.objectType}`,
          path: '/flow',
        });
      }
    }

    if (tables) {
      for (const t of tables.slice(0, 5)) {
        items.push({
          type: 'table',
          id: t.id,
          label: t.tableName,
          sublabel: `${t.schemaName} / ${t.columns.length} cols`,
          path: '/tables',
        });
      }
    }

    return items;
  }, [procData, tables]);

  const items = results();

  // Focus on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, items.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' && items[selectedIndex]) {
        navigate(items[selectedIndex].path);
        onClose();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, items, selectedIndex, navigate, onClose]);

  if (!isOpen) return null;

  const ICONS: Record<string, typeof Workflow> = {
    procedure: Workflow,
    table: Table2,
    finding: Shield,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-surface-50 border border-surface-200 rounded-xl shadow-2xl overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-200">
          <Search className="w-4 h-4 text-surface-400 flex-shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-surface-400"
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
          />
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-brand-500" />}
          <kbd className="text-2xs bg-surface-200/60 px-1.5 py-0.5 rounded text-surface-400 font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {query.length < 2 ? (
            <div className="p-6 text-center text-surface-400 text-xs">
              Type at least 2 characters to search...
            </div>
          ) : items.length === 0 && !isLoading ? (
            <div className="p-6 text-center text-surface-400 text-xs">
              No results found
            </div>
          ) : (
            <div className="py-1">
              {items.map((item, i) => {
                const Icon = ICONS[item.type] || Workflow;
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    onClick={() => { navigate(item.path); onClose(); }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer',
                      i === selectedIndex ? 'bg-brand-500/10' : 'hover:bg-surface-100/60',
                    )}
                  >
                    <Icon className={cn('w-4 h-4 flex-shrink-0',
                      item.type === 'procedure' ? 'text-blue-400' :
                      item.type === 'table' ? 'text-emerald-400' : 'text-red-400'
                    )} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-mono font-medium truncate">{item.label}</p>
                      <p className="text-2xs text-surface-500">{item.sublabel}</p>
                    </div>
                    <span className={cn('text-2xs px-1.5 py-0.5 rounded-md font-bold uppercase',
                      item.type === 'procedure' ? 'badge-info' : 'badge-success'
                    )}>
                      {item.type}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
