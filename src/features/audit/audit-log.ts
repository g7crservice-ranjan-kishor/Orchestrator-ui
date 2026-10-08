import type { AuditEntry } from '../../lib/types';

/**
 * The reading, grouping and filtering rules behind the Audit Log.
 *
 * The audit trail is append-only and deliberately plain: who, what, which entity, when, and some
 * structured context. Everything the page shows beyond those five things is *derived* here — which
 * is why it is worth testing. A category read off the wrong part of an action name, or a count that
 * disagrees with the rows beneath it, is the kind of mistake an audit log must not make.
 */

/** What a raw action verb is called in English. */
export const ACTION_LABELS: Record<string, string> = {
  'project.created': 'Project created',
  'requirement.submitted': 'Requirement submitted',
  'planning.em.started': 'EM planning started',
  'planning.clarification.answered': 'Clarification answered',
  'planning.plan.approved': 'Plan approved',
  'planning.plan.regenerated': 'Plan regenerated',
  'planning.sm.started': 'SM backlog started',
  'backlog.edited': 'Backlog edited',
  'approval.draft.approved': 'Draft approved',
  'approval.adoTarget.confirmed': 'ADO target confirmed',
  'ado.push.completed': 'ADO push completed',
  'development.started': 'Development started',
  'development.batch.started': 'Development batch started',
  'task.approved': 'Task approved',
  'task.development.started': 'Task development started',
  'task.completed': 'Task completed',
  'task.execution.failed': 'Task execution failed',
  'app.secret.provided': 'Application secret provided',
  'story.development.started': 'Story development started',
  'story.ready_for_qa': 'Story ready for QA',
  'sprint.completed': 'Sprint completed',
  'orchestration.dispatch': 'Orchestration dispatch',
  'qa.batch.started': 'QA batch started',
};

/** The categories a reader filters and scans by. */
export type EntryType = 'Task' | 'Story' | 'ADO' | 'Planning' | 'Approval' | 'Agent' | 'System';

export const TYPE_ORDER: EntryType[] = [
  'Task',
  'Story',
  'ADO',
  'Planning',
  'Approval',
  'Agent',
  'System',
];

/**
 * The category an action belongs to, read from the part of the verb before the first dot.
 *
 * Derived rather than stored, because the audit schema records the action and nothing else — and a
 * second stored field would be one more thing that can disagree with the first. Anything whose
 * prefix is not recognised is `System`, so a new action added to the backend shows up in the log
 * immediately instead of vanishing from a filter nobody updated.
 */
export function entryType(action: string): EntryType {
  const prefix = (action ?? '').split('.')[0];
  switch (prefix) {
    case 'task':
      return 'Task';
    case 'story':
      return 'Story';
    case 'ado':
      return 'ADO';
    case 'planning':
      return 'Planning';
    case 'approval':
      return 'Approval';
    case 'development':
    case 'qa':
    case 'orchestration':
      return 'Agent';
    default:
      return 'System';
  }
}

/** The action as a person reads it; an unlabelled verb is shown as written rather than hidden. */
export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/**
 * The one-line summary in the Details column.
 *
 * Prefers the shape of context an entry actually carries — a state transition reads as
 * `To Do → In Progress`, which is the whole story — and falls back to the raw JSON, because an
 * audit entry's context is evidence and must never be silently dropped.
 */
export function summarise(entry: AuditEntry): string {
  const meta = entry.metadata ?? {};
  const from = typeof meta.from === 'string' ? meta.from : null;
  const to = typeof meta.to === 'string' ? meta.to : null;
  if (from && to) return `${from} → ${to}`;

  const keys = Object.keys(meta);
  if (keys.length === 0) return `${entry.entityType} ${entry.entityId}`;
  return JSON.stringify(meta);
}

/** The run a entry points at, when it names one. */
export function runIdOf(entry: AuditEntry): string | null {
  const runId = entry.metadata?.runId;
  return typeof runId === 'string' && runId.trim() ? runId : null;
}

/** `10/1/2026` and `6:35:48 PM`, kept apart so the column can stack them. */
export function formatWhen(iso: string): { date: string; time: string } {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return { date: '—', time: '' };
  return {
    date: at.toLocaleDateString(),
    time: at.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }),
  };
}

/** The full timestamp, as the detail panel shows it. */
export function formatFullWhen(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return at.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Free-text match over actor, action, type, entity and the context JSON. */
export function matchesAuditSearch(entry: AuditEntry, query: string): boolean {
  const term = (query ?? '').trim().toLowerCase();
  if (!term) return true;
  return [
    entry.actorEmail,
    entry.action,
    actionLabel(entry.action),
    entryType(entry.action),
    entry.entityType,
    entry.entityId,
    JSON.stringify(entry.metadata ?? {}),
  ]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(term));
}

export type AuditSort = 'newest' | 'oldest';

export interface AuditFilters {
  search: string;
  /** A single action verb, or `all`. */
  action: string;
  /** Inclusive ISO bounds, or null for no bound. */
  from: string | null;
  to: string | null;
  sort: AuditSort;
}

/** Search, type and date filters, then ordering. */
export function visibleEntries(entries: AuditEntry[], filters: AuditFilters): AuditEntry[] {
  const after = filters.from ? Date.parse(filters.from) : null;
  const before = filters.to ? Date.parse(filters.to) : null;

  const filtered = entries.filter((entry) => {
    if (!matchesAuditSearch(entry, filters.search)) return false;
    if (filters.action !== 'all' && entry.action !== filters.action) return false;
    const at = Date.parse(entry.createdAt);
    if (Number.isNaN(at)) return true; // an unreadable date is shown, never quietly filtered away
    if (after !== null && at < after) return false;
    if (before !== null && at > before) return false;
    return true;
  });

  const at = (entry: AuditEntry) => Date.parse(entry.createdAt) || 0;
  return [...filtered].sort((a, b) => (filters.sort === 'oldest' ? at(a) - at(b) : at(b) - at(a)));
}

/** Only the types actually present, in a fixed order. */
export function typesInUse(entries: AuditEntry[]): EntryType[] {
  const seen = new Set(entries.map((entry) => entryType(entry.action)));
  return TYPE_ORDER.filter((type) => seen.has(type));
}

/**
 * Only the actions actually present, so the filter never offers an empty result — grouped by the
 * category each belongs to, because eighteen verbs in one flat list is not a menu anybody reads.
 */
export function actionsInUse(entries: AuditEntry[]): { type: EntryType; actions: string[] }[] {
  const byType = new Map<EntryType, Set<string>>();
  for (const entry of entries) {
    const type = entryType(entry.action);
    if (!byType.has(type)) byType.set(type, new Set());
    byType.get(type)!.add(entry.action);
  }
  return TYPE_ORDER.filter((type) => byType.has(type)).map((type) => ({
    type,
    actions: [...byType.get(type)!].sort(),
  }));
}

export interface AuditTotals {
  total: number;
  task: number;
  approval: number;
  ado: number;
}

/** The four headline counts, taken from the same list the rows come from. */
export function totalsOf(entries: AuditEntry[]): AuditTotals {
  const of = (type: EntryType) => entries.filter((e) => entryType(e.action) === type).length;
  return { total: entries.length, task: of('Task'), approval: of('Approval'), ado: of('ADO') };
}

/**
 * Entries per day, oldest bucket first, for a stat tile's sparkline.
 *
 * `days` buckets ending on the most recent entry's own day rather than on today, so a log that has
 * been quiet for a week still shows the shape of when it was busy instead of a flat line.
 */
export function countsByDay(entries: AuditEntry[], days = 14): number[] {
  if (entries.length === 0) return [];
  const times = entries.map((e) => Date.parse(e.createdAt)).filter((t) => !Number.isNaN(t));
  if (times.length === 0) return [];

  const DAY = 24 * 60 * 60 * 1000;
  const lastDay = Math.floor(Math.max(...times) / DAY);
  const buckets = new Array<number>(days).fill(0);
  for (const time of times) {
    const index = days - 1 - (lastDay - Math.floor(time / DAY));
    if (index >= 0 && index < days) buckets[index] += 1;
  }
  return buckets;
}

/**
 * A sparkline's line and area paths over a `width` × `height` box.
 *
 * Returns null when there is nothing to draw, so the tile renders without an empty SVG frame. A
 * flat series is drawn along the middle rather than along the floor — a run of equal values is not
 * the same as a run of zeroes, and putting it on the baseline says it is.
 */
export function sparkline(
  values: number[],
  width = 96,
  height = 32,
): { line: string; area: string } | null {
  if (values.length < 2) return null;

  const top = 2;
  const bottom = height - 2;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = span === 0 ? height / 2 : bottom - ((value - min) / span) * (bottom - top);
    return [Number(x.toFixed(2)), Number(y.toFixed(2))] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return { line, area };
}

/** The context JSON as the detail panel prints it, one entry per line. */
export function prettyMetadata(entry: AuditEntry): string {
  return JSON.stringify(entry.metadata ?? {}, null, 2);
}
