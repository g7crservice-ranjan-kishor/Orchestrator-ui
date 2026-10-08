import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { relativeTime } from '../../lib/relative-time';
import { QA_STORY_STATUSES } from '../../lib/types';
import type { QaBoard, QaBug, QaQueue, QaStory, QaStoryStatus } from '../../lib/types';
import { FilterSelect } from './BoardPage';
import { DevelopmentQueue } from './DevelopmentQueue';

/** Run states that mean the QA agent has stopped. */
const TERMINAL = new Set(['Completed', 'Cancelled', 'Failed']);

/** What each column means, shown under its title so the board explains itself. */
const COLUMN_HINT: Record<QaStoryStatus, string> = {
  'Ready for QA': 'Development finished — not tested yet',
  Testing: 'A QA agent is working on it',
  'Failed / Fix Required': 'QA found a defect; waiting on a fix',
  Completed: 'QA passed',
};

const STATUS_CLASS: Record<QaStoryStatus, string> = {
  'Ready for QA': 'qa-badge-ready',
  Testing: 'qa-badge-testing',
  'Failed / Fix Required': 'qa-badge-failed',
  Completed: 'qa-badge-done',
};

interface QaFilters {
  epic: string;
  feature: string;
  sprint: string;
  developer: string;
  search: string;
}

const NO_FILTERS: QaFilters = { epic: '', feature: '', sprint: '', developer: '', search: '' };

/** Distinct, sorted values of one field across the given Stories — a filter's option list. */
function optionsOf(stories: QaStory[], pick: (s: QaStory) => string | null | undefined): string[] {
  return [...new Set(stories.map((s) => pick(s) ?? '').filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/**
 * **QA board** — the Story-level counterpart to the Development board (D-028), laid out the same
 * way: four columns, cascading filters, one card per item.
 *
 * The one deliberate difference is that cards are **not draggable**. A Task moves because a person
 * decides to move it; a Story's QA column is *derived* from Azure DevOps — its state, its open Bugs,
 * and whether an agent is running — so dragging one would assert something untrue. A card moves when
 * the work does.
 */
export function QaBoardView(props: { projectId: string }) {
  const { projectId } = props;
  const [board, setBoard] = useState<QaBoard | null>(null);
  const [filters, setFilters] = useState<QaFilters>(NO_FILTERS);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<number | null>(null);
  /**
   * The last failure, and the card it belongs to.
   *
   * A refusal used to render only as a banner above the columns. Clicking Start on a card further
   * down the board put the explanation off-screen, so a Story that the API had explicitly refused
   * — with a reason — looked like a button that did nothing. `itemId` is the work item the failure
   * concerns, or null for a board-wide one; a failure is shown where the person was looking.
   */
  const [error, setError] = useState<{ itemId: number | null; message: string } | null>(null);
  const [detail, setDetail] = useState<QaStory | null>(null);
  /** Stories ticked for a batch, by ADO id, in the order they were ticked. */
  const [selected, setSelected] = useState<number[]>([]);
  const [queue, setQueue] = useState<QaQueue | null>(null);
  const [queueBusy, setQueueBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBoard(await api.getQaBoard(projectId));
      /*
       * Clears only a previous *load* failure, never the reason an action was refused.
       *
       * This used to be a flat `setError(null)` at the top of the load. Every action reloads the
       * board when it finishes, so a refusal was set and then wiped a moment later by the reload
       * it triggered — the Start button reported "no target repository resolvable" for a few
       * milliseconds and then went quiet. It looked like a button that did nothing, and the real
       * cause had to be found in the database instead of on the screen.
       */
      setError((current) => (current?.itemId === null ? null : current));
    } catch (err) {
      setError({
        itemId: null,
        message: err instanceof ApiError ? err.message : 'Failed to load the QA board.',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  /** The backend's own record of the batch, so a refresh shows the same order and progress. */
  const loadQueue = useCallback(async () => {
    try {
      setQueue(await api.getQaQueue(projectId));
    } catch {
      setQueue(null); // the board is still useful without the queue panel
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    void loadQueue();
  }, [load, loadQueue]);

  const stories = useMemo(() => board?.stories ?? [], [board]);

  // Poll while an agent is testing, or while a batch still has work, so the board and the queue
  // move on their own. A queue drains one run at a time, and each hand-off happens server-side.
  const anyTesting = stories.some((s) => s.qaRunning);
  const queueRunning = (queue?.items ?? []).some(
    (i) => i.state === 'running' || i.state === 'queued',
  );
  useEffect(() => {
    if (!anyTesting && !queueRunning) return;
    const timer = setInterval(() => {
      void load();
      void loadQueue();
    }, 5000);
    return () => clearInterval(timer);
  }, [anyTesting, queueRunning, load, loadQueue]);

  // Cascading options: narrowing the Epic narrows the Features offered, as on the Task board.
  const byEpic = useMemo(
    () => stories.filter((s) => !filters.epic || (s.epic?.title ?? '') === filters.epic),
    [stories, filters.epic],
  );
  const byFeature = useMemo(
    () => byEpic.filter((s) => !filters.feature || (s.feature?.title ?? '') === filters.feature),
    [byEpic, filters.feature],
  );

  const visible = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    return byFeature.filter(
      (s) =>
        (!filters.sprint || s.sprint === filters.sprint) &&
        (!filters.developer || (s.developer ?? '') === filters.developer) &&
        (!needle ||
          String(s.adoId).includes(needle) ||
          s.title.toLowerCase().includes(needle) ||
          (s.feature?.title ?? '').toLowerCase().includes(needle)),
    );
  }, [byFeature, filters]);

  const columns = useMemo(
    () =>
      QA_STORY_STATUSES.map((status) => ({
        status,
        stories: visible.filter((s) => s.status === status).sort((a, b) => a.adoId - b.adoId),
      })),
    [visible],
  );

  const activeFilters = Object.values(filters).filter(Boolean).length;
  const set = (key: keyof QaFilters, value: string) =>
    setFilters((cur) => {
      // Changing a parent clears its child, so a selection can never be self-contradictory.
      if (key === 'epic') return { ...cur, epic: value, feature: '' };
      return { ...cur, [key]: value };
    });

  /** Starts a QA agent for one Story — the same job path the project-wide wave uses. */
  const startTesting = useCallback(
    async (story: QaStory) => {
      setWorking(story.adoId);
      setError(null);
      try {
        const result = await api.startQa(projectId, { workItemIds: [String(story.adoId)] });
        if (result.dispatchedCount === 0) {
          const why = result.ineligible[0]?.reason ?? 'no QA agent was available right now';
          setError({ itemId: story.adoId, message: `Could not start testing: ${why}` });
        }
        await load();
      } catch (err) {
        setError({
          itemId: story.adoId,
          message: err instanceof ApiError ? err.message : 'Could not start testing.',
        });
      } finally {
        setWorking(null);
      }
    },
    [projectId, load],
  );

  const toggleSelect = useCallback((story: QaStory) => {
    setSelected((cur) =>
      cur.includes(story.adoId) ? cur.filter((id) => id !== story.adoId) : [...cur, story.adoId],
    );
  }, []);

  /**
   * Queues every selected Story.
   *
   * One request, not one per Story: the backend remembers the order and starts the next when a run
   * finishes. Sending them individually would dispatch one and have the concurrency cap quietly
   * refuse the rest — which is exactly what the wave used to do.
   */
  const startSelected = useCallback(async () => {
    if (selected.length === 0) return;
    setQueueBusy(true);
    setError(null);
    try {
      setQueue(await api.queueQa(projectId, selected.map(String)));
      setSelected([]);
      await load();
    } catch (err) {
      setError({
        itemId: null,
        message: err instanceof ApiError ? err.message : 'Could not queue the selected Stories.',
      });
    } finally {
      setQueueBusy(false);
    }
  }, [projectId, selected, load]);

  const queueAction = useCallback(
    async (action: 'resume' | 'cancel') => {
      setQueueBusy(true);
      setError(null);
      try {
        setQueue(
          action === 'resume'
            ? await api.resumeQaQueue(projectId)
            : await api.cancelQaQueue(projectId),
        );
        await load();
      } catch (err) {
        setError({
          itemId: null,
          message: err instanceof ApiError ? err.message : `Could not ${action} the QA queue.`,
        });
      } finally {
        setQueueBusy(false);
      }
    },
    [projectId, load],
  );

  /**
   * Sends a Developer agent to fix a Bug. This is the ordinary board transition — the rules now
   * accept Bugs, so `New → In Progress` writes the Bug's own state (`Committed`) and dispatches a
   * pod, exactly as starting a Task does.
   */
  const fixBug = useCallback(
    async (bug: QaBug) => {
      setWorking(bug.adoId);
      setError(null);
      try {
        const result = await api.transitionTasks(projectId, [String(bug.adoId)], 'In Progress', {
          source: 'button',
        });
        const failed = result.outcomes.find((o) => !o.ok);
        if (failed) {
          setError({
            itemId: bug.adoId,
            message: `Could not start the fix for #${bug.adoId}: ${failed.reason ?? 'blocked'}`,
          });
        }
        await load();
      } catch (err) {
        setError({
          itemId: bug.adoId,
          message: err instanceof ApiError ? err.message : 'Could not start the fix.',
        });
      } finally {
        setWorking(null);
      }
    },
    [projectId, load],
  );

  return (
    <section aria-labelledby="qa-heading" className="qa-view">
      <div className="qa-view-head">
        <div>
          <h3 id="qa-heading">
            QA Testing <span className="qa-count">{stories.length}</span>
          </h3>
          <p className="muted">
            Every card is one Azure DevOps <strong>Story</strong> — the QA agent&apos;s unit of
            work. A column is read from Azure DevOps, so cards move when the work does rather than
            by dragging.
          </p>
        </div>
        <div className="qa-view-controls">
          <input
            type="search"
            placeholder="Search by ID, title or feature…"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            aria-label="Search Stories"
          />
          <button className="link" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error?.itemId === null && (
        <p className="error" role="alert">
          {error.message}
        </p>
      )}

      {stories.length > 0 && (
        <>
          <div className="board-filters" role="group" aria-label="Filter stories">
            <FilterSelect
              label="Epic"
              value={filters.epic}
              options={optionsOf(stories, (s) => s.epic?.title)}
              onChange={(v) => set('epic', v)}
            />
            <FilterSelect
              label="Feature"
              value={filters.feature}
              options={optionsOf(byEpic, (s) => s.feature?.title)}
              onChange={(v) => set('feature', v)}
            />
            <FilterSelect
              label="Sprint"
              value={filters.sprint}
              options={optionsOf(byFeature, (s) => s.sprint)}
              onChange={(v) => set('sprint', v)}
            />
            <FilterSelect
              label="Developer"
              value={filters.developer}
              options={optionsOf(byFeature, (s) => s.developer)}
              onChange={(v) => set('developer', v)}
            />
            {activeFilters > 0 && (
              <button className="link" onClick={() => setFilters(NO_FILTERS)}>
                Clear filters
              </button>
            )}
          </div>

          {activeFilters > 0 && (
            <p className="muted board-filters-summary">
              Showing {visible.length} of {stories.length} Stories.
            </p>
          )}
        </>
      )}

      {queue && queue.items.length > 0 && (
        <DevelopmentQueue
          queue={queue}
          busy={queueBusy}
          heading="QA queue"
          noun="Story"
          titleOf={(id) =>
            stories.find((story) => String(story.adoId) === id)?.title ?? `Story ${id}`
          }
          onResume={() => void queueAction('resume')}
          onCancel={() => void queueAction('cancel')}
        />
      )}

      {selected.length > 0 && (
        <div className="bulk-bar" role="region" aria-label="Bulk QA actions">
          <span>
            <strong>{selected.length}</strong> Stor{selected.length === 1 ? 'y' : 'ies'} selected
          </span>
          <button disabled={queueBusy} onClick={() => void startSelected()}>
            {queueBusy ? 'Queueing…' : 'Start testing →'}
          </button>
          <button className="link" disabled={queueBusy} onClick={() => setSelected([])}>
            Clear selection
          </button>
        </div>
      )}

      <div className="board" role="list" aria-label="QA columns">
        {columns.map((col) => (
          <div key={col.status} className="board-column" role="listitem">
            <h3 className="board-column-title">
              {col.status} <span className="badge">{col.stories.length}</span>
              {col.stories.some((story) => story.canStart.allowed) && (
                <button
                  className="link board-select-all"
                  onClick={() =>
                    setSelected((cur) => [
                      ...cur,
                      ...col.stories
                        .filter((story) => story.canStart.allowed && !cur.includes(story.adoId))
                        .map((story) => story.adoId),
                    ])
                  }
                >
                  Select all
                </button>
              )}
            </h3>
            <p className="muted qa-column-hint">{COLUMN_HINT[col.status]}</p>
            <ul className="board-cards">
              {col.stories.map((story) => (
                <QaStoryCard
                  key={story.adoId}
                  story={story}
                  working={working}
                  onOpen={() => setDetail(story)}
                  onStart={() => void startTesting(story)}
                  onFixBug={(bug) => void fixBug(bug)}
                  error={error?.itemId === story.adoId ? error.message : null}
                  selected={selected.includes(story.adoId)}
                  onToggleSelect={() => toggleSelect(story)}
                />
              ))}
            </ul>
            {col.stories.length === 0 && (
              <p className="muted board-column-empty">
                {stories.length === 0 ? 'Nothing has finished development yet' : 'No stories'}
              </p>
            )}
          </div>
        ))}
      </div>

      {detail && (
        <QaStoryDetail
          story={detail}
          working={working}
          onClose={() => setDetail(null)}
          onFixBug={(bug) => void fixBug(bug)}
        />
      )}
    </section>
  );
}

/** One Story card: what it is, how far development got, and the one action available. */
function QaStoryCard(props: {
  story: QaStory;
  /** The work item currently being acted on, if any (Story or Bug). */
  working: number | null;
  onOpen: () => void;
  onStart: () => void;
  onFixBug: (bug: QaBug) => void;
  /** Why the last action on this Story failed, shown on the card the person clicked. */
  error?: string | null;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { story, working, onOpen, onStart, onFixBug, error, selected, onToggleSelect } = props;
  const live = story.qaRunning && story.execution && !TERMINAL.has(story.execution.state);

  return (
    <li className={`board-card qa-story-card${selected ? ' task-card-selected' : ''}`}>
      <div className="qa-story-head">
        {story.canStart.allowed && onToggleSelect && (
          <input
            type="checkbox"
            className="tc-select"
            checked={Boolean(selected)}
            onChange={onToggleSelect}
            aria-label={`Select ${story.title}`}
          />
        )}
        <span className="qa-story-type">Story</span>
        <span className="qa-story-id">#{story.adoId}</span>
        <span className={`qa-story-badge ${STATUS_CLASS[story.status]}`}>{story.status}</span>
      </div>

      <button className="task-card-title-button" onClick={onOpen}>
        {story.title}
      </button>
      {story.description && <p className="qa-story-desc">{story.description}</p>}

      <dl className="qa-story-meta">
        <div>
          <dt>Feature</dt>
          <dd>{story.feature?.title ?? '—'}</dd>
        </div>
        <div>
          <dt>Tasks</dt>
          <dd>
            <strong>
              {story.tasksDone} / {story.tasksTotal}
            </strong>{' '}
            done
          </dd>
        </div>
        <div>
          <dt>Epic</dt>
          <dd>{story.epic?.title ?? '—'}</dd>
        </div>
        <div>
          <dt>Developer</dt>
          <dd>{story.developer ?? '—'}</dd>
        </div>
        <div>
          <dt>Sprint</dt>
          <dd>{story.sprint ?? '—'}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{relativeTime(story.updatedAt)}</dd>
        </div>
      </dl>

      {story.bugs.length > 0 && (
        <ul className="qa-bug-list">
          {story.bugs.map((bug) => (
            <QaBugRow
              key={bug.adoId}
              bug={bug}
              working={working === bug.adoId}
              onFix={() => onFixBug(bug)}
            />
          ))}
        </ul>
      )}

      {live && <p className="qa-story-live">The QA agent is testing this Story now.</p>}

      <div className="qa-story-actions">
        <button className="link" onClick={onOpen}>
          View details
        </button>
        {story.canStart.allowed && (
          <button onClick={onStart} disabled={working === story.adoId}>
            {working === story.adoId ? 'Starting…' : 'Start testing'}
          </button>
        )}
      </div>
      {!story.canStart.allowed && story.canStart.reason && (
        <p className="muted qa-story-why">{story.canStart.reason}</p>
      )}
      {error && (
        <p className="error qa-story-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/** Bug state in plain words — the ADO names do not say what is actually happening. */
const BUG_STATUS: Record<string, string> = {
  New: 'Needs fixing',
  Committed: 'Being fixed',
  Done: 'Fixed — awaiting retest',
};

/** One Bug under a Story: what it is, where it is in the loop, and the one action available. */
function QaBugRow(props: { bug: QaBug; working: boolean; onFix: () => void }) {
  const { bug, working, onFix } = props;
  const label = bug.qaVerified ? 'Verified by QA' : (BUG_STATUS[bug.state] ?? bug.state);
  const tone = bug.qaVerified
    ? 'qa-bug-verified'
    : bug.state === 'New'
      ? 'qa-bug-open'
      : 'qa-bug-wip';

  return (
    <li className="qa-bug-row">
      <span className={`qa-bug-state ${tone}`}>{label}</span>
      <p className="qa-bug-title">{bug.title}</p>
      <p className="muted qa-bug-meta">
        #{bug.adoId}
        {bug.severity ? ` · ${bug.severity}` : ''}
        {bug.assignedTo ? ` · ${bug.assignedTo}` : ''}
      </p>
      {bug.canFix.allowed && (
        <button className="qa-bug-fix" onClick={onFix} disabled={working}>
          {working ? 'Starting…' : 'Fix with Developer Agent'}
        </button>
      )}
      {/* Not every refusal has something to add: a verified Bug is fully described by its badge,
          and an empty line under it would be a second, emptier statement of the same thing. */}
      {!bug.canFix.allowed && bug.canFix.reason && (
        <p className="muted qa-bug-why">{bug.canFix.reason}</p>
      )}
    </li>
  );
}

/** Full Story context plus its latest QA run. Test-case level detail lands with the Test tab. */
function QaStoryDetail(props: {
  story: QaStory;
  working: number | null;
  onClose: () => void;
  onFixBug: (bug: QaBug) => void;
}) {
  const { story, working, onClose, onFixBug } = props;
  const exec = story.execution;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Story ${story.adoId}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <span className="qa-story-type">Story</span>
            <h3>{story.title}</h3>
            <p className="muted">
              #{story.adoId} · ADO state: {story.state}
            </p>
          </div>
          <button className="link" onClick={onClose} aria-label="Close details">
            Close
          </button>
        </div>

        <div className="drawer-body">
          <span className={`qa-story-badge ${STATUS_CLASS[story.status]}`}>{story.status}</span>

          <h4>Description</h4>
          <p>{story.description || 'No description in Azure DevOps.'}</p>

          <h4>Context</h4>
          <dl className="drawer-hierarchy">
            <div>
              <dt>Epic</dt>
              <dd>{story.epic?.title ?? '—'}</dd>
            </div>
            <div>
              <dt>Feature</dt>
              <dd>{story.feature?.title ?? '—'}</dd>
            </div>
            <div>
              <dt>Sprint</dt>
              <dd>{story.sprint ?? '—'}</dd>
            </div>
            <div>
              <dt>Developer</dt>
              <dd>{story.developer ?? '—'}</dd>
            </div>
            <div>
              <dt>Tasks</dt>
              <dd>
                {story.tasksDone} of {story.tasksTotal} Done
              </dd>
            </div>
            <div>
              <dt>Open Bugs</dt>
              <dd>{story.openBugs}</dd>
            </div>
          </dl>

          {story.bugs.length > 0 && (
            <>
              <h4>Bugs</h4>
              <ul className="qa-bug-list">
                {story.bugs.map((bug) => (
                  <QaBugRow
                    key={bug.adoId}
                    bug={bug}
                    working={working === bug.adoId}
                    onFix={() => onFixBug(bug)}
                  />
                ))}
              </ul>
            </>
          )}

          <h4>Latest QA run</h4>
          {exec ? (
            <dl className="drawer-hierarchy">
              <div>
                <dt>Run</dt>
                <dd>{exec.runId}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{exec.state}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{exec.startedAt ? new Date(exec.startedAt).toLocaleString() : '—'}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{exec.completedAt ? new Date(exec.completedAt).toLocaleString() : '—'}</dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd>{exec.cost ? `$${exec.cost.toFixed(2)}` : '—'}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">This Story has not been tested yet.</p>
          )}

          <p className="muted">
            Test cases and their Passed/Failed/Blocked outcomes live in Azure DevOps Test Plans. A
            Test Cases tab here is the next piece of work.
          </p>
        </div>
      </aside>
    </div>
  );
}
