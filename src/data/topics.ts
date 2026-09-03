import type { Topic } from '../types';

/** 最初から入っているお題 */
export const PRESET_TOPICS: Topic[] = [
  {
    id: 'alarm',
    text: '絶対に売れない目覚まし時計の特徴とは？',
    root: '絶対に売れない目覚まし時計',
  },
  {
    id: 'zoo',
    text: 'この動物園、かなり経営が苦しそう。なぜ？',
    root: '経営が苦しそうな動物園',
  },
  {
    id: 'conveni',
    text: 'こんなコンビニは嫌だ。どんなコンビニ？',
    root: '嫌なコンビニ',
  },
  {
    id: 'hero',
    text: '世界一やる気のないヒーロー。どんなヒーロー？',
    root: '世界一やる気のないヒーロー',
  },
  {
    id: 'school',
    text: 'この学校、校長がYouTuberだな。なぜ分かった？',
    root: '校長がYouTuberの学校',
  },
];

export function isPresetTopic(id: string): boolean {
  return PRESET_TOPICS.some((t) => t.id === id);
}

/**
 * お題の文からマップ中央に置く短い言葉を作る。
 * 完璧には決められないので、入力欄の初期値として出して直してもらう。
 */
export function deriveRoot(text: string): string {
  const trimmed = text.trim();
  const head = trimmed.split(/[。．]/)[0] ?? trimmed;
  const base = head.length >= 4 ? head : trimmed;
  const cleaned = base
    .replace(/[？?！!。．\s]+$/g, '')
    .replace(/(とは|なのか|だろうか)$/, '')
    .trim();
  return (cleaned || trimmed).slice(0, 24);
}
