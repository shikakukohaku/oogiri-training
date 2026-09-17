/**
 * 設計書 7章・9章に対応するプロンプト構築。
 * プロンプトはこのアプリのコア技術なので、評価セットと同じファイルを本体でも使う想定。
 */

const LANGUAGE_NAMES_JA = {
  es: 'スペイン語',
  en: '英語',
  fr: 'フランス語',
  de: 'ドイツ語',
  it: 'イタリア語',
  pt: 'ポルトガル語',
  ja: '日本語',
  ko: '韓国語',
  zh: '中国語',
};

export function languageNameJa(code) {
  return LANGUAGE_NAMES_JA[code] ?? code;
}

/** 言語ごとの追加ルール。対応言語を増やすときはここに足す。 */
const LANGUAGE_RULES = {
  es: [
    '活用された動詞は不定詞（辞書形）に戻す（例: me atrevo → atreverse）',
    '再帰動詞は se を含めた形にする（例: dar cuenta ではなく darse cuenta）',
    '名詞は単数形、形容詞は男性単数形にする',
    '地域語・口語（中南米のスラング等）は除外せず、meaningJa に地域の注記を添える',
  ],
};

export function buildSystemPrompt({ targetLanguage, nativeLanguage, maxItems }) {
  const target = languageNameJa(targetLanguage);
  const native = languageNameJa(nativeLanguage);
  const languageRules = (LANGUAGE_RULES[targetLanguage] ?? []).map((rule) => `・${rule}`);

  return [
    'あなたは外国語学習用の語彙抽出エンジンです。',
    `${native}話者が${target}を学習しています。`,
    `入力された文章から、今後覚える価値の高い単語・熟語・慣用表現を抽出してください。`,
    '',
    'ルール：',
    ...languageRules,
    '・熟語や決まった言い回しは、単語に分解せず一つの表現として抽出する',
    '・固有名詞（人名・地名・団体名・商品名）は原則除外する',
    '・極端に珍しい語、その文章でしか使わない専門語は優先度を下げる',
    '・初歩的すぎる機能語（冠詞・前置詞・基本動詞の単独使用など）は除外する',
    '・元文章に存在しない例文を作らない',
    '・sourceSentence は原文の文をそのまま（表記も句読点も変えずに）使う',
    '・surfaceForm は原文に現れたままの形にする',
    '・lemma は辞書形にする',
    '・meaningJa と sentenceJa は自然な日本語にする',
    `・最大${maxItems}項目`,
    '・学習価値の高い順に返す',
    '・knownWords に含まれる語は返さない',
    '',
    'usefulnessScore は「この学習者が今後また出会い、覚えておくと役に立つ度合い」を 0〜1 で表す。',
    'confidence は「抽出・辞書形・語義に自信がある度合い」を 0〜1 で表す。',
    '迷ったら数を絞る。価値の低い語で枠を埋めない。',
  ].join('\n');
}

/** LLM へ渡す user メッセージ（設計書7章の ExtractionInput をそのまま JSON にする）。 */
export function buildUserMessage(input) {
  return JSON.stringify(
    {
      targetLanguage: input.targetLanguage,
      nativeLanguage: input.nativeLanguage,
      learnerLevel: input.learnerLevel ?? 'intermediate',
      knownWords: input.knownWords ?? [],
      maxItems: input.maxItems ?? 10,
      text: input.text,
    },
    null,
    2,
  );
}
