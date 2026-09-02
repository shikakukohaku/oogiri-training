import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import type { Category } from '../types';
import { categoryDef } from '../data/categories';
import { useSession } from '../store/useSession';
import { emit, FOCUS_ADD } from '../lib/bus';

export type IdeaNodeData = {
  text: string;
  category: Category;
  isRoot: boolean;
  depth: number;
};

export type IdeaFlowNode = Node<IdeaNodeData, 'idea'>;

const HANDLES = [
  { id: 's-r', type: 'source', position: Position.Right },
  { id: 't-l', type: 'target', position: Position.Left },
  { id: 's-l', type: 'source', position: Position.Left },
  { id: 't-r', type: 'target', position: Position.Right },
  { id: 's-t', type: 'source', position: Position.Top },
  { id: 't-t', type: 'target', position: Position.Top },
  { id: 's-b', type: 'source', position: Position.Bottom },
  { id: 't-b', type: 'target', position: Position.Bottom },
] as const;

function IdeaNodeViewBase({ id, data, selected }: NodeProps<IdeaFlowNode>) {
  const renameNode = useSession((s) => s.renameNode);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.text);
  const inputRef = useRef<HTMLInputElement>(null);
  const cat = categoryDef(data.category);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== data.text) renameNode(id, draft);
    else setDraft(data.text);
  };

  return (
    <div
      className={`idea-node${data.isRoot ? ' is-root' : ''}${selected ? ' is-selected' : ''}`}
      style={
        data.isRoot
          ? undefined
          : { background: cat.color, color: cat.ink, borderColor: cat.ink }
      }
      onDoubleClick={() => {
        setDraft(data.text);
        setEditing(true);
      }}
      title={data.isRoot ? 'お題' : 'ダブルクリックで書き換え'}
    >
      {HANDLES.map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          type={h.type}
          position={h.position}
          className={`idea-handle idea-handle-${h.type}`}
        />
      ))}

      {editing ? (
        <input
          ref={inputRef}
          className="idea-edit nodrag"
          value={draft}
          maxLength={60}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(data.text);
              setEditing(false);
            }
          }}
        />
      ) : (
        <span className="idea-text">{data.text}</span>
      )}

      {!data.isRoot && data.category !== 'other' && (
        <span className="idea-cat">{cat.label}</span>
      )}

      <button
        type="button"
        className="idea-add nodrag nopan"
        title="ここから子ノードを追加"
        onClick={(e) => {
          e.stopPropagation();
          emit(FOCUS_ADD, { nodeId: id });
        }}
      >
        +
      </button>
    </div>
  );
}

export const IdeaNodeView = memo(IdeaNodeViewBase);
