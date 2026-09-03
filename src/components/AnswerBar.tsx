import { useEffect, useRef, useState } from 'react';
import { MAX_ANSWERS, useSession } from '../store/useSession';
import { FOCUS_ANSWER, on } from '../lib/bus';

export function AnswerBar() {
  const answers = useSession((s) => s.answers);
  const addAnswer = useSession((s) => s.addAnswer);
  const removeAnswer = useSession((s) => s.removeAnswer);
  const chooseAnswer = useSession((s) => s.chooseAnswer);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => on(FOCUS_ANSWER, () => inputRef.current?.focus()), []);

  const full = answers.length >= MAX_ANSWERS;

  const submit = () => {
    if (addAnswer(text)) setText('');
  };

  return (
    <div className="answerbar">
      <div className="answerbar-head">
        <h2 className="panel-title">
          回答候補
          <span className="counter">
            {answers.length}/{MAX_ANSWERS}
          </span>
        </h2>
        <div className="answer-input-row">
          <input
            ref={inputRef}
            className="answer-input"
            value={text}
            maxLength={200}
            disabled={full}
            placeholder={
              full ? '候補がいっぱいです（消すと追加できます）' : '一文にまとめて Enter'
            }
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button type="button" className="btn btn-primary" disabled={full} onClick={submit}>
            候補に追加
          </button>
        </div>
      </div>
      <ol className="answer-list">
        {answers.length === 0 && (
          <li className="answer-empty muted">
            まだ回答がありません。マップの言葉を組み合わせて一文にしてみましょう。
          </li>
        )}
        {answers.map((a, i) => (
          <li key={a.id} className={`answer${a.selected ? ' is-selected' : ''}`}>
            <span className="answer-no">回答{i + 1}</span>
            <span className="answer-text">{a.text}</span>
            <button type="button" className="btn btn-small" onClick={() => chooseAnswer(a.id)}>
              これで回答
            </button>
            <button
              type="button"
              className="btn btn-small btn-ghost"
              title="削除"
              onClick={() => removeAnswer(a.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
