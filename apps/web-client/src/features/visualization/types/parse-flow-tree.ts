import type { FlowTreeNode, FlowNodeType } from './flow-tree';

const VALID_NODE_TYPES = new Set<string>([
  'start', 'end', 'statement', 'condition', 'loop',
  'call', 'return', 'error_handler', 'branch',
]);

/**
 * Safely parse an unknown value into a FlowTreeNode.
 * Validates structure recursively, defaults missing arrays, returns null on invalid input.
 * Replaces unsafe `as unknown as FlowTreeNode` casts.
 */
export function parseFlowTree(raw: unknown): FlowTreeNode | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.nodeId !== 'string' || !obj.nodeId) return null;
  if (typeof obj.nodeType !== 'string' || !VALID_NODE_TYPES.has(obj.nodeType)) return null;

  return {
    nodeId: obj.nodeId,
    nodeType: obj.nodeType as FlowNodeType,
    label: typeof obj.label === 'string' ? obj.label : '',
    lineNumber: typeof obj.lineNumber === 'number' ? obj.lineNumber : null,
    condition: typeof obj.condition === 'string' ? obj.condition : null,
    operation: typeof obj.operation === 'string' ? obj.operation : null,
    expression: typeof obj.expression === 'string' ? obj.expression : null,
    targetProcedure: typeof obj.targetProcedure === 'string' ? obj.targetProcedure : null,
    affectedTables: Array.isArray(obj.affectedTables) ? obj.affectedTables.filter((t): t is string => typeof t === 'string') : [],
    variablesRead: Array.isArray(obj.variablesRead) ? obj.variablesRead.filter((v): v is string => typeof v === 'string') : [],
    variablesWritten: Array.isArray(obj.variablesWritten) ? obj.variablesWritten.filter((v): v is string => typeof v === 'string') : [],
    sqlSnippet: typeof obj.sqlSnippet === 'string' ? obj.sqlSnippet : null,
    children: Array.isArray(obj.children) ? obj.children.map(parseFlowTree).filter((n): n is FlowTreeNode => n !== null) : [],
    trueBranch: obj.trueBranch ? parseFlowTree(obj.trueBranch) : null,
    falseBranch: obj.falseBranch ? parseFlowTree(obj.falseBranch) : null,
  };
}
