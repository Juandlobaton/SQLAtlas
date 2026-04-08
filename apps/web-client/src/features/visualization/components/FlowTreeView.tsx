import { useState, useCallback, useMemo, createContext, useContext } from 'react';
import {
  ChevronRight, ChevronDown, Copy, Check, Code,
  Table2, Variable, ArrowRight, RotateCcw, Shield,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import type { FlowTreeNode } from '@/features/visualization/types/flow-tree';

/* ── Constants ── */

const INITIAL_RENDER_LIMIT = 50;
const RENDER_BATCH = 50;

const OP_COLORS: Record<string, { bg: string; text: string }> = {
  SELECT:   { bg: 'bg-emerald-500/15', text: 'text-emerald-500' },
  INSERT:   { bg: 'bg-blue-500/15',    text: 'text-blue-500' },
  UPDATE:   { bg: 'bg-amber-500/15',   text: 'text-amber-500' },
  DELETE:   { bg: 'bg-red-500/15',     text: 'text-red-500' },
  MERGE:    { bg: 'bg-purple-500/15',  text: 'text-purple-500' },
  EXEC:     { bg: 'bg-blue-500/15',    text: 'text-blue-500' },
  SET:      { bg: 'bg-slate-500/15',   text: 'text-slate-500' },
  DECLARE:  { bg: 'bg-slate-500/15',   text: 'text-slate-500' },
  IF:       { bg: 'bg-amber-500/15',   text: 'text-amber-500' },
  'ELSE IF':{ bg: 'bg-amber-500/15',   text: 'text-amber-500' },
  WHILE:    { bg: 'bg-purple-500/15',  text: 'text-purple-500' },
  FOR:      { bg: 'bg-purple-500/15',  text: 'text-purple-500' },
  TRY:      { bg: 'bg-blue-500/15',    text: 'text-blue-500' },
  RETURN:   { bg: 'bg-emerald-500/15', text: 'text-emerald-500' },
  RAISERROR:{ bg: 'bg-red-500/15',     text: 'text-red-500' },
  THROW:    { bg: 'bg-red-500/15',     text: 'text-red-500' },
  PRINT:    { bg: 'bg-slate-500/15',   text: 'text-slate-500' },
  TRUNCATE: { bg: 'bg-red-500/15',     text: 'text-red-500' },
  'BEGIN TRANSACTION': { bg: 'bg-indigo-500/15', text: 'text-indigo-500' },
  COMMIT:   { bg: 'bg-indigo-500/15',  text: 'text-indigo-500' },
  ROLLBACK: { bg: 'bg-indigo-500/15',  text: 'text-indigo-500' },
  OPEN:     { bg: 'bg-slate-500/15',   text: 'text-slate-500' },
  CLOSE:    { bg: 'bg-slate-500/15',   text: 'text-slate-500' },
  FETCH:    { bg: 'bg-slate-500/15',   text: 'text-slate-500' },
  DEALLOCATE: { bg: 'bg-slate-500/15', text: 'text-slate-500' },
};

const DEFAULT_OP_COLOR = { bg: 'bg-surface-300/30', text: 'text-surface-500' };

const NODE_ROW_BG: Record<string, string> = {
  condition:     'bg-amber-500/5',
  loop:          'bg-purple-500/5',
  call:          'bg-blue-500/5',
  error_handler: 'bg-red-500/5',
  return:        'bg-emerald-500/5',
  statement:     'bg-surface-100/40',
  start:         '',
  end:           'bg-surface-200/40',
  branch:        '',
};

/* ── Context ── */

interface FlowTreeCtx {
  expandedIds: Set<string>;
  toggle: (id: string) => void;
  copiedId: string | null;
  copySnippet: (id: string, text: string) => void;
  onHighlightLine?: (line: number) => void;
}

const FlowTreeContext = createContext<FlowTreeCtx>(null!);

/* ── Props ── */

interface FlowTreeViewProps {
  tree: FlowTreeNode;
  defaultExpandDepth?: number;
  onHighlightLine?: (line: number) => void;
  className?: string;
}

/* ── Helpers ── */

function collectExpandedIds(node: FlowTreeNode, depth: number, maxDepth: number, set: Set<string>) {
  if (depth >= maxDepth) return;
  const hasNested = node.children.length > 0 || node.trueBranch || node.falseBranch;
  if (hasNested) set.add(node.nodeId);
  for (const c of node.children) collectExpandedIds(c, depth + 1, maxDepth, set);
  if (node.trueBranch) collectExpandedIds(node.trueBranch, depth + 1, maxDepth, set);
  if (node.falseBranch) collectExpandedIds(node.falseBranch, depth + 1, maxDepth, set);
}

/* ── Root Component ── */

export function FlowTreeView({ tree, defaultExpandDepth = 2, onHighlightLine, className }: FlowTreeViewProps) {
  const { t } = useTranslation(['flow', 'common']);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    collectExpandedIds(tree, 0, defaultExpandDepth, initial);
    return initial;
  });

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const all = new Set<string>();
    collectExpandedIds(tree, 0, 100, all);
    setExpandedIds(all);
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const copySnippet = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const ctx = useMemo<FlowTreeCtx>(() => ({
    expandedIds, toggle, copiedId, copySnippet, onHighlightLine,
  }), [expandedIds, toggle, copiedId, copySnippet, onHighlightLine]);

  const visibleChildren = tree.children.filter(
    c => c.nodeType !== 'start' && c.nodeType !== 'end',
  );

  return (
    <FlowTreeContext.Provider value={ctx}>
      <div className={cn('space-y-0.5', className)}>
        {/* Toolbar */}
        <div className="flex items-center justify-end gap-2 mb-2">
          <button onClick={expandAll} className="btn-ghost text-2xs px-2 py-1">
            {t('flow:flowTree.expandAll', { defaultValue: 'Expandir todo' })}
          </button>
          <button onClick={collapseAll} className="btn-ghost text-2xs px-2 py-1">
            {t('flow:flowTree.collapseAll', { defaultValue: 'Colapsar todo' })}
          </button>
        </div>

        {/* Tree */}
        <FlowBranch nodes={visibleChildren} depth={0} />
      </div>
    </FlowTreeContext.Provider>
  );
}

/* ── Branch (list of sibling nodes with progressive rendering) ── */

function FlowBranch({ nodes, depth }: { nodes: FlowTreeNode[]; depth: number }) {
  const { t } = useTranslation(['flow']);
  const [renderCount, setRenderCount] = useState(
    Math.min(nodes.length, INITIAL_RENDER_LIMIT),
  );

  const visible = nodes.slice(0, renderCount);
  const remaining = nodes.length - renderCount;

  return (
    <div className={cn(depth > 0 && 'ml-4 border-l-2 border-surface-200/40 pl-3 mt-0.5')}>
      {visible.map(node => (
        <FlowNodeRow key={node.nodeId} node={node} depth={depth} />
      ))}
      {remaining > 0 && (
        <button
          onClick={() => setRenderCount(prev => Math.min(prev + RENDER_BATCH, nodes.length))}
          className="text-2xs text-brand-500 hover:text-brand-400 px-3 py-1.5 transition-colors"
        >
          {t('flow:flowTree.showMore', {
            count: Math.min(RENDER_BATCH, remaining),
            remaining,
            defaultValue: `Mostrar ${Math.min(RENDER_BATCH, remaining)} mas de ${remaining} restantes...`,
          })}
        </button>
      )}
    </div>
  );
}

/* ── Single Node Row ── */

function FlowNodeRow({ node, depth }: { node: FlowTreeNode; depth: number }) {
  const ctx = useContext(FlowTreeContext);
  const [showSnippet, setShowSnippet] = useState(false);

  const op = node.operation || '';
  const opColor = OP_COLORS[op] || DEFAULT_OP_COLOR;
  const rowBg = NODE_ROW_BG[node.nodeType] || '';
  const hasNested = (node.children?.length ?? 0) > 0 || !!node.trueBranch || !!node.falseBranch;
  const isExpanded = ctx.expandedIds.has(node.nodeId);
  const isBranching = node.nodeType === 'condition' || node.nodeType === 'loop' || node.nodeType === 'error_handler';

  const tables = node.affectedTables || [];
  const varsRead = node.variablesRead || [];
  const varsWritten = node.variablesWritten || [];
  const targetProc = node.targetProcedure;

  // Build display label (strip operation keyword from label for cleaner display)
  const displayLabel = node.label || '';

  return (
    <div className="mt-0.5">
      {/* Main row */}
      <div
        className={cn(
          'flex items-start gap-2 py-1.5 px-2.5 rounded-lg transition-all duration-100 group',
          rowBg,
          hasNested && 'cursor-pointer hover:bg-surface-200/40',
        )}
        onClick={hasNested ? () => ctx.toggle(node.nodeId) : undefined}
      >
        {/* Expand chevron */}
        <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center mt-0.5">
          {hasNested ? (
            isExpanded
              ? <ChevronDown className="w-3.5 h-3.5 text-surface-400" />
              : <ChevronRight className="w-3.5 h-3.5 text-surface-400" />
          ) : (
            <ArrowRight className="w-3 h-3 text-surface-300" />
          )}
        </div>

        {/* Line number */}
        {node.lineNumber && (
          <button
            className="text-2xs text-surface-400 w-8 text-right flex-shrink-0 hover:text-brand-500 transition-colors font-mono mt-0.5"
            onClick={(e) => { e.stopPropagation(); ctx.onHighlightLine?.(node.lineNumber!); }}
            title={`Line ${node.lineNumber}`}
          >
            L{node.lineNumber}
          </button>
        )}

        {/* Operation badge */}
        {op && (
          <span className={cn(
            'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5',
            opColor.bg, opColor.text,
          )}>
            {op}
          </span>
        )}

        {/* Label + metadata */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono truncate text-surface-700 dark:text-surface-300">
            {displayLabel}
          </p>

          {/* Condition / loop expression */}
          {isBranching && (node.condition || node.expression) && (
            <p className="text-2xs font-mono mt-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 truncate max-w-full" title={node.condition || node.expression || ''}>
              {node.condition || node.expression}
            </p>
          )}

          {/* Expression for SET/DECLARE */}
          {!isBranching && node.expression && node.expression !== displayLabel && (
            <p className="text-2xs font-mono mt-0.5 text-surface-500 truncate" title={node.expression}>
              {node.expression}
            </p>
          )}

          {/* Metadata pills row */}
          {(tables.length > 0 || varsRead.length > 0 || varsWritten.length > 0 || targetProc) && (
            <div className="flex flex-wrap gap-1 mt-1">
              {targetProc && (
                <span className="inline-flex items-center gap-0.5 text-2xs px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-500 font-mono">
                  <ArrowRight className="w-2.5 h-2.5" />
                  {targetProc}
                </span>
              )}
              {tables.map(t => (
                <span key={t} className="inline-flex items-center gap-0.5 text-2xs px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-500 font-mono">
                  <Table2 className="w-2.5 h-2.5" />
                  {t}
                </span>
              ))}
              {varsWritten.map(v => (
                <span key={`w-${v}`} className="inline-flex items-center gap-0.5 text-2xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-500 font-mono">
                  <Variable className="w-2.5 h-2.5" />
                  {v} =
                </span>
              ))}
              {varsRead.map(v => (
                <span key={`r-${v}`} className="inline-flex items-center gap-0.5 text-2xs px-1.5 py-0.5 rounded bg-surface-300/30 text-surface-500 font-mono">
                  {v}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* SQL snippet toggle */}
        {node.sqlSnippet && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowSnippet(!showSnippet); }}
            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-200/60 text-surface-400 hover:text-surface-600 transition-all flex-shrink-0"
            title="SQL"
          >
            <Code className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* SQL Snippet expanded */}
      {showSnippet && node.sqlSnippet && (
        <div className="ml-6 mt-1 mb-1 relative">
          <div className="code-block p-2.5 rounded-lg text-[11px] font-mono whitespace-pre-wrap max-h-40 overflow-auto bg-surface-900 text-surface-200 dark:bg-surface-800">
            {node.sqlSnippet}
          </div>
          <button
            onClick={() => ctx.copySnippet(node.nodeId, node.sqlSnippet!)}
            className="absolute top-1.5 right-1.5 p-1 rounded bg-surface-700/80 hover:bg-surface-600 text-surface-300 transition-colors"
            title="Copy SQL"
          >
            {ctx.copiedId === node.nodeId
              ? <Check className="w-3 h-3 text-emerald-400" />
              : <Copy className="w-3 h-3" />}
          </button>
        </div>
      )}

      {/* Nested content (branches / children) */}
      {isExpanded && hasNested && (
        <div className="animate-fade-in">
          {isBranching ? (
            <BranchingContent node={node} depth={depth} />
          ) : (
            <FlowBranch nodes={node.children} depth={depth + 1} />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Branching content for conditions, loops, error handlers ── */

function BranchingContent({ node, depth }: { node: FlowTreeNode; depth: number }) {
  if (node.nodeType === 'condition') {
    return (
      <>
        {/* THEN branch */}
        {node.trueBranch && node.trueBranch.children.length > 0 && (
          <div className="mt-0.5">
            <div className="flex items-center gap-1.5 ml-4 pl-3 py-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="text-2xs font-semibold text-emerald-500 uppercase">THEN</span>
              <span className="text-2xs text-surface-400">({node.trueBranch.children.length})</span>
            </div>
            <FlowBranch nodes={node.trueBranch.children} depth={depth + 1} />
          </div>
        )}
        {/* ELSE branch */}
        {node.falseBranch && node.falseBranch.children.length > 0 && (
          <div className="mt-0.5">
            <div className="flex items-center gap-1.5 ml-4 pl-3 py-1">
              <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
              <span className="text-2xs font-semibold text-red-500 uppercase">ELSE</span>
              <span className="text-2xs text-surface-400">({node.falseBranch.children.length})</span>
            </div>
            <FlowBranch nodes={node.falseBranch.children} depth={depth + 1} />
          </div>
        )}
        {/* Direct children (shouldn't happen for conditions, but handle gracefully) */}
        {node.children.length > 0 && (
          <FlowBranch nodes={node.children} depth={depth + 1} />
        )}
      </>
    );
  }

  if (node.nodeType === 'loop') {
    return (
      <div className="mt-0.5">
        <div className="flex items-center gap-1.5 ml-4 pl-3 py-1">
          <RotateCcw className="w-3 h-3 text-purple-500" />
          <span className="text-2xs font-semibold text-purple-500 uppercase">Loop body</span>
          <span className="text-2xs text-surface-400">({node.children.length})</span>
        </div>
        <FlowBranch nodes={node.children} depth={depth + 1} />
      </div>
    );
  }

  if (node.nodeType === 'error_handler') {
    return (
      <>
        {/* TRY body */}
        {node.trueBranch && node.trueBranch.children.length > 0 && (
          <div className="mt-0.5">
            <div className="flex items-center gap-1.5 ml-4 pl-3 py-1">
              <Shield className="w-3 h-3 text-blue-500" />
              <span className="text-2xs font-semibold text-blue-500 uppercase">TRY</span>
              <span className="text-2xs text-surface-400">({node.trueBranch.children.length})</span>
            </div>
            <FlowBranch nodes={node.trueBranch.children} depth={depth + 1} />
          </div>
        )}
        {/* CATCH body */}
        {node.falseBranch && node.falseBranch.children.length > 0 && (
          <div className="mt-0.5">
            <div className="flex items-center gap-1.5 ml-4 pl-3 py-1">
              <Shield className="w-3 h-3 text-red-500" />
              <span className="text-2xs font-semibold text-red-500 uppercase">CATCH</span>
              <span className="text-2xs text-surface-400">({node.falseBranch.children.length})</span>
            </div>
            <FlowBranch nodes={node.falseBranch.children} depth={depth + 1} />
          </div>
        )}
        {/* Direct children */}
        {node.children.length > 0 && (
          <FlowBranch nodes={node.children} depth={depth + 1} />
        )}
      </>
    );
  }

  // Fallback: just render children
  return <FlowBranch nodes={node.children} depth={depth + 1} />;
}
