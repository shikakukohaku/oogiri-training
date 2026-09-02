import { useSession } from '../store/useSession';
import { emit, FOCUS_ADD, FOCUS_ANSWER } from '../lib/bus';

export function SparkPanel() {
  const card = useSession((s) => s.card);
  const clearCard = useSession((s) => s.clearCard);

  if (!card) {
    return (
      <section className="panel panel-spark is-empty">
        <h2 className="panel-title">ひらめきカード</h2>
        <p className="muted">
          ずらしを押すか、離れた2つのノードを線で繋ぐと、ここにお題が出ます。
        </p>
      </section>
    );
  }

  return (
    <section className={`panel panel-spark kind-${card.kind}`}>
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
        <p className="spark-prompt">{card.prompt}</p>
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
      </div>
    </section>
  );
}
