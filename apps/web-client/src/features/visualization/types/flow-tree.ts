export type FlowNodeType =
  | 'start'
  | 'end'
  | 'statement'
  | 'condition'
  | 'loop'
  | 'call'
  | 'return'
  | 'error_handler'
  | 'branch';

export interface FlowTreeNode {
  nodeId: string;
  nodeType: FlowNodeType;
  label: string;
  lineNumber?: number | null;
  condition?: string | null;
  operation?: string | null;
  expression?: string | null;
  targetProcedure?: string | null;
  affectedTables?: string[];
  variablesRead?: string[];
  variablesWritten?: string[];
  sqlSnippet?: string | null;
  children: FlowTreeNode[];
  trueBranch?: FlowTreeNode | null;
  falseBranch?: FlowTreeNode | null;
}
