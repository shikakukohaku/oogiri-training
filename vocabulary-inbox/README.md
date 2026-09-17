# Vocabulary Inbox

設計書: [`docs/vocabulary-inbox-design.md`](../docs/vocabulary-inbox-design.md)

アプリ本体（Next.js / Supabase / FSRS）は別リポジトリに切ってから作る。
ここには、それを待たずに確かめられる部分だけを置いてある。

```
core/   抽出から単語帳への反映までのドメインロジック（そのまま本体へ持っていく）
eval/   抽出品質の評価セット（設計書31章）
db/     Postgres / Supabase のスキーマ（設計書14章）
```

大喜利トレーニングのアプリ本体とは独立していて、依存パッケージもビルドも共有しない。
素の Node.js（20以上）だけで動く。

```bash
node --test "vocabulary-inbox/**/*.test.mjs"
```

DB のテストだけは PostgreSQL が要る。入っていなければ自動で skip される。

```bash
npm i -D @electric-sql/pglite     # ブラウザ/Nodeで動くPostgres。本番には要らない
node --test "vocabulary-inbox/**/*.test.mjs"
```

## core — ドメインロジック

| ファイル | 役割 | 設計書 |
| --- | --- | --- |
| `extractor.mjs` | `VocabularyExtractor`。DeepSeek実装とベースライン | 6章 |
| `prompt.mjs` | プロンプト構築 | 7章・9章 |
| `schema.mjs` | 出力スキーマと検証（原文との照合を含む） | 8章・9章 |
| `chunk.mjs` | 長文のチャンク分割（文・段落境界で切る） | 7章 |
| `normalize.mjs` | 見出し語の正規化（アクセントは残す） | 11章 |
| `limits.mjs` | 文章の長さごとの登録上限 | 10章 |
| `ingest.mjs` | 抽出結果 → 登録 / 遭遇追記 / 却下 の振り分け | 10〜13章 |

中心は `planIngestion()`。LLM の出力を受け取って、単語帳に何をするかを決める純関数。
DB も LLM も触らないので、API Route からでも将来のジョブ基盤からでも同じものを呼べる。

```js
const plan = planIngestion({
  extracted,      // LLM が返した ExtractedVocabulary[]
  text,           // 元の文章（例文の捏造チェックと上限判定に使う）
  existingItems,  // そのユーザーの既存語 [{ id, normalizedLemma, status }]
  knownLemmas,    // 既知語
});

plan.newItems     // 新しく vocabulary_items + cards を作る
plan.occurrences  // 既存itemへ遭遇だけ足す（カードは作らない）
plan.skipped      // 何もしない。reason つき
```

`skipped` の理由は `invalid` / `duplicate-in-batch` / `known` / `low-confidence` /
`low-usefulness` / `over-limit`。**なぜ登録されなかったか**が後から辿れないと
プロンプトの直しようがないので、捨てた候補も理由つきで返す。

`invalid` は LLM が原文に無い例文を作った場合などで、これは品質ではなく実装の問題として扱う。

## eval — 抽出品質の評価セット

設計書31章のとおり、このプロダクトの勝負どころは UI ではなく
**「何を勝手に登録するか」** の品質なので、アプリ本体より先にここを作る。

```
スペイン語の文章20種 → 抽出 → 自動採点 → 人手評価（◎○△×）→ Prompt修正
```

```bash
# LLM 無しで配管だけ確認する（長い語を上から拾うだけのベースライン）
node vocabulary-inbox/eval/run.mjs --extractor baseline

# DeepSeek で全20ケース
export DEEPSEEK_API_KEY=sk-...
node vocabulary-inbox/eval/run.mjs

# ケースを絞る / 上限を変える
node vocabulary-inbox/eval/run.mjs --cases yt-03,lit-01 --max-items 8
```

出力は `eval/results/` に2つ。`*.json` が生の抽出結果とスコア（プロンプト変更の前後比較用）、
`*.md` が人手評価シート（「評価」欄に ◎○△× を書き込む）。`results/` は Git 管理外。

### 見る数字

| 指標 | 意味 | 目安 |
| --- | --- | --- |
| 期待語の再現率 | `shouldPick` を登録できた割合 | 高いほどよい |
| 除外語の混入 | `shouldSkip` を登録してしまった件数 | 0に近いほどよい |
| 不正な項目 | 原文に無い例文、値域外スコア、lemma重複 | **0であるべき** |
| 1文章あたり登録数 | 設計書10章の上限に収まっているか | 5〜10 |

自動採点はあくまで足切りで、本番の判断は人手評価シートの `×` 率。
設計書28章に合わせて **`×` が2割を超えたら抽出ロジックが悪い** と見なす。

ベースライン（`--extractor baseline`）は LLM がどれだけ効いているかの下限。
全20ケースで再現率22.5% / 除外語の混入8.4%。DeepSeek がこれに勝てないなら
プロンプト以前の問題。

### データセット

`eval/dataset/es-ja.json` に20ケース。X投稿・チャット・YouTube字幕・ニュース・
レシピ・小説・求人・メール・中南米の口語などを、レジスターが偏らないように並べてある。

**text は実際の投稿や字幕そのものではなく、文体と語彙の分布を似せて書いた代替サンプル。**
実運用で集めた本物の文章が手に入り次第、同じ形式で差し替え・追加していく。
本物に入れ替えるまで、ここのスコアは絶対値ではなく相対比較（Prompt A と B の差）として読む。

```json
{
  "id": "lit-01",
  "sourceType": "book",
  "register": "小説の一節",
  "text": "Nunca se atrevió a preguntarle por qué se había marchado. ...",
  "shouldPick": ["atreverse", "marcharse", "con el tiempo"],
  "shouldSkip": ["preguntar", "tiempo", "uno"]
}
```

- `shouldPick` … 拾えていてほしい表現。正解の全集合ではないので、
  ここに無い語が出ても不正解とは限らない（人手評価シートに「想定外」として並ぶ）
- `shouldSkip` … 登録されたら邪魔な語。**lemma の完全一致だけ**を違反とする。
  `hacer` を除外語にしても `hacer como que` は違反にならない

### 環境変数

| 変数 | 既定値 | 用途 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | （必須） | APIキー |
| `DEEPSEEK_MODEL` | `deepseek-flash` | モデル |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` | エンドポイント |
| `DEEPSEEK_EXTRA_BODY` | `{}` | リクエストボディへ追加する JSON |

`DEEPSEEK_EXTRA_BODY` は主に **Thinking の無効化**（設計書23章）のためにある。
Thinking を切るパラメータ名はモデル世代で変わりうるので、コードに直書きせず
外から差し込めるようにしてある。現行の API ドキュメントで確認してから、

```bash
export DEEPSEEK_EXTRA_BODY='{"thinking":{"type":"disabled"}}'   # ← 要確認
```

のように渡す。ここを確認するまでは、Thinking が有効なまま課金されている可能性がある。

## db — スキーマ

```bash
psql "$DATABASE_URL" -f vocabulary-inbox/db/schema.sql
psql "$DATABASE_URL" -f vocabulary-inbox/db/rls.sql    # Supabase の場合のみ
```

`schema.sql` は素の PostgreSQL 15+ で流せる。`gen_random_uuid()` は組み込みなので
拡張は要らない。Supabase の Auth と RLS に依存する部分だけ `rls.sql` に分けてある。

アプリ側で忘れても崩れないように、次はDBに持たせてある。

- `normalized_lemma` … 生成列。設計書11章の正規化をDBが保証する
- `encounter_count` / `first_seen_at` / `last_seen_at` … occurrences のトリガで増減。
  Undo で遭遇を消したら数も戻る
- `cards.suspended_at` … Known / Ignore で復習から外す印。`due_at`（FSRSの持ち物）は触らない
- `occurrences` の一意制約 … 同じ文章から同じ語を二重に記録しない

`schema.test.mjs` がこれらを実際に Postgres へ流して確かめる。

## まだ無いもの

- アプリ本体一式（Next.js / Supabase / ts-fsrs）。設計書30章の Phase 1 から
- DeepSeek の実測。契約後に `eval/run.mjs` を回すのが最初の仕事
- `usefulnessScore` 以外のランキング要素（遭遇回数・CEFR・復習状況）。
  混ぜるなら `core/ingest.mjs` の `compareCandidates()` の中だけで済む
