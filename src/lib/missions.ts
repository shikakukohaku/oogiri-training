import type { Answer, IdeaEdge, IdeaNode, OperatorUsage, Stats } from '../types';
import { computeStats } from './tree';

export interface Mission {
  id: string;
  label: string;
  done: (ctx: { stats: Stats; answers: Answer[] }) => boolean;
  progress: (ctx: { stats: Stats; answers: Answer[] }) => [number, number];
}

export const MISSIONS: Mission[] = [
  {
    id: 'spread5',
    label: 'まず関連する言葉を5個出そう',
    done: ({ stats }) => stats.volume >= 5,
    progress: ({ stats }) => [Math.min(stats.volume, 5), 5],
  },
  {
    id: 'deep3',
    label: 'どれか1本を3段以上深掘りしよう',
    done: ({ stats }) => stats.depth >= 3,
    progress: ({ stats }) => [Math.min(stats.depth, 3), 3],
  },
  {
    id: 'cross1',
    label: '離れた2つの枝を繋いでみよう',
    done: ({ stats }) => stats.cross >= 1,
    progress: ({ stats }) => [Math.min(stats.cross, 1), 1],
  },
  {
    id: 'shift1',
    label: 'ずらしを1つ使ってみよう',
    done: ({ stats }) => stats.shifts >= 1,
    progress: ({ stats }) => [Math.min(stats.shifts, 1), 1],
  },
  {
    id: 'answer3',
    label: '回答を3つ作ろう',
    done: ({ answers }) => answers.length >= 3,
    progress: ({ answers }) => [Math.min(answers.length, 3), 3],
  },
];

/** 現在の状態から、達成済みミッション id を求める。 */
export function achievedMissions(
  nodes: IdeaNode[],
  edges: IdeaEdge[],
  operatorUsages: OperatorUsage[],
  answers: Answer[],
): string[] {
  const stats = computeStats(nodes, edges, operatorUsages);
  return MISSIONS.filter((m) => m.done({ stats, answers })).map((m) => m.id);
}
