import { useSession } from '../store/useSession';
import { useStats } from '../lib/useStats';
import { operatorLabel } from '../data/operators';
import { topicById } from '../data/topics';
import { exportLogsCsv, exportLogsJson } from '../lib/logs';

const BARS = [
  { key: 'volume', label: '発想量', max: 20 },
  { key: 'width', label: '広さ', max: 8 },
  { key: 'depth', label: '深さ', max: 6 },
  { key: 'cross', label: '横断', max: 5 },
] as const;

function Segments({ value, max }: { value: number; max: number }) {
  const filled = Math.min(value, max);
  return (
    <span className="segbar">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`seg${i < filled ? ' is-on' : ''}`} />
      ))}
    </span>
  );
}

function formatDuration(ms: number | null): string {
  if (!ms || ms < 0) return '—';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

export function ResultOverlay() {
  const answers = useSession((s) => s.answers);
  const operatorUsages = useSession((s) => s.operatorUsages);
  const topicId = useSession((s) => s.topicId);
  const log = useSession((s) => s.log);
  const restart = useSession((s) => s.restart);
  const goNextTopic = useSession((s) => s.goNextTopic);
  const backToMap = useSession((s) => s.backToMap);
  const stats = useStats();

  const final = answers.find((a) => a.selected);
  const usedOps = Array.from(new Set(operatorUsages.map((u) => u.operator)));

  return (
    <div className="overlay">
      <div className="result">
        <p className="result-topic">{topicById(topicId).text}</p>
        <h2 className="result-title">今回の発想</h2>

        <ul className="result-bars">
          {BARS.map((b) => (
            <li key={b.key}>
              <span className="result-bar-label">{b.label}</span>
              <Segments value={stats[b.key]} max={b.max} />
              <span className="result-bar-value">{stats[b.key]}</span>
            </li>
          ))}
        </ul>

        <div className="result-block">
          <h3>使用したずらし</h3>
          {usedOps.length ? (
            <ul className="result-ops">
              {usedOps.map((op) => (
                <li key={op}>{operatorLabel(op)}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">なし</p>
          )}
        </div>

        <div className="result-block">
          <h3>最終回答</h3>
          <p className="result-answer">{final ? final.text : '—'}</p>
        </div>

        <p className="result-meta">
          かかった時間 {formatDuration(log.durationMs)} ／ 作ったノード {log.createdNodeCount}{' '}
          ／ 消したノード {log.deletedNodeCount} ／ 飛び地 {log.randomWordCount} 回 ／ 回答{' '}
          {log.answerCount} 個
        </p>

        <div className="result-actions">
          <button type="button" className="btn btn-primary" onClick={restart}>
            もう一度
          </button>
          <button type="button" className="btn btn-primary" onClick={goNextTopic}>
            次のお題
          </button>
          <button type="button" className="btn" onClick={backToMap}>
            マップに戻る
          </button>
        </div>
        <div className="result-actions">
          <button type="button" className="btn btn-small" onClick={() => exportLogsJson(log)}>
            ログをJSONで保存
          </button>
          <button type="button" className="btn btn-small" onClick={() => exportLogsCsv(log)}>
            ログをCSVで保存
          </button>
        </div>
      </div>
    </div>
  );
}
