import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category } from '../types';
import { CATEGORIES } from '../data/categories';
import { useSession } from '../store/useSession';
import { FOCUS_ADD, on } from '../lib/bus';

export function QuickAdd() {
  const nodes = useSession((s) => s.nodes);
  const selectedIds = useSession((s) => s.selectedIds);
  const addNode = useSession((s) => s.addNode);

  const [text, setText] = useState('');
  const [category, setCategory] = useState<Category>('other');
  const [pinned, setPinned] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastCreated = useRef<string | null>(null);

  const rootId = useMemo(() => nodes.find((n) => n.parentId === null)?.id ?? null, [nodes]);
  const targetId = pinned ?? selectedIds[0] ?? rootId;
  const target = nodes.find((n) => n.id === targetId) ?? null;

  // ユーザーが自分で別のノードを選び直したら pin を外す
  useEffect(() => {
    if (selectedIds[0] !== lastCreated.current) setPinned(null);
  }, [selectedIds]);

  useEffect(
    () =>
      on(FOCUS_ADD, (detail) => {
        const d = (detail ?? {}) as { nodeId?: string; text?: string };
        if (d.nodeId) {
          lastCreated.current = d.nodeId;
          setPinned(d.nodeId);
        }
        if (d.text) setText(d.text);
        inputRef.current?.focus();
      }),
    [],
  );

  const submit = (dive: boolean) => {
    if (!targetId || !text.trim()) return;
    const id = addNode(targetId, text, category);
    if (!id) return;
    setText('');
    lastCreated.current = id;
    setPinned(dive ? id : targetId);
    inputRef.current?.focus();
  };

  return (
    <div className="quickadd">
      <div className="quickadd-row">
        <span className="quickadd-target" title="ここに子ノードが生えます">
          <span className="quickadd-target-label">追加先</span>
          <strong>{target ? target.text : '—'}</strong>
        </span>
        <input
          ref={inputRef}
          className="quickadd-input"
          value={text}
          maxLength={60}
          placeholder="思いついた言葉を入れて Enter"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit(e.shiftKey);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setPinned(null);
              inputRef.current?.blur();
            }
          }}
        />
        <button type="button" className="btn btn-primary" onClick={() => submit(false)}>
          追加
        </button>
      </div>
      <div className="quickadd-row quickadd-cats">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip${category === c.id ? ' is-on' : ''}`}
            style={{ background: c.color, color: c.ink, borderColor: c.ink }}
            onClick={() => {
              setCategory(c.id);
              inputRef.current?.focus();
            }}
          >
            {c.label}
          </button>
        ))}
        <span className="quickadd-hint">
          Enter 追加 / Shift+Enter 追加してそのまま深掘り / Esc 解除
        </span>
      </div>
    </div>
  );
}
