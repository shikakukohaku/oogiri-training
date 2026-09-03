import { useSession } from '../store/useSession';
import { useStats } from '../lib/useStats';

export type Sheet = 'tools' | 'answers' | null;

export function PhoneBar({ sheet, onOpen }: { sheet: Sheet; onOpen: (s: Sheet) => void }) {
  const answers = useSession((s) => s.answers);
  const card = useSession((s) => s.card);
  const connectMode = useSession((s) => s.connectMode);
  const startConnectMode = useSession((s) => s.startConnectMode);
  const cancelConnectMode = useSession((s) => s.cancelConnectMode);
  const rollRandomWord = useSession((s) => s.rollRandomWord);
  const stats = useStats();

  return (
    <nav className="phone-bar">
      <button
        type="button"
        className={`pb-btn${sheet === 'tools' ? ' is-on' : ''}${card ? ' has-dot' : ''}`}
        onClick={() => onOpen(sheet === 'tools' ? null : 'tools')}
      >
        <span className="pb-label">ずらし</span>
        <span className="pb-sub">{stats.shifts}種</span>
      </button>

      <button
        type="button"
        className={`pb-btn${connectMode ? ' is-on' : ''}`}
        onClick={() => (connectMode ? cancelConnectMode() : startConnectMode())}
      >
        <span className="pb-label">{connectMode ? 'やめる' : 'つなぐ'}</span>
        <span className="pb-sub">{stats.cross}本</span>
      </button>

      <button
        type="button"
        className="pb-btn"
        onClick={() => {
          rollRandomWord();
          onOpen('tools');
        }}
      >
        <span className="pb-label">飛び地</span>
        <span className="pb-sub">🎲</span>
      </button>

      <button
        type="button"
        className={`pb-btn${sheet === 'answers' ? ' is-on' : ''}`}
        onClick={() => onOpen(sheet === 'answers' ? null : 'answers')}
      >
        <span className="pb-label">回答</span>
        <span className="pb-sub">{answers.length}/5</span>
      </button>
    </nav>
  );
}
