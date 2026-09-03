import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Topic } from '../types';
import { deriveRoot, PRESET_TOPICS } from '../data/topics';
import { uid } from '../lib/uid';

export const MAX_TOPIC_TEXT = 80;
export const MAX_TOPIC_ROOT = 24;

interface TopicsState {
  /** ユーザーが自分で足したお題 */
  custom: Topic[];
  addTopic: (text: string, root?: string) => Topic | null;
  removeTopic: (id: string) => void;
}

export const useTopics = create<TopicsState>()(
  persist(
    (set, get) => ({
      custom: [],

      addTopic: (rawText, rawRoot) => {
        const text = rawText.trim().slice(0, MAX_TOPIC_TEXT);
        if (!text) return null;
        const root = (rawRoot?.trim() || deriveRoot(text)).slice(0, MAX_TOPIC_ROOT);
        const topic: Topic = { id: uid('t'), text, root };
        set({ custom: [...get().custom, topic] });
        return topic;
      },

      removeTopic: (id) => set({ custom: get().custom.filter((t) => t.id !== id) }),
    }),
    { name: 'oogiri-training/topics/v1', version: 1 },
  ),
);

/** プリセット + 自作お題 */
export function allTopics(): Topic[] {
  return [...PRESET_TOPICS, ...useTopics.getState().custom];
}

export function topicById(id: string): Topic {
  return allTopics().find((t) => t.id === id) ?? PRESET_TOPICS[0];
}

export function nextTopicId(id: string): string {
  const topics = allTopics();
  const i = topics.findIndex((t) => t.id === id);
  return topics[(i + 1 + topics.length) % topics.length].id;
}
