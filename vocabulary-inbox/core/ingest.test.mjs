import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyLength, maxItemsForText } from './limits.mjs';
import { planIngestion, rankCandidates, summarizePlan } from './ingest.mjs';

const TEXT = [
  'No me atrevo a decirle la verdad.',
  'Me da rabia que el equipo se venga abajo.',
  'Sin embargo, nadie se dio cuenta.',
].join(' ');

function extracted(overrides = {}) {
  return {
    surfaceForm: 'me atrevo',
    lemma: 'atreverse',
    type: 'word',
    partOfSpeech: 'verb',
    meaningJa: '思い切って〜する',
    sourceSentence: 'No me atrevo a decirle la verdad.',
    sentenceJa: '彼に本当のことを言う勇気がない。',
    cefr: 'B1',
    usefulnessScore: 0.9,
    confidence: 0.95,
    ...overrides,
  };
}

const daRabia = extracted({
  lemma: 'dar rabia',
  surfaceForm: 'da rabia',
  type: 'phrase',
  sourceSentence: 'Me da rabia que el equipo se venga abajo.',
  usefulnessScore: 0.8,
});

const darseCuenta = extracted({
  lemma: 'darse cuenta',
  surfaceForm: 'se dio cuenta',
  type: 'phrase',
  sourceSentence: 'Sin embargo, nadie se dio cuenta.',
  usefulnessScore: 0.7,
});

test('文章の長さで登録上限が変わる（設計書10章）', () => {
  assert.equal(classifyLength('a'.repeat(200)).kind, 'short');
  assert.equal(maxItemsForText('a'.repeat(200)), 5);
  assert.equal(maxItemsForText('a'.repeat(1000)), 10);
  assert.equal(maxItemsForText('a'.repeat(50000)), 15);
});

test('ユーザー設定の上限は既定値を上回れない', () => {
  assert.equal(maxItemsForText('a'.repeat(1000), 3), 3);
  assert.equal(maxItemsForText('a'.repeat(1000), 99), 10);
  assert.equal(maxItemsForText('a'.repeat(1000), 0), 10);
  assert.equal(maxItemsForText('a'.repeat(1000), null), 10);
});

test('rankCandidates は usefulnessScore 順、同点なら熟語を先に出す', () => {
  const ranked = rankCandidates([
    extracted({ lemma: 'word-b', usefulnessScore: 0.7 }),
    extracted({ lemma: 'phrase-a', usefulnessScore: 0.7, type: 'idiom' }),
    extracted({ lemma: 'top', usefulnessScore: 0.95 }),
  ]);
  assert.deepEqual(ranked.map((item) => item.lemma), ['top', 'phrase-a', 'word-b']);
});

test('上限を超えた分は over-limit として登録しない', () => {
  const plan = planIngestion({
    text: TEXT,
    extracted: [extracted(), daRabia, darseCuenta],
    maxItems: 2,
  });
  assert.deepEqual(plan.newItems.map((entry) => entry.lemma), ['atreverse', 'dar rabia']);
  assert.deepEqual(
    plan.skipped.map((entry) => [entry.lemma, entry.reason]),
    [['darse cuenta', 'over-limit']],
  );
});

test('既存語は新しいカードを作らず遭遇だけ足す（設計書12章）', () => {
  const plan = planIngestion({
    text: TEXT,
    extracted: [extracted(), daRabia],
    existingItems: [{ id: 'item-1', normalizedLemma: 'atreverse', status: 'learning' }],
  });
  assert.deepEqual(plan.newItems.map((entry) => entry.lemma), ['dar rabia']);
  assert.equal(plan.occurrences.length, 1);
  assert.deepEqual(plan.occurrences[0].occurrence, {
    surfaceForm: 'me atrevo',
    sourceSentence: 'No me atrevo a decirle la verdad.',
    sentenceJa: '彼に本当のことを言う勇気がない。',
  });
  assert.equal(plan.occurrences[0].vocabularyItemId, 'item-1');
});

test('known / ignored にした語も遭遇だけは記録する（設計書13章）', () => {
  const plan = planIngestion({
    text: TEXT,
    extracted: [extracted(), daRabia],
    existingItems: [
      { id: 'item-1', normalizedLemma: 'atreverse', status: 'known' },
      { id: 'item-2', normalizedLemma: 'dar rabia', status: 'ignored' },
    ],
  });
  assert.equal(plan.newItems.length, 0);
  assert.deepEqual(plan.occurrences.map((entry) => entry.status), ['known', 'ignored']);
});

test('既存語の照合はアクセントを残したまま表記ゆれを吸収する（設計書11章）', () => {
  const plan = planIngestion({
    text: TEXT,
    extracted: [extracted({ lemma: '  Darse   Cuenta  ', surfaceForm: 'se dio cuenta', sourceSentence: 'Sin embargo, nadie se dio cuenta.' })],
    existingItems: [{ id: 'item-9', normalizedLemma: 'darse cuenta', status: 'learning' }],
  });
  assert.equal(plan.newItems.length, 0);
  assert.equal(plan.occurrences[0].vocabularyItemId, 'item-9');
});

test('item が無くても既知語なら登録しない', () => {
  const plan = planIngestion({
    text: TEXT,
    extracted: [extracted()],
    knownLemmas: ['Atreverse'],
  });
  assert.deepEqual(plan.skipped.map((entry) => entry.reason), ['known']);
});

test('しきい値割れは理由つきで落とす（設計書10章）', () => {
  const plan = planIngestion({
    text: TEXT,
    extracted: [
      extracted({ confidence: 0.5 }),
      daRabia,
      { ...darseCuenta, usefulnessScore: 0.4 },
    ],
  });
  assert.deepEqual(plan.newItems.map((entry) => entry.lemma), ['dar rabia']);
  assert.deepEqual(plan.skipped.map((entry) => entry.reason), ['low-confidence', 'low-usefulness']);
});

test('原文に無い例文は invalid として捨てる（設計書9章）', () => {
  const plan = planIngestion({
    text: TEXT,
    extracted: [extracted({ sourceSentence: 'Esta frase no está en el texto.' })],
  });
  assert.equal(plan.newItems.length, 0);
  assert.equal(plan.skipped[0].reason, 'invalid');
  assert.match(plan.skipped[0].detail.join(), /sourceSentence/);
});

test('同じ文章に同じ語が二度出ても遭遇は1件にまとめる', () => {
  const plan = planIngestion({
    text: TEXT,
    extracted: [extracted(), extracted({ surfaceForm: 'atrevo' })],
  });
  assert.equal(plan.newItems.length, 1);
  assert.deepEqual(plan.skipped.map((entry) => entry.reason), ['duplicate-in-batch']);
});

test('newItems は vocabulary_items の形に整形される（設計書14章）', () => {
  const plan = planIngestion({ text: TEXT, extracted: [extracted()] });
  assert.deepEqual(plan.newItems[0].item, {
    lemma: 'atreverse',
    normalizedLemma: 'atreverse',
    type: 'word',
    partOfSpeech: 'verb',
    meaningJa: '思い切って〜する',
    cefr: 'B1',
    status: 'learning',
  });
});

test('summarizePlan は登録直後の表示に必要な数を返す（設計書4章・20章）', () => {
  const plan = planIngestion({
    text: TEXT,
    extracted: [extracted(), daRabia, darseCuenta],
    existingItems: [{ id: 'item-1', normalizedLemma: 'dar rabia', status: 'learning' }],
    maxItems: 1,
  });
  assert.deepEqual(summarizePlan(plan), {
    addedItems: 1,
    duplicateItems: 1,
    skippedItems: 1,
    addedLemmas: ['atreverse'],
  });
});
