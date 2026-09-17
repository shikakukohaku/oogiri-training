/**
 * 設計書 8章「LLM出力」の ExtractedVocabulary に対応する JSON Schema と、
 * スキーマに通った後の値の健全性チェック。
 *
 * Structured Output に対応していないモデルへ差し替える場合でも、
 * validateExtractedItem() 側は共通で使える。
 */

import { containsNormalized } from './normalize.mjs';

export const VOCABULARY_TYPES = ['word', 'phrase', 'idiom'];
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const extractedVocabularyItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'surfaceForm',
    'lemma',
    'type',
    'meaningJa',
    'sourceSentence',
    'sentenceJa',
    'usefulnessScore',
    'confidence',
  ],
  properties: {
    surfaceForm: { type: 'string', description: '原文に現れた形。活用・語形変化したまま。' },
    lemma: { type: 'string', description: '辞書形。再帰動詞は se を含める。' },
    type: { type: 'string', enum: VOCABULARY_TYPES },
    partOfSpeech: { type: 'string' },
    meaningJa: { type: 'string', description: '日本語の語義。複数あれば読点区切り。' },
    sourceSentence: { type: 'string', description: '原文からそのまま抜き出した文。創作禁止。' },
    sentenceJa: { type: 'string', description: 'sourceSentence の日本語訳。' },
    cefr: { type: 'string', enum: CEFR_LEVELS },
    usefulnessScore: { type: 'number', minimum: 0, maximum: 1 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
};

export const extractionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      description: '学習価値の高い順。',
      items: extractedVocabularyItemSchema,
    },
  },
};

/**
 * 1項目を検証する。返り値は問題点の配列（空なら問題なし）。
 * ここで見るのはスキーマだけでは表せない制約（必須項目・値域）。原文との照合は score.mjs 側。
 */
export function validateExtractedItem(item) {
  const problems = [];
  const str = (key) => typeof item?.[key] === 'string' && item[key].trim() !== '';

  for (const key of ['surfaceForm', 'lemma', 'meaningJa', 'sourceSentence', 'sentenceJa']) {
    if (!str(key)) problems.push(`${key} が空または文字列でない`);
  }
  if (!VOCABULARY_TYPES.includes(item?.type)) problems.push(`type が不正: ${item?.type}`);
  if (item?.cefr != null && !CEFR_LEVELS.includes(item.cefr)) {
    problems.push(`cefr が不正: ${item.cefr}`);
  }
  for (const key of ['usefulnessScore', 'confidence']) {
    const value = item?.[key];
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
      problems.push(`${key} が 0〜1 の数値でない: ${value}`);
    }
  }
  return problems;
}

/**
 * スキーマ検証に加えて、原文との突き合わせまで行う。
 * 設計書9章の「元文章に存在しない例文を作らない / sourceSentence は原文をそのまま使う」は
 * 事後に機械で確かめられる数少ないルールなので、抽出と評価の両方でここを通す。
 */
export function findItemProblems(item, sourceText) {
  const problems = validateExtractedItem(item);
  if (sourceText != null) {
    if (!containsNormalized(sourceText, item?.sourceSentence)) {
      problems.push('sourceSentence が原文に無い（捏造の疑い）');
    }
    if (!containsNormalized(sourceText, item?.surfaceForm)) {
      problems.push('surfaceForm が原文に無い');
    }
  }
  return problems;
}
