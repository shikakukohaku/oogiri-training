import { useSession } from '../store/useSession';
import { topicById, TOPICS } from '../data/topics';
import { exportLogsCsv, exportLogsJson } from '../lib/logs';
import { emit, FIT_VIEW } from '../lib/bus';

export function TopBar() {
  const topicId = useSession((s) => s.topicId);
  const setTopic = useSession((s) => s.setTopic);
  const goNextTopic = useSession((s) => s.goNextTopic);
  const restart = useSession((s) => s.restart);
  const autoLayout = useSession((s) => s.autoLayout);
  const undo = useSession((s) => s.undo);
  const redo = useSession((s) => s.redo);
  const canUndo = useSession((s) => s.past.length > 0);
  const canRedo = useSession((s) => s.future.length > 0);
  const log = useSession((s) => s.log);
  const topic = topicById(topicId);

  return (
    <header className="topbar">
      <div className="topbar-main">
        <span className="topbar-mark" title="大喜利発想トレーニング">
          発想
          <br />
          筋トレ
        </span>
        <span className="topbar-tag">お題</span>
        <h1 className="topbar-topic">{topic.text}</h1>
      </div>
      <div className="topbar-tools">
        <select
          className="topic-select"
          value={topicId}
          aria-label="お題を選ぶ"
          onChange={(e) => {
            if (confirm('お題を変えると今のマップは消えます。よろしいですか？')) {
              setTopic(e.target.value);
            }
          }}
        >
          {TOPICS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.text}
            </option>
          ))}
        </select>
        <button type="button" className="btn" disabled={!canUndo} onClick={undo} title="Ctrl+Z">
          元に戻す
        </button>
        <button
          type="button"
          className="btn"
          disabled={!canRedo}
          onClick={redo}
          title="Ctrl+Shift+Z"
        >
          やり直す
        </button>
        <button
          type="button"
          className="btn"
          title="放射状に並べ直す"
          onClick={() => {
            autoLayout();
            emit(FIT_VIEW);
          }}
        >
          整列
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (confirm('このお題で最初からやり直しますか？')) restart();
          }}
        >
          リセット
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (confirm('次のお題に進みます。今のマップは消えます。')) goNextTopic();
          }}
        >
          次のお題
        </button>
        <span className="topbar-export">
          <button type="button" className="btn btn-small" onClick={() => exportLogsJson(log)}>
            JSON
          </button>
          <button type="button" className="btn btn-small" onClick={() => exportLogsCsv(log)}>
            CSV
          </button>
        </span>
      </div>
    </header>
  );
}
