import type { IdeaNode } from '../types';
import { buildIndex } from './tree';

const RING = 215;

/** 新しい子ノードを置く座標を決める。 */
export function childPosition(nodes: IdeaNode[], parentId: string): { x: number; y: number } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parent = byId.get(parentId);
  if (!parent) return { x: 0, y: 0 };

  const siblings = nodes.filter((n) => n.parentId === parentId);
  const i = siblings.length;

  if (parent.parentId === null) {
    // Root の周りは放射状のリングに並べる
    const per = 8;
    const ring = Math.floor(i / per);
    const angle = ((i % per) / per) * Math.PI * 2 + ring * 0.39 - Math.PI / 2;
    const r = RING + ring * 165;
    return {
      x: parent.position.x + Math.cos(angle) * r,
      y: parent.position.y + Math.sin(angle) * r,
    };
  }

  const gp = parent.parentId ? byId.get(parent.parentId) : undefined;
  const dir = gp
    ? Math.atan2(parent.position.y - gp.position.y, parent.position.x - gp.position.x)
    : 0;
  // 0, -1, +1, -2, +2 ... と扇状に開く
  const k = Math.ceil(i / 2) * (i % 2 === 1 ? -1 : 1);
  const angle = dir + k * 0.52;
  const r = 178;
  return {
    x: parent.position.x + Math.cos(angle) * r,
    y: parent.position.y + Math.sin(angle) * r,
  };
}

/** 全体を放射状に組み直す（自動レイアウト）。 */
export function radialLayout(nodes: IdeaNode[]): IdeaNode[] {
  const index = buildIndex(nodes);
  if (!index.rootId) return nodes;

  const leafCount = new Map<string, number>();
  const countLeaves = (id: string): number => {
    const cached = leafCount.get(id);
    if (cached !== undefined) return cached;
    const children = index.childrenOf.get(id) ?? [];
    const n = children.length === 0 ? 1 : children.reduce((s, c) => s + countLeaves(c.id), 0);
    leafCount.set(id, n);
    return n;
  };
  countLeaves(index.rootId);

  const positions = new Map<string, { x: number; y: number }>();
  positions.set(index.rootId, { x: 0, y: 0 });

  const walk = (id: string, from: number, to: number, depth: number) => {
    const children = index.childrenOf.get(id) ?? [];
    const total = children.reduce((s, c) => s + countLeaves(c.id), 0) || 1;
    let cursor = from;
    for (const child of children) {
      const span = ((to - from) * countLeaves(child.id)) / total;
      const angle = cursor + span / 2;
      const r = RING + (depth - 1) * 172;
      positions.set(child.id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r });
      walk(child.id, cursor, cursor + span, depth + 1);
      cursor += span;
    }
  };
  walk(index.rootId, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, 1);

  return nodes.map((n) => {
    const p = positions.get(n.id);
    return p ? { ...n, position: p } : n;
  });
}
