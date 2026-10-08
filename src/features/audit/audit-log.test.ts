import { describe, expect, it } from 'vitest';
import type { AuditEntry } from '../../lib/types';
import {
  actionLabel,
  actionsInUse,
  countsByDay,
  entryType,
  formatFullWhen,
  formatWhen,
  matchesAuditSearch,
  prettyMetadata,
  runIdOf,
  sparkline,
  summarise,
  totalsOf,
  typesInUse,
  visibleEntries,
} from './audit-log';

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'a1',
  actorId: null,
  actorEmail: 'admin@example.com',
  action: 'task.development.started',
  entityType: 'project',
  entityId: '6abe2b5bd8ca853c7a61bd31',
  projectId: '6abe2b5bd8ca853c7a61bd31',
  metadata: { from: 'To Do', to: 'In Progress' },
  createdAt: '2026-10-01T18:35:48.000Z',
  ...over,
});

/**
 * The category is read off the action verb rather than stored, so a new backend action appears in
 * the log the day it is added instead of disappearing from a filter nobody updated.
 */
describe('entryType', () => {
  it('reads the category from the action prefix', () => {
    expect(entryType('task.completed')).toBe('Task');
    expect(entryType('story.ready_for_qa')).toBe('Story');
    expect(entryType('ado.push.completed')).toBe('ADO');
    expect(entryType('planning.em.started')).toBe('Planning');
    expect(entryType('approval.draft.approved')).toBe('Approval');
  });

  it('groups the agent-dispatching actions together', () => {
    expect(entryType('development.batch.started')).toBe('Agent');
    expect(entryType('qa.batch.started')).toBe('Agent');
    expect(entryType('orchestration.dispatch')).toBe('Agent');
  });

  /** An action this build has never seen must still be shown, under something. */
  it('falls back to System for anything unrecognised', () => {
    expect(entryType('project.created')).toBe('System');
    expect(entryType('something.brand.new')).toBe('System');
    expect(entryType('')).toBe('System');
  });
});

describe('actionLabel', () => {
  it('names the actions it knows', () => {
    expect(actionLabel('ado.push.completed')).toBe('ADO push completed');
  });

  it('shows an unknown action as written rather than hiding it', () => {
    expect(actionLabel('something.brand.new')).toBe('something.brand.new');
  });
});

/** The Details column: a transition is the whole story, and nothing else may be dropped. */
describe('summarise', () => {
  it('reads a state change as a transition', () => {
    expect(summarise(entry())).toBe('To Do → In Progress');
  });

  it('falls back to the raw context when there is no transition', () => {
    const line = summarise(entry({ metadata: { bulkOperationId: '180f8f76', succeeded: 1 } }));
    expect(line).toContain('180f8f76');
  });

  it('names the entity when there is no context at all', () => {
    expect(summarise(entry({ metadata: {}, entityType: 'task', entityId: '772' }))).toBe(
      'task 772',
    );
  });
});

describe('runIdOf', () => {
  it('finds the run an entry points at', () => {
    const withRun = entry({ metadata: { runId: 'a627b053-049f-4f5b-84b7-23b23d386fd0' } });
    expect(runIdOf(withRun)).toBe('a627b053-049f-4f5b-84b7-23b23d386fd0');
  });

  it('says nothing when the entry names no run', () => {
    expect(runIdOf(entry())).toBeNull();
    expect(runIdOf(entry({ metadata: { runId: '  ' } }))).toBeNull();
    expect(runIdOf(entry({ metadata: { runId: 42 } }))).toBeNull();
  });
});

describe('timestamps', () => {
  it('splits the date from the time for the column', () => {
    const { date, time } = formatWhen('2026-10-01T18:35:48.000Z');
    expect(date).toMatch(/2026/);
    expect(time).toMatch(/\d/);
  });

  it('gives the full timestamp for the detail panel', () => {
    expect(formatFullWhen('2026-10-01T18:35:48.000Z')).toMatch(/2026/);
  });

  it('says nothing useful for an unreadable date', () => {
    expect(formatWhen('nonsense')).toEqual({ date: '—', time: '' });
    expect(formatFullWhen('nonsense')).toBe('—');
  });
});

describe('search and filtering', () => {
  const task = entry({ id: 't', action: 'task.completed', actorEmail: 'system' });
  const push = entry({
    id: 'p',
    action: 'ado.push.completed',
    createdAt: '2026-09-20T10:00:00.000Z',
    metadata: { items: 71 },
  });

  it('matches the actor', () => {
    expect(matchesAuditSearch(task, 'system')).toBe(true);
    expect(matchesAuditSearch(task, 'admin')).toBe(false);
  });

  it('matches the action, by verb or by label', () => {
    expect(matchesAuditSearch(push, 'ado.push')).toBe(true);
    expect(matchesAuditSearch(push, 'ADO push completed')).toBe(true);
  });

  /** The context is evidence — it has to be searchable. */
  it('matches inside the context JSON', () => {
    expect(matchesAuditSearch(push, '71')).toBe(true);
  });

  it('matches everything on an empty query', () => {
    expect(matchesAuditSearch(task, '  ')).toBe(true);
  });

  const all = { search: '', action: 'all', from: null, to: null, sort: 'newest' as const };

  it('filters by action', () => {
    const shown = visibleEntries([task, push], { ...all, action: 'ado.push.completed' });
    expect(shown.map((e) => e.id)).toEqual(['p']);
  });

  it('filters by date range, inclusively', () => {
    const shown = visibleEntries([task, push], {
      ...all,
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
    });
    expect(shown.map((e) => e.id)).toEqual(['p']);
  });

  it('sorts newest first by default, oldest first on request', () => {
    expect(visibleEntries([push, task], all).map((e) => e.id)).toEqual(['t', 'p']);
    expect(visibleEntries([push, task], { ...all, sort: 'oldest' }).map((e) => e.id)).toEqual([
      'p',
      't',
    ]);
  });

  /** An entry with a date nobody can read is still evidence; it must not vanish. */
  it('keeps an entry whose date cannot be parsed', () => {
    const broken = entry({ id: 'b', createdAt: 'nonsense' });
    const shown = visibleEntries([broken], { ...all, from: '2026-10-01T00:00:00.000Z' });
    expect(shown.map((e) => e.id)).toEqual(['b']);
  });

  it('offers only the types actually present, in a fixed order', () => {
    expect(typesInUse([push, task])).toEqual(['Task', 'ADO']);
  });

  /** Eighteen verbs in one flat list is not a menu anybody reads, so they come grouped. */
  it('offers the actions present, grouped by category', () => {
    expect(actionsInUse([push, task])).toEqual([
      { type: 'Task', actions: ['task.completed'] },
      { type: 'ADO', actions: ['ado.push.completed'] },
    ]);
  });
});

/** The tiles are counted from the same list the rows come from, so they cannot disagree. */
describe('totalsOf', () => {
  it('counts the headline categories', () => {
    const entries = [
      entry({ action: 'task.completed' }),
      entry({ action: 'task.development.started' }),
      entry({ action: 'approval.draft.approved' }),
      entry({ action: 'ado.push.completed' }),
      entry({ action: 'project.created' }),
    ];
    expect(totalsOf(entries)).toEqual({ total: 5, task: 2, approval: 1, ado: 1 });
  });

  it('counts an empty log as empty', () => {
    expect(totalsOf([])).toEqual({ total: 0, task: 0, approval: 0, ado: 0 });
  });
});

describe('countsByDay', () => {
  it('buckets entries by day, oldest first', () => {
    const counts = countsByDay(
      [
        entry({ createdAt: '2026-10-01T10:00:00.000Z' }),
        entry({ createdAt: '2026-10-01T18:00:00.000Z' }),
        entry({ createdAt: '2026-09-30T10:00:00.000Z' }),
      ],
      3,
    );
    expect(counts).toEqual([0, 1, 2]);
  });

  /**
   * Buckets end on the newest entry, not on today — a log that has been quiet for a month still
   * shows the shape of when it was busy instead of a flat line of zeroes.
   */
  it('ends on the most recent entry rather than on today', () => {
    const counts = countsByDay([entry({ createdAt: '2020-01-05T10:00:00.000Z' })], 3);
    expect(counts[counts.length - 1]).toBe(1);
  });

  it('draws nothing from an empty log', () => {
    expect(countsByDay([], 7)).toEqual([]);
  });
});

describe('sparkline', () => {
  it('draws a line and a closed area', () => {
    const paths = sparkline([1, 4, 2], 100, 40);
    expect(paths?.line.startsWith('M0 ')).toBe(true);
    expect(paths?.area.endsWith('Z')).toBe(true);
  });

  /** A run of equal values is not a run of zeroes, so it is not drawn on the floor. */
  it('draws a flat series down the middle', () => {
    const paths = sparkline([3, 3, 3], 100, 40);
    expect(paths?.line).toContain('20');
  });

  it('draws nothing from a single point', () => {
    expect(sparkline([5], 100, 40)).toBeNull();
    expect(sparkline([], 100, 40)).toBeNull();
  });
});

describe('prettyMetadata', () => {
  it('prints the context one field per line', () => {
    expect(prettyMetadata(entry()).split(String.fromCharCode(10)).length).toBeGreaterThan(2);
  });

  it('prints an empty context as an empty object', () => {
    expect(prettyMetadata(entry({ metadata: {} }))).toBe('{}');
  });
});
