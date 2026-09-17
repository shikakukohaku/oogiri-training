/**
 * 設計書10章「自動登録ロジック」の上限。
 *
 * 長いYouTube字幕から50語候補が出ても全部は登録しない。
 * 文章の長さで登録数の上限を変える。
 */

export const INGESTION_LIMITS = [
  { kind: 'short', label: '短文', maxChars: 280, maxItems: 5 },
  { kind: 'normal', label: '通常文章', maxChars: 3000, maxItems: 10 },
  { kind: 'long', label: '長文', maxChars: Infinity, maxItems: 15 },
];

export function classifyLength(text) {
  const length = String(text ?? '').trim().length;
  return INGESTION_LIMITS.find((limit) => length <= limit.maxChars) ?? INGESTION_LIMITS.at(-1);
}

/**
 * この文章から自動登録してよい最大件数。
 * override は learning_profiles.max_items_per_ingestion（ユーザー設定）を想定。
 */
export function maxItemsForText(text, override) {
  const base = classifyLength(text).maxItems;
  if (override == null) return base;
  const limit = Number(override);
  if (!Number.isFinite(limit) || limit <= 0) return base;
  return Math.min(base, Math.floor(limit));
}
