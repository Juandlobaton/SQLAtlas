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

/* ── Dagre layout engine ── */

const NODE_WIDTH = 200;
const NODE_HEIGHT = 70;
const CONDITION_WIDTH = 140;
const CONDITION_HEIGHT = 90;

function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80, marginx: 40, marginy: 40 });

  for (const node of nodes) {
    const isCondition = node.type === 'condition';
    const isSmall = node.type === 'start' || node.type === 'end';
    g.setNode(node.id, {
      width: isSmall ? 50 : isCondition ? CONDITION_WIDTH : NODE_WIDTH,
      height: isSmall ? 50 : isCondition ? CONDITION_HEIGHT : NODE_HEIGHT,
    });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    const isCondition = node.type === 'condition';
    const isSmall = node.type === 'start' || node.type === 'end';
    const w = isSmall ? 50 : isCondition ? CONDITION_WIDTH : NODE_WIDTH;
    const h = isSmall ? 50 : isCondition ? CONDITION_HEIGHT : NODE_HEIGHT;
    return { ...node, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });
}

/* ── Convert FlowTreeNode → React Flow nodes/edges ── */

interface ConvertResult {
  nodes: Node[];
  edges: Edge[];
}

function convertFlowTree(
  tree: FlowTreeNode,
  onDrillDown?: (name: string) => void,
): ConvertResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let edgeId = 0;

  function addEdge(source: string, target: string, label?: string, sourceHandle?: string) {
    edges.push({
      id: `e-${edgeId++}`,
      source,
      target,
      sourceHandle,
      label,
      type: 'smoothstep',
      style: { strokeWidth: 1.5, stroke: '#94a3b8' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8', width: 16, height: 16 },
      labelStyle: { fontSize: 9, fill: '#64748b' },
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

  function processNode(node: FlowTreeNode, parentId: string | null): string {
    const type = mapNodeType(node);

    // Skip branch wrappers — process their children directly
    if (node.nodeType === 'branch') {
      let lastId = parentId;
      for (const child of node.children) {
        const childId = processNode(child, lastId);
        lastId = childId;
      }
      return lastId || parentId || '';
    }

    const rfNode: Node = {
      id: node.nodeId,
      type,
      position: { x: 0, y: 0 }, // dagre will compute
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
    };
    nodes.push(rfNode);

    if (parentId) {
      addEdge(parentId, node.nodeId);
    }

    // Handle condition branches
    if (node.nodeType === 'condition') {
      if (node.trueBranch?.children?.length) {
        let lastTrue: string = node.nodeId;
        for (const child of node.trueBranch.children) {
          const childId = processNode(child, lastTrue === node.nodeId ? null : lastTrue);
          if (lastTrue === node.nodeId) {
            addEdge(node.nodeId, childId, 'TRUE', 'true');
          }
          lastTrue = childId;
        }
      }
      if (node.falseBranch?.children?.length) {
        let lastFalse: string = node.nodeId;
        for (const child of node.falseBranch.children) {
          const childId = processNode(child, lastFalse === node.nodeId ? null : lastFalse);
          if (lastFalse === node.nodeId) {
            addEdge(node.nodeId, childId, 'FALSE', 'false');
          }
          lastFalse = childId;
        }
      }
    }

    // Handle loop body
    if (node.nodeType === 'loop' && node.children.length > 0) {
      let lastLoop = node.nodeId;
      for (const child of node.children) {
        const childId = processNode(child, lastLoop === node.nodeId ? null : lastLoop);
        if (lastLoop === node.nodeId) {
          addEdge(node.nodeId, childId, 'body');
        }
        lastLoop = childId;
      }
    }

    // Handle error handler (TRY/CATCH)
    if (node.nodeType === 'error_handler') {
      if (node.trueBranch?.children?.length) {
        let lastTry = node.nodeId;
        for (const child of node.trueBranch.children) {
          const childId = processNode(child, lastTry === node.nodeId ? null : lastTry);
          if (lastTry === node.nodeId) {
            addEdge(node.nodeId, childId, 'TRY');
          }
          lastTry = childId;
        }
      }
      if (node.falseBranch?.children?.length) {
        let lastCatch = node.nodeId;
        for (const child of node.falseBranch.children) {
          const childId = processNode(child, lastCatch === node.nodeId ? null : lastCatch);
          if (lastCatch === node.nodeId) {
            addEdge(node.nodeId, childId, 'CATCH');
          }
          lastCatch = childId;
        }
      }
    }

    // Handle sequential children (for start node, generic statements)
    if (node.nodeType !== 'condition' && node.nodeType !== 'loop' && node.nodeType !== 'error_handler') {
      let lastChild = node.nodeId;
      for (const child of node.children) {
        const childId = processNode(child, lastChild === node.nodeId ? null : lastChild);
        if (lastChild === node.nodeId) {
          addEdge(node.nodeId, childId);
        }
        lastChild = childId;
      }
    }

    return node.nodeId;
  }

  processNode(tree, null);

  return { nodes, edges };
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
  const { nodes: rawNodes, edges: rawEdges } = useMemo(
    () => convertFlowTree(flowTree, onDrillDown),
    [flowTree, onDrillDown],
  );

  const positioned = useMemo(() => layoutNodes(rawNodes, rawEdges), [rawNodes, rawEdges]);
  const [nodes, , onNodesChange] = useNodesState(positioned);
  const [edges, , onEdgesChange] = useEdgesState(rawEdges);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2.5}
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
    </div>
  );
}
