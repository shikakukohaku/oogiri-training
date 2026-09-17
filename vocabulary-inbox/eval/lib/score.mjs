/**
 * 抽出結果の採点。
 *
 * 自動で測れるのは「明らかに拾ってほしい語を拾えたか」「明らかに要らない語を
 * 登録していないか」「原文を捏造していないか」までで、最終判断は人手評価に回す。
 * 設計書 31章の評価ループのうち、機械にできる部分だけをここで担当する。
 */

import { containsNormalized, normalizeLemma } from './normalize.mjs';
import { validateExtractedItem } from './schema.mjs';

/** 設計書 10章の自動登録ロジック（MVP版）。 */
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
 * shouldPick との突き合わせは緩く見る。
 * 期待値を "olvidársele a alguien" と書き、lemma が "olvidarse" で返ってきても拾えたと見なす。
 */
function matchesExpected(item, expected) {
  const target = normalizeLemma(expected);
  const candidates = [normalizeLemma(item?.lemma), normalizeLemma(item?.surfaceForm)];
  return candidates.some(
    (candidate) =>
      candidate !== '' &&
      (candidate === target ||
        candidate.includes(` ${target} `) ||
        candidate.startsWith(`${target} `) ||
        candidate.endsWith(` ${target}`) ||
        target.startsWith(`${candidate} `) ||
        target.endsWith(` ${candidate}`)),
  );
}

/** shouldSkip は厳密一致だけを違反とする（"hacer como que" は "hacer" の違反ではない）。 */
function violatesSkip(item, skip) {
  return normalizeLemma(item?.lemma) === normalizeLemma(skip);
}

export function scoreCase({ testCase, items, rule = DEFAULT_REGISTER_RULE }) {
  const expected = testCase.shouldPick ?? [];
  const skip = testCase.shouldSkip ?? [];

  const seenLemmas = new Set();
  const scored = items.map((item) => {
    const problems = validateExtractedItem(item);
    if (!containsNormalized(testCase.text, item?.sourceSentence)) {
      problems.push('sourceSentence が原文に無い（捏造の疑い）');
    }
    if (!containsNormalized(testCase.text, item?.surfaceForm)) {
      problems.push('surfaceForm が原文に無い');
    }
    const key = normalizeLemma(item?.lemma);
    if (seenLemmas.has(key)) problems.push('同じ lemma が重複している');
    seenLemmas.add(key);

    const registered = shouldRegister(item, rule);
    const hitFor = expected.filter((entry) => matchesExpected(item, entry));
    const skipHit = skip.find((entry) => violatesSkip(item, entry)) ?? null;

    return {
      item,
      registered,
      problems,
      matchedExpected: hitFor,
      violatedSkip: skipHit,
      verdict: hitFor.length > 0 ? 'expected' : skipHit ? 'skip-violation' : 'extra',
    };
  });

  const registeredItems = scored.filter((entry) => entry.registered);
  const foundExpected = expected.filter((entry) =>
    registeredItems.some((scoredItem) => matchesExpected(scoredItem.item, entry)),
  );
  const missedExpected = expected.filter((entry) => !foundExpected.includes(entry));
  const violations = registeredItems.filter((entry) => entry.violatedSkip);
  const invalid = scored.filter((entry) => entry.problems.length > 0);

  return {
    caseId: testCase.id,
    sourceType: testCase.sourceType,
    register: testCase.register,
    extractedCount: scored.length,
    registeredCount: registeredItems.length,
    expectedCount: expected.length,
    foundExpected,
    missedExpected,
    recall: expected.length === 0 ? null : foundExpected.length / expected.length,
    violations: violations.map((entry) => entry.item.lemma),
    noiseRate:
      registeredItems.length === 0 ? null : violations.length / registeredItems.length,
    invalidCount: invalid.length,
    problems: invalid.map((entry) => ({
      lemma: entry.item?.lemma ?? '(不明)',
      problems: entry.problems,
    })),
    items: scored,
  };
}

export function summarize(caseResults) {
  const withRecall = caseResults.filter((result) => result.recall != null);
  const totalRegistered = sum(caseResults.map((result) => result.registeredCount));
  const totalViolations = sum(caseResults.map((result) => result.violations.length));
  const totalInvalid = sum(caseResults.map((result) => result.invalidCount));
  const totalExtracted = sum(caseResults.map((result) => result.extractedCount));

  return {
    cases: caseResults.length,
    extractedTotal: totalExtracted,
    registeredTotal: totalRegistered,
    registeredPerCase: caseResults.length === 0 ? 0 : totalRegistered / caseResults.length,
    recallMacro:
      withRecall.length === 0
        ? null
        : sum(withRecall.map((result) => result.recall)) / withRecall.length,
    violationTotal: totalViolations,
    noiseRate: totalRegistered === 0 ? null : totalViolations / totalRegistered,
    invalidTotal: totalInvalid,
    invalidRate: totalExtracted === 0 ? null : totalInvalid / totalExtracted,
  };
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
