import { useStats } from '../lib/useStats';

const ROWS = [
  { key: 'volume', label: '発想量', note: '総ノード数', max: 20 },
  { key: 'width', label: '広さ', note: 'お題の直下', max: 8 },
  { key: 'depth', label: '深さ', note: '最大の段数', max: 6 },
  { key: 'cross', label: '横断', note: '枝をまたぐ線', max: 5 },
  { key: 'shifts', label: 'ずらし', note: '使った種類', max: 8 },
] as const;

export function StatsPanel() {
  const stats = useStats();
  return (
    <section className="hud">
      {ROWS.map((r) => {
        const value = stats[r.key];
        const pct = Math.min(100, (value / r.max) * 100);
        return (
          <div key={r.key} className="hud-cell" title={r.note}>
            <span className="hud-label">{r.label}</span>
            <span className="hud-value">{value}</span>
            <span className="hud-gauge">
              <span className="hud-gauge-fill" style={{ width: `${pct}%` }} />
            </span>
          </div>
        );
      })}
    </section>
  );
}
