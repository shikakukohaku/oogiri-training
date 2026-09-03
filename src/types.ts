export type Category =
  | 'thing'
  | 'action'
  | 'trait'
  | 'emotion'
  | 'common'
  | 'situation'
  | 'word'
  | 'other';

export interface CategoryDef {
  id: Category;
  /** 付箋の地色 */
  color: string;
  /** 枝線やラベルに使う濃い同系色 */
  deep: string;
  label: string;
}

export interface Topic {
  id: string;
  text: string;
  /** Root ノードに表示する短縮形 */
  root: string;
}

export interface IdeaNode {
  id: string;
  text: string;
  parentId: string | null;
  category: Category;
  position: { x: number; y: number };
}

export type EdgeKind = 'parent' | 'cross';

export interface IdeaEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeKind;
}

export type OperatorId =
  | 'reverse'
  | 'exaggerate'
  | 'minimize'
  | 'personify'
  | 'perspective'
  | 'crossIndustry'
  | 'literal'
  | 'combine';

export interface OperatorDef {
  id: OperatorId;
  label: string;
  hint: string;
  example: string;
  /** 必要な選択ノード数 */
  needs: 1 | 2;
}

export interface OperatorUsage {
  id: string;
  operator: OperatorId;
  selectedNodeIds: string[];
  selectedTexts: string[];
  timestamp: number;
}

export interface Answer {
  id: string;
  text: string;
  selected: boolean;
  createdAt: number;
}

/** 右パネルに出る「ひらめきカード」 */
export interface SparkCard {
  kind: 'operator' | 'random' | 'combine';
  title: string;
  subtitle: string;
  body: string;
  prompt: string;
  nodeIds: string[];
  /** 「ノードにする」で初期値として入れる文字列 */
  seed: string;
  at: number;
}

export interface SessionLog {
  sessionId: string;
  topicId: string;
  topicText: string;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  createdNodeCount: number;
  deletedNodeCount: number;
  crossEdgeCount: number;
  maxDepth: number;
  nodeCount: number;
  operatorsUsed: OperatorId[];
  operatorUseCount: number;
  randomWordCount: number;
  answerCount: number;
  finalAnswer: string | null;
}

export interface Stats {
  /** 発想量: Root を除く総ノード数 */
  volume: number;
  /** 広さ: Root 直下のノード数 */
  width: number;
  /** 深さ: 最大 Depth */
  depth: number;
  /** 横断: 異なる Branch 間を繋いだ Edge 数 */
  cross: number;
  /** ずらし: 使用した演算子の種類数 */
  shifts: number;
}
