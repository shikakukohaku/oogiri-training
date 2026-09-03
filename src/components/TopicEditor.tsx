import { useEffect, useRef, useState } from 'react';
import { deriveRoot, PRESET_TOPICS } from '../data/topics';
import { MAX_TOPIC_ROOT, MAX_TOPIC_TEXT, useTopics } from '../store/useTopics';
import { useSession } from '../store/useSession';

export function TopicEditor({ onClose }: { onClose: () => void }) {
  const custom = useTopics((s) => s.custom);
  const addTopic = useTopics((s) => s.addTopic);
  const removeTopic = useTopics((s) => s.removeTopic);
  const setTopic = useSession((s) => s.setTopic);
  const currentTopicId = useSession((s) => s.topicId);
  const nodeCount = useSession((s) => s.nodes.length);

  const [text, setText] = useState('');
  const [root, setRoot] = useState('');
  const [rootEdited, setRootEdited] = useState(false);
  const textRef = useRef<HTMLInputElement>(null);

  useEffect(() => textRef.current?.focus(), []);

  const rootValue = rootEdited ? root : deriveRoot(text);

  const submit = () => {
    if (!text.trim()) return;
    if (nodeCount > 1 && !confirm('新しいお題を始めます。今のマップは消えます。')) return;
    const topic = addTopic(text, rootValue);
    if (!topic) return;
    setTopic(topic.id);
    onClose();
  };

  return (
    <div className="topic-editor" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <h2 className="panel-title">
        お題を作る
        <button type="button" className="panel-x" onClick={onClose} title="閉じる">
          ×
        </button>
      </h2>

      <label className="topic-field">
        <span>お題</span>
        <input
          ref={textRef}
          value={text}
          maxLength={MAX_TOPIC_TEXT}
          placeholder="例: 絶対に泊まりたくないホテル。どんなホテル？"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
      </label>

      <label className="topic-field">
        <span>マップの中央に置く言葉</span>
        <input
          value={rootValue}
          maxLength={MAX_TOPIC_ROOT}
          placeholder="お題から自動で作ります"
          onChange={(e) => {
            setRootEdited(true);
            setRoot(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
      </label>

      <button
        type="button"
        className="btn btn-primary"
        disabled={!text.trim()}
        onClick={submit}
      >
        追加して始める
      </button>

      <div className="topic-list">
        <h3>作ったお題（{custom.length}）</h3>
        {custom.length === 0 ? (
          <p className="muted">
            まだありません。プリセットは{PRESET_TOPICS.length}問あります。
          </p>
        ) : (
          <ul>
            {custom.map((t) => (
              <li key={t.id}>
                <span className="topic-list-text">{t.text}</span>
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  disabled={t.id === currentTopicId}
                  title={
                    t.id === currentTopicId ? 'いま挑戦中のお題は消せません' : 'このお題を消す'
                  }
                  onClick={() => removeTopic(t.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
