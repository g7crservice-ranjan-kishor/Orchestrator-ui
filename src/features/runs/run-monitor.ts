import type { Run } from '../../lib/types';
import { pageOf as pageRows, showingLabel as describePage, PAGE_SIZE } from '../../lib/paging';

export { PAGE_SIZE };

/**
 * The reading, filtering and paging rules behind the Runs page.
 *
 * Kept apart from the component because each one is a claim about a run that can be wrong in a way
 * a screenshot will not show: a duration that keeps counting after the run finished, a search that
 * cannot find a run by the work item it was started for, a page count that disagrees with the rows
 * on screen.
 */

/** States in which nothing further will happen. */
export const TERMINAL_STATES = ['Completed', 'Cancelled', 'Failed', 'Blocked'];

export function isTerminal(state: string): boolean {
  return TERMINAL_STATES.includes(state);
}

/** How often the page re-reads while something is running, and while nothing is. */
export const ACTIVE_POLL_MS = 3000;
export const IDLE_POLL_MS = 10000;

export type RunSort = 'latest' | 'oldest' | 'longest';

export const SORT_LABELS: Record<RunSort, string> = {
  latest: 'Latest first',
  oldest: 'Oldest first',
  longest: 'Longest first',
};

/** `1m 42s`, `58s`, `1h 04m`. Rounded down, because a run is never reported as longer than it ran. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/**
 * How long a run has taken.
 *
 * A finished run reports the duration the agent itself measured; anything else would disagree with
 * the Run Result on the same screen. A run still going has no measured duration yet, so the time
 * since it was created is shown instead — and it must stop the moment the run ends, which is why
 * the stored value wins whenever there is one.
 */
export function runDuration(run: Run, now: Date = new Date()): number {
  if (run.result) return run.result.durationMs;
  const started = Date.parse(run.createdAt);
  if (Number.isNaN(started)) return Number.NaN;
  return Math.max(0, now.getTime() - started);
}

/** The first segment of a run id — enough to recognise it, short enough to read. */
export function shortId(runId: string): string {
  return (runId ?? '').split('-')[0] ?? '';
}

/** `Dec 10, 2024 11:32 AM`, in the viewer's own locale. */
export function formatStarted(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return at.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTokens(tokens: number): string {
  return Number.isFinite(tokens) ? tokens.toLocaleString() : '—';
}

export function formatCost(cost: number): string {
  return Number.isFinite(cost) ? `$${cost.toFixed(2)}` : '—';
}

/**
 * Free-text match across what identifies a run.
 *
 * The work item is included deliberately: a run is usually looked for by the Task it was started
 * for ("what happened to 759?"), not by an id nobody has memorised.
 */
export function matchesRunSearch(run: Run, query: string): boolean {
  const term = (query ?? '').trim().toLowerCase();
  if (!term) return true;
  return [run.runId, run.role, run.state, run.workItemId ?? '']
    .filter(Boolean)
    .some((field) => field.toLowerCase().includes(term));
}

export function visibleRuns(
  runs: Run[],
  opts: { search: string; state: string; sort: RunSort },
  now: Date = new Date(),
): Run[] {
  const filtered = runs.filter(
    (run) =>
      matchesRunSearch(run, opts.search) && (opts.state === 'all' || run.state === opts.state),
  );
  const started = (run: Run) => Date.parse(run.createdAt) || 0;
  switch (opts.sort) {
    case 'oldest':
      return [...filtered].sort((a, b) => started(a) - started(b));
    case 'longest':
      return [...filtered].sort((a, b) => runDuration(b, now) - runDuration(a, now));
    case 'latest':
    default:
      return [...filtered].sort((a, b) => started(b) - started(a));
  }
}

/** Only the states actually present, so the filter never offers an empty result. */
export function statesInUse(runs: Run[]): string[] {
  return [...new Set(runs.map((run) => run.state))].sort();
}

/** One page of rows. Out-of-range pages clamp rather than showing nothing. */
export function pageOf<T>(rows: T[], page: number, size: number = PAGE_SIZE): T[] {
  return pageRows(rows, page, size);
}

/** `Showing 1 to 10 of 14 runs`. */
export function showingLabel(total: number, page: number, size: number = PAGE_SIZE): string {
  return describePage(total, page, 'run', size);
}

export interface ActivityEntry {
  key: string;
  label: string;
  at: string | null;
  /** True for the step still in progress, which the page shows as a pulsing dot. */
  pending: boolean;
}

/**
 * The run's own history, from what the orchestrator actually stores.
 *
 * It is deliberately short. The agent streams granular progress — workspace initialised, repository
 * checked, tool calls — but those events are relayed to any connected browser and never written
 * down, so they cannot be recovered for a run that has already finished. Inventing plausible steps
 * here would put words on screen that nothing stands behind. What is recorded is when the run was
 * created, how many attempts it took, when it last changed, and how it ended.
 */
export function activityOf(run: Run): ActivityEntry[] {
  const entries: ActivityEntry[] = [
    { key: 'started', label: 'Run started', at: run.createdAt, pending: false },
  ];

  if (run.attempts > 1) {
    entries.push({
      key: 'attempts',
      label: `Re-dispatched — attempt ${run.attempts}`,
      at: null,
      pending: false,
    });
  }

  if (run.result) {
    entries.push({
      key: 'result',
      label: `Result recorded — ${run.result.filesChanged} file${
        run.result.filesChanged === 1 ? '' : 's'
      } changed`,
      at: run.updatedAt,
      pending: false,
    });
  }

  entries.push(
    isTerminal(run.state)
      ? { key: 'end', label: run.state, at: run.updatedAt, pending: false }
      : { key: 'end', label: `${run.state}…`, at: run.updatedAt, pending: true },
  );

  return entries;
}
