import type { Topic } from '../types';

export const TOPICS: Topic[] = [
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

export function topicById(id: string): Topic {
  return TOPICS.find((t) => t.id === id) ?? TOPICS[0];
}

export function nextTopicId(id: string): string {
  const i = TOPICS.findIndex((t) => t.id === id);
  return TOPICS[(i + 1 + TOPICS.length) % TOPICS.length].id;
}
