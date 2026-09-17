import { test } from 'node:test';
import assert from 'node:assert/strict';

import { containsNormalized, normalizeLemma } from './normalize.mjs';
import { splitIntoChunks, splitIntoSentences } from './chunk.mjs';
import { validateExtractedItem } from './schema.mjs';
import { DEFAULT_REGISTER_RULE, scoreCase, shouldRegister, summarize } from './score.mjs';
import { createDeepSeekExtractor } from './extractor.mjs';

test('normalizeLemma はアクセントを残したまま表記を揃える', () => {
  assert.equal(normalizeLemma('  Darse   Cuenta '), 'darse cuenta');
  assert.equal(normalizeLemma('Atrevió'), 'atrevió');
  assert.notEqual(normalizeLemma('atrevió'), normalizeLemma('atrevio'));
  assert.equal(normalizeLemma('café'), normalizeLemma('café'));
});

test('containsNormalized は引用符とダッシュの揺れを吸収する', () => {
  const text = '— Oye, ¿al final te vienes el sábado?';
  assert.ok(containsNormalized(text, '- Oye, ¿al final te vienes el sábado?'));
  assert.ok(!containsNormalized(text, 'Nunca dijo eso.'));
});

test('splitIntoChunks は短文をそのまま返し、長文は文境界で切る', () => {
  assert.deepEqual(splitIntoChunks('Hola. Adiós.'), ['Hola. Adiós.']);
  const long = Array.from({ length: 400 }, (_, i) => `Frase número ${i}.`).join(' ');
  const chunks = splitIntoChunks(long, { maxChars: 500 });
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.ok(chunk.length <= 500);
  assert.equal(chunks.join(' ').replace(/\s+/g, ' '), long.replace(/\s+/g, ' '));
});

test('splitIntoSentences はスペイン語の疑問符・感嘆符でも切れる', () => {
  assert.deepEqual(splitIntoSentences('¿Vienes? ¡Claro! Nos vemos.'), [
    '¿Vienes?',
    '¡Claro!',
    'Nos vemos.',
  ]);
});

test('validateExtractedItem はスコアの値域と必須項目を見る', () => {
  const base = {
    surfaceForm: 'me atrevo',
    lemma: 'atreverse',
    type: 'word',
    meaningJa: '思い切って〜する',
    sourceSentence: 'No me atrevo a decirle la verdad.',
    sentenceJa: '彼に本当のことを言う勇気がない。',
    usefulnessScore: 0.9,
    confidence: 0.98,
  };
  assert.deepEqual(validateExtractedItem(base), []);
  assert.ok(validateExtractedItem({ ...base, confidence: 1.4 }).length === 1);
  assert.ok(validateExtractedItem({ ...base, type: 'collocation' }).length === 1);
  assert.ok(validateExtractedItem({ ...base, cefr: 'B3' }).length === 1);
  assert.deepEqual(validateExtractedItem({ ...base, cefr: 'B1' }), []);
});

test('shouldRegister は設計書10章のしきい値どおり', () => {
  assert.ok(shouldRegister({ confidence: 0.7, usefulnessScore: 0.6 }, DEFAULT_REGISTER_RULE));
  assert.ok(!shouldRegister({ confidence: 0.69, usefulnessScore: 0.9 }, DEFAULT_REGISTER_RULE));
  assert.ok(!shouldRegister({ confidence: 0.9 }, DEFAULT_REGISTER_RULE));
});

const testCase = {
  id: 'unit-01',
  text: 'Nunca se atrevió a preguntarle por qué se había marchado.',
  shouldPick: ['atreverse', 'marcharse'],
  shouldSkip: ['preguntar'],
};

function item(overrides) {
  return {
    surfaceForm: 'se atrevió',
    lemma: 'atreverse',
    type: 'word',
    meaningJa: '思い切って〜する',
    sourceSentence: 'Nunca se atrevió a preguntarle por qué se había marchado.',
    sentenceJa: 'なぜ去ったのか、ついに聞く勇気がなかった。',
    usefulnessScore: 0.9,
    confidence: 0.95,
    ...overrides,
  };
}

test('scoreCase は期待語・除外語・登録判定を数える', () => {
  const result = scoreCase({
    testCase,
    items: [
      item({}),
      item({ lemma: 'preguntar', surfaceForm: 'preguntarle' }),
      item({ lemma: 'marcharse', surfaceForm: 'marchado', usefulnessScore: 0.5 }),
    ],
  });
  assert.equal(result.extractedCount, 3);
  assert.equal(result.registeredCount, 2); // marcharse は usefulnessScore 不足で登録されない
  assert.deepEqual(result.foundExpected, ['atreverse']);
  assert.deepEqual(result.missedExpected, ['marcharse']);
  assert.deepEqual(result.violations, ['preguntar']);
  assert.equal(result.recall, 0.5);
});

test('scoreCase は原文に無い例文を捏造として検出する', () => {
  const result = scoreCase({
    testCase,
    items: [item({ sourceSentence: 'No me atrevo a decirle la verdad.' })],
  });
  assert.equal(result.invalidCount, 1);
  assert.match(result.problems[0].problems.join(), /sourceSentence/);
});

test('scoreCase は shouldSkip を厳密一致でしか違反にしない', () => {
  const result = scoreCase({
    testCase,
    items: [item({ lemma: 'preguntar por', surfaceForm: 'preguntarle por' })],
  });
  assert.deepEqual(result.violations, []);
});

test('scoreCase は同じ lemma の重複を検出する', () => {
  const result = scoreCase({ testCase, items: [item({}), item({})] });
  assert.equal(result.invalidCount, 1);
  assert.match(result.problems[0].problems.join(), /重複/);
});

test('summarize は再現率をケース平均で出す', () => {
  const summary = summarize([
    scoreCase({ testCase, items: [item({})] }),
    scoreCase({ testCase, items: [item({}), item({ lemma: 'marcharse', surfaceForm: 'marchado' })] }),
  ]);
  assert.equal(summary.cases, 2);
  assert.equal(summary.recallMacro, 0.75);
  assert.equal(summary.violationTotal, 0);
});

test('DeepSeek 実装は JSON 応答を items 配列にして返す', async () => {
  const calls = [];
  const extractor = createDeepSeekExtractor({
    apiKey: 'test-key',
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '```json\n{"items":[{"lemma":"atreverse"}]}\n```' } }],
          usage: { total_tokens: 42 },
        }),
      };
    },
  });
  const { items, usage } = await extractor.extract({
    targetLanguage: 'es',
    nativeLanguage: 'ja',
    maxItems: 5,
    text: testCase.text,
  });
  assert.deepEqual(items, [{ lemma: 'atreverse' }]);
  assert.equal(usage.total_tokens, 42);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.response_format.type, 'json_object');
  assert.match(calls[0].body.messages[0].content, /最大5項目/);
  assert.match(calls[0].body.messages[1].content, /"targetLanguage": "es"/);
});

test('DeepSeek 実装は 4xx を再試行せずに投げる', async () => {
  let attempts = 0;
  const extractor = createDeepSeekExtractor({
    apiKey: 'test-key',
    fetchImpl: async () => {
      attempts += 1;
      return { ok: false, status: 401, text: async () => 'unauthorized' };
    },
  });
  await assert.rejects(
    () => extractor.extract({ targetLanguage: 'es', nativeLanguage: 'ja', text: 'Hola.' }),
    /401/,
  );
  assert.equal(attempts, 1);
});
