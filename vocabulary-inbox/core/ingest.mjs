/**
 * 抽出結果を「単語帳に何をするか」へ変換する層。
 *
 * 設計書の
 *   10章 自動登録ロジック
 *   11章 重複判定
 *   12章 遭遇を保存する
 *   13章 Known機能
 * をまとめて受け持つ純関数。DB も LLM も触らないので、
 * Next.js の API Route からでも将来のジョブ基盤からでも同じものを呼べる。
 */

import { normalizeLemma } from './normalize.mjs';
import { findItemProblems } from './schema.mjs';
import { maxItemsForText } from './limits.mjs';

/** 設計書10章の MVP 版フィルタ。 */
export const DEFAULT_REGISTER_RULE = { minConfidence: 0.7, minUsefulness: 0.6 };

export function shouldRegister(item, rule = DEFAULT_REGISTER_RULE) {
  return (
    typeof item?.confidence === 'number' &&
    typeof item?.usefulnessScore === 'number' &&
    item.confidence >= rule.minConfidence &&
    item.usefulnessScore >= rule.minUsefulness
  );
}

/**
 * 同点のとき熟語・慣用表現を単語より前に出す。
 * 設計書5章「語学学習では単語より熟語の方が価値が高いケースも多い」に合わせた弱い優先度。
 */
const TYPE_WEIGHT = { idiom: 2, phrase: 1, word: 0 };

/**
 * 登録候補の並べ替え。
 *
 * MVPでは usefulnessScore がほぼ全てで、あとは決定性のためのタイブレークしかしない。
 * 設計書10章にある「過去の遭遇回数 / CEFR / 過去の復習状況」を混ぜるのはこの関数の中だけで済む。
 */
export function compareCandidates(a, b) {
  const byUsefulness = (b?.usefulnessScore ?? 0) - (a?.usefulnessScore ?? 0);
  if (byUsefulness !== 0) return byUsefulness;
  const byConfidence = (b?.confidence ?? 0) - (a?.confidence ?? 0);
  if (byConfidence !== 0) return byConfidence;
  const byType = (TYPE_WEIGHT[b?.type] ?? 0) - (TYPE_WEIGHT[a?.type] ?? 0);
  if (byType !== 0) return byType;
  return normalizeLemma(a?.lemma).localeCompare(normalizeLemma(b?.lemma));
}

export function rankCandidates(items) {
  return [...items].sort(compareCandidates);
}

/**
 * 1回の ingestion をどう反映するかを決める。
 *
 * @param {object} params
 * @param {object[]} params.extracted    LLM が返した ExtractedVocabulary の配列
 * @param {string}  params.text          元の文章（sourceSentence の照合と上限判定に使う）
 * @param {object[]} [params.existingItems]  そのユーザーの既存語 [{ id, normalizedLemma, status }]
 * @param {string[]} [params.knownLemmas]    既知語として扱う見出し語（items 未作成のもの）
 * @param {number}  [params.maxItems]        上限の明示指定。省略時は文章長から決める
 * @param {object}  [params.rule]            自動登録のしきい値
 *
 * @returns {{
 *   maxItems: number,
 *   newItems: object[],     // 新しく vocabulary_items + cards を作るもの
 *   occurrences: object[],  // 既存itemへ occurrences だけ足すもの（カードは作らない）
 *   skipped: object[],      // 何もしないもの（理由つき）
 * }}
 */
export function planIngestion({
  extracted = [],
  text = '',
  existingItems = [],
  knownLemmas = [],
  maxItems,
  rule = DEFAULT_REGISTER_RULE,
} = {}) {
  const limit = maxItems ?? maxItemsForText(text);
  const existingByLemma = new Map(
    existingItems.map((item) => [normalizeLemma(item.normalizedLemma ?? item.lemma), item]),
  );
  const knownSet = new Set(knownLemmas.map(normalizeLemma));

  const newItems = [];
  const occurrences = [];
  const skipped = [];
  const candidates = [];
  const seenInBatch = new Map();

  for (const item of extracted) {
    const normalizedLemma = normalizeLemma(item?.lemma);
    const entry = { normalizedLemma, lemma: item?.lemma, item };

    const problems = findItemProblems(item, text);
    if (problems.length > 0) {
      skipped.push({ ...entry, reason: 'invalid', detail: problems });
      continue;
    }

    // 同じ文章の中で同じ語が二度出ても、遭遇は1件にまとめる（設計書12章）。
    const duplicate = seenInBatch.get(normalizedLemma);
    if (duplicate) {
      skipped.push({ ...entry, reason: 'duplicate-in-batch', detail: [duplicate.item.surfaceForm] });
      continue;
    }
    seenInBatch.set(normalizedLemma, entry);

    const existing = existingByLemma.get(normalizedLemma);
    if (existing) {
      // 既にカードがある語も、known / ignored にした語も、遭遇だけは記録する。
      occurrences.push({
        ...entry,
        vocabularyItemId: existing.id,
        status: existing.status,
        occurrence: toOccurrence(item),
      });
      continue;
    }

    if (knownSet.has(normalizedLemma)) {
      skipped.push({ ...entry, reason: 'known' });
      continue;
    }
    if (typeof item.confidence !== 'number' || item.confidence < rule.minConfidence) {
      skipped.push({ ...entry, reason: 'low-confidence', detail: [item.confidence] });
      continue;
    }
    if (typeof item.usefulnessScore !== 'number' || item.usefulnessScore < rule.minUsefulness) {
      skipped.push({ ...entry, reason: 'low-usefulness', detail: [item.usefulnessScore] });
      continue;
    }
    candidates.push(entry);
  }

  const ranked = [...candidates].sort((a, b) => compareCandidates(a.item, b.item));
  for (const [index, entry] of ranked.entries()) {
    if (index < limit) {
      newItems.push({
        ...entry,
        item: toVocabularyItem(entry.item),
        occurrence: toOccurrence(entry.item),
      });
    } else {
      skipped.push({ ...entry, reason: 'over-limit' });
    }
  }

  return { maxItems: limit, newItems, occurrences, skipped };
}

/** vocabulary_items に入れる形（設計書14章）。surfaceForm は occurrences 側へ回す。 */
function toVocabularyItem(item) {
  return {
    lemma: item.lemma,
    normalizedLemma: normalizeLemma(item.lemma),
    type: item.type,
    partOfSpeech: item.partOfSpeech ?? null,
    meaningJa: item.meaningJa,
    cefr: item.cefr ?? null,
    status: 'learning',
  };
}

/** occurrences に入れる形（設計書14章）。 */
function toOccurrence(item) {
  return {
    surfaceForm: item.surfaceForm,
    sourceSentence: item.sourceSentence,
    sentenceJa: item.sentenceJa,
  };
}

/** 登録直後の「✓ 8個の表現を追加しました」用（設計書4章・20章）。 */
export function summarizePlan(plan) {
  return {
    addedItems: plan.newItems.length,
    duplicateItems: plan.occurrences.length,
    skippedItems: plan.skipped.length,
    addedLemmas: plan.newItems.map((entry) => entry.lemma),
  };
}
