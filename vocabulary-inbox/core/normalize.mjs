/**
 * 正規化ユーティリティ。
 * 設計書 11章「重複判定」に合わせて、アクセント記号は落とさない。
 */

/** 見出し語の正規化キー。user_id + target_language と合わせて重複判定に使う。 */
export function normalizeLemma(value) {
  return String(value ?? '')
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * 「LLMが返した文が本当に原文にあるか」を照合するための正規化。
 * 引用符・ダッシュ・省略記号の表記ゆれと空白だけを吸収し、語そのものは触らない。
 */
export function normalizeForMatch(value) {
  return String(value ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‘’‚‛´`]/g, "'")
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[—–‑-]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

/** needle が haystack に（表記ゆれを吸収した上で）含まれるか。 */
export function containsNormalized(haystack, needle) {
  const n = normalizeForMatch(needle);
  if (n === '') return false;
  return normalizeForMatch(haystack).includes(n);
}
