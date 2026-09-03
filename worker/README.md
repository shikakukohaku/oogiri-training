# あるあるのお手本を返す Worker

アプリからは `{word, topic, existing}` を送り、`{items: string[]}` が返る。
API キーはこの Worker の中だけに置き、ブラウザには出さない。

## なぜ Worker を挟むのか

- ブラウザから LLM の API を直接叩くと、キーがブラウザに置かれる。公開サイトでは使えない
- LLM の API は普通ブラウザ向けの CORS を開けていないので、そもそも通らない
- プロバイダをこの中に閉じ込めてあるので、差し替えてもアプリ側は変更不要

## 用意するもの

- Cloudflare のアカウント（無料枠で足りる）
- DeepSeek の API キー

## 手順

```bash
npm install -g wrangler
wrangler login

cd worker
wrangler secret put DEEPSEEK_API_KEY   # 貼り付ける。ここにしか置かれない
wrangler deploy
```

`https://oogiri-aruaru.<subdomain>.workers.dev` のような URL が出る。
アプリの `≡` → 「お手本の設定」にその URL を入れると、お手本が AI から出るようになる。

## 回数制限（推奨）

公開 URL なので、入れないと他人にクレジットを使われる。

```bash
wrangler kv namespace create RATE_LIMIT
```

出てきた id を `wrangler.toml` の `[[kv_namespaces]]` に書いてコメントを外し、
もう一度 `wrangler deploy`。IP ごとに1日 `DAILY_LIMIT` 回まで。

`ALLOWED_ORIGINS` には公開サイトのオリジンを入れておく（空にすると誰からでも叩ける）。

## 動作確認

```bash
curl -X POST https://<your-worker>.workers.dev \
  -H 'content-type: application/json' \
  -H 'origin: https://shikakukohaku.github.io' \
  -d '{"word":"おばあちゃん","topic":"逆張りおばあちゃんが教えてくれた生活の知恵とは？"}'
```

## 別のモデルを使う

`wrangler.toml` の `[vars]` に `MODEL = "..."` を足す。OpenAI 互換の API なら
`src/index.js` の `ENDPOINT` を変えるだけで動く。
