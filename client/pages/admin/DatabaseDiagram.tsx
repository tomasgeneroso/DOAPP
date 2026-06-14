import { useState, useCallback, useRef, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Panel,
  MarkerType,
  type Node,
  type Edge,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Dagre from '@dagrejs/dagre';
import { toPng } from 'html-to-image';
import { Search, Download, RotateCcw, ChevronDown, ChevronUp, X, Filter } from 'lucide-react';
import EntityNode, { type EntityNodeData } from '../../components/admin/erd/EntityNode.js';
import { entities, relationships } from '../../components/admin/erd/schemaData.js';
import type { EntityCategory } from '../../components/admin/erd/types.js';

// ─── Layout ──────────────────────────────────────────────────────────────────

function getLayoutedElements(nodes: Node[], edges: Edge[], direction: 'LR' | 'TB' = 'LR') {
  const g = new Dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: 80, nodesep: 50, marginx: 40, marginy: 40 });

  nodes.forEach(n => g.setNode(n.id, { width: 280, height: n.data.collapsed ? 44 : 44 + (n.data.entity.fields.length * 28) }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  Dagre.layout(g);

  return {
    nodes: nodes.map(n => {
      const pos = g.node(n.id);
      return { ...n, position: { x: pos.x - 140, y: pos.y - ((n.data.collapsed ? 44 : 44 + n.data.entity.fields.length * 28) / 2) } };
    }),
    edges,
  };
}

// ─── Category meta ───────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<EntityCategory, string> = {
  core: 'Core',
  payments: 'Pagos',
  communication: 'Mensajería',
  support: 'Soporte',
  content: 'Contenido',
  auth: 'Auth / Logs',
};

const CATEGORY_COLORS: Record<EntityCategory, string> = {
  core: '#3b82f6',
  payments: '#10b981',
  communication: '#8b5cf6',
  support: '#f59e0b',
  content: '#6366f1',
  auth: '#ef4444',
};

const nodeTypes = { entityNode: EntityNode };

// ─── Edge builder ────────────────────────────────────────────────────────────

function buildEdge(rel: (typeof relationships)[number], collapsed: Set<string>): Edge {
  return {
    id: rel.id,
    source: rel.source,
    target: rel.target,
    label: `${rel.sourceField} → ${rel.label || rel.targetField}`,
    type: 'smoothstep',
    animated: rel.relationType === '1:1',
    markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#64748b' },
    style: { stroke: '#64748b', strokeWidth: 1.5 },
    labelStyle: { fill: '#94a3b8', fontSize: 9, fontFamily: 'monospace' },
    labelBgStyle: { fill: '#0f172a', fillOpacity: 0.85 },
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DatabaseDiagram() {
  const [search, setSearch] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<EntityCategory>>(new Set(Object.keys(CATEGORY_LABELS) as EntityCategory[]));
  const [collapsedAll, setCollapsedAll] = useState(false);
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set());
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);

  // Build initial nodes
  const buildNodes = useCallback((collapsed: Set<string>, highlight: Set<string>): Node[] =>
    entities
      .filter(e => selectedCategories.has(e.category))
      .filter(e => !search || e.tableName.toLowerCase().includes(search.toLowerCase()) || e.label.toLowerCase().includes(search.toLowerCase()))
      .map(entity => ({
        id: entity.id,
        type: 'entityNode',
        position: { x: 0, y: 0 },
        data: {
          entity,
          collapsed: collapsed.has(entity.id),
          highlighted: highlight.has(entity.id),
          onToggleCollapse: (id: string) => {
            setCollapsedSet(prev => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            });
          },
        } satisfies EntityNodeData,
      })),
  [search, selectedCategories]);

  const buildEdges = useCallback((): Edge[] => {
    const visibleIds = new Set(entities.filter(e => selectedCategories.has(e.category)).map(e => e.id));
    return relationships
      .filter(r => visibleIds.has(r.source) && visibleIds.has(r.target))
      .map(r => buildEdge(r, collapsedSet));
  }, [selectedCategories, collapsedSet]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const applyLayout = useCallback((dir: 'LR' | 'TB' = 'LR') => {
    const rawNodes = buildNodes(collapsedSet, highlighted);
    const rawEdges = buildEdges();
    const { nodes: ln, edges: le } = getLayoutedElements(rawNodes, rawEdges, dir);
    setNodes(ln);
    setEdges(le);
  }, [buildNodes, buildEdges, collapsedSet, highlighted, setNodes, setEdges]);

  useEffect(() => { applyLayout('LR'); }, [search, selectedCategories, collapsedSet]);

  // Toggle collapse all
  const handleCollapseAll = () => {
    const next = !collapsedAll;
    setCollapsedAll(next);
    setCollapsedSet(next ? new Set(entities.map(e => e.id)) : new Set());
  };

  // Search highlight
  useEffect(() => {
    if (!search) { setHighlighted(new Set()); return; }
    const matched = entities.filter(e => e.tableName.includes(search.toLowerCase()) || e.label.toLowerCase().includes(search.toLowerCase())).map(e => e.id);
    setHighlighted(new Set(matched));
  }, [search]);

  // Export PNG
  const handleExport = () => {
    if (!flowRef.current) return;
    const el = flowRef.current.querySelector('.react-flow__viewport')?.parentElement as HTMLElement | null;
    if (!el) return;
    toPng(el, { backgroundColor: '#0a0f1e', cacheBust: true })
      .then(url => { const a = document.createElement('a'); a.href = url; a.download = 'doapp-erd.png'; a.click(); })
      .catch(() => {});
  };

  const toggleCategory = (cat: EntityCategory) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const visibleCount = entities.filter(e => selectedCategories.has(e.category)).length;

  return (
    <>
      <Helmet>
        <title>Diagrama ERD — Admin | DoApp</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Diagrama de Base de Datos</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          {visibleCount} entidades · {relationships.length} relaciones — generado desde los modelos Sequelize
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar tabla..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(p => !p)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${showFilters ? 'bg-sky-600 text-white border-sky-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
        >
          <Filter className="h-4 w-4" />
          Categorías
        </button>

        {/* Collapse all */}
        <button
          onClick={handleCollapseAll}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          {collapsedAll ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          {collapsedAll ? 'Expandir todo' : 'Colapsar todo'}
        </button>

        {/* Re-layout */}
        <button
          onClick={() => applyLayout('LR')}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          title="Re-aplicar layout automático"
        >
          <RotateCcw className="h-4 w-4" />
          Layout
        </button>

        {/* Export */}
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium transition-colors"
        >
          <Download className="h-4 w-4" />
          PNG
        </button>
      </div>

      {/* Category filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 mb-4 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          {(Object.entries(CATEGORY_LABELS) as [EntityCategory, string][]).map(([cat, label]) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                selectedCategories.has(cat)
                  ? 'text-white border-transparent'
                  : 'bg-transparent border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
              }`}
              style={selectedCategories.has(cat) ? { backgroundColor: CATEGORY_COLORS[cat], borderColor: CATEGORY_COLORS[cat] } : {}}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
              {label}
              <span className="opacity-70">({entities.filter(e => e.category === cat).length})</span>
            </button>
          ))}
        </div>
      )}

      {/* Diagram */}
      <div
        ref={flowRef}
        className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xl"
        style={{ height: 'calc(100vh - 260px)', minHeight: 500, background: '#0a0f1e' }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e293b" />
          <Controls showInteractive={false} className="!bg-slate-800 !border-slate-600 !rounded-xl" />
          <MiniMap
            nodeColor={n => CATEGORY_COLORS[(n.data as EntityNodeData).entity.category] || '#64748b'}
            maskColor="rgba(10,15,30,0.75)"
            style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
          />
          <Panel position="top-right">
            <div className="flex flex-col gap-1.5 p-2 rounded-xl bg-slate-800/90 border border-slate-600 backdrop-blur-sm">
              {(Object.entries(CATEGORY_LABELS) as [EntityCategory, string][]).map(([cat, label]) => (
                <div key={cat} className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                  {label}
                </div>
              ))}
            </div>
          </Panel>
        </ReactFlow>
      </div>
    </>
  );
}
