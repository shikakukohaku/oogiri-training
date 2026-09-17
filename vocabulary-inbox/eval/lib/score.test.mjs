import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_REGISTER_RULE, scoreCase, shouldRegister, summarize } from './score.mjs';

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

