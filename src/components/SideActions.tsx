import { useSession } from '../store/useSession';

export function SideActions() {
  const selectedIds = useSession((s) => s.selectedIds);
  const connectNodes = useSession((s) => s.connectNodes);
  const rollRandomWord = useSession((s) => s.rollRandomWord);
  const connectMode = useSession((s) => s.connectMode);
  const startConnectMode = useSession((s) => s.startConnectMode);
  const cancelConnectMode = useSession((s) => s.cancelConnectMode);

  // 2つ選んであるならその場で繋ぐ。そうでなければタップで繋ぐモードに入る。
  const ready = selectedIds.length >= 2;
  const label = connectMode ? 'つなぐのをやめる' : ready ? '2つを線で繋ぐ' : '線でつなぐ';

  return (
    <div className="side-actions">
      <button
        type="button"
        className={`btn btn-connect${connectMode ? ' is-on' : ''}`}
        title="2つのノードを線で繋ぎます。ノードの縁の点をドラッグしても繋げます"
        onClick={() => {
          if (connectMode) cancelConnectMode();
          else if (ready) connectNodes(selectedIds[0], selectedIds[1]);
          else startConnectMode();
        }}
      >
        {label}
      </button>
      <button type="button" className="btn btn-dice" onClick={rollRandomWord}>
        🎲 煮詰まった
      </button>
    </div>
  );
}
