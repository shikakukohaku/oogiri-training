import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

/** id から決まる、線のゆらぎ量 */
function wobbleOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 33 + id.charCodeAt(i)) % 997;
  return ((h % 7) - 3) / 3; // -1 .. 1
}

function curve(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  amount: number,
): { d: string; mx: number; my: number } {
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  // 線に垂直な向きへ少しふくらませて、定規で引いていない線にする
  const nx = -dy / len;
  const ny = dx / len;
  const bulge = Math.min(26, len * 0.09) * amount;
  const cx = (sx + tx) / 2 + nx * bulge;
  const cy = (sy + ty) / 2 + ny * bulge;
  return {
    d: `M ${sx},${sy} Q ${cx},${cy} ${tx},${ty}`,
    mx: (sx + tx) / 2 + (nx * bulge) / 2,
    my: (sy + ty) / 2 + (ny * bulge) / 2,
  };
}

export function SketchEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  selected,
  data,
}: EdgeProps) {
  const kind = (data?.kind as string) ?? 'parent';
  const color = (data?.color as string) ?? '#1b1a17';
  const cross = kind === 'cross';
  const w = wobbleOf(id);

  const main = curve(sourceX, sourceY, targetX, targetY, w);
  // ほんの少しずらした二本目で、ペンでなぞった線に見せる
  const ghost = curve(sourceX + 1.2, sourceY + 1.6, targetX - 1.2, targetY + 1.4, w * 1.35);

  const stroke = selected ? '#1b1a17' : cross ? '#ef4b3a' : color;

  return (
    <>
      <BaseEdge
        id={id}
        path={main.d}
        style={{
          stroke,
          strokeWidth: cross ? 3 : 2.2,
          strokeLinecap: 'round',
          strokeDasharray: cross ? '9 7' : undefined,
          opacity: cross ? 1 : 0.72,
        }}
      />
      <path
        d={ghost.d}
        fill="none"
        stroke={stroke}
        strokeWidth={cross ? 1.4 : 1}
        strokeLinecap="round"
        opacity={cross ? 0.45 : 0.28}
        style={{ pointerEvents: 'none' }}
      />
      {cross && (
        <EdgeLabelRenderer>
          <div
            className="edge-cross-badge nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${main.mx}px, ${main.my}px)` }}
          >
            ×
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
