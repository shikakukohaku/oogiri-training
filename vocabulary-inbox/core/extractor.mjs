/**
 * 設計書 6章の VocabularyExtractor。
 *
 *   interface VocabularyExtractor {
 *     extract(input: ExtractionInput): Promise<ExtractedVocabulary[]>
 *   }
 *
 * アプリ本体はこの形だけを知り、DeepSeek 固有の API は触らない。
 */

import { buildSystemPrompt, buildUserMessage } from './prompt.mjs';
import { extractionResponseSchema } from './schema.mjs';
import { splitIntoChunks, splitIntoSentences } from './chunk.mjs';
import { normalizeLemma } from './normalize.mjs';

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-flash';
const RETRIABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * DeepSeek 実装。OpenAI 互換の /chat/completions を叩く。
 *
 * Thinking の無効化フラグだけはモデル世代でパラメータ名が変わりうるので、
 * extraBody（環境変数 DEEPSEEK_EXTRA_BODY）で外から差し込めるようにしてある。
 * 実運用に入れる前に現行の API ドキュメントで確認すること。
 */
export function createDeepSeekExtractor({
  apiKey,
  model = DEFAULT_MODEL,
  baseUrl = DEFAULT_BASE_URL,
  temperature = 0,
  maxChunkChars,
  extraBody = {},
  fetchImpl = globalThis.fetch,
  maxRetries = 3,
} = {}) {
  if (!apiKey) throw new Error('DeepSeek の API キーが必要です');

  async function callOnce(input) {
    const body = {
      model,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt({
            targetLanguage: input.targetLanguage,
            nativeLanguage: input.nativeLanguage,
            maxItems: input.maxItems ?? 10,
          }),
        },
        { role: 'user', content: buildUserMessage(input) },
      ],
      response_format: { type: 'json_object' },
      temperature,
      stream: false,
      ...extraBody,
    };

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
      let response;
      try {
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch (error) {
        lastError = error;
        continue;
      }
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        lastError = new Error(`DeepSeek API ${response.status}: ${detail.slice(0, 500)}`);
        if (!RETRIABLE_STATUS.has(response.status)) throw lastError;
        continue;
      }
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        lastError = new Error('DeepSeek の応答に content がありません');
        continue;
      }
      return { items: parseItems(content), usage: payload?.usage ?? null };
    }
    throw lastError ?? new Error('DeepSeek API の呼び出しに失敗しました');
  }

  return {
    name: `deepseek:${model}`,
    responseSchema: extractionResponseSchema,
    async extract(input) {
      const chunks = splitIntoChunks(input.text, { maxChars: maxChunkChars });
      if (chunks.length === 0) return { items: [], usage: null };
      if (chunks.length === 1) return callOnce(input);

      const results = [];
      for (const chunk of chunks) {
        results.push(await callOnce({ ...input, text: chunk }));
      }
      return {
        items: mergeItems(results.flatMap((result) => result.items), input.maxItems ?? 10),
        usage: sumUsage(results.map((result) => result.usage)),
      };
    },
  };
}

/**
 * LLM を使わないベースライン。長い語を上から拾うだけ。
 * 「LLM が本当に効いているのか」を測るための下限であり、製品には載せない。
 */
export function createBaselineExtractor() {
  return {
    name: 'baseline:longest-words',
    responseSchema: null,
    async extract(input) {
      const sentences = splitIntoSentences(input.text);
      const seen = new Map();
      for (const sentence of sentences) {
        for (const word of sentence.match(/[\p{L}'’-]+/gu) ?? []) {
          const key = normalizeLemma(word);
          if (key.length < 6 || seen.has(key)) continue;
          seen.set(key, {
            surfaceForm: word,
            lemma: key,
            type: 'word',
            meaningJa: '(ベースラインのため語義なし)',
            sourceSentence: sentence,
            sentenceJa: '(ベースラインのため訳なし)',
            usefulnessScore: Math.min(0.99, 0.5 + key.length / 40),
            confidence: 0.8,
          });
        }
      }
      const items = [...seen.values()]
        .sort((a, b) => b.usefulnessScore - a.usefulnessScore)
        .slice(0, input.maxItems ?? 10);
      return { items, usage: null };
    },
  };
}

function parseItems(content) {
  const trimmed = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`JSON として解釈できない応答: ${trimmed.slice(0, 300)}`);
  }
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.items)) return parsed.items;
  throw new Error('応答に items 配列がありません');
}

/** チャンクをまたいだ重複を lemma で潰し、usefulnessScore 順に maxItems 件へ絞る。 */
function mergeItems(items, maxItems) {
  const byLemma = new Map();
  for (const item of items) {
    const key = normalizeLemma(item?.lemma);
    const existing = byLemma.get(key);
    if (!existing || (item?.usefulnessScore ?? 0) > (existing.usefulnessScore ?? 0)) {
      byLemma.set(key, item);
    }
  }
  return [...byLemma.values()]
    .sort((a, b) => (b?.usefulnessScore ?? 0) - (a?.usefulnessScore ?? 0))
    .slice(0, maxItems);
}

function sumUsage(usages) {
  const present = usages.filter(Boolean);
  if (present.length === 0) return null;
  return present.reduce(
    (total, usage) => ({
      prompt_tokens: (total.prompt_tokens ?? 0) + (usage.prompt_tokens ?? 0),
      completion_tokens: (total.completion_tokens ?? 0) + (usage.completion_tokens ?? 0),
      total_tokens: (total.total_tokens ?? 0) + (usage.total_tokens ?? 0),
    }),
    {},
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
