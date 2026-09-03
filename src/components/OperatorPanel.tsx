import { OPERATORS } from '../data/operators';
import { useSession } from '../store/useSession';

export function OperatorPanel() {
  const nodes = useSession((s) => s.nodes);
  const selectedIds = useSession((s) => s.selectedIds);
  const applyOperator = useSession((s) => s.applyOperator);

  const picked = selectedIds
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is NonNullable<typeof n> => Boolean(n));

  return (
    <section className="panel panel-op">
      <h2 className="panel-title">ずらし</h2>
      <p className="panel-sub">
        {picked.length === 0 ? (
          <span className="muted">ノードを選ぶと使えます（Shift+クリックで2つ選択）</span>
        ) : (
          <>
            選択中:{' '}
            {picked
              .slice(0, 2)
              .map((n) => `「${n.text}」`)
              .join(' ')}
          </>
        )}
      </p>
      <div className="op-grid">
        {OPERATORS.map((op) => {
          const disabled = picked.length < op.needs;
          return (
            <button
              key={op.id}
              type="button"
              className={`op-btn${op.needs === 2 ? ' op-btn-wide' : ''}`}
              disabled={disabled}
              title={`${op.hint} 例: ${op.example}`}
              onClick={() => applyOperator(op.id)}
            >
              <span className="op-label">{op.label}</span>
              <span className="op-hint">{op.hint}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
