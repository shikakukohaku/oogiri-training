import type { Category, CategoryDef } from '../types';

export const CATEGORIES: CategoryDef[] = [
  { id: 'other', label: '未分類', color: '#f3efe4', ink: '#5c5449' },
  { id: 'thing', label: 'モノ', color: '#d9ebf7', ink: '#25587a' },
  { id: 'action', label: '行動', color: '#dcefdc', ink: '#2f6b3a' },
  { id: 'trait', label: '特徴', color: '#fbe6cf', ink: '#8a5320' },
  { id: 'emotion', label: '感情', color: '#f9dcdc', ink: '#8f3a3a' },
  { id: 'common', label: '常識', color: '#e6e1f5', ink: '#4d4183' },
  { id: 'situation', label: '状況', color: '#d8efee', ink: '#22645f' },
  { id: 'word', label: '言葉', color: '#f7e9b8', ink: '#7a6212' },
];

export function categoryDef(id: Category): CategoryDef {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}
