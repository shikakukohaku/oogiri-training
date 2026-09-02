import type { IdeaEdge, IdeaNode, Stats } from '../types';

export interface TreeIndex {
  byId: Map<string, IdeaNode>;
  childrenOf: Map<string, IdeaNode[]>;
  /** Root からの距離。Root は 0 */
  depthOf: Map<string, number>;
  /** そのノードが属する「枝」= Root 直下の祖先の id。Root 自身は null */
  branchOf: Map<string, string | null>;
  rootId: string | null;
}

export function buildIndex(nodes: IdeaNode[]): TreeIndex {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, IdeaNode[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = childrenOf.get(n.parentId);
    if (list) list.push(n);
    else childrenOf.set(n.parentId, [n]);
  }

  const root = nodes.find((n) => n.parentId === null) ?? null;
  const depthOf = new Map<string, number>();
  const branchOf = new Map<string, string | null>();

  if (root) {
    depthOf.set(root.id, 0);
    branchOf.set(root.id, null);
    const queue: IdeaNode[] = [root];
    while (queue.length) {
      const cur = queue.shift() as IdeaNode;
      const depth = depthOf.get(cur.id) ?? 0;
      for (const child of childrenOf.get(cur.id) ?? []) {
        if (depthOf.has(child.id)) continue; // 循環よけ
        depthOf.set(child.id, depth + 1);
        branchOf.set(child.id, depth === 0 ? child.id : (branchOf.get(cur.id) ?? null));
        queue.push(child);
      }
    }
  }

  return { byId, childrenOf, depthOf, branchOf, rootId: root?.id ?? null };
}

/** node とその子孫すべての id */
export function subtreeIds(index: TreeIndex, id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (out.includes(cur)) continue;
    out.push(cur);
    for (const c of index.childrenOf.get(cur) ?? []) stack.push(c.id);
  }
  return out;
}

/** 「横断」としてカウントできる Edge か（違う枝どうしを繋いでいるか） */
export function isCrossBranch(index: TreeIndex, edge: IdeaEdge): boolean {
  if (edge.type !== 'cross') return false;
  const a = index.branchOf.get(edge.source);
  const b = index.branchOf.get(edge.target);
  if (a === undefined || b === undefined) return false;
  if (a === null || b === null) return false; // Root への接続は横断としない
  return a !== b;
}

export function computeStats(
  nodes: IdeaNode[],
  edges: IdeaEdge[],
  operators: { operator: string }[],
  index: TreeIndex = buildIndex(nodes),
): Stats {
  const volume = nodes.filter((n) => n.parentId !== null).length;
  const width = index.rootId ? (index.childrenOf.get(index.rootId)?.length ?? 0) : 0;
  let depth = 0;
  for (const d of index.depthOf.values()) depth = Math.max(depth, d);
  const cross = edges.filter((e) => isCrossBranch(index, e)).length;
  const shifts = new Set(operators.map((o) => o.operator)).size;
  return { volume, width, depth, cross, shifts };
}
