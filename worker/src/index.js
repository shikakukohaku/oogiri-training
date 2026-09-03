/**
 * あるあるのお手本を返す Cloudflare Worker。
 *
 * ブラウザから直接 LLM を叩くと API キーがブラウザに置かれるうえ、
 * CORS でも弾かれる。キーはここに置き、アプリは {word, topic} だけを送る。
 * プロバイダをこの中に閉じ込めてあるので、差し替えてもアプリは触らなくてよい。
 */

const MODEL = 'deepseek-chat';
const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const WANT = 5;
const MAX_ITEM_LENGTH = 40;

const SYSTEM_PROMPT = `あなたは大喜利の素材係です。お題と言葉を渡すので、その言葉についての「あるある」を5つ挙げてください。

あるあるとは、多くの人が共有している前提のことです。笑いは共有された前提を裏切って起きるので、裏切る対象は「みんなが知っていること」でなければ成立しません。

守ること:
- 必ずお題の文脈に沿ったあるあるにする。お題と関係のない一般論は出さない
- 事実や豆知識ではなく、聞いた人が「ある」と感じるものを出す
- ボケ・大喜利の回答は書かない。裏切るのは利用者の仕事
- 一文で、25文字以内
- すでに書かれているものとは違う角度のものを出す

出力は次の JSON だけ。説明は書かない:
{"items":["あるある1","あるある2","あるある3","あるある4","あるある5"]}`;

function corsHeaders(origin, allowed) {
  const ok = allowed.length === 0 || allowed.includes(origin);
  return {
    'access-control-allow-origin': ok ? origin || '*' : allowed[0],
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

/** 返ってきた JSON を信用せず、必ず形を整えてから返す */
function normalize(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // ```json ... ``` で包まれることがある
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }
  const list = Array.isArray(parsed) ? parsed : (parsed?.items ?? []);
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    if (typeof entry !== 'string') continue;
    const text = entry.trim().replace(/^[-・*\d.\s]+/, '').slice(0, MAX_ITEM_LENGTH);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= WANT) break;
  }
  return out;
}

/** KV を割り当てている場合だけ、IP ごとに1日の回数を制限する */
async function overLimit(env, ip) {
  if (!env.RATE_LIMIT || !ip) return false;
  const limit = Number(env.DAILY_LIMIT ?? 40);
  const key = `${new Date().toISOString().slice(0, 10)}:${ip}`;
  const used = Number((await env.RATE_LIMIT.get(key)) ?? 0);
  if (used >= limit) return true;
  await env.RATE_LIMIT.put(key, String(used + 1), { expirationTtl: 60 * 60 * 26 });
  return false;
}

export default {
  async fetch(request, env) {
    const allowed = (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const origin = request.headers.get('origin') ?? '';
    const cors = corsHeaders(origin, allowed);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST してください' }, 405, cors);
    if (allowed.length > 0 && !allowed.includes(origin)) {
      return json({ error: 'このオリジンからは使えません' }, 403, cors);
    }
    if (!env.DEEPSEEK_API_KEY) {
      return json({ error: 'DEEPSEEK_API_KEY が設定されていません' }, 500, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'JSON を送ってください' }, 400, cors);
    }

    const word = String(body?.word ?? '').trim().slice(0, 60);
    const topic = String(body?.topic ?? '').trim().slice(0, 120);
    if (!word || !topic) return json({ error: 'word と topic が要ります' }, 400, cors);

    const existing = Array.isArray(body?.existing)
      ? body.existing.filter((s) => typeof s === 'string').slice(0, 8)
      : [];

    if (await overLimit(env, request.headers.get('cf-connecting-ip'))) {
      return json({ error: '今日の回数の上限に達しました' }, 429, cors);
    }

    const userPrompt = [
      `お題: ${topic}`,
      `言葉: ${word}`,
      `すでに書かれているもの: ${existing.length ? existing.join(' / ') : 'なし'}`,
    ].join('\n');

    let upstream;
    try {
      upstream = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.MODEL ?? MODEL,
          response_format: { type: 'json_object' },
          max_tokens: 512,
          temperature: 1.0,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
    } catch {
      return json({ error: 'お手本の取得に失敗しました' }, 502, cors);
    }

    if (!upstream.ok) {
      return json({ error: `お手本の取得に失敗しました (${upstream.status})` }, 502, cors);
    }

    const data = await upstream.json().catch(() => null);
    const items = normalize(data?.choices?.[0]?.message?.content ?? '');
    if (items.length === 0) {
      return json({ error: 'お手本を組み立てられませんでした' }, 502, cors);
    }

    return json({ items, word, model: env.MODEL ?? MODEL }, 200, cors);
  },
};
