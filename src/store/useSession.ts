import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Answer,
  Category,
  IdeaEdge,
  IdeaNode,
  OperatorId,
  OperatorUsage,
  SessionLog,
  SparkCard,
  Topic,
} from '../types';
import { PRESET_TOPICS } from '../data/topics';
import { nextTopicId, topicById } from './useTopics';
import { operatorDef } from '../data/operators';
import { pickRandomWord } from '../data/randomWords';
import { uid } from '../lib/uid';
import { buildIndex, computeStats, subtreeIds } from '../lib/tree';
import { childPosition, radialLayout } from '../lib/layout';
import { achievedMissions } from '../lib/missions';
import { appendLog } from '../lib/logs';

export const MAX_ANSWERS = 5;
const MAX_HISTORY = 60;
const MAX_TEXT = 60;

interface Doc {
  nodes: IdeaNode[];
  edges: IdeaEdge[];
  operatorUsages: OperatorUsage[];
  answers: Answer[];
  achieved: string[];
}

export type Phase = 'map' | 'result';

interface SessionState extends Doc {
  topicId: string;
  selectedIds: string[];
  /** タップだけで枝を繋ぐためのモード（Shift+クリックが使えない端末向け） */
  connectMode: boolean;
  connectFirstId: string | null;
  card: SparkCard | null;
  lastWord: string | null;
  phase: Phase;
  log: SessionLog;
  past: Doc[];
  future: Doc[];

  addNode: (parentId: string, text: string, category: Category) => string | null;
  renameNode: (id: string, text: string) => void;
  setNodeCategory: (id: string, category: Category) => void;
  moveNode: (id: string, position: { x: number; y: number }) => void;
  deleteNodes: (ids: string[]) => void;
  connectNodes: (source: string, target: string) => void;
  deleteEdges: (ids: string[]) => void;
  setSelected: (ids: string[]) => void;
  startConnectMode: () => void;
  cancelConnectMode: () => void;
  tapConnect: (nodeId: string) => void;
  applyOperator: (operator: OperatorId) => void;
  rollRandomWord: () => void;
  clearCard: () => void;
  autoLayout: () => void;
  addAnswer: (text: string) => boolean;
  removeAnswer: (id: string) => void;
  chooseAnswer: (id: string) => void;
  backToMap: () => void;
  restart: () => void;
  goNextTopic: () => void;
  setTopic: (topicId: string) => void;
  undo: () => void;
  redo: () => void;
}

function makeLog(topic: Topic): SessionLog {
  return {
    sessionId: uid('s'),
    topicId: topic.id,
    topicText: topic.text,
    startedAt: Date.now(),
    finishedAt: null,
    durationMs: null,
    createdNodeCount: 0,
    deletedNodeCount: 0,
    crossEdgeCount: 0,
    maxDepth: 0,
    nodeCount: 0,
    operatorsUsed: [],
    operatorUseCount: 0,
    randomWordCount: 0,
    answerCount: 0,
    finalAnswer: null,
  };
}

function makeDoc(topic: Topic): Doc {
  const root: IdeaNode = {
    id: uid('root'),
    text: topic.root,
    parentId: null,
    category: 'other',
    position: { x: 0, y: 0 },
  };
  return { nodes: [root], edges: [], operatorUsages: [], answers: [], achieved: [] };
}

function snapshot(s: SessionState): Doc {
  return {
    nodes: s.nodes,
    edges: s.edges,
    operatorUsages: s.operatorUsages,
    answers: s.answers,
    achieved: s.achieved,
  };
}

function withAchieved(doc: Doc): Doc {
  const found = achievedMissions(doc.nodes, doc.edges, doc.operatorUsages, doc.answers);
  const merged = [...doc.achieved];
  for (const id of found) if (!merged.includes(id)) merged.push(id);
  return { ...doc, achieved: merged };
}

function commit(s: SessionState, doc: Doc) {
  return {
    ...withAchieved(doc),
    past: [...s.past, snapshot(s)].slice(-MAX_HISTORY),
    future: [] as Doc[],
  };
}

function freshSession(topicId: string) {
  const topic = topicById(topicId);
  return {
    topicId: topic.id,
    ...makeDoc(topic),
    selectedIds: [] as string[],
    connectMode: false,
    connectFirstId: null as string | null,
    card: null,
    lastWord: null,
    phase: 'map' as Phase,
    log: makeLog(topic),
    past: [] as Doc[],
    future: [] as Doc[],
  };
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      ...freshSession(PRESET_TOPICS[0].id),

      addNode: (parentId, rawText, category) => {
        const text = rawText.trim().slice(0, MAX_TEXT);
        if (!text) return null;
        const s = get();
        if (!s.nodes.some((n) => n.id === parentId)) return null;
        const node: IdeaNode = {
          id: uid(),
          text,
          parentId,
          category,
          position: childPosition(s.nodes, parentId, text),
        };
        const edge: IdeaEdge = {
          id: uid('e'),
          source: parentId,
          target: node.id,
          type: 'parent',
        };
        set({
          ...commit(s, {
            ...snapshot(s),
            nodes: [...s.nodes, node],
            edges: [...s.edges, edge],
          }),
          selectedIds: [node.id],
          log: { ...s.log, createdNodeCount: s.log.createdNodeCount + 1 },
        });
        return node.id;
      },

      renameNode: (id, rawText) => {
        const text = rawText.trim().slice(0, MAX_TEXT);
        if (!text) return;
        const s = get();
        set(
          commit(s, {
            ...snapshot(s),
            nodes: s.nodes.map((n) => (n.id === id ? { ...n, text } : n)),
          }),
        );
      },

      setNodeCategory: (id, category) => {
        const s = get();
        set(
          commit(s, {
            ...snapshot(s),
            nodes: s.nodes.map((n) => (n.id === id ? { ...n, category } : n)),
          }),
        );
      },

      // ドラッグはヒストリに積まない（Undo がドラッグで埋まるため）
      moveNode: (id, position) =>
        set((s) => ({
          nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
        })),

      deleteNodes: (ids) => {
        const s = get();
        const index = buildIndex(s.nodes);
        const doomed = new Set<string>();
        for (const id of ids) {
          if (id === index.rootId) continue;
          for (const sub of subtreeIds(index, id)) doomed.add(sub);
        }
        if (doomed.size === 0) return;
        const nodes = s.nodes.filter((n) => !doomed.has(n.id));
        const edges = s.edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target));
        set({
          ...commit(s, { ...snapshot(s), nodes, edges }),
          selectedIds: s.selectedIds.filter((id) => !doomed.has(id)),
          log: { ...s.log, deletedNodeCount: s.log.deletedNodeCount + doomed.size },
        });
      },

      connectNodes: (source, target) => {
        const s = get();
        if (source === target) return;
        const known = new Set(s.nodes.map((n) => n.id));
        if (!known.has(source) || !known.has(target)) return;
        const exists = s.edges.some(
          (e) =>
            (e.source === source && e.target === target) ||
            (e.source === target && e.target === source),
        );
        if (exists) return;
        const edge: IdeaEdge = { id: uid('e'), source, target, type: 'cross' };
        const a = s.nodes.find((n) => n.id === source);
        const b = s.nodes.find((n) => n.id === target);
        set({
          ...commit(s, { ...snapshot(s), edges: [...s.edges, edge] }),
          connectMode: false,
          connectFirstId: null,
          card: {
            kind: 'combine',
            title: '枝が繋がった',
            subtitle: `${a?.text ?? ''} × ${b?.text ?? ''}`,
            body: '離れたところにある2つが今くっついた。ここに何か落ちてないか？',
            prompt: 'この組み合わせから新しいノードか回答を考えてください',
            nodeIds: [source, target],
            seed: '',
            at: Date.now(),
          },
        });
      },

      deleteEdges: (ids) => {
        const s = get();
        if (!ids.length) return;
        const edges = s.edges.filter((e) => !ids.includes(e.id));
        if (edges.length === s.edges.length) return;
        set(commit(s, { ...snapshot(s), edges }));
      },

      setSelected: (ids) =>
        set((s) => (sameIds(s.selectedIds, ids) ? s : { ...s, selectedIds: ids })),

      startConnectMode: () => set({ connectMode: true, connectFirstId: null, selectedIds: [] }),

      cancelConnectMode: () => set({ connectMode: false, connectFirstId: null }),

      tapConnect: (nodeId) => {
        const s = get();
        if (!s.connectMode) return;
        if (!s.connectFirstId) {
          set({ connectFirstId: nodeId });
          return;
        }
        if (s.connectFirstId === nodeId) {
          set({ connectFirstId: null });
          return;
        }
        // connectNodes 側でモードを閉じる
        s.connectNodes(s.connectFirstId, nodeId);
      },

      applyOperator: (operator) => {
        const s = get();
        const def = operatorDef(operator);
        const picked = s.selectedIds
          .map((id) => s.nodes.find((n) => n.id === id))
          .filter((n): n is IdeaNode => Boolean(n));
        if (picked.length < def.needs) return;
        const used = picked.slice(0, Math.max(def.needs, Math.min(picked.length, 2)));
        const usage: OperatorUsage = {
          id: uid('op'),
          operator,
          selectedNodeIds: used.map((n) => n.id),
          selectedTexts: used.map((n) => n.text),
          timestamp: Date.now(),
        };
        set({
          ...commit(s, { ...snapshot(s), operatorUsages: [...s.operatorUsages, usage] }),
          card: {
            kind: 'operator',
            title: def.label,
            subtitle: used.map((n) => `「${n.text}」`).join(' × '),
            body: `${def.hint}\n例: ${def.example}`,
            prompt: 'これを使って新しいノードか回答を考えてください',
            nodeIds: usage.selectedNodeIds,
            seed: '',
            at: Date.now(),
          },
          log: {
            ...s.log,
            operatorUseCount: s.log.operatorUseCount + 1,
            operatorsUsed: s.log.operatorsUsed.includes(operator)
              ? s.log.operatorsUsed
              : [...s.log.operatorsUsed, operator],
          },
        });
      },

      rollRandomWord: () => {
        const s = get();
        const word = pickRandomWord(s.lastWord);
        const anchor =
          s.nodes.find((n) => n.id === s.selectedIds[0]) ??
          s.nodes.find((n) => n.parentId === null);
        set({
          lastWord: word,
          card: {
            kind: 'random',
            title: '飛び地',
            subtitle: word,
            body: `「${anchor?.text ?? ''}」と「${word}」を無理やり繋げてください。`,
            prompt: '関係なさそうなほど良い。強引に接点を作る。',
            nodeIds: anchor ? [anchor.id] : [],
            seed: word,
            at: Date.now(),
          },
          log: { ...s.log, randomWordCount: s.log.randomWordCount + 1 },
        });
      },

      clearCard: () => set({ card: null }),

      autoLayout: () => {
        const s = get();
        set(commit(s, { ...snapshot(s), nodes: radialLayout(s.nodes) }));
      },

      addAnswer: (rawText) => {
        const text = rawText.trim().slice(0, 200);
        const s = get();
        if (!text || s.answers.length >= MAX_ANSWERS) return false;
        const answer: Answer = { id: uid('a'), text, selected: false, createdAt: Date.now() };
        set({
          ...commit(s, { ...snapshot(s), answers: [...s.answers, answer] }),
          log: { ...s.log, answerCount: s.log.answerCount + 1 },
        });
        return true;
      },

      removeAnswer: (id) => {
        const s = get();
        set(commit(s, { ...snapshot(s), answers: s.answers.filter((a) => a.id !== id) }));
      },

      chooseAnswer: (id) => {
        const s = get();
        const answers = s.answers.map((a) => ({ ...a, selected: a.id === id }));
        const chosen = answers.find((a) => a.selected);
        const stats = computeStats(s.nodes, s.edges, s.operatorUsages);
        const finishedAt = Date.now();
        const log: SessionLog = {
          ...s.log,
          finishedAt,
          durationMs: finishedAt - s.log.startedAt,
          nodeCount: stats.volume,
          maxDepth: stats.depth,
          crossEdgeCount: stats.cross,
          answerCount: answers.length,
          finalAnswer: chosen?.text ?? null,
        };
        appendLog(log);
        set({ ...commit(s, { ...snapshot(s), answers }), log, phase: 'result' });
      },

      backToMap: () => set({ phase: 'map' }),

      restart: () => set(freshSession(get().topicId)),

      goNextTopic: () => set(freshSession(nextTopicId(get().topicId))),

      setTopic: (topicId) => set(freshSession(topicId)),

      undo: () => {
        const s = get();
        if (!s.past.length) return;
        const prev = s.past[s.past.length - 1];
        set({
          ...prev,
          past: s.past.slice(0, -1),
          future: [snapshot(s), ...s.future].slice(0, MAX_HISTORY),
          selectedIds: s.selectedIds.filter((id) => prev.nodes.some((n) => n.id === id)),
        });
      },

      redo: () => {
        const s = get();
        if (!s.future.length) return;
        const next = s.future[0];
        set({
          ...next,
          past: [...s.past, snapshot(s)].slice(-MAX_HISTORY),
          future: s.future.slice(1),
          selectedIds: s.selectedIds.filter((id) => next.nodes.some((n) => n.id === id)),
        });
      },
    }),
    {
      name: 'oogiri-training/session/v1',
      version: 1,
      partialize: (s) => ({
        topicId: s.topicId,
        nodes: s.nodes,
        edges: s.edges,
        operatorUsages: s.operatorUsages,
        answers: s.answers,
        achieved: s.achieved,
        selectedIds: s.selectedIds,
        lastWord: s.lastWord,
        phase: s.phase,
        log: s.log,
      }),
    },
  ),
);
