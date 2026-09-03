import { useSession } from '../store/useSession';
import { useStats } from '../lib/useStats';
import { hasShiftedAruaru, MISSIONS } from '../lib/missions';

export function MissionPanel() {
  const answers = useSession((s) => s.answers);
  const achieved = useSession((s) => s.achieved);
  const nodes = useSession((s) => s.nodes);
  const operatorUsages = useSession((s) => s.operatorUsages);
  const stats = useStats();
  const ctx = { stats, answers, shiftedAruaru: hasShiftedAruaru(nodes, operatorUsages) };

  // 古いセッションには今は無いミッションの id が残っていることがある
  const doneCount = MISSIONS.filter((m) => achieved.includes(m.id)).length;
  const currentIndex = MISSIONS.findIndex((m) => !achieved.includes(m.id));
  const current = currentIndex >= 0 ? MISSIONS[currentIndex] : null;
  const [cur, goal] = current ? current.progress(ctx) : [0, 0];

  return (
    <section className="panel panel-mission">
      <h2 className="panel-title">
        ミッション
        <span className="counter">
          {doneCount}/{MISSIONS.length}
        </span>
      </h2>
      {current ? (
        <p className="mission-now">
          <span className="mission-now-label">{current.label}</span>
          <span className="mission-progress">
            {cur}/{goal}
          </span>
        </p>
      ) : (
        <p className="mission-clear">全ミッション達成</p>
      )}
      <details className="mission-all">
        <summary>ぜんぶ見る</summary>
        <ol className="mission-list">
          {MISSIONS.map((m) => {
            const done = achieved.includes(m.id);
            return (
              <li key={m.id} className={`mission${done ? ' is-done' : ''}`}>
                <span className="mission-check">{done ? '✓' : '・'}</span>
                <span className="mission-label">{m.label}</span>
              </li>
            );
          })}
        </ol>
      </details>
    </section>
  );
}
