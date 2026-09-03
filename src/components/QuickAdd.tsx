import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category, NodeKind, NodeSource } from '../types';
import { CATEGORIES } from '../data/categories';
import { MAX_ARUARU_TEXT, useSession } from '../store/useSession';
import { FOCUS_ADD, on } from '../lib/bus';

export function QuickAdd() {
  const nodes = useSession((s) => s.nodes);
  const selectedIds = useSession((s) => s.selectedIds);
  const addNode = useSession((s) => s.addNode);
  const openAruaruHint = useSession((s) => s.openAruaruHint);

  const [text, setText] = useState('');
  const [category, setCategory] = useState<Category>('other');
  const [kind, setKind] = useState<NodeKind>('word');
  const [pinned, setPinned] = useState<string | null>(null);
  // お手本から流し込まれた文か。書き直しても由来は由来として残す
  const [fromHint, setFromHint] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastCreated = useRef<string | null>(null);

  const rootId = useMemo(() => nodes.find((n) => n.parentId === null)?.id ?? null, [nodes]);
  const targetId = pinned ?? selectedIds[0] ?? rootId;
  const target = nodes.find((n) => n.id === targetId) ?? null;

  // あるあるのあるあるは作れない。対象が文なら単語モードに戻す
  const canWriteAruaru = target !== null && target.kind !== 'aruaru';
  const mode: NodeKind = canWriteAruaru ? kind : 'word';

  // その言葉について、自分で1つでも書いたか（お手本を開ける条件）
  const selfAruaruCount = useMemo(
    () =>
      nodes.filter((n) => n.parentId === targetId && n.kind === 'aruaru' && n.source !== 'hint')
        .length,
    [nodes, targetId],
  );

  // ユーザーが自分で別のノードを選び直したら pin を外す
  useEffect(() => {
    if (selectedIds[0] !== lastCreated.current) setPinned(null);
  }, [selectedIds]);

  useEffect(
    () =>
      on(FOCUS_ADD, (detail) => {
        const d = (detail ?? {}) as {
          nodeId?: string;
          text?: string;
          kind?: NodeKind;
          source?: NodeSource;
        };
        if (d.nodeId) {
          lastCreated.current = d.nodeId;
          setPinned(d.nodeId);
        }
        if (d.kind) setKind(d.kind);
        if (d.text) setText(d.text);
        setFromHint(d.source === 'hint');
        inputRef.current?.focus();
      }),
    [],
  );

  const submit = (dive: boolean) => {
    if (!targetId || !text.trim()) return;
    const id = addNode(
      targetId,
      text,
      mode === 'aruaru' ? 'other' : category,
      mode,
      fromHint ? 'hint' : 'self',
    );
    if (!id) return;
    setText('');
    setFromHint(false);
    lastCreated.current = id;
    // あるあるは同じ言葉に並べたいので、掘らずに追加先を保つ
    setPinned(mode === 'aruaru' ? targetId : dive ? id : targetId);
    inputRef.current?.focus();
  };

  return (
    <div className={`quickadd mode-${mode}`}>
      <div className="quickadd-row">
        <span className="quickadd-target" title="ここに子ノードが生えます">
          <span className="quickadd-target-label">追加先</span>
          <strong>{target ? target.text : '—'}</strong>
        </span>

        <span className="kind-switch" role="group" aria-label="追加するものの種類">
          <button
            type="button"
            className={`kind-btn${mode === 'word' ? ' is-on' : ''}`}
            onClick={() => {
              setKind('word');
              inputRef.current?.focus();
            }}
          >
            単語
          </button>
          <button
            type="button"
            className={`kind-btn${mode === 'aruaru' ? ' is-on' : ''}`}
            disabled={!canWriteAruaru}
            title={canWriteAruaru ? '共有された前提を一文で書く' : 'あるあるの下には書けません'}
            onClick={() => {
              setKind('aruaru');
              inputRef.current?.focus();
            }}
          >
            あるある
          </button>
        </span>

        <input
          ref={inputRef}
          className="quickadd-input"
          value={text}
          maxLength={mode === 'aruaru' ? MAX_ARUARU_TEXT : 60}
          placeholder={
            mode === 'aruaru'
              ? `「${target?.text ?? ''}」のあるあるを一文で`
              : '思いついた言葉を入れて Enter'
          }
          onChange={(e) => {
            setText(e.target.value);
            // まっさらにしてから書き直したなら、それは自分の言葉
            if (e.target.value === '') setFromHint(false);
          }}
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

      {mode === 'aruaru' ? (
        <div className="quickadd-row quickadd-aruaru">
          <button
            type="button"
            className={`btn btn-hint${selfAruaruCount < 1 ? ' is-locked' : ''}`}
            disabled={!targetId}
            title={
              selfAruaruCount < 1
                ? 'まず自分で1つ書いてから開きます'
                : 'あるあるのお手本を5つ見る'
            }
            onClick={() => {
              if (!targetId) return;
              openAruaruHint(targetId);
              inputRef.current?.focus();
            }}
          >
            {selfAruaruCount < 1 ? '🔒 お手本を見る' : 'お手本を見る'}
          </button>
          <span className="quickadd-note">
            {selfAruaruCount < 1
              ? 'まず自分で1つ書こう。書いてから見ると身につき方が変わります'
              : '多くの人が共有している前提を一文で。「〜しがち」で終わる形が書きやすい'}
          </span>
        </div>
      ) : (
        <div className="quickadd-row quickadd-cats">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chip${category === c.id ? ' is-on' : ''}`}
              style={{ background: c.color }}
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
      )}
    </div>
  );
}
