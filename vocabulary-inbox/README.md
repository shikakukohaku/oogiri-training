# Vocabulary Inbox — 語彙抽出の評価セット

設計書: [`docs/vocabulary-inbox-design.md`](../docs/vocabulary-inbox-design.md)

設計書31章のとおり、このプロダクトの勝負どころは UI ではなく
**「何を勝手に登録するか」** の品質なので、アプリ本体より先にここを作る。

```
スペイン語の文章20種
      ↓
抽出（DeepSeek）
      ↓
自動採点（期待語・除外語・捏造チェック）
      ↓
人手評価（◎○△×）
      ↓
Prompt修正
```

このディレクトリは大喜利トレーニングのアプリ本体とは独立していて、
依存パッケージもビルドも共有しない。素の Node.js（20以上）だけで動く。

## 実行

```bash
# LLM 無しで配管だけ確認する（長い語を上から拾うだけのベースライン）
node vocabulary-inbox/eval/run.mjs --extractor baseline

# DeepSeek で全20ケース
export DEEPSEEK_API_KEY=sk-...
node vocabulary-inbox/eval/run.mjs

# ケースを絞る / 上限を変える
node vocabulary-inbox/eval/run.mjs --cases yt-03,lit-01 --max-items 8
```

ユニットテスト:

```bash
node --test "vocabulary-inbox/**/*.test.mjs"
```

出力は `eval/results/` に2つ。

- `*.json` … 生の抽出結果とスコア。Prompt を変えた前後の差分を見る用
- `*.md` … 人手評価シート。「評価」欄に ◎○△× を書き込む

`results/` は Git 管理外。残したい回だけ別の場所へコピーする。

### 環境変数

| 変数 | 既定値 | 用途 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | （必須） | APIキー |
| `DEEPSEEK_MODEL` | `deepseek-flash` | モデル |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` | エンドポイント |
| `DEEPSEEK_EXTRA_BODY` | `{}` | リクエストボディへ追加する JSON |

`DEEPSEEK_EXTRA_BODY` は主に **Thinking の無効化**（設計書23章）のためにある。
Thinking を切るパラメータ名はモデル世代で変わりうるので、コードに直書きせず
外から差し込めるようにしてある。現行の API ドキュメントで名前を確認してから、

```bash
export DEEPSEEK_EXTRA_BODY='{"thinking":{"type":"disabled"}}'   # ← 要確認
```

のように渡す。ここを確認するまでは、Thinking が有効なまま課金されている可能性がある。

## 見る数字

ランナーが出すのは以下。

| 指標 | 意味 | 目安 |
| --- | --- | --- |
| 期待語の再現率 | `shouldPick` を登録できた割合 | 高いほどよい |
| 除外語の混入 | `shouldSkip` を登録してしまった件数 | 0に近いほどよい |
| 不正な項目 | 原文に無い例文、値域外スコア、lemma重複 | **0であるべき** |
| 1文章あたり登録数 | 設計書10章の上限に収まっているか | 5〜10 |

「不正な項目」だけは品質の問題ではなく実装の問題なので、
1件でも出たら Prompt かパーサを直す。

自動採点はあくまで足切りで、本番の判断は人手評価シートの `×` 率。
設計書28章に合わせて **`×` が2割を超えたら抽出ロジックが悪い** と見なす。

ベースライン（`--extractor baseline`）は LLM がどれだけ効いているかの下限。
DeepSeek がこれに勝てないなら Prompt 以前の問題。

## データセット

`eval/dataset/es-ja.json` に20ケース。X投稿・チャット・YouTube字幕・ニュース・
レシピ・小説・求人・メール・中南米の口語などを、レジスターが偏らないように並べてある。

**text は実際の投稿や字幕そのものではなく、文体と語彙の分布を似せて書いた代替サンプル。**
実運用で集めた本物の文章が手に入り次第、同じ形式で差し替え・追加していく。
本物に入れ替えるまで、ここのスコアは絶対値ではなく相対比較（Prompt A と B の差）として読む。

各ケースの形式:

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

## コード

| ファイル | 役割 |
| --- | --- |
| `eval/run.mjs` | CLI。実行・採点・レポート出力 |
| `eval/lib/extractor.mjs` | 設計書6章の `VocabularyExtractor`。DeepSeek実装とベースライン |
| `eval/lib/prompt.mjs` | 設計書7章・9章のプロンプト構築 |
| `eval/lib/schema.mjs` | 設計書8章の出力スキーマと検証 |
| `eval/lib/chunk.mjs` | 設計書7章のチャンク分割（文・段落境界で切る） |
| `eval/lib/normalize.mjs` | 設計書11章の正規化（アクセントは残す） |
| `eval/lib/score.mjs` | 設計書10章の自動登録条件と採点 |

`prompt.mjs` / `schema.mjs` / `normalize.mjs` / `chunk.mjs` は評価専用ではなく、
アプリ本体（Next.js側）へそのまま持っていく前提で書いてある。
評価セットで通用したプロンプトと本番のプロンプトがずれるのが一番まずい。

## まだ無いもの

- アプリ本体（Next.js / Supabase / FSRS）。設計書30章の Phase 1 から
- `knownWords` を実際に効かせる経路（インターフェースだけ用意してある）
- `usefulnessScore` 以外のランキング要素（遭遇回数・CEFR・復習状況）
