# Vocabulary Inbox（仮）設計書 v0.1

> 大喜利トレーニングとは別プロダクトの設計書。アプリ本体の実装はまだ無く、このリポジトリでは
> 設計書と、語彙抽出の評価セット（[`vocabulary-inbox/`](../vocabulary-inbox/README.md)）のみを管理する。

## 目次

- [1. プロダクト概要](#1-プロダクト概要)
- [2. プロダクトの思想](#2-プロダクトの思想)
- [3. MVPの対象](#3-mvpの対象)
- [4. MVPで作るもの](#4-mvpで作るもの)
- [5. 語彙抽出](#5-語彙抽出)
- [6. LLM](#6-llm)
- [7. LLMへの入力](#7-llmへの入力)
- [8. LLM出力](#8-llm出力)
- [9. LLM Prompt方針](#9-llm-prompt方針)
- [10. 自動登録ロジック](#10-自動登録ロジック)
- [11. 重複判定](#11-重複判定)
- [12. 「遭遇」を保存する](#12-遭遇を保存する)
- [13. Known機能](#13-known機能)
- [14. データモデル](#14-データモデル)
- [15. 復習](#15-復習)
- [16. 復習UI](#16-復習ui)
- [17. 一覧画面](#17-一覧画面)
- [18. Web MVP画面](#18-web-mvp画面)
- [19. 技術構成](#19-技術構成)
- [20. Backend API](#20-backend-api)
- [21. 非同期処理](#21-非同期処理)
- [22. DeepSeek利用料金](#22-deepseek利用料金)
- [23. コスト最適化](#23-コスト最適化)
- [24. エラーへの考え方](#24-エラーへの考え方)
- [25. Native Appへの移行](#25-native-appへの移行)
- [26. Native版で追加する最大の機能](#26-native版で追加する最大の機能)
- [27. MVPではやらないもの](#27-mvpではやらないもの)
- [28. MVP成功条件](#28-mvp成功条件)
- [29. 商用化判断](#29-商用化判断)
- [30. 実装優先順位](#30-実装優先順位)
- [31. このプロダクトで最も重要な部分](#31-このプロダクトで最も重要な部分)
- [32. MVPの完成形](#32-mvpの完成形)

---

## 1. プロダクト概要

### コンセプト

外国語で見つけた文章を雑に放り込むだけで、覚える価値のある単語・表現が勝手に単語帳へ
追加されるアプリ。

主な利用イメージ：

```
Xでスペイン語の投稿を見る
  ↓
文章をコピー
  ↓
Vocabulary Inbox に貼る
  ↓
終了
```

または

```
YouTubeを見る
  ↓
Gemini等で文字起こし
  ↓
全文コピー
  ↓
Vocabulary Inbox に貼る
  ↓
終了
```

アプリ側が自動的に、

```
文章分割
  ↓
学習価値のある単語・熟語を抽出
  ↓
辞書形へ正規化
  ↓
意味・品詞・例文を生成
  ↓
既知語・重複語を除外
  ↓
単語帳へ登録
  ↓
FSRSで復習
```

まで行う。

---

## 2. プロダクトの思想

Ankiの最大の問題を「カードを作る必要があること」と捉える。

このアプリでは、**学習者がカードを作らない**。

ユーザーがすることは基本的に2つだけ。

1. 外国語の文章を放り込む
2. 復習する

「この単語を登録しますか？」という確認も原則出さない。

多少間違って登録されても、

- 知ってる
- いらない
- 削除

ですぐ修正できる方を優先する。

正確性100%より、**摩擦の少なさ**を優先する。

---

## 3. MVPの対象

初期バージョンでは、

| 項目 | 内容 |
| --- | --- |
| 学習言語 | スペイン語 |
| 母語 | 日本語 |
| 入力 | テキスト |
| プラットフォーム | Web |

に限定する。

内部データモデルでは `target_language` と `native_language` を持ち、後から英語・
フランス語などに拡張可能にする。

---

## 4. MVPで作るもの

### 4.1 Inbox

トップページに大きなテキストエリアを置く。

```
┌─────────────────────────────────────────────┐
│ スペイン語をなんでも貼り付ける               │
│                                             │
│ No me atrevo a decirle la verdad...         │
│                                             │
│                                  [ 追加 ]   │
└─────────────────────────────────────────────┘
```

追加後は即座にInboxを空にする。

処理中：

```
解析中...
```

処理完了後：

```
✓ 8個の表現を追加しました
atreverse
darse cuenta
sin embargo
a pesar de
...
```

程度を表示する。

**登録前の確認画面は作らない。**

---

## 5. 語彙抽出

LLMを使って文章から「覚える価値がある表現」を抽出する。

単語だけではなく、

- atreverse
- darse cuenta
- tener ganas de
- a pesar de

のような熟語・定型表現も一つのVocabulary Itemとして扱う。

特に語学学習では単語より熟語の方が価値が高いケースも多いため、

- `word`
- `phrase`
- `idiom`

を区別する。

---

## 6. LLM

### 初期モデル

DeepSeek `deepseek-flash`

語彙抽出は複雑な推論ではないため、Thinking Modeは使用しない。

2026年9月現在のDeepSeek APIでは `deepseek-flash` が提供され、非Thinkingモードと
JSON出力を利用できる。Responses APIではJSON SchemaによるStructured Outputも利用可能。
（出典: DeepSeek API Docs）

LLM部分は以下のinterfaceの裏に隠す。

```ts
interface VocabularyExtractor {
  extract(input: ExtractionInput): Promise<ExtractedVocabulary[]>
}
```

実装：

- `DeepSeekVocabularyExtractor`

将来的に、

- `OpenAIVocabularyExtractor`
- `GeminiVocabularyExtractor`
- `ClaudeVocabularyExtractor`

へ交換できるようにする。

アプリ本体からDeepSeek固有APIを直接呼ばない。

---

## 7. LLMへの入力

例：

```json
{
  "targetLanguage": "es",
  "nativeLanguage": "ja",
  "learnerLevel": "intermediate",
  "knownWords": [],
  "maxItems": 10,
  "text": "No me atrevo a decirle la verdad..."
}
```

長文の場合は事前にチャンクへ分割する。

目安：5,000〜15,000文字 / chunk

文章の途中ではなく、**文または段落単位**で分割する。

---

## 8. LLM出力

Structured Outputを利用する。

```ts
type ExtractedVocabulary = {
  surfaceForm: string
  lemma: string
  type: "word" | "phrase" | "idiom"
  partOfSpeech?: string
  meaningJa: string
  sourceSentence: string
  sentenceJa: string
  cefr?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2"
  usefulnessScore: number
  confidence: number
}
```

例：

```json
{
  "surfaceForm": "me atrevo",
  "lemma": "atreverse",
  "type": "word",
  "partOfSpeech": "verb",
  "meaningJa": "思い切って〜する、〜する勇気がある",
  "sourceSentence": "No me atrevo a decirle la verdad.",
  "sentenceJa": "彼に本当のことを言う勇気がない。",
  "cefr": "B1",
  "usefulnessScore": 0.91,
  "confidence": 0.98
}
```

重要なのは、`me atrevo` ではなく `atreverse` をVocabulary Itemとして保存すること。

ただし実際に遭遇した形として `surfaceForm = "me atrevo"` も保存する。

---

## 9. LLM Prompt方針

System Promptの概念は以下。

```
あなたは外国語学習用の語彙抽出エンジンです。
日本語話者がスペイン語を学習しています。
入力された文章から、
今後覚える価値の高い単語・熟語・慣用表現を抽出してください。

ルール：
・活用された動詞は辞書形に戻す
・再帰動詞はseを含める
・熟語は一つの表現として抽出する
・固有名詞は原則除外
・極端に珍しい語は優先度を下げる
・初歩的すぎる機能語は除外する
・元文章に存在しない例文を作らない
・sourceSentenceは原文をそのまま使う
・最大10項目
・学習価値の高い順に返す
```

LLMに「全単語を解析」させない。**最大N個の重要語を選ばせる。** これが重要。

---

## 10. 自動登録ロジック

例えば長いYouTube字幕から50語候補が出ても全部登録しない。

デフォルト：

| 入力 | 上限 |
| --- | --- |
| 短文 | 最大5語 |
| 通常文章 | 最大10語 |
| 長文 | 最大15語 |

最終的には、

- LLM usefulnessScore
- 過去の遭遇回数
- CEFR
- 既知語情報
- 過去の復習状況

などからランキングする。

ただしMVPでは複雑にしない。

```ts
if (
  confidence >= 0.7 &&
  usefulnessScore >= 0.6 &&
  !known &&
  !alreadyRegistered
) {
  register()
}
```

程度で開始する。

---

## 11. 重複判定

以下をVocabulary Itemの基本キーとする。

- `user_id`
- `target_language`
- `normalized_lemma`

例：`atrevo` / `atrevió` / `atreverse` / `me atrevo` はLLMがすべて `atreverse` へ
正規化する。

`normalized_lemma` は、

- Unicode NFC
- lowercase
- 前後空白削除
- 連続空白の正規化

程度。**アクセント記号は削除しない。**

---

## 12. 「遭遇」を保存する

同じ単語に再び遭遇しても新しいカードは作らない。代わりにOccurrenceを追加する。

例：

```
atreverse   遭遇回数 4
1. No me atrevo a decirlo.
2. Nunca se atrevió a preguntarle.
3. ¿Te atreves a hacerlo?
4. No se atreve a salir.
```

これはこのアプリの重要な特徴にする。

最終的には「この単語、今月5回見てるのにまだ覚えてない」のような情報が取れる。

---

## 13. Known機能

復習画面・単語一覧から「知ってる」を押せる。

これを押したVocabulary Itemは `status = known` となる。

以降の文章で再び出現してもカードには追加しない。Occurrenceだけ記録してもよい。

これにより使えば使うほど、**ユーザー専用の既知語辞書**ができていく。

---

## 14. データモデル

### users

```
id
email
created_at
```

### learning_profiles

```
id
user_id
target_language
native_language
level
max_items_per_ingestion
created_at
```

### ingestions

貼り付けられた文章。

```
id
user_id
raw_text
source_type
source_url    nullable
title         nullable
status
created_at
processed_at
```

`status`: `pending` / `processing` / `completed` / `failed`

### vocabulary_items

```
id
user_id
target_language
lemma
normalized_lemma
type
part_of_speech
meaning_ja
cefr
status
first_seen_at
last_seen_at
encounter_count
created_at
updated_at
```

`status`: `learning` / `known` / `ignored`

### occurrences

```
id
vocabulary_item_id
ingestion_id
surface_form
source_sentence
sentence_ja
created_at
```

### cards

```
id
user_id
vocabulary_item_id
card_type
due_at
fsrs_state    jsonb
created_at
updated_at
```

MVPでは `card_type = recognition` だけでよい。

### review_logs

```
id
card_id
rating
reviewed_at
fsrs_log    jsonb
```

---

## 15. 復習

FSRSを使用する。

TypeScriptでは `ts-fsrs` を利用する。現在のライブラリではカード生成・
Again / Hard / Good / Easyごとの次回スケジュール計算を提供している。（出典: GitHub）

**自前で復習アルゴリズムは作らない。**

---

## 16. 復習UI

表：

```
No me atrevo a decirle la verdad.
           atreverse
           意味は？
```

タップ。

裏：

```
atreverse
思い切って〜する
〜する勇気がある

No me atrevo a decirle la verdad.
彼に本当のことを言う勇気がない。
```

評価：`Again` / `Hard` / `Good` / `Easy`

まずはAnki同様の4段階。

---

## 17. 一覧画面

```
Vocabulary
検索...

atreverse        B1   4回
darse cuenta     B1   7回
sin embargo      B1   2回
a pesar de       B2   3回
```

単語を開くと、

- 意味
- 復習状態
- 遭遇回数
- 過去に遭遇した文章

が見える。

---

## 18. Web MVP画面

必要な画面は4つだけ。

| 画面 | 内容 |
| --- | --- |
| Inbox | テキスト投入 |
| Review | 今日の復習 |
| Vocabulary | 登録済み語彙 |
| Item Detail | 意味・遭遇履歴 |

設定画面は最低限でよい。

---

## 19. 技術構成

Web MVP：

```
Next.js / TypeScript / React
        ↓
    Next.js API
        ↓
Supabase（PostgreSQL / Auth）
        ↓
    DeepSeek API
```

- Hosting: Vercel
- 復習: `ts-fsrs`

構成イメージ：

```
Browser
   │
   ▼
Next.js
   │
   ├── Supabase
   │
   └── VocabularyExtractor
            │
            └── DeepSeek API
```

---

## 20. Backend API

### POST /api/ingestions

```json
{
  "text": "...",
  "sourceType": "paste",
  "sourceUrl": null
}
```

response:

```json
{
  "id": "xxx",
  "status": "processing"
}
```

### GET /api/ingestions/:id

```json
{
  "status": "completed",
  "addedItems": 8,
  "duplicateItems": 4
}
```

### GET /api/reviews/today

今日復習するカードを返す。

### POST /api/cards/:id/review

```json
{
  "rating": "good"
}
```

FSRSで次回dueを計算する。

### PATCH /api/vocabulary/:id

```json
{
  "status": "known"
}
```

など。

---

## 21. 非同期処理

短いX投稿なら即処理できるが、YouTube全文では数万文字になる。

そのため、

```
POST ingestion
  ↓
DB保存
  ↓
processing
  ↓
LLM処理
  ↓
completed
```

というモデルにしておく。

最初の個人利用段階ではNext.js内で処理して構わない。

タイムアウトが問題になり始めたら、

- Trigger.dev
- Inngest
- Supabase Edge Function

などへ切り出す。**最初からジョブ基盤を作り込みすぎない。**

---

## 22. DeepSeek利用料金

`deepseek-flash` の2026年9月時点の通常入力料金は、キャッシュミス時で100万tokenあたり
ピーク $0.30、出力は $1.20。オフピークはそれぞれ $0.15 / $0.60。（出典: DeepSeek API Docs）

例えば、

```
input  : 10,000 tokens
output :  2,000 tokens
```

ならピーク料金でも概算、

```
input   $0.0030
output  $0.0024
合計    $0.0054
```

程度。

したがってMVP段階ではLLMコストより、**どんな単語を自動登録すると気持ちいいか**の
調整の方がはるかに重要。

---

## 23. コスト最適化

最初から以下を行う。

**LLMに生成させすぎない**
新しい例文を作らせない。原文から例文を取得する。

**非Thinking**
DeepSeekはThinkingがデフォルトで有効なので、語彙抽出では明示的にOFFにする。
（出典: DeepSeek API Docs）

**1文章1リクエストにしない**
全文または大きめのchunk単位で一括抽出する。

**Structured Output**
JSON解析失敗による再リクエストを減らす。

---

## 24. エラーへの考え方

LLMは間違える前提。

そのため厳格な確認UIではなく、

```
登録
  ↓
間違っていたら削除
```

にする。

登録直後に、

```
8件追加  [確認する]
```

を表示し、間違った候補を簡単に削除できるようにする。Undoも付ける。

---

## 25. Native Appへの移行

Web版で需要を確認してから、React Native / Expo でNative Appを作る。

Backendは変更しない。

```
Web
  │
  ├──── API ─── Backend
  │
Native
  │
  └──── API ─── Backend
```

にする。

Web版のコードを無理にNativeへそのまま移植しようとせず、

- API
- Domain Model
- VocabularyExtractor
- DB

を再利用する。

---

## 26. Native版で追加する最大の機能

### Share Extension

これがNative化する最大の理由。

Xで、

```
スペイン語投稿
  ↓
共有
  ↓
Vocabulary Inbox
  ↓
完了
```

を可能にする。

Safariの記事でも、

```
共有 → Vocabulary Inbox
```

YouTube文字起こしでも、

```
全文選択 → 共有 → Vocabulary Inbox
```

とする。理想的にはアプリ本体を開かなくてもいい。

**「外国語を見つけたら共有する」** という行動を習慣にする。

---

## 27. MVPではやらないもの

以下は作らない。

- YouTube API連携 / YouTube字幕自動取得
- Chrome Extension
- 音声認識 / 音声カード
- AI会話
- 自動例文生成
- 辞書API
- 画像生成
- SNS機能 / ランキング / Gamification
- 複数Deck
- 高度なAnki互換機能 / Anki Import / Export

ユーザーが本当に、

```
文章を貼る → 自動登録 → 復習する
```

を継続するかを見る。

---

## 28. MVP成功条件

自分自身で2週間使う。

見る数字：

- 投入した文章数
- 抽出されたVocabulary数
- 削除率
- Known率
- 復習数
- 継続日数

特に重要なのは、

**自動登録された語彙の削除率**
10〜20%程度なら許容。50%消しているなら抽出ロジックが悪い。

**文章投入回数**
「あとで単語帳に入れよう」ではなく、見つけた瞬間に自然と貼り付けるようになるか。

**復習継続**
実際に覚えるところまで使うか。

---

## 29. 商用化判断

自分で使って、「XやYouTubeを見ると自然にVocabulary Inboxへ送りたくなる」状態に
なったら一般公開する。

その時点で、英語 / スペイン語 / フランス語 / ドイツ語 / 中国語 / 韓国語 などへ対応する。

- 無料: 月10回インポート
- 有料: 無制限、月500〜1,000円程度

などを検討する。

LLMコスト自体は非常に低いため、原価よりもUXと継続率が重要。

---

## 30. 実装優先順位

### Phase 1

- テキスト入力
- DeepSeek語彙抽出
- DB保存
- Vocabulary一覧

ここまででまず自分で触る。

### Phase 2

- FSRS
- 復習画面
- Known / Ignore
- 遭遇履歴

日常利用開始。

### Phase 3

- 認証
- PWA
- UI改善
- 利用ログ

他人に触ってもらえる状態にする。

### Phase 4

利用実績が良ければ、Expo Native App / Share Extension へ進む。

---

## 31. このプロダクトで最も重要な部分

技術的には、DeepSeek + Postgres + FSRS なので難しくない。

勝負になるのは、**「何を勝手に登録するか」** の品質。

例えば、

```
hacer / tener / que / de
```

ばかり登録されたら一日で使わなくなる。

逆に、

```
darse cuenta / atreverse / a pesar de / echar de menos
```

のような、「そうそう、こういうのを覚えたかった」というものだけ選ばれるなら強い。

したがって最初の開発時間はUIより、

```
20種類くらいの実際のスペイン語文章
  ↓
抽出結果
  ↓
人間が見て評価
  ↓
Prompt修正
```

という評価セット作りに使う。**ここをこのアプリのコア技術とする。**

評価セットの実体は [`vocabulary-inbox/`](../vocabulary-inbox/README.md)。
抽出・自動採点・人手評価シートの出力までを、アプリ本体とは独立に回せるようにしてある。

---

## 32. MVPの完成形

最終的に最初のWeb版では、これだけできれば完成。

```
       ┌──────────────────┐
       │ 外国語を貼る     │
       └────────┬─────────┘
                ↓
       ┌──────────────────┐
       │ DeepSeek解析     │
       └────────┬─────────┘
                ↓
       ┌──────────────────┐
       │ 勝手に単語帳へ   │
       └────────┬─────────┘
                ↓
       ┌──────────────────┐
       │ FSRSで復習       │
       └──────────────────┘
```

**「カードを作る」という行為をプロダクトから消す。** これをMVPの中心価値とする。
