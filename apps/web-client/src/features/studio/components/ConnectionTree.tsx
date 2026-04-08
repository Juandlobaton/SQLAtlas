import { useState } from 'react';
import {
  Database, ChevronDown, ChevronRight, Search, Workflow,
  Zap, Eye, Table2, AlertTriangle, Loader2,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useConnections } from '@/shared/hooks/useConnections';
import { useProcedures, type ProcedureItem } from '@/shared/hooks/useAnalysis';

/* ── Types for tree interaction ── */

interface ProcedureOpenPayload {
  id: string;
  objectName: string;
  connectionId: string;
  schemaName: string;
  objectType: string;
}

interface ConnectionTreeProps {
  onOpenProcedure: (proc: ProcedureOpenPayload) => void;
  onOpenSingleton: (item: { id: string; type: string; label: string; icon: string }) => void;
}

/* ── Object type icons ── */
const TYPE_ICONS: Record<string, typeof Workflow> = {
  PROCEDURE: Workflow,
  FUNCTION: Zap,
  TRIGGER: AlertTriangle,
  VIEW: Eye,
};

/* ── CC badge colors ── */
function ccColor(cc: number | null): string {
  if (!cc || cc <= 5) return 'bg-emerald-500/15 text-emerald-600';
  if (cc <= 10) return 'bg-amber-500/15 text-amber-600';
  if (cc <= 20) return 'bg-orange-500/15 text-orange-600';
  return 'bg-red-500/15 text-red-600';
}

/* ── Connection section with expandable schemas ── */

function ConnectionSection({ connectionId, connectionName, engine, onOpenProcedure }: {
  connectionId: string;
  connectionName: string;
  engine: string;
  onOpenProcedure: ConnectionTreeProps['onOpenProcedure'];
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useProcedures(
    expanded ? connectionId : null,
    { limit: 500, search: search || undefined },
  );
  const procedures = data?.items ?? [];

  // Group by schema
  const schemas = new Map<string, ProcedureItem[]>();
  for (const proc of procedures) {
    const key = proc.schemaName || 'default';
    if (!schemas.has(key)) schemas.set(key, []);
    schemas.get(key)!.push(proc);
  }

  return (
    <div>
      {/* Connection header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3 text-surface-400" /> : <ChevronRight className="w-3 h-3 text-surface-400" />}
        <Database className="w-3.5 h-3.5 text-brand-500" />
        <span className="font-medium text-surface-700 dark:text-surface-300 truncate flex-1 text-left">{connectionName}</span>
        <span className="text-[9px] text-surface-400 flex-shrink-0">{engine}</span>
      </button>

      {expanded && (
        <div className="ml-2">
          {/* Search within connection */}
          <div className="px-2 py-1">
            <div className="relative">
              <Search className="w-3 h-3 text-surface-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                className="input text-[10px] pl-6 py-1 w-full"
                placeholder="Filter..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-3 h-3 animate-spin text-surface-400" />
            </div>
          )}

          {/* Schema groups */}
          {[...schemas.entries()].map(([schemaName, procs]) => (
            <SchemaGroup
              key={schemaName}
              schemaName={schemaName}
              procedures={procs}
              connectionId={connectionId}
              onOpenProcedure={onOpenProcedure}
            />
          ))}

          {!isLoading && procedures.length === 0 && (
            <p className="text-[10px] text-surface-400 text-center py-2">No objects</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Schema group with procedure list ── */

function SchemaGroup({ schemaName, procedures, connectionId, onOpenProcedure }: {
  schemaName: string;
  procedures: ProcedureItem[];
  connectionId: string;
  onOpenProcedure: ConnectionTreeProps['onOpenProcedure'];
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
      >
        {expanded ? <ChevronDown className="w-2.5 h-2.5 text-surface-400" /> : <ChevronRight className="w-2.5 h-2.5 text-surface-400" />}
        <span className="font-semibold text-surface-500 uppercase tracking-wider">{schemaName}</span>
        <span className="text-surface-400 ml-auto">{procedures.length}</span>
      </button>

      {expanded && (
        <div className="ml-1">
          {procedures.map((proc) => (
            <ProcedureRow
              key={proc.id}
              proc={proc}
              connectionId={connectionId}
              onOpen={onOpenProcedure}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Single procedure row with expandable preview ── */

function ProcedureRow({ proc, connectionId, onOpen }: {
  proc: ProcedureItem;
  connectionId: string;
  onOpen: ConnectionTreeProps['onOpenProcedure'];
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TYPE_ICONS[proc.objectType] || Workflow;
  const cc = proc.estimatedComplexity;
  const secCount = proc.securityFindings?.length ?? 0;
  const autoDoc = proc.autoDoc as Record<string, unknown> | null;
  const summary = autoDoc?.summary as string | undefined;
  const params = proc.parameters || [];
  // Extract tables from autoDoc.tablesAccessed
  const tables = ((autoDoc?.tablesAccessed ?? []) as { tableName: string }[]).map((t) => t.tableName);
  // Extract calls from autoDoc.sideEffects
  const calls = ((autoDoc?.sideEffects ?? []) as string[]).filter((s) => s.startsWith('Calls:'));

  return (
    <div>
      {/* Main row */}
      <div className="flex items-center group">
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-0.5 text-surface-400"
        >
          {expanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
        </button>
        <button
          onDoubleClick={() => onOpen({ id: proc.id, objectName: proc.objectName, connectionId, schemaName: proc.schemaName, objectType: proc.objectType })}
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center gap-1.5 px-1 py-1 text-[11px] hover:bg-surface-100 dark:hover:bg-surface-800 rounded transition-colors min-w-0"
        >
          <Icon className="w-3 h-3 text-surface-400 flex-shrink-0" />
          <span className="font-mono truncate text-surface-700 dark:text-surface-300">{proc.objectName}</span>
          <div className="flex items-center gap-1 ml-auto flex-shrink-0">
            {cc != null && (
              <span className={cn('text-[8px] px-1 py-0.5 rounded font-medium', ccColor(cc))}>{cc}</span>
            )}
            {secCount > 0 && (
              <span className="text-[8px] px-1 py-0.5 rounded bg-red-500/15 text-red-600">
                <AlertTriangle className="w-2 h-2 inline" /> {secCount}
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Expandable preview */}
      {expanded && (
        <div className="ml-6 pl-2 border-l border-surface-200 dark:border-surface-700 mb-1 space-y-0.5">
          {/* Params */}
          {params.length > 0 && (
            <p className="text-[9px] text-surface-500 font-mono truncate">
              {params.map((p) => `${p.name} ${p.dataType}`).join(', ')}
            </p>
          )}
          {/* Tables */}
          {tables.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Table2 className="w-2.5 h-2.5 text-cyan-500" />
              <span className="text-[9px] text-cyan-600 font-mono truncate">{tables.slice(0, 4).join(', ')}</span>
              {tables.length > 4 && <span className="text-[8px] text-surface-400">+{tables.length - 4}</span>}
            </div>
          )}
          {/* Calls */}
          {calls.length > 0 && (
            <p className="text-[9px] text-brand-500 font-mono truncate">{calls[0]}</p>
          )}
          {/* Summary */}
          {summary && (
            <p className="text-[9px] text-surface-400 line-clamp-2">{summary}</p>
          )}
          {/* Quick open */}
          <button
            onClick={() => onOpen({ id: proc.id, objectName: proc.objectName, connectionId, schemaName: proc.schemaName, objectType: proc.objectType })}
            className="text-[9px] text-brand-500 hover:text-brand-600 font-medium"
          >
            Open flow →
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main ConnectionTree component ── */

export function ConnectionTree({ onOpenProcedure, onOpenSingleton }: ConnectionTreeProps) {
  const { data: connections = [], isLoading } = useConnections();

  return (
    <div className="text-xs">
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-4 h-4 animate-spin text-surface-400" />
        </div>
      )}

      {!isLoading && connections.length === 0 && (
        <div className="p-3 text-center">
          <Database className="w-8 h-8 text-surface-200 mx-auto mb-2" />
          <p className="text-[11px] text-surface-400 mb-2">No connections yet</p>
          <button
            onClick={() => onOpenSingleton({ id: 'tab-connections', type: 'connections', label: 'Connections', icon: 'connections' })}
            className="text-[10px] text-brand-500 hover:text-brand-600 font-medium"
          >
            Add connection →
          </button>
        </div>
      )}

      {connections.map((conn) => (
        <ConnectionSection
          key={conn.id}
          connectionId={conn.id}
          connectionName={conn.name}
          engine={conn.engine}
          onOpenProcedure={onOpenProcedure}
        />
      ))}
    </div>
  );
}
