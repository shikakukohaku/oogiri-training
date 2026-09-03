import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { MindMap } from './components/MindMap';
import { QuickAdd } from './components/QuickAdd';
import { TopBar } from './components/TopBar';
import { StatsPanel } from './components/StatsPanel';
import { MissionPanel } from './components/MissionPanel';
import { OperatorPanel } from './components/OperatorPanel';
import { SparkPanel } from './components/SparkPanel';
import { SideActions } from './components/SideActions';
import { AnswerBar } from './components/AnswerBar';
import { ResultOverlay } from './components/ResultOverlay';
import { useSession } from './store/useSession';
import { emit, FOCUS_ADD } from './lib/bus';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
  );
}

export default function App() {
  const phase = useSession((s) => s.phase);
  const undo = useSession((s) => s.undo);
  const redo = useSession((s) => s.redo);
  const rollRandomWord = useSession((s) => s.rollRandomWord);
  const backToMap = useSession((s) => s.backToMap);
  const connectMode = useSession((s) => s.connectMode);
  const cancelConnectMode = useSession((s) => s.cancelConnectMode);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (isTyping(e.target)) return;
      if (phase === 'result') {
        if (e.key === 'Escape') backToMap();
        return;
      }
      if (e.key === 'Escape' && connectMode) {
        cancelConnectMode();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        emit(FOCUS_ADD, {});
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        rollRandomWord();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, rollRandomWord, phase, backToMap, connectMode, cancelConnectMode]);

  return (
    <div className="app">
      <TopBar />
      <main className="workspace">
        <section className="canvas-area">
          <div className="canvas">
            <ReactFlowProvider>
              <MindMap />
            </ReactFlowProvider>
          </div>
          <QuickAdd />
        </section>
        <aside className="side">
          <StatsPanel />
          <MissionPanel />
          <SparkPanel />
          <OperatorPanel />
          <p className="help">
            タップ / クリックで選択 / ノードの縁の点をドラッグで線を繋ぐ（「線でつなぐ」を押して
            2つタップでも繋がる）/ ダブルタップで書き換え / Delete で削除 / R で飛び地
          </p>
          <SideActions />
        </aside>
      </main>
      <footer className="bottom">
        <AnswerBar />
      </footer>
      {phase === 'result' && <ResultOverlay />}
    </div>
  );
}
