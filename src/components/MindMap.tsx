import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import type { Connection, Edge, EdgeChange, NodeChange } from '@xyflow/react';
import { useSession } from '../store/useSession';
import { branchColors, buildIndex } from '../lib/tree';
import { FIT_VIEW, on } from '../lib/bus';
import { IdeaNodeView } from './IdeaNode';
import type { IdeaFlowNode } from './IdeaNode';
import { SketchEdge } from './SketchEdge';

const nodeTypes = { idea: IdeaNodeView };
const edgeTypes = { sketch: SketchEdge };

/** 位置関係から、見た目が自然になる Handle の組み合わせを選ぶ */
function pickHandles(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: 's-r', targetHandle: 't-l' }
      : { sourceHandle: 's-l', targetHandle: 't-r' };
  }
  return dy >= 0
    ? { sourceHandle: 's-b', targetHandle: 't-t' }
    : { sourceHandle: 's-t', targetHandle: 't-b' };
}

export function MindMap() {
  const nodes = useSession((s) => s.nodes);
  const edges = useSession((s) => s.edges);
  const selectedIds = useSession((s) => s.selectedIds);
  const moveNode = useSession((s) => s.moveNode);
  const deleteNodes = useSession((s) => s.deleteNodes);
  const connectNodes = useSession((s) => s.connectNodes);
  const setSelected = useSession((s) => s.setSelected);
  const connectMode = useSession((s) => s.connectMode);
  const connectFirstId = useSession((s) => s.connectFirstId);

  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const { fitView, flowToScreenPosition, getViewport, setViewport } = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);
  const rootId = useMemo(() => nodes.find((n) => n.parentId === null)?.id ?? null, [nodes]);
  const lastRoot = useRef<string | null>(null);

  useEffect(() => {
    if (rootId && rootId !== lastRoot.current) {
      lastRoot.current = rootId;
      // お題が切り替わったら全体を映し直す
      const t = setTimeout(
        () => fitView({ padding: 0.3, duration: 300, minZoom: 0.5, maxZoom: 1 }),
        60,
      );
      return () => clearTimeout(t);
    }
    return undefined;
  }, [rootId, fitView]);

  // 新しく生えたノードが画面外なら、全体が見えるように映し直す
  const knownIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(nodes.map((n) => n.id));
    const prev = knownIds.current;
    knownIds.current = ids;
    if (!prev) return;
    const added = nodes.filter((n) => !prev.has(n.id));
    const last = added[added.length - 1];
    const box = wrapRef.current?.getBoundingClientRect();
    if (!last || !box) return;
    // ズームは変えず、必要なぶんだけ画面をずらす（読める大きさを保つため）
    const p = flowToScreenPosition(last.position);
    const left = box.left + Math.min(48, box.width * 0.12);
    const right = box.right - Math.min(230, box.width * 0.45);
    const top = box.top + Math.min(30, box.height * 0.1);
    const bottom = box.bottom - Math.min(90, box.height * 0.28);
    let dx = 0;
    let dy = 0;
    if (p.x < left) dx = left - p.x;
    else if (p.x > right) dx = right - p.x;
    if (p.y < top) dy = top - p.y;
    else if (p.y > bottom) dy = bottom - p.y;
    if (dx || dy) {
      const v = getViewport();
      setViewport({ x: v.x + dx, y: v.y + dy, zoom: v.zoom }, { duration: 260 });
    }
  }, [nodes, flowToScreenPosition, getViewport, setViewport]);

  useEffect(
    () =>
      on(FIT_VIEW, () => {
        window.setTimeout(
          () => fitView({ padding: 0.2, duration: 340, minZoom: 0.5, maxZoom: 1 }),
          20,
        );
      }),
    [fitView],
  );

  const index = useMemo(() => buildIndex(nodes), [nodes]);
  const depthOf = index.depthOf;
  const tones = useMemo(() => branchColors(nodes, index), [nodes, index]);

  const rfNodes: IdeaFlowNode[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: 'idea' as const,
        position: n.position,
        selected: selectedIds.includes(n.id),
        deletable: n.parentId !== null,
        draggable: !connectMode,
        data: {
          text: n.text,
          category: n.category,
          isRoot: n.parentId === null,
          depth: depthOf.get(n.id) ?? 0,
          tone: tones.get(n.id) ?? '#1b1a17',
          connecting: connectMode,
          picked: connectFirstId === n.id,
          kind: n.kind ?? 'word',
          source: n.source ?? 'self',
        },
      })),
    [nodes, selectedIds, depthOf, tones, connectMode, connectFirstId],
  );

  const rfEdges: Edge[] = useMemo(() => {
    const pos = new Map(nodes.map((n) => [n.id, n.position]));
    return edges.map((e) => {
      const a = pos.get(e.source) ?? { x: 0, y: 0 };
      const b = pos.get(e.target) ?? { x: 0, y: 0 };
      const handles = pickHandles(a, b);
      const cross = e.type === 'cross';
      const tone = tones.get(e.target) ?? tones.get(e.source) ?? '#1b1a17';
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        ...handles,
        type: 'sketch',
        selected: selectedEdgeIds.includes(e.id),
        className: cross ? 'edge-cross' : 'edge-parent',
        zIndex: cross ? 1 : 0,
        data: { kind: e.type, color: cross ? '#ef4b3a' : tone },
      };
    });
  }, [edges, nodes, selectedEdgeIds, tones]);

  // 選択は React Flow から届く 'select' 変更を store に反映させる。
  // props の selected と onSelectionChange を併用すると両者が取り合って無限ループになる。
  const onNodesChange = useCallback(
    (changes: NodeChange<IdeaFlowNode>[]) => {
      const removed: string[] = [];
      let selection: string[] | null = null;
      for (const c of changes) {
        if (c.type === 'position' && c.position) {
          moveNode(c.id, c.position);
        } else if (c.type === 'remove') {
          removed.push(c.id);
        } else if (c.type === 'select') {
          const base: string[] = selection ?? useSession.getState().selectedIds;
          selection = c.selected
            ? base.includes(c.id)
              ? base
              : [...base, c.id]
            : base.filter((id) => id !== c.id);
        }
      }
      if (selection) setSelected(selection);
      if (removed.length) deleteNodes(removed);
    },
    [moveNode, deleteNodes, setSelected],
  );

  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    const removed: string[] = [];
    for (const c of changes) {
      if (c.type === 'remove') removed.push(c.id);
      else if (c.type === 'select') {
        const { id, selected } = c;
        setSelectedEdgeIds((prev) =>
          selected ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id),
        );
      }
    }
    if (removed.length) useSession.getState().deleteEdges(removed);
  }, []);

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) connectNodes(c.source, c.target);
    },
    [connectNodes],
  );

  return (
    <div className="flow-wrap" ref={wrapRef}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={44}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        deleteKeyCode={['Delete', 'Backspace']}
        selectionKeyCode={null}
        zoomOnDoubleClick={false}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: false }}
        fitView
        fitViewOptions={{ padding: 0.3, minZoom: 0.5, maxZoom: 1 }}
      >
        <Background variant={BackgroundVariant.Cross} gap={40} size={5} color="#ded4bb" />
        <MiniMap
          pannable
          zoomable
          className="mini"
          nodeColor={(n) => (n.data?.tone as string) ?? '#1b1a17'}
          style={{ width: 150, height: 104 }}
        />
        <Controls showInteractive={false} />
      </ReactFlow>
      {connectMode && (
        <div className="connect-hint">
          {connectFirstId ? 'つなぐ相手をタップ' : '繋ぎたいノードをタップ'}
        </div>
      )}
    </div>
  );
}
