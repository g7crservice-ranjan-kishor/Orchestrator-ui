import { describe, expect, it } from 'vitest';
import type { Run, RunResult } from '../../lib/types';
import {
  activityOf,
  formatCost,
  formatDuration,
  formatStarted,
  formatTokens,
  isTerminal,
  matchesRunSearch,
  pageOf,
  runDuration,
  shortId,
  showingLabel,
  statesInUse,
  visibleRuns,
} from './run-monitor';

const result = (over: Partial<RunResult> = {}): RunResult => ({
  durationMs: 151_000,
  tokens: 137_925,
  cost: 0.84,
  logsRef: null,
  filesChanged: 9,
  commits: ['c98486b5aa'],
  adoChanges: [],
  artifacts: [],
  workspacePath: '/workspace/repo',
  ...over,
});

const run = (over: Partial<Run> = {}): Run => ({
  runId: '3ae6c15e-1e2b-4b6f-9a10-5c8d7f3e9a12',
  role: 'developer',
  state: 'Completed',
  workItemId: '759',
  attempts: 1,
  result: result(),
  createdAt: '2026-10-01T11:32:00.000Z',
  updatedAt: '2026-10-01T11:34:31.000Z',
  ...over,
});

describe('formatDuration', () => {
  it('reads the way the run list shows it', () => {
    expect(formatDuration(58_000)).toBe('58s');
    expect(formatDuration(151_000)).toBe('2m 31s');
    expect(formatDuration(102_000)).toBe('1m 42s');
    expect(formatDuration(3_840_000)).toBe('1h 04m');
  });

  it('pads the seconds so the column stays aligned', () => {
    expect(formatDuration(65_000)).toBe('1m 05s');
  });

  it('says nothing useful for a duration it cannot read', () => {
    expect(formatDuration(Number.NaN)).toBe('—');
    expect(formatDuration(-1)).toBe('—');
  });
});

/**
 * The defect this exists to prevent: a finished run whose timer keeps counting, because the page
 * measured from `createdAt` instead of reading the duration the agent reported.
 */
describe('runDuration', () => {
  const now = new Date('2026-10-01T11:40:00.000Z');

  it('uses the measured duration once the run has a result', () => {
    expect(runDuration(run(), now)).toBe(151_000);
  });

  it('counts from the start while the run is still going', () => {
    const live = run({ state: 'Running', result: null });
    expect(runDuration(live, now)).toBe(8 * 60 * 1000);
  });

  it('never goes negative when a clock disagrees', () => {
    const future = run({ state: 'Running', result: null, createdAt: '2026-10-01T12:00:00.000Z' });
    expect(runDuration(future, now)).toBe(0);
  });
});

describe('identity and formatting', () => {
  it('shortens a run id to its first segment', () => {
    expect(shortId('3ae6c15e-1e2b-4b6f-9a10-5c8d7f3e9a12')).toBe('3ae6c15e');
  });

  it('groups the token count', () => {
    expect(formatTokens(137_925)).toBe((137_925).toLocaleString());
  });

  it('gives the cost to the cent', () => {
    expect(formatCost(0.8372)).toBe('$0.84');
    expect(formatCost(0)).toBe('$0.00');
  });

  it('formats the start as a date and time', () => {
    expect(formatStarted('2026-10-01T11:32:00.000Z')).toMatch(/2026/);
  });

  it('says nothing for an unreadable date', () => {
    expect(formatStarted('not a date')).toBe('—');
  });
});

describe('isTerminal', () => {
  it('knows which states are the end of a run', () => {
    expect(isTerminal('Completed')).toBe(true);
    expect(isTerminal('Failed')).toBe(true);
    expect(isTerminal('Running')).toBe(false);
    expect(isTerminal('Queued')).toBe(false);
  });
});

describe('search and filtering', () => {
  const finished = run({ runId: 'aaaa1111-0000', state: 'Completed', workItemId: '759' });
  const running = run({
    runId: 'bbbb2222-0000',
    state: 'Running',
    workItemId: '760',
    result: null,
    createdAt: '2026-10-01T12:00:00.000Z',
  });

  it('matches a run id', () => {
    expect(matchesRunSearch(finished, 'aaaa')).toBe(true);
    expect(matchesRunSearch(finished, 'bbbb')).toBe(false);
  });

  /** A run is looked for by the Task it was started for far more often than by its id. */
  it('matches the work item it was started for', () => {
    expect(matchesRunSearch(running, '760')).toBe(true);
  });

  it('matches everything on an empty query', () => {
    expect(matchesRunSearch(finished, '  ')).toBe(true);
  });

  it('filters by state', () => {
    const shown = visibleRuns([finished, running], {
      search: '',
      state: 'Running',
      sort: 'latest',
    });
    expect(shown.map((r) => r.runId)).toEqual(['bbbb2222-0000']);
  });

  it('sorts newest first by default', () => {
    const shown = visibleRuns([finished, running], { search: '', state: 'all', sort: 'latest' });
    expect(shown.map((r) => r.runId)).toEqual(['bbbb2222-0000', 'aaaa1111-0000']);
  });

  it('sorts oldest first on request', () => {
    const shown = visibleRuns([finished, running], { search: '', state: 'all', sort: 'oldest' });
    expect(shown.map((r) => r.runId)).toEqual(['aaaa1111-0000', 'bbbb2222-0000']);
  });

  it('sorts by how long each run took', () => {
    const now = new Date('2026-10-01T12:01:00.000Z'); // the running one is only a minute old
    const shown = visibleRuns(
      [running, finished],
      { search: '', state: 'all', sort: 'longest' },
      now,
    );
    expect(shown.map((r) => r.runId)).toEqual(['aaaa1111-0000', 'bbbb2222-0000']);
  });

  it('offers only the states actually present', () => {
    expect(statesInUse([finished, running])).toEqual(['Completed', 'Running']);
  });
});

describe('paging', () => {
  const rows = Array.from({ length: 14 }, (_, i) => i + 1);

  it('returns one page of rows', () => {
    expect(pageOf(rows, 1)).toHaveLength(10);
    expect(pageOf(rows, 2)).toEqual([11, 12, 13, 14]);
  });

  /** A filter that shrinks the list must not leave the reader on a blank page. */
  it('clamps a page past the end', () => {
    expect(pageOf(rows, 9)).toEqual([11, 12, 13, 14]);
    expect(pageOf(rows, 0)).toHaveLength(10);
  });

  it('describes what is on screen', () => {
    expect(showingLabel(14, 1)).toBe('Showing 1 to 10 of 14 runs');
    expect(showingLabel(14, 2)).toBe('Showing 11 to 14 of 14 runs');
    expect(showingLabel(1, 1)).toBe('Showing 1 to 1 of 1 run');
    expect(showingLabel(0, 1)).toBe('Showing 0 of 0 runs');
  });

  it('describes a page past the end as the last one', () => {
    expect(showingLabel(14, 9)).toBe('Showing 11 to 14 of 14 runs');
  });
});

/**
 * The activity list is built only from what is stored. The agent's granular progress events are
 * relayed live and never written down, so a finished run cannot report them — and making them up
 * would put steps on screen that never happened.
 */
describe('activityOf', () => {
  it('reports the start and the end of a finished run', () => {
    const entries = activityOf(run());
    expect(entries.map((e) => e.label)).toEqual([
      'Run started',
      'Result recorded — 9 files changed',
      'Completed',
    ]);
    expect(entries.every((e) => !e.pending)).toBe(true);
  });

  it('leaves the last step pending while the run is going', () => {
    const entries = activityOf(run({ state: 'Running', result: null }));
    expect(entries.map((e) => e.label)).toEqual(['Run started', 'Running…']);
    expect(entries[entries.length - 1].pending).toBe(true);
  });

  /** A re-dispatched run is the one case where attempts tell a story worth seeing. */
  it('names a retry', () => {
    const entries = activityOf(run({ attempts: 3 }));
    expect(entries.map((e) => e.label)).toContain('Re-dispatched — attempt 3');
  });

  it('counts one file as one', () => {
    const entries = activityOf(run({ result: result({ filesChanged: 1 }) }));
    expect(entries.map((e) => e.label)).toContain('Result recorded — 1 file changed');
  });
});
