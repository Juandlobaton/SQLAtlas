import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Play, Square, GitBranch, RotateCw, PhoneCall, ShieldAlert,
  Table2, Code,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/* ── Shared data shape ── */

export interface FlowNodeData {
  [key: string]: unknown;
  label: string;
  operation: string;
  nodeType: string;
  condition?: string | null;
  expression?: string | null;
  tables?: string[];
  varsRead?: string[];
  varsWritten?: string[];
  targetProcedure?: string | null;
  sqlSnippet?: string | null;
  lineNumber?: number | null;
  onDrillDown?: (procName: string) => void;
}

/* ── Style maps ── */

const OP_BG: Record<string, string> = {
  SELECT: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40',
  INSERT: 'border-blue-400 bg-blue-50 dark:bg-blue-950/40',
  UPDATE: 'border-amber-400 bg-amber-50 dark:bg-amber-950/40',
  DELETE: 'border-red-400 bg-red-50 dark:bg-red-950/40',
  MERGE: 'border-purple-400 bg-purple-50 dark:bg-purple-950/40',
  DECLARE: 'border-slate-300 bg-slate-50 dark:bg-slate-900/40',
  SET: 'border-slate-300 bg-slate-50 dark:bg-slate-900/40',
  EXEC: 'border-brand-400 bg-brand-50 dark:bg-brand-950/40',
  IF: 'border-amber-500 bg-amber-50 dark:bg-amber-950/40',
  'ELSE IF': 'border-amber-500 bg-amber-50 dark:bg-amber-950/40',
  WHILE: 'border-purple-500 bg-purple-50 dark:bg-purple-950/40',
  FOR: 'border-purple-500 bg-purple-50 dark:bg-purple-950/40',
  TRY: 'border-blue-500 bg-blue-50 dark:bg-blue-950/40',
  RETURN: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40',
  RAISERROR: 'border-red-500 bg-red-50 dark:bg-red-950/40',
  THROW: 'border-red-500 bg-red-50 dark:bg-red-950/40',
  'BEGIN TRANSACTION': 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40',
  COMMIT: 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40',
  ROLLBACK: 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40',
  TRUNCATE: 'border-red-300 bg-red-50 dark:bg-red-950/40',
};

const OP_BADGE: Record<string, string> = {
  SELECT: 'bg-emerald-500 text-white',
  INSERT: 'bg-blue-500 text-white',
  UPDATE: 'bg-amber-500 text-white',
  DELETE: 'bg-red-500 text-white',
  MERGE: 'bg-purple-500 text-white',
  EXEC: 'bg-brand-600 text-white',
  IF: 'bg-amber-500 text-white',
  'ELSE IF': 'bg-amber-500 text-white',
  WHILE: 'bg-purple-500 text-white',
  FOR: 'bg-purple-500 text-white',
  TRY: 'bg-blue-500 text-white',
  RETURN: 'bg-emerald-600 text-white',
  DECLARE: 'bg-slate-400 text-white',
  SET: 'bg-slate-400 text-white',
};

const DEFAULT_BG = 'border-surface-300 bg-surface-50 dark:bg-surface-900/40';

/* ── Start Node (circle, green) ── */

export const StartNode = memo(function StartNode() {
  return (
    <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-md">
      <Play className="w-4 h-4 text-white fill-white" />
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-600 !w-2 !h-2" />
    </div>
  );
});

/* ── End Node (circle, red) ── */

export const EndNode = memo(function EndNode() {
  return (
    <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center shadow-md ring-2 ring-red-300">
      <Square className="w-3.5 h-3.5 text-white fill-white" />
      <Handle type="target" position={Position.Top} className="!bg-red-600 !w-2 !h-2" />
    </div>
  );
});

/* ── Condition Node (diamond) ── */

export const ConditionNode = memo(function ConditionNode({ data }: { data: FlowNodeData }) {
  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="!bg-amber-600 !w-2 !h-2" />
      <div className="w-32 h-20 rotate-45 border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/40 shadow-sm flex items-center justify-center">
        <div className="-rotate-45 text-center px-1 max-w-[110px]">
          <GitBranch className="w-3.5 h-3.5 mx-auto text-amber-600 mb-0.5" />
          <p className="text-[9px] font-mono text-amber-800 dark:text-amber-300 leading-tight truncate">
            {data.condition || data.label || 'IF'}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} id="default" className="!bg-amber-600 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} id="true" className="!bg-emerald-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Left} id="false" className="!bg-red-500 !w-2 !h-2" />
    </div>
  );
});

/* ── Loop Node (rounded with loop icon) ── */

export const LoopNode = memo(function LoopNode({ data }: { data: FlowNodeData }) {
  return (
    <div className={cn('rounded-xl border-2 px-3 py-2 min-w-[160px] max-w-[260px] shadow-sm', OP_BG[data.operation] || DEFAULT_BG)}>
      <Handle type="target" position={Position.Top} className="!bg-purple-600 !w-2 !h-2" />
      <div className="flex items-center gap-1.5">
        <RotateCw className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
        <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded', OP_BADGE[data.operation] || 'bg-surface-400 text-white')}>
          {data.operation}
        </span>
      </div>
      {data.condition && (
        <p className="text-[10px] font-mono text-surface-600 dark:text-surface-400 mt-1 truncate">{data.condition}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-purple-600 !w-2 !h-2" />
    </div>
  );
});

/* ── Call Node (double-border, drill-down) ── */

export const CallNode = memo(function CallNode({ data }: { data: FlowNodeData }) {
  const target = data.targetProcedure || data.label;
  return (
    <div
      className="rounded-lg border-2 border-brand-500 bg-brand-50 dark:bg-brand-950/30 px-3 py-2 min-w-[160px] max-w-[260px] shadow-sm ring-2 ring-brand-200 dark:ring-brand-800 cursor-pointer hover:ring-brand-400 transition-all"
      onDoubleClick={() => data.onDrillDown?.(target)}
    >
      <Handle type="target" position={Position.Top} className="!bg-brand-600 !w-2 !h-2" />
      <div className="flex items-center gap-1.5">
        <PhoneCall className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />
        <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded', OP_BADGE.EXEC)}>EXEC</span>
      </div>
      <p className="text-[11px] font-mono font-medium text-brand-700 dark:text-brand-300 mt-1 truncate">{target}</p>
      <p className="text-[8px] text-brand-400 mt-0.5">Double-click to open</p>
      <Handle type="source" position={Position.Bottom} className="!bg-brand-600 !w-2 !h-2" />
    </div>
  );
});

/* ── Error Handler Node ── */

export const ErrorHandlerNode = memo(function ErrorHandlerNode({ data }: { data: FlowNodeData }) {
  return (
    <div className="rounded-lg border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 min-w-[160px] max-w-[260px] shadow-sm">
      <Handle type="target" position={Position.Top} className="!bg-blue-600 !w-2 !h-2" />
      <div className="flex items-center gap-1.5">
        <ShieldAlert className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500 text-white">TRY / CATCH</span>
      </div>
      <p className="text-[10px] text-surface-600 dark:text-surface-400 mt-1 truncate">{data.label}</p>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-600 !w-2 !h-2" />
    </div>
  );
});

/* ── Statement Node (generic — SELECT, INSERT, UPDATE, DELETE, SET, DECLARE, etc.) ── */

export const StatementNode = memo(function StatementNode({ data }: { data: FlowNodeData }) {
  const [showSql, setShowSql] = useState(false);
  const op = data.operation || '';
  const tables = data.tables || [];

  return (
    <div className={cn('rounded-lg border-2 px-3 py-2 min-w-[160px] max-w-[280px] shadow-sm', OP_BG[op] || DEFAULT_BG)}>
      <Handle type="target" position={Position.Top} className="!bg-surface-500 !w-2 !h-2" />

      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0', OP_BADGE[op] || 'bg-surface-400 text-white')}>
            {op || 'SQL'}
          </span>
          {data.lineNumber && (
            <span className="text-[8px] text-surface-400 font-mono">L{data.lineNumber}</span>
          )}
        </div>
        {data.sqlSnippet && (
          <button onClick={() => setShowSql(!showSql)} className="p-0.5 rounded hover:bg-surface-200/60 text-surface-400 hover:text-surface-600">
            <Code className="w-3 h-3" />
          </button>
        )}
      </div>

      <p className="text-[10px] font-mono text-surface-700 dark:text-surface-300 mt-1 truncate" title={data.label}>
        {data.label}
      </p>

      {tables.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {tables.slice(0, 3).map((t) => (
            <span key={t} className="inline-flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-600 font-mono">
              <Table2 className="w-2 h-2" />{t}
            </span>
          ))}
          {tables.length > 3 && <span className="text-[8px] text-surface-400">+{tables.length - 3}</span>}
        </div>
      )}

      {showSql && data.sqlSnippet && (
        <pre className="mt-1.5 text-[8px] font-mono bg-surface-900 text-surface-200 p-1.5 rounded overflow-x-auto max-h-16 whitespace-pre-wrap">
          {data.sqlSnippet}
        </pre>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-surface-500 !w-2 !h-2" />
    </div>
  );
});

/* ── Node type registry ── */

export const nodeTypes = {
  start: StartNode,
  end: EndNode,
  statement: StatementNode,
  condition: ConditionNode,
  loop: LoopNode,
  call: CallNode,
  error_handler: ErrorHandlerNode,
};
