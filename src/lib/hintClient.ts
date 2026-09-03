const ENDPOINT_KEY = 'oogiri-training/hint-endpoint/v1';
const TIMEOUT_MS = 20000;
const MAX_ITEMS = 5;
const MAX_ITEM_LENGTH = 40;

export function getHintEndpoint(): string {
  try {
    return localStorage.getItem(ENDPOINT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setHintEndpoint(url: string): void {
  try {
    const trimmed = url.trim();
    if (trimmed) localStorage.setItem(ENDPOINT_KEY, trimmed);
    else localStorage.removeItem(ENDPOINT_KEY);
  } catch {
    // localStorage が使えない環境では諦める
  }
}

export interface HintRequest {
  word: string;
  topic: string;
  existing: string[];
}

/** 返ってきたものは信用せず、形を整えてから使う */
function normalize(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of list) {
    if (typeof entry !== 'string') continue;
    const text = entry.trim().slice(0, MAX_ITEM_LENGTH);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export async function fetchAruaruHint(endpoint: string, req: HintRequest): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        typeof data === 'object' && data !== null && 'error' in data
          ? String((data as { error: unknown }).error)
          : `お手本の取得に失敗しました (${res.status})`;
      throw new Error(message);
    }
    const items = normalize((data as { items?: unknown } | null)?.items);
    if (items.length === 0) throw new Error('お手本が空で返ってきました');
    return items;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('お手本の取得が時間切れになりました');
    }
    // fetch 自体が失敗したときは TypeError。そのままでは「Failed to fetch」になる
    if (e instanceof TypeError) {
      throw new Error('お手本を返す先に繋がりませんでした（URL の設定を確認してください）');
    }
    throw e instanceof Error ? e : new Error('お手本の取得に失敗しました');
  } finally {
    clearTimeout(timer);
  }
}
