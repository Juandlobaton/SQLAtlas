import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { nodeTypes } from './FlowNodes';
import type { FlowTreeNode } from '@/features/visualization/types/flow-tree';

interface PipelineCanvasProps {
  flowTree: FlowTreeNode;
  onDrillDown?: (procedureName: string) => void;
}

/* ── Layout constants ── */

const NODE_WIDTH = 240;
const NODE_HEIGHT = 80;
const CONDITION_WIDTH = 160;
const CONDITION_HEIGHT = 160;
const CALL_WIDTH = 260;

/*
 * Edge weight strategy (dagre: higher weight = more vertical/direct)
 *
 * Convention: TRUE → RIGHT, FALSE → DOWN (ISO 5807 adapted for SQL)
 *
 *  - W_SIDE = 1  → side branches: TRUE exits, CATCH, full-ELSE
 *  - W_MAIN = 5  → vertical continuation: FALSE chain, TRY body
 *  - W_SEQ  = 3  → normal sequential flow, loop body
 *
 * With dagre align:'UL', low-weight edges naturally go RIGHT.
 * This eliminates the need for complex post-processing.
 */
const W_SIDE = 1;
const W_MAIN = 5;
const W_SEQ  = 3;

/* ── Dagre layout engine ── */

interface BranchEntry {
  trueIds: Set<string>;
  falseIds: Set<string>;
}

function nodeWidth(node: Node): number {
  if (node.type === 'start' || node.type === 'end') return 50;
  if (node.type === 'condition') return CONDITION_WIDTH;
  if (node.type === 'call' || node.type === 'error_handler') return CALL_WIDTH;
  return NODE_WIDTH;
}

function nodeHeight(node: Node): number {
  if (node.type === 'start' || node.type === 'end') return 50;
  if (node.type === 'condition') return CONDITION_HEIGHT;
  return NODE_HEIGHT;
}

function layoutNodes(
  nodes: Node[],
  edges: Edge[],
  branchInfo?: Map<string, BranchEntry>,
  loopBodyMap?: Map<string, Set<string>>,
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 120, ranksep: 120, marginx: 50, marginy: 50, align: 'UL' });

  for (const node of nodes) {
    const isSmall = node.type === 'start' || node.type === 'end';
    const isCondition = node.type === 'condition';
    const isWide = node.type === 'call' || node.type === 'error_handler';
    g.setNode(node.id, {
      width: isSmall ? 50 : isCondition ? CONDITION_WIDTH : isWide ? CALL_WIDTH : NODE_WIDTH,
      height: isSmall ? 50 : isCondition ? CONDITION_HEIGHT : NODE_HEIGHT,
    });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target, {
      weight: (edge.data as any)?.weight ?? 1,
    });
  }

  dagre.layout(g);

  const positioned = nodes.map((node) => {
    const pos = g.node(node.id);
    const w = nodeWidth(node);
    const isSmall = node.type === 'start' || node.type === 'end';
    const h = isSmall ? 50 : node.type === 'condition' ? CONDITION_HEIGHT : NODE_HEIGHT;
    return { ...node, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });

  /*
   * Minimal post-processing: only for full IF/ELSE (both branches as side branches).
   * Ensure TRUE is to the RIGHT and FALSE is to the LEFT.
   * IF/ELSE IF chains and single-branch cases are handled natively by dagre.
   */
  if (branchInfo) {
    for (const [, info] of branchInfo) {
      if (info.trueIds.size === 0 || info.falseIds.size === 0) continue;

      const trueNodes = positioned.filter(n => info.trueIds.has(n.id));
      const falseNodes = positioned.filter(n => info.falseIds.has(n.id));
      if (trueNodes.length === 0 || falseNodes.length === 0) continue;

      const trueAvgX = trueNodes.reduce((s, n) => s + n.position.x, 0) / trueNodes.length;
      const falseAvgX = falseNodes.reduce((s, n) => s + n.position.x, 0) / falseNodes.length;

      // TRUE should be RIGHT (higher X) — if dagre placed it LEFT, swap
      if (trueAvgX < falseAvgX) {
        const delta = falseAvgX - trueAvgX;
        for (const n of trueNodes) n.position.x += delta;
        for (const n of falseNodes) n.position.x -= delta;
      }
    }
  }

  // Create visual background rectangles for WHILE/FOR loop bodies
  if (loopBodyMap) {
    const PAD = 28;
    for (const [loopId, bodyIds] of loopBodyMap) {
      const loopNode = positioned.find(n => n.id === loopId);
      if (!loopNode) continue;

      const bodyNodes = positioned.filter(n => bodyIds.has(n.id));
      if (bodyNodes.length === 0) continue;

      const allNodes = [loopNode, ...bodyNodes];
      const minX = Math.min(...allNodes.map(n => n.position.x)) - PAD;
      const minY = loopNode.position.y - PAD;
      const maxX = Math.max(...allNodes.map(n => n.position.x + nodeWidth(n))) + PAD;
      const maxY = Math.max(...allNodes.map(n => n.position.y + nodeHeight(n))) + PAD;

      positioned.unshift({
        id: `${loopId}-bg`,
        type: 'loopBackground',
        position: { x: minX, y: minY },
        style: { width: maxX - minX, height: maxY - minY },
        data: { label: '' },
        zIndex: -1,
        selectable: false,
        draggable: false,
      } as Node);
    }
  }

  return positioned;
}

/* ── Convert FlowTreeNode → React Flow nodes/edges ── */

interface ConvertResult {
  nodes: Node[];
  edges: Edge[];
  branchInfo: Map<string, BranchEntry>;
  loopBodyMap: Map<string, Set<string>>;
}

function convertFlowTree(
  tree: FlowTreeNode,
  onDrillDown?: (name: string) => void,
): ConvertResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let edgeId = 0;
  const branchInfo = new Map<string, BranchEntry>();
  const loopBodyMap = new Map<string, Set<string>>();

  function addEdge(source: string, target: string, label?: string, sourceHandle?: string, weight?: number) {
    const isTry   = label === 'TRY';
    const isCatch = label === 'CATCH';
    const isTrue  = label === 'TRUE';
    const isFalse = label === 'FALSE';

    let stroke = '#94a3b8';
    if (isTrue || isTry)    stroke = '#10b981';
    if (isFalse || isCatch) stroke = '#ef4444';

    let labelFill = '#475569';
    if (isTrue || isTry)    labelFill = '#059669';
    if (isFalse || isCatch) labelFill = '#dc2626';

    edges.push({
      id: `e-${edgeId++}`,
      source,
      target,
      sourceHandle,
      label,
      type: 'smoothstep',
      style: { strokeWidth: 1.5, stroke },
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 16, height: 16 },
      labelStyle: { fontSize: 10, fill: labelFill, fontWeight: 600 },
      data: { weight: weight ?? 1 },
    });
  }

  function mapNodeType(node: FlowTreeNode): string {
    if (node.nodeType === 'condition') return 'condition';
    if (node.nodeType === 'loop') return 'loop';
    if (node.nodeType === 'call' || node.operation === 'EXEC') return 'call';
    if (node.nodeType === 'error_handler') return 'error_handler';
    if (node.nodeType === 'start') return 'start';
    if (node.nodeType === 'end') return 'end';
    return 'statement';
  }

  /** Detect IF/ELSE IF chain: falseBranch has a single condition child */
  function isElseIfChain(node: FlowTreeNode): boolean {
    const fb = node.falseBranch;
    if (!fb || fb.children.length === 0) return false;
    return fb.children.length === 1 && fb.children[0].nodeType === 'condition';
  }

  /*
   * processNode — recursive tree → graph converter
   *
   * collectIds propagation rules:
   *  - Conditions  → DO NOT propagate (each condition adjusts independently)
   *  - Loops       → propagate (body moves with loop)
   *  - Error handlers → propagate TRY + CATCH (whole block moves together)
   *  - Sequential  → propagate
   */
  function processNode(node: FlowTreeNode, parentId: string | null, collectIds?: Set<string>): string {
    const type = mapNodeType(node);

    if (node.nodeType === 'branch') {
      let lastId = parentId;
      for (const child of node.children) {
        const childId = processNode(child, lastId, collectIds);
        lastId = childId;
      }
      return lastId || parentId || '';
    }

    collectIds?.add(node.nodeId);

    nodes.push({
      id: node.nodeId,
      type,
      position: { x: 0, y: 0 },
      data: {
        label: node.label || '',
        operation: node.operation || '',
        nodeType: node.nodeType,
        condition: node.condition,
        expression: node.expression,
        tables: node.affectedTables || [],
        varsRead: node.variablesRead || [],
        varsWritten: node.variablesWritten || [],
        targetProcedure: node.targetProcedure,
        sqlSnippet: node.sqlSnippet,
        lineNumber: node.lineNumber,
        onDrillDown,
      },
    });

    if (parentId) {
      addEdge(parentId, node.nodeId, undefined, undefined, W_SEQ);
    }

    if (node.nodeType === 'condition') handleCondition(node);
    if (node.nodeType === 'loop') handleLoop(node, collectIds);
    if (node.nodeType === 'error_handler') handleErrorHandler(node, collectIds);

    if (node.nodeType !== 'condition' && node.nodeType !== 'loop' && node.nodeType !== 'error_handler') {
      handleSequentialChildren(node, collectIds);
    }

    return node.nodeId;
  }

  /* ── Condition handler ──
   *
   * Convention: TRUE → RIGHT (side branch), FALSE → DOWN (continuation)
   *
   * Cases:
   *  1. IF/ELSE IF chain → TRUE right (W_SIDE), FALSE down via "default" (W_MAIN)
   *  2. Full IF/ELSE     → TRUE right (W_SIDE), FALSE left via "false" (W_SIDE)
   *  3. IF only TRUE     → TRUE right (W_SIDE)
   *  4. IF only FALSE    → FALSE down via "default" (W_SEQ)
   */
  function handleCondition(node: FlowTreeNode) {
    const hasTrue  = (node.trueBranch?.children?.length ?? 0) > 0;
    const hasFalse = (node.falseBranch?.children?.length ?? 0) > 0;
    const isChain  = hasFalse && isElseIfChain(node);

    const trueIds  = new Set<string>();
    const falseIds = new Set<string>();

    // TRUE branch → RIGHT handle, low weight (dagre places it to the right naturally)
    if (hasTrue) {
      let last = node.nodeId;
      for (const child of node.trueBranch!.children) {
        const childId = processNode(child, last === node.nodeId ? null : last, trueIds);
        if (last === node.nodeId) {
          addEdge(node.nodeId, childId, 'TRUE', 'true', W_SIDE);
        }
        last = childId;
      }
    }

    // FALSE branch: routing depends on pattern
    if (hasFalse) {
      let last = node.nodeId;
      for (const child of node.falseBranch!.children) {
        const childId = processNode(child, last === node.nodeId ? null : last, falseIds);
        if (last === node.nodeId) {
          if (isChain || !hasTrue) {
            // Chain or only-FALSE: continue DOWN via bottom handle, high weight
            addEdge(node.nodeId, childId, 'FALSE', 'default', W_MAIN);
          } else {
            // Full IF/ELSE: FALSE goes LEFT via "false" handle, low weight
            addEdge(node.nodeId, childId, 'FALSE', 'false', W_SIDE);
          }
        }
        last = childId;
      }
    }

    // Store for minimal post-layout check (NO propagation to parent)
    branchInfo.set(node.nodeId, { trueIds, falseIds });
  }

  /* ── Loop handler (WHILE / FOR / cursor-fetch) ── */
  function handleLoop(node: FlowTreeNode, collectIds?: Set<string>) {
    if (node.children.length === 0) return;

    const bodyIds = new Set<string>();
    let last = node.nodeId;
    for (const child of node.children) {
      const childId = processNode(child, last === node.nodeId ? null : last, bodyIds);
      if (last === node.nodeId) {
        addEdge(node.nodeId, childId, 'body', undefined, W_SEQ);
      }
      last = childId;
    }

    // Propagate body IDs to parent collector
    if (collectIds) {
      for (const id of bodyIds) collectIds.add(id);
    }

    // Track for visual loop background
    loopBodyMap.set(node.nodeId, bodyIds);
  }

  /* ── Error handler (TRY/CATCH T-SQL · EXCEPTION Oracle/PG) ── */
  function handleErrorHandler(node: FlowTreeNode, collectIds?: Set<string>) {
    if (node.trueBranch?.children?.length) {
      let last = node.nodeId;
      for (const child of node.trueBranch.children) {
        const childId = processNode(child, last === node.nodeId ? null : last, collectIds);
        if (last === node.nodeId) {
          addEdge(node.nodeId, childId, 'TRY', 'try', W_MAIN);
        }
        last = childId;
      }
    }
    if (node.falseBranch?.children?.length) {
      let last = node.nodeId;
      for (const child of node.falseBranch.children) {
        const childId = processNode(child, last === node.nodeId ? null : last, collectIds);
        if (last === node.nodeId) {
          addEdge(node.nodeId, childId, 'CATCH', 'catch', W_SIDE);
        }
        last = childId;
      }
    }
  }

  /* ── Sequential children ── */
  function handleSequentialChildren(node: FlowTreeNode, collectIds?: Set<string>) {
    if (node.children.length === 0) return;
    let last = node.nodeId;
    for (const child of node.children) {
      const childId = processNode(child, last === node.nodeId ? null : last, collectIds);
      if (last === node.nodeId) {
        addEdge(node.nodeId, childId, undefined, undefined, W_SEQ);
      }
      last = childId;
    }
  }

  processNode(tree, null);
  return { nodes, edges, branchInfo, loopBodyMap };
}

/* ── MiniMap colors ── */

function minimapColor(node: Node) {
  switch (node.type) {
    case 'start': return '#10b981';
    case 'end': return '#ef4444';
    case 'condition': return '#f59e0b';
    case 'loop': return '#8b5cf6';
    case 'call': return '#3b82f6';
    case 'error_handler': return '#3b82f6';
    default: return '#94a3b8';
  }
}

/* ── Main Component ── */

export function PipelineCanvas({ flowTree, onDrillDown }: PipelineCanvasProps) {
  const { nodes: rawNodes, edges: rawEdges, branchInfo, loopBodyMap } = useMemo(
    () => convertFlowTree(flowTree, onDrillDown),
    [flowTree, onDrillDown],
  );

  const positioned = useMemo(
    () => layoutNodes(rawNodes, rawEdges, branchInfo, loopBodyMap),
    [rawNodes, rawEdges, branchInfo, loopBodyMap],
  );
  const [nodes, , onNodesChange] = useNodesState(positioned);
  const [edges, , onEdgesChange] = useEdgesState(rawEdges);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.05}
        maxZoom={2.5}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'smoothstep' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          nodeColor={minimapColor}
          maskColor="rgba(0,0,0,0.08)"
          position="bottom-right"
          style={{ width: 160, height: 100 }}
        />
      </ReactFlow>

      {/* Legend */}
      <div className="absolute top-3 left-3 glass rounded-lg px-3 py-2 text-[10px] space-y-1.5 pointer-events-none select-none">
        <p className="font-semibold text-surface-600 text-[11px]">Leyenda</p>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500" /> Inicio</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500" /> Fin</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rotate-45 border border-amber-500 bg-amber-50" style={{width:10,height:10}} /> Condición</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-brand-500" /> EXEC</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500" /> TRY/CATCH</span>
        </div>
        <div className="flex items-center gap-4 text-surface-500">
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-emerald-500" /> TRUE / TRY</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-red-500" /> FALSE / CATCH</span>
          <span>Rueda: desplazar</span>
          <span>Ctrl+Rueda: zoom</span>
          <span>Click botón EXEC: abrir SP</span>
        </div>
      </div>
    </div>
  );
}
