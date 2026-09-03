import type { Category, CategoryDef } from '../types';

/**
 * リソグラフ印刷のような、版で刷ったベタ色。
 * color = 付箋の地色 / deep = 枝線やラベルに使う濃い同系色。
 */
export const CATEGORIES: CategoryDef[] = [
  { id: 'other', label: '未分類', color: '#fffdf4', deep: '#8c8474' },
  { id: 'thing', label: 'モノ', color: '#b9e0f7', deep: '#1c6b96' },
  { id: 'action', label: '行動', color: '#c6e9ad', deep: '#3d7a2a' },
  { id: 'trait', label: '特徴', color: '#ffd8a3', deep: '#a35c14' },
  { id: 'emotion', label: '感情', color: '#ffb6c8', deep: '#b1315c' },
  { id: 'common', label: '常識', color: '#d8d3f2', deep: '#4b429c' },
  { id: 'situation', label: '状況', color: '#a4e5db', deep: '#12756a' },
  { id: 'word', label: '言葉', color: '#ffe27a', deep: '#8a6b06' },
];

export function categoryDef(id: Category): CategoryDef {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}
