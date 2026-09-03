import { useEffect, useRef, useState } from 'react';
import { getHintEndpoint, setHintEndpoint } from '../lib/hintClient';

export function HintSettings({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(() => getHintEndpoint());
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => ref.current?.focus(), []);

  const save = () => {
    setHintEndpoint(url);
    setSaved(true);
  };

  return (
    <div
      className="topic-editor hint-settings"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <h2 className="panel-title">
        お手本の設定
        <button type="button" className="panel-x" onClick={onClose} title="閉じる">
          ×
        </button>
      </h2>

      <p className="hint-settings-lead">
        同じ言葉でも、お題が変われば要るあるあるは変わります。手元の見本は単語にしか
        答えられないので、お題を踏まえたお手本が欲しいときはここに Worker の URL を入れます。
      </p>

      <label className="topic-field">
        <span>お手本を返す URL</span>
        <input
          ref={ref}
          value={url}
          placeholder="https://oogiri-aruaru.xxx.workers.dev"
          inputMode="url"
          onChange={(e) => {
            setUrl(e.target.value);
            setSaved(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
        />
      </label>

      <div className="hint-settings-actions">
        <button type="button" className="btn btn-primary" onClick={save}>
          {saved ? '保存しました' : '保存'}
        </button>
        {getHintEndpoint() && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setUrl('');
              setHintEndpoint('');
              setSaved(true);
            }}
          >
            解除
          </button>
        )}
      </div>

      <p className="hint-settings-note">
        入れないあいだは、手元の見本（42語）が出ます。URL の作り方は リポジトリの{' '}
        <code>worker/README.md</code> にあります。API キーは Worker の中だけに
        置かれ、ここには入れません。
      </p>
    </div>
  );
}
