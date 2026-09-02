import { useMemo } from 'react';
import { useSession } from '../store/useSession';
import { computeStats } from './tree';
import type { Stats } from '../types';

export function useStats(): Stats {
  const nodes = useSession((s) => s.nodes);
  const edges = useSession((s) => s.edges);
  const operatorUsages = useSession((s) => s.operatorUsages);
  return useMemo(
    () => computeStats(nodes, edges, operatorUsages),
    [nodes, edges, operatorUsages],
  );
}
