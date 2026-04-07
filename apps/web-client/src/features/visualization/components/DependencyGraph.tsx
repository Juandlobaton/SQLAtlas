import { useEffect, useRef } from 'react';
import cytoscape, { Core, EventObject } from 'cytoscape';
import { GraphData, GraphNode } from '../hooks/useGraphData';

interface Props {
  data: GraphData;
  highlightedPath: Set<string>;
  onNodeSelect: (node: GraphNode | null) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  layout: string;
}

const TYPE_CONFIG: Record<string, { bg: string; border: string; shape: string; icon: string }> = {
  procedure: { bg: '#3b82f6', border: '#1d4ed8', shape: 'round-rectangle', icon: '{ }' },
  function:  { bg: '#8b5cf6', border: '#6d28d9', shape: 'round-rectangle', icon: 'fn' },
  trigger:   { bg: '#f59e0b', border: '#b45309', shape: 'rhomboid',        icon: '>>' },
  view:      { bg: '#06b6d4', border: '#0e7490', shape: 'barrel',          icon: '[]' },
  table:     { bg: '#10b981', border: '#047857', shape: 'rectangle',       icon: '#' },
  external:  { bg: '#ef4444', border: '#b91c1c', shape: 'diamond',         icon: '?' },
};

const EDGE_CONFIG: Record<string, { color: string; style: string; arrow: string }> = {
  calls:      { color: '#3b82f6', style: 'solid',  arrow: 'triangle' },
  reads_from: { color: '#10b981', style: 'solid',  arrow: 'circle' },
  writes_to:  { color: '#f59e0b', style: 'solid',  arrow: 'triangle-tee' },
  references: { color: '#8b5cf6', style: 'dashed', arrow: 'diamond' },
};

function riskColor(cc: number): string {
  if (cc <= 5) return '#10b981';
  if (cc <= 10) return '#eab308';
  if (cc <= 20) return '#f97316';
  return '#ef4444';
}

function buildElements(data: GraphData) {
  const nodes = data.nodes.map((n) => {
    const cfg = TYPE_CONFIG[n.objectType] || TYPE_CONFIG.procedure;
    const cc = n.complexity || 0;
    const size = Math.max(50, Math.min(90, 50 + cc * 1.5));
    return {
      data: {
        id: n.id,
        label: n.label.length > 22 ? n.label.slice(0, 20) + '...' : n.label,
        fullLabel: n.label,
        schema: n.schema,
        objectType: n.objectType,
        complexity: cc,
        riskLevel: n.riskLevel || 'low',
        securityIssues: n.securityIssues,
        lineCount: n.lineCount || 0,
        bgColor: cfg.bg,
        borderColor: n.securityIssues > 0 ? '#ef4444' : cfg.border,
        nodeShape: cfg.shape,
        typeIcon: cfg.icon,
        nodeWidth: size * 1.8,
        nodeHeight: size,
        riskColor: riskColor(cc),
      },
    };
  });

  const edges = data.edges.map((e) => {
    const cfg = EDGE_CONFIG[e.type] || EDGE_CONFIG.calls;
    return {
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        edgeType: e.type,
        isDynamic: e.isDynamic,
        confidence: e.confidence,
        edgeColor: e.isDynamic ? '#94a3b8' : cfg.color,
        lineStyle: e.isDynamic ? 'dashed' : cfg.style,
        arrowShape: cfg.arrow,
        edgeWidth: e.isDynamic ? 1.5 : 2.5,
        edgeLabel: e.type === 'calls' ? 'EXEC' : e.type === 'reads_from' ? 'READ' : e.type === 'writes_to' ? 'WRITE' : '',
      },
    };
  });

  return [...nodes, ...edges];
}

const LAYOUTS: Record<string, cytoscape.LayoutOptions> = {
  'etl-flow': {
    name: 'breadthfirst',
    directed: true,
    spacingFactor: 2.0,
    avoidOverlap: true,
    padding: 60,
    grid: true,
  } as any,
  hierarchical: {
    name: 'breadthfirst',
    directed: true,
    spacingFactor: 1.8,
    avoidOverlap: true,
    padding: 60,
    circle: false,
  } as any,
  concentric: {
    name: 'concentric',
    minNodeSpacing: 80,
    concentric: (node: any) => node.indegree() + node.outdegree(),
    levelWidth: () => 2,
    padding: 60,
  },
  force: {
    name: 'cose',
    idealEdgeLength: () => 200,
    nodeOverlap: 50,
    padding: 60,
    nodeRepulsion: () => 15000,
    animate: false,
  },
  circle: {
    name: 'circle',
    padding: 60,
    avoidOverlap: true,
    spacingFactor: 1.5,
  },
};

export function DependencyGraph({ data, highlightedPath, onNodeSelect, onNodeDoubleClick, layout }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const destroyedRef = useRef(false);
  const onNodeSelectRef = useRef(onNodeSelect);
  onNodeSelectRef.current = onNodeSelect;
  const onNodeDoubleClickRef = useRef(onNodeDoubleClick);
  onNodeDoubleClickRef.current = onNodeDoubleClick;

  useEffect(() => {
    if (!containerRef.current || data.nodes.length === 0) return;
    destroyedRef.current = false;

    const cy = cytoscape({
      container: containerRef.current,
      elements: buildElements(data),
      style: [
        // ── Node base: ETL-style cards ──
        {
          selector: 'node',
          style: {
            'background-color': 'data(bgColor)',
            'background-opacity': 0.95,
            'border-color': 'data(borderColor)',
            'border-width': 3,
            shape: 'data(nodeShape)' as any,
            width: 'data(nodeWidth)',
            height: 'data(nodeHeight)',
            label: 'data(label)',
            color: document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#ffffff',
            'font-size': '13px',
            'font-weight': 'bold' as any,
            'font-family': '"JetBrains Mono", monospace',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': '120px',
            'overlay-padding': '8px',
            'z-index': 10,
            'text-outline-color': 'data(bgColor)',
            'text-outline-width': 2,
          } as any,
        },
        // Schema label below
        {
          selector: 'node',
          style: {
            'text-margin-y': 0,
          },
        },
        // Security issues: red pulsing border
        {
          selector: 'node[securityIssues > 0]',
          style: {
            'border-color': '#ef4444',
            'border-width': 4,
            'border-style': 'double' as any,
            'background-opacity': 1,
          },
        },
        // Table nodes: different shape
        {
          selector: 'node[objectType = "table"]',
          style: {
            shape: 'rectangle',
            'background-color': '#10b981',
            width: 80,
            height: 45,
          },
        },
        // External/dynamic nodes
        {
          selector: 'node[objectType = "external"]',
          style: {
            shape: 'diamond',
            'border-style': 'dashed' as any,
            'background-opacity': 0.7,
          },
        },
        // ── Edges: ETL-style connectors ──
        {
          selector: 'edge',
          style: {
            'curve-style': 'taxi',
            'taxi-direction': 'downward',
            'taxi-turn': '50px',
            'target-arrow-shape': 'data(arrowShape)' as any,
            'target-arrow-color': 'data(edgeColor)',
            'target-arrow-fill': 'filled',
            'line-color': 'data(edgeColor)',
            width: 'data(edgeWidth)',
            'line-style': 'data(lineStyle)' as any,
            'arrow-scale': 1.5,
            opacity: 0.8,
            label: 'data(edgeLabel)',
            'font-size': '10px',
            'font-weight': 'bold' as any,
            color: 'data(edgeColor)',
            'text-background-color': document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff',
            'text-background-opacity': 0.9,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            'text-rotation': 'autorotate',
          } as any,
        },
        // Calls edges: blue solid
        {
          selector: 'edge[edgeType = "calls"]',
          style: {
            'line-color': '#3b82f6',
            'target-arrow-color': '#3b82f6',
          },
        },
        // Write edges: orange
        {
          selector: 'edge[edgeType = "writes_to"]',
          style: {
            'line-color': '#f59e0b',
            'target-arrow-color': '#f59e0b',
            width: 3,
          },
        },
        // Dynamic edges: dashed gray
        {
          selector: 'edge[isDynamic]',
          style: {
            'line-style': 'dashed' as any,
            opacity: 0.5,
          },
        },
        // ── Selection ──
        {
          selector: ':selected',
          style: {
            'border-color': '#fbbf24',
            'border-width': 5,
            'z-index': 999,
          },
        },
        // ── Highlight/dim for tracing ──
        {
          selector: '.dimmed',
          style: { opacity: 0.1 },
        },
        {
          selector: '.highlighted',
          style: {
            opacity: 1,
            'z-index': 999,
            'border-width': 5,
            'border-color': '#fbbf24',
          } as any,
        },
        {
          selector: 'edge.highlighted',
          style: {
            opacity: 1,
            width: 4,
            'z-index': 998,
            'line-color': '#fbbf24',
            'target-arrow-color': '#fbbf24',
          } as any,
        },
      ],
      layout: LAYOUTS[layout] || LAYOUTS['etl-flow'],
      minZoom: 0.15,
      maxZoom: 4,
      boxSelectionEnabled: false,
    });

    // Click node → show details
    cy.on('tap', 'node', (evt: EventObject) => {
      const d = evt.target.data();
      onNodeSelectRef.current({
        id: d.id,
        label: d.fullLabel || d.label,
        objectType: d.objectType,
        schema: d.schema,
        complexity: d.complexity,
        riskLevel: d.riskLevel,
        securityIssues: d.securityIssues,
        lineCount: d.lineCount,
      });
    });

    // Double-click → trace call chain
    cy.on('dbltap', 'node', (evt: EventObject) => {
      onNodeDoubleClickRef.current(evt.target.id());
    });

    // Click background → deselect
    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) onNodeSelectRef.current(null);
    });

    // Fit to screen after layout
    cy.on('layoutstop', () => {
      cy.fit(undefined, 40);
    });

    cyRef.current = cy;
    return () => {
      destroyedRef.current = true;
      cyRef.current = null;
      try { cy.stop(); cy.removeAllListeners(); cy.unmount(); cy.destroy(); } catch { /* */ }
    };
  }, [data, layout]);

  // Highlighting
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || destroyedRef.current) return;

    cy.elements().removeClass('dimmed highlighted');
    if (highlightedPath.size > 0) {
      cy.elements().addClass('dimmed');
      cy.elements().forEach((el) => {
        if (highlightedPath.has(el.id())) el.removeClass('dimmed').addClass('highlighted');
      });
    }
  }, [highlightedPath]);

  return (
    <div ref={containerRef} className="w-full h-full rounded-lg" style={{ minHeight: '500px', background: 'linear-gradient(135deg, rgb(var(--surface-50)) 0%, rgb(var(--surface-100)) 100%)' }} />
  );
}
