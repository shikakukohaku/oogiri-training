import { useEffect, useRef } from 'react';
import { useSession } from '../store/useSession';
import { emit, FOCUS_ADD, FOCUS_ANSWER } from '../lib/bus';

export function SparkPanel() {
  const card = useSession((s) => s.card);
  const clearCard = useSession((s) => s.clearCard);
  const ref = useRef<HTMLElement>(null);
  const cardAt = card?.at;

  // 新しいカードが出たとき、画面の外にいたら寄せる
  useEffect(() => {
    if (cardAt) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [cardAt]);

  if (!card) {
    return (
      <section className="panel panel-spark is-empty" ref={ref}>
        <h2 className="panel-title">ひらめきカード</h2>
        <p className="muted">
          ずらしを押すか、離れた2つのノードを線で繋ぐと、ここにお題が出ます。
        </p>
      </section>
    );
  }

  return (
    <section className={`panel panel-spark kind-${card.kind}`} ref={ref}>
      <h2 className="panel-title">
        ひらめきカード
        <button type="button" className="panel-x" onClick={clearCard} title="閉じる">
          ×
        </button>
      </h2>
      <div className="spark">
        <div className="spark-title">{card.title}</div>
        <div className="spark-subtitle">{card.subtitle}</div>
        <p className="spark-body">{card.body}</p>

        {card.kind === 'aruaru' && card.items && card.items.length > 0 && (
          <ul className="hint-list">
            {card.items.map((item) => (
              <li key={item}>
                <span className="hint-text">{item}</span>
                <button
                  type="button"
                  className="btn btn-small"
                  title="入力欄に入れます。自分の言葉に直してから Enter"
                  onClick={() =>
                    emit(FOCUS_ADD, {
                      nodeId: card.nodeIds[0],
                      text: item,
                      kind: 'aruaru',
                      source: 'hint',
                    })
                  }
                >
                  使う
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="spark-prompt">{card.prompt}</p>
        {card.kind !== 'aruaru' && (
          <div className="spark-actions">
            <button
              type="button"
              className="btn"
              onClick={() => emit(FOCUS_ADD, { nodeId: card.nodeIds[0], text: card.seed })}
            >
              ノードにする
            </button>
            <button type="button" className="btn" onClick={() => emit(FOCUS_ANSWER, {})}>
              回答にする
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
