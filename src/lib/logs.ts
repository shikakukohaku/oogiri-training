import type { SessionLog } from '../types';

const LOG_KEY = 'oogiri-training/logs/v1';

export function loadLogs(): SessionLog[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SessionLog[]) : [];
  } catch {
    return [];
  }
}

export function appendLog(log: SessionLog): void {
  try {
    const logs = loadLogs().filter((l) => l.sessionId !== log.sessionId);
    logs.push(log);
    localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(-200)));
  } catch {
    // localStorage が使えない環境では黙って諦める
  }
}

export function clearLogs(): void {
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    // noop
  }
}

const CSV_COLUMNS: (keyof SessionLog)[] = [
  'sessionId',
  'topicId',
  'topicText',
  'startedAt',
  'finishedAt',
  'durationMs',
  'nodeCount',
  'createdNodeCount',
  'deletedNodeCount',
  'maxDepth',
  'crossEdgeCount',
  'operatorUseCount',
  'operatorsUsed',
  'randomWordCount',
  'answerCount',
  'finalAnswer',
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = Array.isArray(value) ? value.join('|') : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function logsToCsv(logs: SessionLog[]): string {
  const head = CSV_COLUMNS.join(',');
  const rows = logs.map((log) => CSV_COLUMNS.map((c) => csvCell(log[c])).join(','));
  return [head, ...rows].join('\n');
}

export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportLogsJson(extra?: SessionLog | null): void {
  const logs = loadLogs();
  const all = extra ? [...logs.filter((l) => l.sessionId !== extra.sessionId), extra] : logs;
  download('oogiri-logs.json', JSON.stringify(all, null, 2), 'application/json');
}

export function exportLogsCsv(extra?: SessionLog | null): void {
  const logs = loadLogs();
  const all = extra ? [...logs.filter((l) => l.sessionId !== extra.sessionId), extra] : logs;
  download('oogiri-logs.csv', logsToCsv(all), 'text/csv');
}
