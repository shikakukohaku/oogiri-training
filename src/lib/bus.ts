/** 小さな用途限定のイベントバス（ノードから入力欄へフォーカスを渡すだけ） */
export const FOCUS_ADD = 'oogiri:focus-add';
export const FOCUS_ANSWER = 'oogiri:focus-answer';

export function emit(name: string, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on(name: string, handler: (detail: unknown) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent).detail);
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}
