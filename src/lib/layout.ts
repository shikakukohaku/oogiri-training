import type { IdeaNode } from '../types';
import { buildIndex } from './tree';

const RING = 235;

/**
 * React Flow の position は左上基準なので、放射状に並べるときは中心を使う。
 * 実測サイズは store が持っていないため、文字数からの見積もりで代用する。
 */
function sizeOf(node: IdeaNode): { w: number; h: number } {
  const isRoot = node.parentId === null;
  const maxW = isRoot ? 250 : 192;
  const charW = isRoot ? 19 : 15;
  const pad = isRoot ? 40 : 30;
  const w = Math.min(maxW, pad + node.text.length * charW);
  const perLine = Math.max(1, Math.floor((w - pad) / charW));
  const lines = Math.max(1, Math.ceil(node.text.length / perLine));
  const h = (isRoot ? 34 : 24) + lines * (isRoot ? 26 : 19);
  return { w, h };
}

function centerOf(node: IdeaNode): { x: number; y: number } {
  const { w, h } = sizeOf(node);
  return { x: node.position.x + w / 2, y: node.position.y + h / 2 };
}

/** 中心座標を、そのテキストのノードの左上座標に直す */
function topLeft(center: { x: number; y: number }, text: string, isRoot: boolean) {
  const { w, h } = sizeOf({ text, parentId: isRoot ? null : 'x' } as IdeaNode);
  return { x: center.x - w / 2, y: center.y - h / 2 };
}

/** 新しい子ノードを置く座標を決める。 */
export function childPosition(
  nodes: IdeaNode[],
  parentId: string,
  text = '',
): { x: number; y: number } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parent = byId.get(parentId);
  if (!parent) return { x: 0, y: 0 };

  const pc = centerOf(parent);
  const siblings = nodes.filter((n) => n.parentId === parentId);
  const i = siblings.length;

  if (parent.parentId === null) {
    // Root の周りは放射状のリングに並べる
    const per = 8;
    const ring = Math.floor(i / per);
    const angle = ((i % per) / per) * Math.PI * 2 + ring * 0.39 - Math.PI / 2;
    const r = RING + ring * 175;
    return topLeft(
      { x: pc.x + Math.cos(angle) * r, y: pc.y + Math.sin(angle) * r },
      text,
      false,
    );
  }

  const gp = parent.parentId ? byId.get(parent.parentId) : undefined;
  const gc = gp ? centerOf(gp) : undefined;
  const dir = gc ? Math.atan2(pc.y - gc.y, pc.x - gc.x) : 0;
  // 0, -1, +1, -2, +2 ... と扇状に開く
  const k = Math.ceil(i / 2) * (i % 2 === 1 ? -1 : 1);
  const angle = dir + k * 0.52;
  const r = 195;
  return topLeft({ x: pc.x + Math.cos(angle) * r, y: pc.y + Math.sin(angle) * r }, text, false);
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

  const centers = new Map<string, { x: number; y: number }>();
  centers.set(index.rootId, { x: 0, y: 0 });

  const walk = (id: string, from: number, to: number, depth: number) => {
    const children = index.childrenOf.get(id) ?? [];
    const total = children.reduce((s, c) => s + countLeaves(c.id), 0) || 1;
    let cursor = from;
    for (const child of children) {
      const span = ((to - from) * countLeaves(child.id)) / total;
      const angle = cursor + span / 2;
      const r = RING + (depth - 1) * 185;
      centers.set(child.id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r });
      walk(child.id, cursor, cursor + span, depth + 1);
      cursor += span;
    }
  };
  walk(index.rootId, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, 1);

  return nodes.map((n) => {
    const c = centers.get(n.id);
    if (!c) return n;
    const { w, h } = sizeOf(n);
    return { ...n, position: { x: c.x - w / 2, y: c.y - h / 2 } };
  });
}
