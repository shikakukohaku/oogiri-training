/**
 * 設計書 7章「長文の場合は事前にチャンクへ分割する」に対応。
 * 文の途中では切らず、段落 → 文 の順で境界を探す。
 */

const DEFAULT_MAX_CHARS = 12000;

/** 段落単位に分け、長すぎる段落はさらに文単位で分ける。 */
export function splitIntoChunks(text, { maxChars = DEFAULT_MAX_CHARS } = {}) {
  const source = String(text ?? '').trim();
  if (source === '') return [];
  if (source.length <= maxChars) return [source];

  const pieces = [];
  for (const paragraph of source.split(/\n\s*\n/)) {
    const trimmed = paragraph.trim();
    if (trimmed === '') continue;
    if (trimmed.length <= maxChars) pieces.push(trimmed);
    else pieces.push(...splitIntoSentences(trimmed));
  }

  const chunks = [];
  let current = '';
  for (const piece of pieces) {
    if (current === '') {
      current = piece;
    } else if (current.length + piece.length + 2 <= maxChars) {
      current += `\n\n${piece}`;
    } else {
      chunks.push(current);
      current = piece;
    }
  }
  if (current !== '') chunks.push(current);

  // 1文で maxChars を超える異常な入力だけは、やむを得ず長さで切る。
  return chunks.flatMap((chunk) =>
    chunk.length <= maxChars ? [chunk] : splitByLength(chunk, maxChars),
  );
}

export function splitIntoSentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?…。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '');
}

function splitByLength(text, maxChars) {
  const parts = [];
  for (let i = 0; i < text.length; i += maxChars) parts.push(text.slice(i, i + maxChars));
  return parts;
}
