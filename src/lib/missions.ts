import type { Answer, IdeaEdge, IdeaNode, OperatorUsage, Stats } from '../types';
import { computeStats } from './tree';

export interface MissionContext {
  stats: Stats;
  answers: Answer[];
  /** あるあるノードを対象にずらしを使ったか */
  shiftedAruaru: boolean;
}

export interface Mission {
  id: string;
  label: string;
  done: (ctx: MissionContext) => boolean;
  progress: (ctx: MissionContext) => [number, number];
}

export const MISSIONS: Mission[] = [
  {
    id: 'spread5',
    label: 'まず関連する言葉を5個出そう',
    done: ({ stats }) => stats.volume >= 5,
    progress: ({ stats }) => [Math.min(stats.volume, 5), 5],
  },
  {
    id: 'aruaru3',
    label: '「あるある」を3つ出そう',
    done: ({ stats }) => stats.aruaru >= 3,
    progress: ({ stats }) => [Math.min(stats.aruaru, 3), 3],
  },
  {
    id: 'shiftAruaru',
    label: 'あるあるをずらしてみよう',
    done: ({ shiftedAruaru }) => shiftedAruaru,
    progress: ({ shiftedAruaru }) => [shiftedAruaru ? 1 : 0, 1],
  },
  {
    id: 'cross1',
    label: '離れた2つの枝を繋いでみよう',
    done: ({ stats }) => stats.cross >= 1,
    progress: ({ stats }) => [Math.min(stats.cross, 1), 1],
  },
  {
    id: 'answer3',
    label: '回答を3つ作ろう',
    done: ({ answers }) => answers.length >= 3,
    progress: ({ answers }) => [Math.min(answers.length, 3), 3],
  },
];

/** あるあるノードに対してずらしを使ったことがあるか */
export function hasShiftedAruaru(nodes: IdeaNode[], operatorUsages: OperatorUsage[]): boolean {
  const aruaru = new Set(nodes.filter((n) => n.kind === 'aruaru').map((n) => n.id));
  return operatorUsages.some((u) => u.selectedNodeIds.some((id) => aruaru.has(id)));
}

/** 現在の状態から、達成済みミッション id を求める。 */
export function achievedMissions(
  nodes: IdeaNode[],
  edges: IdeaEdge[],
  operatorUsages: OperatorUsage[],
  answers: Answer[],
): string[] {
  const stats = computeStats(nodes, edges, operatorUsages);
  const shiftedAruaru = hasShiftedAruaru(nodes, operatorUsages);
  return MISSIONS.filter((m) => m.done({ stats, answers, shiftedAruaru })).map((m) => m.id);
}
