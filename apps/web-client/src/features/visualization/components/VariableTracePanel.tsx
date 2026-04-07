import { useState, useMemo } from 'react';
import {
  Search, X, Variable, ArrowRight, Key, Hash, Eye, PenTool,
  Zap, GitBranch, CornerDownRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';

interface VariableRef {
  variableName: string;
  referenceType: string;
  lineNumber: number | null;
  dataType: string | null;
  scope: string | null;
  targetVariable: string | null;
  targetProcedure: string | null;
  expression: string | null;
}

interface Props {
  variableReferences: VariableRef[];
  onClose: () => void;
  onHighlightLine?: (line: number) => void;
}

const TYPE_CONFIG: Record<string, { icon: typeof Key; color: string; bg: string }> = {
  declare:       { icon: Hash, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  parameter_in:  { icon: Key, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  parameter_out: { icon: Key, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  set:           { icon: PenTool, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  select_into:   { icon: PenTool, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  where_clause:  { icon: Eye, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  insert_value:  { icon: ArrowRight, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  update_set:    { icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  exec_argument: { icon: GitBranch, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  condition:     { icon: CornerDownRight, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  return:        { icon: ArrowRight, color: 'text-red-400', bg: 'bg-red-500/10' },
};

export function VariableTracePanel({ variableReferences, onClose, onHighlightLine }: Props) {
  const { t } = useTranslation('flow');
  const [search, setSearch] = useState('');
  const [selectedVar, setSelectedVar] = useState<string | null>(null);

  // Group variables by category
  const variables = useMemo(() => {
    const map = new Map<string, { name: string; category: string; count: number; dataType?: string }>();
    for (const ref of variableReferences) {
      if (!map.has(ref.variableName)) {
        const category = ref.referenceType === 'parameter_in' || ref.referenceType === 'parameter_out'
          ? 'parameters'
          : ref.variableName.startsWith('#') ? 'tempTables' : 'localVariables';
        map.set(ref.variableName, {
          name: ref.variableName,
          category,
          count: 0,
          dataType: ref.dataType || undefined,
        });
      }
      map.get(ref.variableName)!.count++;
      if (ref.dataType) map.get(ref.variableName)!.dataType = ref.dataType;
    }
    return Array.from(map.values());
  }, [variableReferences]);

  const filteredVars = useMemo(() => {
    if (!search) return variables;
    const s = search.toLowerCase();
    return variables.filter(v => v.name.toLowerCase().includes(s));
  }, [variables, search]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, typeof filteredVars> = { parameters: [], localVariables: [], tempTables: [] };
    for (const v of filteredVars) {
      (groups[v.category] || groups.localVariables).push(v);
    }
    return groups;
  }, [filteredVars]);

  // Trace for selected variable
  const trace = useMemo(() => {
    if (!selectedVar) return [];
    return variableReferences
      .filter(r => r.variableName === selectedVar)
      .sort((a, b) => (a.lineNumber || 0) - (b.lineNumber || 0));
  }, [selectedVar, variableReferences]);

  return (
    <div className="w-80 border-l border-surface-200 bg-surface-50 flex flex-col animate-slide-up overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-surface-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Variable className="w-4 h-4 text-brand-500" />
          <h3 className="text-xs font-semibold">{t('variableTrace.title')}</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-surface-200 text-surface-400 cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-surface-200/60">
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            className="input pl-7 text-2xs py-1"
            placeholder={t('variableTrace.searchVariable')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Variable list / Trace view */}
      <div className="flex-1 overflow-y-auto">
        {!selectedVar ? (
          /* Variable list */
          <div className="p-2 space-y-3">
            {Object.entries(grouped).map(([category, vars]) => {
              if (vars.length === 0) return null;
              return (
                <div key={category}>
                  <p className="text-[10px] uppercase text-surface-400 font-semibold mb-1 px-1">
                    {t(`variableTrace.categories.${category}`)}
                  </p>
                  <div className="space-y-0.5">
                    {vars.map(v => (
                      <button
                        key={v.name}
                        onClick={() => setSelectedVar(v.name)}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-surface-100/60 text-2xs transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-brand-400">{v.name}</span>
                          {v.dataType && <span className="text-surface-400">{v.dataType}</span>}
                        </div>
                        <span className="text-surface-400">{t('variableTrace.occurrences', { count: v.count })}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {variables.length === 0 && (
              <p className="text-center text-surface-400 text-2xs py-4">{t('variableTrace.noVariables')}</p>
            )}
          </div>
        ) : (
          /* Trace timeline */
          <div className="p-2">
            <button
              onClick={() => setSelectedVar(null)}
              className="flex items-center gap-1 text-2xs text-brand-500 hover:text-brand-400 mb-2 cursor-pointer"
            >
              <ArrowRight className="w-3 h-3 rotate-180" />
              {t('variableTrace.title')}
            </button>

            <div className="flex items-center gap-1.5 mb-3 px-1">
              <span className="font-mono font-bold text-sm text-brand-400">{selectedVar}</span>
              <span className="text-2xs text-surface-400">
                {t('variableTrace.occurrences', { count: trace.length })}
              </span>
            </div>

            <div className="space-y-1">
              {trace.map((ref, i) => {
                const cfg = TYPE_CONFIG[ref.referenceType] || TYPE_CONFIG.set;
                const Icon = cfg.icon;
                return (
                  <button
                    key={i}
                    onClick={() => ref.lineNumber && onHighlightLine?.(ref.lineNumber)}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded-md border transition-colors cursor-pointer',
                      cfg.bg, 'border-transparent hover:border-surface-200/50',
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn('w-3 h-3 flex-shrink-0', cfg.color)} />
                      <span className={cn('text-2xs font-bold uppercase', cfg.color)}>
                        {t(`variableTrace.types.${ref.referenceType}`)}
                      </span>
                      {ref.lineNumber && (
                        <span className="text-2xs text-surface-400 ml-auto">L{ref.lineNumber}</span>
                      )}
                    </div>
                    {ref.dataType && (
                      <p className="text-2xs text-surface-500 ml-4.5 mt-0.5">{ref.dataType}</p>
                    )}
                    {ref.expression && (
                      <p className="text-2xs text-surface-500 ml-4.5 mt-0.5 font-mono truncate">= {ref.expression}</p>
                    )}
                    {ref.targetProcedure && (
                      <p className="text-2xs text-purple-400 ml-4.5 mt-0.5">
                        → {ref.targetProcedure}
                        {ref.targetVariable && ` (${ref.targetVariable})`}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
