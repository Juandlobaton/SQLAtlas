import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import cytoscape, { Core } from 'cytoscape';
// @ts-expect-error no types
import fcose from 'cytoscape-fcose';
// @ts-expect-error no types
import cola from 'cytoscape-cola';
// @ts-expect-error no types
import dagre from 'cytoscape-dagre';
import type { ERTable, ERRelationship } from '@/shared/hooks/useTables';

cytoscape.use(fcose);
cytoscape.use(cola);
cytoscape.use(dagre);

export interface ERDiagramHandle {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  center: (nodeId?: string) => void;
}

interface Props {
  tables: ERTable[];
  relationships: ERRelationship[];
  onTableSelect: (table: ERTable | null) => void;
  layout: string;
  groupBySchema?: boolean;
  onLayoutingChange?: (isLayouting: boolean) => void;
}

// ── 12 schema palettes ──
const PALETTES = [
  { bg: '#172554', border: '#3b82f6', text: '#93c5fd', groupBg: '#1e3a5f20' },
  { bg: '#14332a', border: '#10b981', text: '#6ee7b7', groupBg: '#1a3f2e20' },
  { bg: '#2e1065', border: '#8b5cf6', text: '#c4b5fd', groupBg: '#3b1f4e20' },
  { bg: '#422006', border: '#f59e0b', text: '#fcd34d', groupBg: '#3f2a1a20' },
  { bg: '#450a0a', border: '#ef4444', text: '#fca5a5', groupBg: '#3f1a1a20' },
  { bg: '#083344', border: '#06b6d4', text: '#67e8f9', groupBg: '#1a3f3f20' },
  { bg: '#500724', border: '#ec4899', text: '#f9a8d4', groupBg: '#3f1a2e20' },
  { bg: '#1a2e05', border: '#84cc16', text: '#bef264', groupBg: '#2a3f1a20' },
  { bg: '#431407', border: '#f97316', text: '#fdba74', groupBg: '#3f2e1a20' },
  { bg: '#1e1b4b', border: '#6366f1', text: '#a5b4fc', groupBg: '#1a1f3f20' },
  { bg: '#134e4a', border: '#14b8a6', text: '#5eead4', groupBg: '#1f3f3a20' },
  { bg: '#4c0519', border: '#e11d48', text: '#fda4af', groupBg: '#3f1a2020' },
];

function palette(schema: string, idx: Map<string, number>) {
  if (!idx.has(schema)) idx.set(schema, idx.size);
  return PALETTES[idx.get(schema)! % PALETTES.length];
}

// ── Build elements with optional schema grouping ──
function buildElements(
  tables: ERTable[],
  relationships: ERRelationship[],
  grouped: boolean,
) {
  const schemaIdx = new Map<string, number>();
  const edgeDeg = new Map<string, number>();
  for (const r of relationships) {
    edgeDeg.set(r.sourceTableId, (edgeDeg.get(r.sourceTableId) || 0) + 1);
    edgeDeg.set(r.targetTableId, (edgeDeg.get(r.targetTableId) || 0) + 1);
  }

  const elements: any[] = [];

  // Schema compound nodes (parents)
  if (grouped) {
    const schemas = new Set(tables.map(t => t.schemaName));
    for (const s of schemas) {
      const p = palette(s, schemaIdx);
      const count = tables.filter(t => t.schemaName === s).length;
      elements.push({
        data: {
          id: `schema:${s}`,
          label: `${s} (${count})`,
          isGroup: true,
          bgColor: p.groupBg,
          borderColor: p.border,
          textColor: p.text,
        },
      });
    }
  }

  // Table nodes
  for (const t of tables) {
    const p = palette(t.schemaName, schemaIdx);
    const deg = edgeDeg.get(t.id) || 0;
    const w = Math.max(90, Math.min(200, t.tableName.length * 7.5 + 35));
    const h = 34 + Math.min(deg * 1.5, 14);

    elements.push({
      data: {
        id: t.id,
        label: t.tableName,
        schema: t.schemaName,
        colCount: t.columns.length,
        degree: deg,
        bgColor: p.bg,
        borderColor: p.border,
        textColor: p.text,
        w, h,
        ...(grouped ? { parent: `schema:${t.schemaName}` } : {}),
      },
    });
  }

  // Edges
  for (const r of relationships) {
    elements.push({
      data: {
        id: r.id,
        source: r.sourceTableId,
        target: r.targetTableId,
        fkName: r.constraintName,
        srcCols: r.sourceColumns.join(', '),
        tgtCols: r.targetColumns.join(', '),
      },
    });
  }

  return elements;
}

// ── Layouts ──
function getLayout(name: string, n: number, grouped: boolean): any {
  switch (name) {
    case 'dagre':
      return {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: n > 100 ? 30 : 50,
        rankSep: n > 100 ? 60 : 90,
        edgeSep: 15,
        fit: true,
        padding: 50,
        animate: false,
        ranker: 'network-simplex',
      };

    case 'fcose':
      return {
        name: 'fcose',
        quality: n > 80 ? 'default' : 'proof',
        randomize: true,
        animate: false,
        fit: true,
        padding: 50,
        nodeSeparation: n > 100 ? 100 : 70,
        idealEdgeLength: n > 100 ? 140 : 110,
        nodeRepulsion: () => (n > 100 ? 9000 : 5000),
        edgeElasticity: () => 0.45,
        gravity: n > 150 ? 0.12 : 0.22,
        gravityRange: n > 150 ? 1.8 : 3.5,
        numIter: n > 150 ? 1500 : 2500,
        tile: true,
        tilingPaddingVertical: 15,
        tilingPaddingHorizontal: 15,
      };

    case 'cola':
      // For large graphs, use dagre instead — cola is O(n³) and blocks the main thread
      if (n > 120) {
        return {
          name: 'dagre',
          rankDir: 'TB',
          nodeSep: 25,
          rankSep: 50,
          edgeSep: 10,
          fit: true,
          padding: 40,
          animate: false,
          ranker: 'tight-tree',
        };
      }
      return {
        name: 'cola',
        animate: true,
        fit: true,
        padding: 50,
        nodeSpacing: () => 25,
        edgeLength: 130,
        avoidOverlap: true,
        convergenceThreshold: 0.02,
        maxSimulationTime: 2000,
        flow: grouped ? { axis: 'y', minSeparation: 50 } : undefined,
      };

    case 'grid':
      return {
        name: 'grid',
        fit: true,
        padding: 40,
        avoidOverlap: true,
        avoidOverlapPadding: 12,
        condense: true,
        cols: Math.ceil(Math.sqrt(n) * 1.3),
        sort: (a: any, b: any) => {
          const sa = a.data('schema') || '';
          const sb = b.data('schema') || '';
          if (sa !== sb) return sa.localeCompare(sb);
          return (b.data('degree') || 0) - (a.data('degree') || 0);
        },
      };

    case 'concentric':
      return {
        name: 'concentric',
        fit: true,
        padding: 50,
        avoidOverlap: true,
        minNodeSpacing: n > 100 ? 12 : 25,
        concentric: (node: any) => node.data('degree') || 0,
        levelWidth: () => (n > 120 ? 6 : n > 60 ? 4 : 2),
        spacingFactor: n > 100 ? 0.7 : 1.3,
        clockwise: true,
      };

    default:
      return getLayout('fcose', n, grouped);
  }
}

// ── Component ──
export const ERDiagram = forwardRef<ERDiagramHandle, Props>(
  function ERDiagram({ tables, relationships, onTableSelect, layout, groupBySchema = false, onLayoutingChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<Core | null>(null);
    const onTableSelectRef = useRef(onTableSelect);
    onTableSelectRef.current = onTableSelect;
    const onLayoutingChangeRef = useRef(onLayoutingChange);
    onLayoutingChangeRef.current = onLayoutingChange;

    useImperativeHandle(ref, () => ({
      fit: () => cyRef.current?.fit(undefined, 50),
      zoomIn: () => {
        const cy = cyRef.current;
        if (cy) cy.zoom({ level: cy.zoom() * 1.4, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
      },
      zoomOut: () => {
        const cy = cyRef.current;
        if (cy) cy.zoom({ level: cy.zoom() / 1.4, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
      },
      center: (nodeId?: string) => {
        const cy = cyRef.current;
        if (!cy) return;
        if (nodeId) {
          const node = cy.getElementById(nodeId);
          if (node.length) cy.animate({ center: { eles: node }, zoom: 1.8, duration: 350, easing: 'ease-out-cubic' } as any);
        } else {
          cy.fit(undefined, 50);
        }
      },
    }));

    useEffect(() => {
      if (!containerRef.current || tables.length === 0) return;

      const isDark = document.documentElement.classList.contains('dark');
      const edgeBase = isDark ? '#6366f1' : '#818cf8';
      const edgeDim = isDark ? '#1e293b' : '#e2e8f0';
      const groupLabelColor = isDark ? '#94a3b8' : '#64748b';
      const groupBorderBase = isDark ? 0.3 : 0.2;

      // Signal layout start
      onLayoutingChangeRef.current?.(true);

      const cy = cytoscape({
        container: containerRef.current,
        elements: buildElements(tables, relationships, groupBySchema),
        style: [
          // ── Schema group (compound parent) ──
          {
            selector: 'node[?isGroup]',
            style: {
              'label': 'data(label)',
              'text-valign': 'top' as any,
              'text-halign': 'center' as any,
              'font-family': '"Inter", ui-sans-serif, system-ui, sans-serif',
              'font-size': '13px',
              'font-weight': 'bold' as any,
              'color': groupLabelColor,
              'text-margin-y': -8,
              'background-color': 'data(bgColor)',
              'background-opacity': isDark ? 0.4 : 0.25,
              'border-width': 2,
              'border-color': 'data(borderColor)',
              'border-opacity': groupBorderBase,
              'border-style': 'dashed' as any,
              'shape': 'round-rectangle',
              'padding': '25px',
              'compound-sizing-wrt-labels': 'include',
            } as any,
          },
          // ── Table nodes ──
          {
            selector: 'node[!isGroup]',
            style: {
              'label': 'data(label)',
              'text-valign': 'center' as any,
              'text-halign': 'center' as any,
              'font-family': '"Inter", ui-sans-serif, system-ui, sans-serif',
              'font-size': '10px',
              'font-weight': 'bold' as any,
              'shape': 'round-rectangle',
              'background-color': 'data(bgColor)',
              'border-width': 2,
              'border-color': 'data(borderColor)',
              'color': 'data(textColor)',
              'width': 'data(w)',
              'height': 'data(h)',
              'text-outline-color': 'data(bgColor)',
              'text-outline-width': 2,
              'overlay-padding': '4px',
              'z-index': 10,
              'transition-property': 'border-width, border-color, opacity',
              'transition-duration': '0.15s' as any,
            } as any,
          },
          // Hub nodes (high connectivity) get visual emphasis
          { selector: 'node[degree >= 5][!isGroup]', style: { 'border-width': 3, 'font-size': '11px', 'font-weight': 'bold' as any } },
          { selector: 'node[degree >= 10][!isGroup]', style: { 'border-width': 4, 'font-size': '12px' } },
          // Active/hover
          { selector: 'node:active', style: { 'overlay-opacity': 0.06, 'overlay-color': '#3b82f6' } },
          // Highlighted
          {
            selector: '.highlighted',
            style: {
              'opacity': 1,
              'border-color': '#f59e0b',
              'border-width': 4,
              'z-index': 999,
            },
          },
          // Dimmed
          {
            selector: '.dimmed',
            style: { 'opacity': 0.07 } as any,
          },
          // ── Edges ──
          {
            selector: 'edge',
            style: {
              'curve-style': (tables.length > 80 ? 'haystack' : 'bezier') as any,
              'haystack-radius': 0.5,
              'target-arrow-shape': tables.length > 80 ? 'none' : 'triangle',
              'target-arrow-color': edgeBase,
              'line-color': edgeBase,
              'width': 1.5,
              'opacity': 0.3,
              'arrow-scale': 0.6,
              'transition-property': 'opacity, width, line-color',
              'transition-duration': '0.15s' as any,
            } as any,
          },
          {
            selector: 'edge.highlighted',
            style: {
              'line-color': '#f59e0b',
              'target-arrow-color': '#f59e0b',
              'width': 2.5,
              'opacity': 1,
              'z-index': 999,
              'curve-style': 'bezier' as any,
              'target-arrow-shape': 'triangle',
            },
          },
          {
            selector: 'edge.dimmed',
            style: {
              'line-color': edgeDim,
              'target-arrow-color': edgeDim,
              'opacity': 0.04,
            },
          },
        ],
        layout: { name: 'preset' },  // No layout computation during construction
        minZoom: 0.1,
        maxZoom: 5,
        boxSelectionEnabled: false,
        pixelRatio: 'auto' as any,
      });

      // ── Semantic zoom: show column count badge at medium zoom ──
      let lastZoomLevel = '';
      cy.on('zoom', () => {
        const z = cy.zoom();
        const level = z < 0.4 ? 'far' : z < 1.2 ? 'mid' : 'close';
        if (level === lastZoomLevel) return;
        lastZoomLevel = level;

        cy.startBatch();
        cy.nodes('[!isGroup]').forEach(node => {
          const name = node.data('label') || '';
          const cols = node.data('colCount') || 0;
          if (level === 'far') {
            node.style('label', name.length > 5 ? name.slice(0, 4) + '..' : name);
            node.style('font-size', '8px');
          } else if (level === 'mid') {
            node.style('label', name);
            node.style('font-size', '10px');
          } else {
            node.style('label', `${name}\n${cols} cols`);
            node.style('font-size', '10px');
            node.style('text-wrap', 'wrap');
          }
        });
        cy.endBatch();
      });

      // ── Tap node → highlight neighborhood ──
      cy.on('tap', 'node[!isGroup]', (evt) => {
        const node = evt.target;
        const table = tables.find(t => t.id === node.id()) || null;
        onTableSelectRef.current(table);

        const connected = node.neighborhood().add(node);
        cy.elements().not(connected).addClass('dimmed').removeClass('highlighted');
        connected.addClass('highlighted').removeClass('dimmed');
      });

      // Tap compound → toggle collapse (visual: just highlight schema)
      cy.on('tap', 'node[?isGroup]', (evt) => {
        const group = evt.target;
        const children = group.children();
        const connected = children.neighborhood().add(children).add(group);
        cy.elements().not(connected).addClass('dimmed').removeClass('highlighted');
        connected.addClass('highlighted').removeClass('dimmed');
      });

      // Tap background → clear
      cy.on('tap', (evt) => {
        if (evt.target === cy) {
          onTableSelectRef.current(null);
          cy.elements().removeClass('highlighted dimmed');
        }
      });

      // Hover edge → show FK name
      cy.on('mouseover', 'edge', (evt) => {
        const e = evt.target;
        e.style({
          'label': e.data('fkName'),
          'font-size': '8px',
          'color': isDark ? '#94a3b8' : '#64748b',
          'text-background-color': isDark ? '#0f172a' : '#f8fafc',
          'text-background-opacity': 0.95,
          'text-background-padding': '3px',
          'text-background-shape': 'roundrectangle',
          'text-rotation': 'autorotate',
          'text-margin-y': -8,
          'opacity': 0.9,
          'width': 2.5,
        });
      });
      cy.on('mouseout', 'edge', (evt) => {
        const e = evt.target;
        if (!e.hasClass('highlighted')) {
          e.style({ 'label': '', 'opacity': 0.3, 'width': 1.5 });
        }
      });

      // Double-click → zoom to node
      cy.on('dbltap', 'node[!isGroup]', (evt) => {
        cy.animate({ center: { eles: evt.target }, zoom: 2.2, duration: 350, easing: 'ease-out-cubic' } as any);
      });

      cyRef.current = cy;

      // Delay layout so the browser can paint the loading overlay first
      // setTimeout with 100ms gives enough time for React to render + browser to paint
      const timerId = setTimeout(() => {
        if (!cyRef.current) return;  // Already destroyed
        const layoutConfig = getLayout(layout, tables.length, groupBySchema);
        const layoutInstance = cy.layout(layoutConfig);
        layoutInstance.on('layoutstop', () => {
          cy.animate({ fit: { eles: cy.elements(), padding: 40 }, duration: 500, easing: 'ease-out-cubic' });
          onLayoutingChangeRef.current?.(false);
        });
        layoutInstance.run();
      }, 100);

      return () => {
        clearTimeout(timerId);
        cy.destroy();
        cyRef.current = null;
      };
    }, [tables, relationships, layout, groupBySchema]);

    return (
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ background: 'linear-gradient(135deg, rgb(var(--surface-50)) 0%, rgb(var(--surface-100)) 100%)' }}
      />
    );
  },
);
