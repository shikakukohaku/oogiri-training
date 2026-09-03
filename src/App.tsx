import { useEffect, useRef, useState } from 'react';
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
import { useIsPhone } from './lib/useIsPhone';
import { PhoneBar } from './components/PhoneBar';
import type { Sheet } from './components/PhoneBar';
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
  const isPhone = useIsPhone();
  const [rawSheet, setRawSheet] = useState<Sheet>(null);
  // 幅が広い画面ではシートという概念がない
  const sheet = isPhone ? rawSheet : null;
  const openedAt = useRef(0);

  const setSheet = (next: Sheet) => {
    if (next) openedAt.current = Date.now();
    setRawSheet(next);
  };

  // カードが出たら道具のシートを開く。出しっぱなしにしないと気づけない
  useEffect(() => {
    if (!isPhone) return undefined;
    return useSession.subscribe((s, prev) => {
      if (s.card && s.card.at !== prev.card?.at) {
        openedAt.current = Date.now();
        setRawSheet('tools');
      }
    });
  }, [isPhone]);

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
      if (e.key === 'Escape') {
        if (connectMode) {
          cancelConnectMode();
          return;
        }
        if (sheet) {
          setSheet(null);
          return;
        }
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
  }, [undo, redo, rollRandomWord, phase, backToMap, connectMode, cancelConnectMode, sheet]);

  return (
    <div className={`app${isPhone ? ' is-phone' : ''}${sheet ? ' sheet-open' : ''}`}>
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
        <aside className={`side${sheet === 'tools' ? ' is-open' : ''}`}>
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
      {/*
        背景を閉じるのは click。開いたきっかけの指の click が背景に届いてしまうので、
        開いた直後の一瞬だけ無視する。pointerdown で閉じると、今度は閉じたあとの
        click が下のキャンバスまで抜けて選択が外れ、「追加先」がお題に戻ってしまう
        （タッチの click は touchstart 基準で作られるので pointerdown では止まらない）
      */}
      {isPhone && sheet && (
        <div
          className="sheet-backdrop"
          aria-hidden="true"
          onClick={() => {
            if (Date.now() - openedAt.current > 300) setSheet(null);
          }}
        />
      )}
      <footer className={`answer-dock${sheet === 'answers' ? ' is-open' : ''}`}>
        <AnswerBar />
      </footer>
      {isPhone && <PhoneBar sheet={sheet} onOpen={setSheet} />}
      {phase === 'result' && <ResultOverlay />}
    </div>
  );
}
