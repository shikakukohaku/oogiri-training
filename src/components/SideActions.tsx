import { useSession } from '../store/useSession';

export function SideActions() {
  const selectedIds = useSession((s) => s.selectedIds);
  const connectNodes = useSession((s) => s.connectNodes);
  const rollRandomWord = useSession((s) => s.rollRandomWord);

  return (
    <div className="side-actions">
      <button
        type="button"
        className="btn btn-connect"
        disabled={selectedIds.length < 2}
        title="選んだ2つのノードを線で繋ぎます（ノードの縁の点をドラッグしても繋げます）"
        onClick={() => connectNodes(selectedIds[0], selectedIds[1])}
      >
        2つを線で繋ぐ
      </button>
      <button type="button" className="btn btn-dice" onClick={rollRandomWord}>
        🎲 煮詰まった
      </button>
    </div>
  );
}
