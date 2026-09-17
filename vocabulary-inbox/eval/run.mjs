#!/usr/bin/env node
/**
 * 語彙抽出の評価ランナー。
 *
 *   node vocabulary-inbox/eval/run.mjs                    # DeepSeek で全20ケース
 *   node vocabulary-inbox/eval/run.mjs --extractor baseline
 *   node vocabulary-inbox/eval/run.mjs --cases yt-03,lit-01 --max-items 8
 *
 * 結果は results/ に JSON と、人手評価用の Markdown を書き出す。
 * 設計書 31章の「抽出結果 → 人間が見て評価 → Prompt修正」を回すための道具。
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBaselineExtractor, createDeepSeekExtractor } from '../core/extractor.mjs';
import { DEFAULT_REGISTER_RULE, scoreCase, summarize } from './lib/score.mjs';

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const dataset = JSON.parse(await readFile(resolve(here, options.dataset), 'utf8'));
  const cases = selectCases(dataset.cases, options);
  if (cases.length === 0) throw new Error('対象ケースがありません');

  const extractor = createExtractor(options);
  console.log(`extractor: ${extractor.name}`);
  console.log(`cases: ${cases.length} / maxItems: ${options.maxItems}\n`);

  const caseResults = [];
  for (const testCase of cases) {
    process.stdout.write(`- ${testCase.id} ... `);
    const startedAt = Date.now();
    try {
      const { items, usage } = await extractor.extract({
        targetLanguage: dataset.targetLanguage,
        nativeLanguage: dataset.nativeLanguage,
        learnerLevel: dataset.learnerLevel,
        knownWords: testCase.knownWords ?? [],
        maxItems: options.maxItems,
        text: testCase.text,
      });
      const result = scoreCase({ testCase, items, rule: DEFAULT_REGISTER_RULE });
      result.usage = usage;
      result.elapsedMs = Date.now() - startedAt;
      caseResults.push(result);
      console.log(
        `登録${result.registeredCount} / 期待${result.foundExpected.length}/${result.expectedCount}` +
          `${result.violations.length > 0 ? ` / 除外語${result.violations.length}` : ''}` +
          `${result.invalidCount > 0 ? ` / 不正${result.invalidCount}` : ''}`,
      );
    } catch (error) {
      console.log(`失敗: ${error.message}`);
      caseResults.push({
        caseId: testCase.id,
        sourceType: testCase.sourceType,
        register: testCase.register,
        error: String(error.message ?? error),
        extractedCount: 0,
        registeredCount: 0,
        expectedCount: (testCase.shouldPick ?? []).length,
        foundExpected: [],
        missedExpected: testCase.shouldPick ?? [],
        recall: 0,
        violations: [],
        noiseRate: null,
        invalidCount: 0,
        problems: [],
        items: [],
      });
    }
  }

  const summary = summarize(caseResults);
  printSummary(summary);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const slug = extractor.name.replace(/[^a-z0-9]+/gi, '-');
  const outDir = resolve(here, options.out);
  await mkdir(outDir, { recursive: true });

  const jsonPath = join(outDir, `${stamp}-${slug}.json`);
  const mdPath = join(outDir, `${stamp}-${slug}.md`);
  await writeFile(
    jsonPath,
    `${JSON.stringify(
      { runAt: new Date().toISOString(), extractor: extractor.name, options, summary, caseResults },
      null,
      2,
    )}\n`,
  );
  await writeFile(mdPath, renderReport({ extractor, options, summary, caseResults, cases }));

  console.log(`\n結果:      ${jsonPath}`);
  console.log(`評価シート: ${mdPath}`);
}

function createExtractor(options) {
  if (options.extractor === 'baseline') return createBaselineExtractor();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      'DEEPSEEK_API_KEY が未設定です。キー無しで動きを見るなら --extractor baseline を使ってください。',
    );
  }
  return createDeepSeekExtractor({
    apiKey,
    model: process.env.DEEPSEEK_MODEL || undefined,
    baseUrl: process.env.DEEPSEEK_BASE_URL || undefined,
    extraBody: process.env.DEEPSEEK_EXTRA_BODY ? JSON.parse(process.env.DEEPSEEK_EXTRA_BODY) : {},
  });
}

function selectCases(allCases, options) {
  let cases = allCases;
  if (options.caseIds.length > 0) {
    cases = cases.filter((testCase) => options.caseIds.includes(testCase.id));
    const missing = options.caseIds.filter((id) => !cases.some((c) => c.id === id));
    if (missing.length > 0) throw new Error(`知らないケースID: ${missing.join(', ')}`);
  }
  return options.limit > 0 ? cases.slice(0, options.limit) : cases;
}

function parseArgs(argv) {
  const options = {
    extractor: 'deepseek',
    dataset: 'dataset/es-ja.json',
    out: 'results',
    maxItems: 10,
    limit: 0,
    caseIds: [],
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[(i += 1)];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--extractor') options.extractor = next();
    else if (arg === '--dataset') options.dataset = next();
    else if (arg === '--out') options.out = next();
    else if (arg === '--max-items') options.maxItems = Number(next());
    else if (arg === '--limit') options.limit = Number(next());
    else if (arg === '--cases') options.caseIds = next().split(',').map((id) => id.trim());
    else throw new Error(`知らないオプション: ${arg}`);
  }
  if (!['deepseek', 'baseline'].includes(options.extractor)) {
    throw new Error(`--extractor は deepseek か baseline: ${options.extractor}`);
  }
  return options;
}

function printHelp() {
  console.log(
    [
      '使い方: node vocabulary-inbox/eval/run.mjs [options]',
      '',
      '  --extractor <deepseek|baseline>  抽出器（既定: deepseek）',
      '  --cases <id,id,...>              対象ケースを限定',
      '  --limit <n>                      先頭n件だけ',
      '  --max-items <n>                  1文章あたりの上限（既定: 10）',
      '  --dataset <path>                 データセット（既定: dataset/es-ja.json）',
      '  --out <dir>                      出力先（既定: results）',
      '',
      '環境変数: DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL / DEEPSEEK_EXTRA_BODY',
    ].join('\n'),
  );
}

function printSummary(summary) {
  console.log('\n── サマリ ──');
  console.log(`ケース数           ${summary.cases}`);
  console.log(`抽出合計           ${summary.extractedTotal}`);
  console.log(
    `登録合計           ${summary.registeredTotal}（1文章あたり ${summary.registeredPerCase.toFixed(1)}）`,
  );
  console.log(`期待語の再現率     ${percent(summary.recallMacro)}`);
  console.log(`除外語の混入       ${summary.violationTotal}件 / ${percent(summary.noiseRate)}`);
  console.log(`不正な項目         ${summary.invalidTotal}件 / ${percent(summary.invalidRate)}`);
}

function percent(value) {
  return value == null ? '-' : `${(value * 100).toFixed(1)}%`;
}

function renderReport({ extractor, options, summary, caseResults, cases }) {
  const caseById = new Map(cases.map((testCase) => [testCase.id, testCase]));
  const lines = [
    '# 語彙抽出 評価シート',
    '',
    `- 実行日時: ${new Date().toISOString()}`,
    `- 抽出器: \`${extractor.name}\``,
    `- maxItems: ${options.maxItems}`,
    `- 自動登録条件: confidence >= ${DEFAULT_REGISTER_RULE.minConfidence} かつ usefulnessScore >= ${DEFAULT_REGISTER_RULE.minUsefulness}`,
    '',
    '## サマリ',
    '',
    '| 指標 | 値 |',
    '| --- | --- |',
    `| ケース数 | ${summary.cases} |`,
    `| 抽出合計 | ${summary.extractedTotal} |`,
    `| 登録合計 | ${summary.registeredTotal}（1文章あたり ${summary.registeredPerCase.toFixed(1)}） |`,
    `| 期待語の再現率 | ${percent(summary.recallMacro)} |`,
    `| 除外語の混入 | ${summary.violationTotal}件 / ${percent(summary.noiseRate)} |`,
    `| 不正な項目 | ${summary.invalidTotal}件 / ${percent(summary.invalidRate)} |`,
    '',
    '## 人手評価のしかた',
    '',
    '各項目の「評価」欄を埋める。',
    '',
    '- `◎` … まさに覚えたかった表現',
    '- `○` … 登録されていて困らない',
    '- `△` … どちらでもない',
    '- `×` … 邪魔。登録されたら削除する',
    '',
    '`×` の割合が2割を超えたら Prompt かフィルタ条件を直す（設計書28章）。',
    '',
  ];

  for (const result of caseResults) {
    const testCase = caseById.get(result.caseId);
    lines.push(`## ${result.caseId} — ${result.register ?? ''}`, '');
    lines.push('> ' + (testCase?.text ?? '').replace(/\n+/g, ' '), '');
    if (result.error) {
      lines.push(`**失敗**: ${result.error}`, '');
      continue;
    }
    lines.push('| 評価 | lemma | 種別 | 意味 | use | conf | 登録 | 自動判定 |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const entry of result.items) {
      const item = entry.item ?? {};
      lines.push(
        `|  | ${escapeCell(item.lemma)} | ${escapeCell(item.type)} | ${escapeCell(item.meaningJa)} | ` +
          `${formatScore(item.usefulnessScore)} | ${formatScore(item.confidence)} | ` +
          `${entry.registered ? '○' : '—'} | ${verdictLabel(entry)} |`,
      );
    }
    lines.push('');
    if (result.missedExpected.length > 0) {
      lines.push(`- 拾えなかった期待語: ${result.missedExpected.join(' / ')}`);
    }
    if (result.violations.length > 0) {
      lines.push(`- 除外したかった語を登録: ${result.violations.join(' / ')}`);
    }
    for (const problem of result.problems) {
      lines.push(`- ⚠ ${problem.lemma}: ${problem.problems.join(' / ')}`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function verdictLabel(entry) {
  if (entry.violatedSkip) return `除外語（${entry.violatedSkip}）`;
  if (entry.verdict === 'expected') return `期待語（${entry.matchedExpected.join(', ')}）`;
  return '想定外';
}

function formatScore(value) {
  return typeof value === 'number' ? value.toFixed(2) : '-';
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
}

main().catch((error) => {
  console.error(`\nエラー: ${error.message}`);
  process.exitCode = 1;
});
