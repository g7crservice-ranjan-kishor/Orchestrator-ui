import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { relativeTime } from '../../lib/relative-time';
import { agentBadge } from './agent-status';
import { DevelopmentQueue } from './DevelopmentQueue';
import { SprintRolloverDialog } from './SprintRolloverDialog';
import { QaBoardView } from './QaBoardView';
import { TASK_COLUMNS } from '../../lib/types';
import type {
  Board,
  Run,
  BoardTask,
  TaskStatus,
  QaBatchResult,
  SprintRolloverPlan,
  TaskTransitionResult,
  TransitionSource,
  TransitionTarget,
  WorkItemRef,
  DevQueue,
} from '../../lib/types';

/**
 * **Development Board** — a task-centric view of the work the Claude Developer Agent executes. Every
 * card is a single Azure DevOps **Task** (one agent run = one Task); Epic → Feature → Story travel
 * with the card as context and drive the filters.
 *
 * The board feels like an ordinary Kanban — cards drag between columns — but every move is
 * **validation-driven**: drag-and-drop, the card buttons and the bulk actions all call the same
 * backend transition API, which enforces the same centralized rules (sprint, execution agent, active
 * execution, hierarchy). An invalid move never changes the card; it explains why instead. `Done` is
 * set by the orchestrator only, after a successful agent run.
 */

interface Filters {
  epic: string;
  feature: string;
  story: string;
  sprint: string;
  status: string;
  assignee: string;
  agent: string;
}

const NO_FILTERS: Filters = {
  epic: '',
  feature: '',
  story: '',
  sprint: '',
  status: '',
  assignee: '',
  agent: '',
};

/** Run states that mean the QA agent has stopped. */
const QA_TERMINAL = new Set(['Completed', 'Cancelled', 'Failed']);

/**
 * Plain-English QA run status. The job state machine is an implementation detail; what the user
 * needs to know is whether an agent is working, waiting, or finished.
 */
const QA_STATUS: Record<string, { label: string; className: string }> = {
  Queued: { label: 'Waiting for an agent', className: 'qa-run-queued' },
  Claimed: { label: 'Starting up', className: 'qa-run-running' },
  Running: { label: 'Testing now', className: 'qa-run-running' },
  Blocked: { label: 'Blocked', className: 'qa-run-blocked' },
  Completed: { label: 'Finished', className: 'qa-run-done' },
  Failed: { label: 'Did not finish', className: 'qa-run-failed' },
  Cancelled: { label: 'Cancelled', className: 'qa-run-failed' },
};

/** Label for the single forward move out of each column. */
const ACTION_LABEL: Partial<Record<TaskStatus, string>> = {
  Draft: 'Approve',
  'To Do': 'Start Development',
};

/**
 * A Bug is dispatched through the same transition as a Task, but calling it "Start Development"
 * reads wrongly for a defect QA already found — the developer is fixing, not building.
 */
function actionLabelFor(task: BoardTask): string | undefined {
  const label = ACTION_LABEL[task.status];
  if (label === 'Start Development' && task.kind === 'bug') {
    return 'Fix this Bug';
  }
  return label;
}

/** What a bulk operation is called, for the confirmation dialog. */
const BULK_LABEL: Record<TransitionTarget, string> = {
  'To Do': 'Approve Selected',
  'In Progress': 'Start Development',
};

const titleOf = (ref: WorkItemRef | null): string => ref?.title ?? '';

function optionsOf(tasks: BoardTask[], pick: (t: BoardTask) => string | null): string[] {
  return [...new Set(tasks.map((t) => pick(t) ?? '').filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** ADO stores rich text as HTML; render it as plain text rather than injecting markup. */
function toPlainText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const formatTime = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : '—');

/** A rejected move: shown as a banner so the user always learns why the card did not move. */
interface Rejection {
  title: string;
  reason: string;
  hint?: string;
}

/** A bulk operation awaiting confirmation, with the backend's dry-run verdict. */
interface PendingBulk {
  keys: string[];
  to: TransitionTarget;
  source: TransitionSource;
  preview: TaskTransitionResult;
}

export function BoardPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  const [selected, setSelected] = useState<string[]>([]);
  const [selectionStatus, setSelectionStatus] = useState<TaskStatus | null>(null);
  const [working, setWorking] = useState(false);
  const [pending, setPending] = useState<PendingBulk | null>(null);
  const [result, setResult] = useState<TaskTransitionResult | null>(null);
  /** The backend's own record of what was selected, so a refresh does not lose the order. */
  const [queue, setQueue] = useState<DevQueue | null>(null);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<TaskStatus | null>(null);
  const [rollover, setRollover] = useState<SprintRolloverPlan | null>(null);
  const [rolloverDone, setRolloverDone] = useState<SprintRolloverPlan | null>(null);
  const [qaPreview, setQaPreview] = useState<QaBatchResult | null>(null);
  const [qaResult, setQaResult] = useState<QaBatchResult | null>(null);
  const [qaRuns, setQaRuns] = useState<Run[]>([]);
  /**
   * Development (Tasks) vs QA Testing (Stories) — two views of the same work, kept separate.
   *
   * Held in the URL rather than in component state so the sidebar can link to each of them, and so
   * the view survives a refresh and can be sent to someone. Any value other than `qa` is
   * Development, which makes a mistyped link land somewhere sensible instead of nowhere.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const view: 'development' | 'qa' = searchParams.get('view') === 'qa' ? 'qa' : 'development';
  const setView = (next: 'development' | 'qa') => {
    const params = new URLSearchParams(searchParams);
    if (next === 'qa') params.set('view', 'qa');
    else params.delete('view');
    // Replace rather than push: switching tabs is not a step to go Back through.
    setSearchParams(params, { replace: true });
  };

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      setBoard(await api.getBoard(projectId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load board.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadQueue = useCallback(async () => {
    if (!projectId) return;
    try {
      setQueue(await api.getDevelopmentQueue(projectId));
    } catch {
      // The queue is a view over the board, never a reason to fail it.
      setQueue(null);
    }
  }, [projectId]);

  /** QA runs for this project — the board itself only shows Tasks, so QA is invisible without this. */
  const loadQaRuns = useCallback(async () => {
    if (!projectId) return;
    try {
      const runs = await api.listRuns(projectId);
      setQaRuns(runs.filter((r) => r.role === 'qa'));
    } catch {
      // Status is a nicety; never break the board over it.
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    void loadQaRuns();
    void loadQueue();
  }, [load, loadQaRuns, loadQueue]);

  /*
   * Poll while the queue still has work. Only the queue is fetched on each tick — it is small and
   * changes often — and the board is reloaded just once, when the Task actually being run changes,
   * so the columns follow along without the whole board flickering every few seconds.
   */
  const queueRunning = queue?.items.find((item) => item.state === 'running')?.workItemId ?? null;
  const queueActive =
    queue?.status === 'active' && queue.items.some((item) => item.state !== 'done');
  useEffect(() => {
    if (!queueActive) return;
    const timer = setInterval(() => void loadQueue(), 4000);
    return () => clearInterval(timer);
  }, [queueActive, loadQueue]);

  useEffect(() => {
    // The run in flight changed (or ended), so the columns are now out of date.
    void load();
  }, [queueRunning, load]);

  // Poll while a QA agent is working so the panel stays live without a manual refresh.
  const qaActive = qaRuns.some((r) => !QA_TERMINAL.has(r.state));
  useEffect(() => {
    if (!qaActive) return;
    const timer = setInterval(() => void loadQaRuns(), 4000);
    return () => clearInterval(timer);
  }, [qaActive, loadQaRuns]);

  const allTasks = useMemo(() => board?.columns.flatMap((c) => c.tasks) ?? [], [board]);

  /** Story id → title, so a QA run can be shown by name (QA tests Stories; the board shows Tasks). */
  const storyTitles = useMemo(() => {
    const byId = new Map<string, string>();
    for (const t of allTasks) {
      if (t.story?.adoId) byId.set(String(t.story.adoId), t.story.title);
    }
    return byId;
  }, [allTasks]);
  const byKey = useMemo(() => new Map(allTasks.map((t) => [t.key, t])), [allTasks]);

  // Cascading options: narrowing an Epic narrows the Features available, and so on.
  const byEpic = useMemo(
    () => allTasks.filter((t) => !filters.epic || titleOf(t.epic) === filters.epic),
    [allTasks, filters.epic],
  );
  const byFeature = useMemo(
    () => byEpic.filter((t) => !filters.feature || titleOf(t.feature) === filters.feature),
    [byEpic, filters.feature],
  );
  const byStory = useMemo(
    () => byFeature.filter((t) => !filters.story || titleOf(t.story) === filters.story),
    [byFeature, filters.story],
  );
  const filtered = useMemo(
    () =>
      byStory.filter(
        (t) =>
          (!filters.sprint || t.sprint === filters.sprint) &&
          (!filters.status || t.status === filters.status) &&
          (!filters.assignee || t.assignee === filters.assignee) &&
          (!filters.agent || (t.executionAgent ?? 'Unassigned') === filters.agent),
      ),
    [byStory, filters.sprint, filters.status, filters.assignee, filters.agent],
  );

  /*
   * Draft holds backlog Tasks that are not in Azure DevOps yet. Once a project has been pushed it
   * can never fill again, so the column is dead space on every board that matters. Hidden rather
   * than removed: a project reviewed before its push shows that planned work nowhere else.
   *
   * The decision uses the unfiltered board, so the column does not appear and vanish as filters
   * change — an empty column under a filter reads the same as the others do.
   */
  const columns = useMemo(() => {
    const hasDrafts = allTasks.some((task) => task.status === 'Draft');
    return TASK_COLUMNS.filter((status) => status !== 'Draft' || hasDrafts).map((status) => ({
      status,
      tasks: filtered.filter((t) => t.status === status),
    }));
  }, [filtered, allTasks]);

  const detailTask = detailKey ? (byKey.get(detailKey) ?? null) : null;

  const clearSelection = useCallback(() => {
    setSelected([]);
    setSelectionStatus(null);
  }, []);

  /** Selecting a card in a different column replaces the selection — one status per bulk action. */
  const toggleSelect = useCallback(
    (task: BoardTask) => {
      setSelectionStatus(task.status);
      setSelected((cur) => {
        const base = selectionStatus === task.status ? cur : [];
        return base.includes(task.key) ? base.filter((k) => k !== task.key) : [...base, task.key];
      });
    },
    [selectionStatus],
  );

  const selectAllIn = useCallback((status: TaskStatus, tasks: BoardTask[]) => {
    setSelectionStatus(status);
    setSelected(tasks.map((t) => t.key));
  }, []);

  /** Executes a transition and refreshes the board from ADO. */
  const run = useCallback(
    async (keys: string[], to: TransitionTarget, source: TransitionSource) => {
      if (!projectId || keys.length === 0) return;
      setWorking(true);
      setActionError(null);
      setRejection(null);
      setResult(null);
      try {
        if (to === 'In Progress') {
          // The backend keeps the order and starts them one at a time; the browser only submits.
          setQueue(await api.queueDevelopment(projectId, keys));
        } else {
          setResult(await api.transitionTasks(projectId, keys, to, { source }));
        }
        clearSelection();
        setPending(null);
        setDetailKey(null);
        await load();
        await loadQueue();
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : 'Transition failed.');
      } finally {
        setWorking(false);
      }
    },
    [projectId, load, loadQueue, clearSelection],
  );

  /** Asks the backend to validate a bulk selection, then opens the confirmation dialog. */
  const previewBulk = useCallback(
    async (keys: string[], to: TransitionTarget, source: TransitionSource) => {
      if (!projectId || keys.length === 0) return;
      setWorking(true);
      setActionError(null);
      setRejection(null);
      setResult(null);
      try {
        const preview = await api.transitionTasks(projectId, keys, to, { dryRun: true, source });
        setPending({ keys, to, source, preview });
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : 'Validation failed.');
      } finally {
        setWorking(false);
      }
    },
    [projectId],
  );

  /**
   * A single card's forward move. The backend already told us whether it is allowed
   * (`canTransition`), so an invalid attempt is explained locally without a pointless round trip —
   * and the server re-validates anyway when the move is allowed.
   */
  const moveOne = useCallback(
    (task: BoardTask, source: TransitionSource) => {
      const { to, allowed, reason, hint } = task.canTransition;
      if (!to || !allowed) {
        setRejection({
          title: task.title,
          reason: reason ?? 'This Task cannot be moved.',
          hint,
        });
        return;
      }
      void run([task.key], to as TransitionTarget, source);
    },
    [run],
  );

  /** A drop onto a column: validate the target, then move one card or preview a bulk move. */
  const onDrop = useCallback(
    (target: TaskStatus, keys: string[]) => {
      setDragFrom(null);
      const tasks = keys.map((k) => byKey.get(k)).filter((t): t is BoardTask => Boolean(t));
      if (tasks.length === 0) return;
      const from = tasks[0].status;
      if (from === target) return;

      // The only move a card offers is its `canTransition.to`; anything else is rejected outright.
      const expected = tasks[0].canTransition.to;
      if (target !== expected) {
        setRejection({
          title: tasks.length === 1 ? tasks[0].title : `${tasks.length} Tasks`,
          reason:
            target === 'Done'
              ? 'Done is set by the orchestrator, not manually.'
              : `${from} → ${target} is not a supported transition.`,
          hint:
            target === 'Done'
              ? 'A Task moves to Done automatically once its Developer Agent run completes successfully.'
              : 'The development flow is Draft → To Do → In Progress → Done.',
        });
        return;
      }
      if (tasks.length === 1) {
        moveOne(tasks[0], 'drag-drop');
      } else {
        void previewBulk(keys, expected as TransitionTarget, 'drag-drop');
      }
    },
    [byKey, moveOne, previewBulk],
  );

  /**
   * Previews the QA wave. QA is human-triggered and costs one pod (and one Claude session) per item,
   * so the user always sees what would run before anything starts.
   */
  const previewQa = useCallback(async () => {
    if (!projectId) return;
    setWorking(true);
    setActionError(null);
    try {
      setQaPreview(await api.startQa(projectId, { dryRun: true }));
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not check what is ready for QA.',
      );
    } finally {
      setWorking(false);
    }
  }, [projectId]);

  /** Dispatches the QA wave: one pod per Story in Done and per Bug awaiting retest. */
  const confirmQa = useCallback(async () => {
    if (!projectId) return;
    setWorking(true);
    setActionError(null);
    try {
      const started = await api.startQa(projectId);
      setQaPreview(null);
      setQaResult(started);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not start QA.');
    } finally {
      setWorking(false);
    }
  }, [projectId, load]);

  /** Previews the sprint rollover: nothing changes until the dialog is confirmed. */
  const previewRollover = useCallback(async () => {
    if (!projectId) return;
    setWorking(true);
    setActionError(null);
    try {
      setRollover(await api.completeSprint(projectId, { dryRun: true }));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not check the sprint.');
    } finally {
      setWorking(false);
    }
  }, [projectId]);

  /** Applies the rollover, then reloads so the board reflects the new active sprint. */
  const confirmRollover = useCallback(async () => {
    if (!projectId) return;
    setWorking(true);
    setActionError(null);
    try {
      const applied = await api.completeSprint(projectId);
      setRollover(null);
      setRolloverDone(applied);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not complete the sprint.');
    } finally {
      setWorking(false);
    }
  }, [projectId, load]);

  if (!projectId) return null;

  const bulkTarget = selectionStatus
    ? ((selectionStatus === 'Draft' ? 'To Do' : 'In Progress') as TransitionTarget)
    : null;
  const bulkAllowed = Boolean(selectionStatus && ACTION_LABEL[selectionStatus]);
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const set = (key: keyof Filters, value: string) =>
    setFilters((cur) => {
      if (key === 'epic') return { ...cur, epic: value, feature: '', story: '' };
      if (key === 'feature') return { ...cur, feature: value, story: '' };
      return { ...cur, [key]: value };
    });

  return (
    <section aria-labelledby="board-heading">
      <div className="page-header">
        <h2 id="board-heading">Development Board</h2>
        <div className="actions">
          {board?.currentSprint && (
            <span className="badge" title="Active sprint in Azure DevOps">
              Active: {board.currentSprint}
            </span>
          )}
          <button
            className="link"
            onClick={() => void previewQa()}
            disabled={loading || working}
            title="Test every Story that is Done and retest every fixed Bug (one QA agent per item)"
          >
            Start QA
          </button>
          {board?.currentSprint && (
            <button
              className="link"
              onClick={() => void previewRollover()}
              disabled={loading || working}
              title="Close the active sprint and start the next one (moves the iteration dates in Azure DevOps)"
            >
              Complete Sprint &amp; Start Next
            </button>
          )}
          <button
            className="link"
            onClick={() => {
              void load();
              void loadQueue();
            }}
            disabled={loading || working}
          >
            Refresh from ADO
          </button>
        </div>
      </div>
      <p className="muted">
        Every card is one Azure DevOps <strong>Task</strong> — the Developer Agent&apos;s unit of
        execution. Drag a card to the next column, or use its buttons; every move is validated the
        same way. <strong>Done</strong> is set by the orchestrator after a successful agent run.
      </p>

      <div className="view-switch" role="tablist">
        <button
          role="tab"
          aria-selected={view === 'development'}
          className={`view-switch-tab${view === 'development' ? ' view-switch-active' : ''}`}
          onClick={() => setView('development')}
        >
          Development
        </button>
        <button
          role="tab"
          aria-selected={view === 'qa'}
          className={`view-switch-tab${view === 'qa' ? ' view-switch-active' : ''}`}
          onClick={() => setView('qa')}
        >
          QA Testing
        </button>
      </div>

      {view === 'qa' ? (
        <QaBoardView projectId={projectId} />
      ) : (
        <>
          {qaRuns.length > 0 && (
            <QaActivityPanel
              runs={qaRuns}
              storyTitles={storyTitles}
              projectId={projectId}
              onRefresh={() => void loadQaRuns()}
            />
          )}

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {actionError && (
            <p className="error" role="alert">
              {actionError}
            </p>
          )}

          {rejection && (
            <div className="rejection" role="alert">
              <div>
                <strong>Cannot move “{rejection.title}”.</strong>
                <div>{rejection.reason}</div>
                {rejection.hint && <div className="muted">{rejection.hint}</div>}
              </div>
              <button className="link" onClick={() => setRejection(null)}>
                Dismiss
              </button>
            </div>
          )}

          {result && <TransitionSummary result={result} onDismiss={() => setResult(null)} />}
          {queue && (
            <DevelopmentQueue
              queue={queue}
              tasks={allTasks}
              busy={working}
              onResume={() => {
                void api
                  .resumeDevelopmentQueue(projectId!)
                  .then(setQueue)
                  .then(() => load());
              }}
              onCancel={() => {
                void api.cancelDevelopmentQueue(projectId!).then(setQueue);
              }}
            />
          )}

          {board && allTasks.length === 0 && (
            <p className="muted">
              {board.pushed
                ? 'No Tasks found for this project in Azure DevOps.'
                : 'Nothing pushed to ADO yet. Approve and push from the Planning page.'}
            </p>
          )}

          {allTasks.length > 0 && (
            <>
              <div className="board-filters" role="group" aria-label="Filter tasks">
                <FilterSelect
                  label="Epic"
                  value={filters.epic}
                  options={optionsOf(allTasks, (t) => titleOf(t.epic))}
                  onChange={(v) => set('epic', v)}
                />
                <FilterSelect
                  label="Feature"
                  value={filters.feature}
                  options={optionsOf(byEpic, (t) => titleOf(t.feature))}
                  onChange={(v) => set('feature', v)}
                />
                <FilterSelect
                  label="Story"
                  value={filters.story}
                  options={optionsOf(byFeature, (t) => titleOf(t.story))}
                  onChange={(v) => set('story', v)}
                />
                <FilterSelect
                  label="Sprint"
                  value={filters.sprint}
                  options={optionsOf(byStory, (t) => t.sprint)}
                  onChange={(v) => set('sprint', v)}
                />
                <FilterSelect
                  label="Status"
                  value={filters.status}
                  options={columns.map((col) => col.status)}
                  onChange={(v) => set('status', v)}
                />
                <FilterSelect
                  label="Assignee"
                  value={filters.assignee}
                  options={optionsOf(byStory, (t) => t.assignee)}
                  onChange={(v) => set('assignee', v)}
                />
                <FilterSelect
                  label="Execution agent"
                  value={filters.agent}
                  options={optionsOf(byStory, (t) => t.executionAgent ?? 'Unassigned')}
                  onChange={(v) => set('agent', v)}
                />
                <div className="board-filters-summary">
                  <span className="muted">
                    {filtered.length} of {allTasks.length} Tasks
                  </span>
                  {activeFilters > 0 && (
                    <button className="link" onClick={() => setFilters(NO_FILTERS)}>
                      Clear filters
                    </button>
                  )}
                </div>
              </div>

              {selected.length > 0 && (
                <div className="bulk-bar" role="region" aria-label="Bulk actions">
                  <span>
                    <strong>{selected.length}</strong> Task{selected.length === 1 ? '' : 's'}{' '}
                    selected in <em>{selectionStatus}</em>
                  </span>
                  {bulkAllowed && bulkTarget && (
                    <button
                      disabled={working}
                      onClick={() => void previewBulk(selected, bulkTarget, 'bulk')}
                    >
                      {working ? 'Validating…' : `${BULK_LABEL[bulkTarget]} →`}
                    </button>
                  )}
                  <button className="link" disabled={working} onClick={clearSelection}>
                    Clear selection
                  </button>
                </div>
              )}

              <div className="board" role="list" aria-label="Development columns">
                {columns.map((col) => {
                  const selectable = Boolean(ACTION_LABEL[col.status]);
                  const isDropTarget = dragFrom !== null && dragFrom !== col.status;
                  return (
                    <div
                      key={col.status}
                      className={`board-column${isDropTarget ? ' board-column-droppable' : ''}`}
                      role="listitem"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        try {
                          const keys = JSON.parse(e.dataTransfer.getData('text/plain')) as string[];
                          onDrop(col.status, keys);
                        } catch {
                          setDragFrom(null);
                        }
                      }}
                    >
                      <h3 className="board-column-title">
                        {col.status} <span className="badge">{col.tasks.length}</span>
                        {selectable && col.tasks.length > 0 && (
                          <button
                            className="link board-select-all"
                            onClick={() => selectAllIn(col.status, col.tasks)}
                          >
                            Select all
                          </button>
                        )}
                      </h3>
                      <ul className="board-cards">
                        {col.tasks.map((task) => (
                          <TaskCard
                            key={task.key}
                            task={task}
                            selectable={selectable}
                            selected={selected.includes(task.key)}
                            working={working}
                            onToggleSelect={() => toggleSelect(task)}
                            onOpen={() => setDetailKey(task.key)}
                            onAction={() => moveOne(task, 'button')}
                            onDragStart={(e) => {
                              // Dragging a selected card drags the whole selection (bulk drag).
                              const keys =
                                selected.includes(task.key) && selectionStatus === task.status
                                  ? selected
                                  : [task.key];
                              e.dataTransfer.setData('text/plain', JSON.stringify(keys));
                              e.dataTransfer.effectAllowed = 'move';
                              setDragFrom(task.status);
                            }}
                            onDragEnd={() => setDragFrom(null)}
                          />
                        ))}
                      </ul>
                      {col.tasks.length === 0 && (
                        <p className="muted board-column-empty">No tasks</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {qaResult && (
            <div className="transition-summary" role="status">
              <div className="transition-summary-head">
                <span>
                  <strong>{qaResult.dispatchedCount}</strong> QA agent
                  {qaResult.dispatchedCount === 1 ? '' : 's'} started
                  {qaResult.skippedActive.length > 0 &&
                    ` · ${qaResult.skippedActive.length} already under test`}
                  {qaResult.deferred.length > 0 && ` · ${qaResult.deferred.length} deferred`}
                </span>
                <button className="link" onClick={() => setQaResult(null)}>
                  Dismiss
                </button>
              </div>
              {qaResult.dispatchedCount > 0 && (
                <ul className="transition-summary-list">
                  {qaResult.dispatched.map((d) => (
                    <li key={d.workItemId}>
                      #{d.workItemId} — run {d.runId.slice(0, 8)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {qaPreview && (
            <QaPreviewDialog
              preview={qaPreview}
              working={working}
              onCancel={() => setQaPreview(null)}
              onConfirm={() => void confirmQa()}
            />
          )}

          {rolloverDone && (
            <div className="transition-summary" role="status">
              <div className="transition-summary-head">
                <span>
                  <strong>{rolloverDone.current?.name}</strong> completed ·{' '}
                  <strong>{rolloverDone.next?.name}</strong> is now the active sprint
                </span>
                <button className="link" onClick={() => setRolloverDone(null)}>
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {rollover && (
            <SprintRolloverDialog
              plan={rollover}
              working={working}
              onCancel={() => setRollover(null)}
              onConfirm={() => void confirmRollover()}
            />
          )}

          {pending && (
            <BulkPreviewDialog
              pending={pending}
              working={working}
              onCancel={() => setPending(null)}
              onConfirm={() => {
                const eligible = pending.preview.outcomes.filter((o) => o.ok).map((o) => o.taskKey);
                void run(eligible, pending.to, pending.source);
              }}
            />
          )}

          {detailTask && (
            <TaskDetail
              task={detailTask}
              working={working}
              onClose={() => setDetailKey(null)}
              onAction={() => moveOne(detailTask, 'button')}
            />
          )}
        </>
      )}
    </section>
  );
}

export function FilterSelect(props: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const { label, value, options, onChange } = props;
  return (
    <label className="board-filter">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Compact, draggable Task card carrying its Epic → Feature → Story context. */
function TaskCard(props: {
  task: BoardTask;
  selectable: boolean;
  selected: boolean;
  working: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onAction: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const { task, selectable, selected, working, onToggleSelect, onOpen, onAction } = props;
  const { to, allowed, reason } = task.canTransition;
  const actionLabel = actionLabelFor(task);
  const agent = agentBadge(task);
  const isBug = task.kind === 'bug';
  const summary = toPlainText(task.description);

  return (
    <li
      className={`board-card task-card${selected ? ' task-card-selected' : ''}`}
      draggable={Boolean(to)}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
    >
      {agent && (
        <span className={`tc-progress tc-progress-${agent.tone}`} aria-hidden="true">
          <span />
        </span>
      )}
      <div className="tc-head">
        {/* Grouped so a narrow column wraps the agent pill onto its own line, never the checkbox. */}
        <span className="tc-head-left">
          {selectable && (
            <input
              type="checkbox"
              className="tc-select"
              checked={selected}
              onChange={onToggleSelect}
              aria-label={`Select ${task.title}`}
            />
          )}
          <span className={`tc-type${isBug ? ' tc-type-bug' : ''}`}>
            <Icon name={isBug ? 'bug' : 'task'} />
            {isBug ? 'Bug' : 'Task'}
          </span>
          <span className="tc-id">{task.adoId ? `#${task.adoId}` : 'not in ADO yet'}</span>
        </span>
        {agent && (
          <span className={`tc-agent ${agent.className}`} title={agent.title}>
            <span className="tc-spinner" aria-hidden="true" />
            {agent.label}
          </span>
        )}
      </div>

      <button className="tc-title" onClick={onOpen}>
        {task.title}
      </button>
      {summary && <p className="tc-desc">{summary}</p>}

      <dl className="tc-meta">
        <MetaField icon="story" label="Story" value={titleOf(task.story)} />
        <MetaField icon="person" label="Assignee" value={task.assignee} />
        <MetaField icon="feature" label="Feature" value={titleOf(task.feature)} />
        <MetaField
          icon="sprint"
          label="Sprint"
          value={task.sprint}
          tone={task.sprintTimeFrame === 'future' ? 'warn' : undefined}
        />
        <MetaField icon="epic" label="Epic" value={titleOf(task.epic)} />
        <MetaField icon="clock" label="Updated" value={relativeTime(task.updatedAt)} />
      </dl>

      <div className="tc-foot">
        <span
          className={`task-status task-status-${task.status.replace(/\s+/g, '-').toLowerCase()}`}
        >
          {task.status}
        </span>
        {task.executionAgent && (
          <span className="tc-owner">
            <Icon name="agent" />
            {task.executionAgent}
          </span>
        )}
      </div>

      {actionLabel && (
        <div className="task-card-actions">
          <button
            className="task-card-action"
            disabled={!allowed || working}
            title={allowed ? undefined : reason}
            onClick={onAction}
          >
            {actionLabel}
          </button>
          {!allowed && reason && <span className="task-card-blocked">{reason}</span>}
        </div>
      )}
    </li>
  );
}

/** One labelled fact on a card, with its icon. Renders an em dash rather than vanishing. */
function MetaField(props: {
  icon: IconName;
  label: string;
  value: string | null | undefined;
  tone?: 'warn';
}) {
  return (
    <div>
      <dt>
        <Icon name={props.icon} />
        {props.label}
      </dt>
      <dd className={props.tone === 'warn' ? 'sprint-future' : undefined}>{props.value || '—'}</dd>
    </div>
  );
}

type IconName =
  'task' | 'bug' | 'story' | 'feature' | 'epic' | 'person' | 'sprint' | 'clock' | 'agent';

/**
 * Small inline glyphs for the card. Inline rather than an icon package: nine 16px paths do not
 * justify a dependency, and keeping them here means they inherit `currentColor` everywhere.
 */
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, JSX.Element> = {
    task: (
      <>
        <rect x="3" y="3" width="10" height="10" rx="2" />
        <path d="M5.8 8.2l1.6 1.6 3-3.4" />
      </>
    ),
    bug: (
      <>
        <rect x="5" y="6" width="6" height="7" rx="3" />
        <path d="M5 9H2.5M11 9h2.5M5.5 6.5L4 5M10.5 6.5L12 5M6 3.5h4" />
      </>
    ),
    story: (
      <>
        <path d="M4 2h5l3 3v9H4z" />
        <path d="M6 7.5h4M6 10h3" />
      </>
    ),
    feature: (
      <>
        <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
        <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
        <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
        <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
      </>
    ),
    epic: (
      <>
        <path d="M8 2l6 3-6 3-6-3z" />
        <path d="M2 8l6 3 6-3M2 11l6 3 6-3" />
      </>
    ),
    person: (
      <>
        <circle cx="8" cy="5.5" r="2.5" />
        <path d="M3.5 13.5a4.5 4.5 0 019 0" />
      </>
    ),
    sprint: (
      <>
        <rect x="2.5" y="3.5" width="11" height="10" rx="2" />
        <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
      </>
    ),
    clock: (
      <>
        <circle cx="8" cy="8" r="6" />
        <path d="M8 4.5V8l2.5 1.5" />
      </>
    ),
    agent: (
      <>
        <path d="M4 3h8v10l-4-2.5L4 13z" />
      </>
    ),
  };
  return (
    <svg
      className="tc-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

/** Full Task details: information, hierarchy, execution, and the one valid action. */
function TaskDetail(props: {
  task: BoardTask;
  working: boolean;
  onClose: () => void;
  onAction: () => void;
}) {
  const { task, working, onClose, onAction } = props;
  const actionLabel = ACTION_LABEL[task.status];
  const { allowed, reason, hint } = task.canTransition;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const description = toPlainText(task.description);
  const criteria = toPlainText(task.acceptanceCriteria);
  const exec = task.execution;
  const agent = agentBadge(task);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Task ${task.adoId ?? task.key}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <span className="board-card-type">Task</span>
            <h3>{task.title}</h3>
            <p className="muted">
              {task.adoId ? `#${task.adoId}` : 'Not in Azure DevOps yet'}
              {task.state ? ` · ADO state: ${task.state}` : ''}
            </p>
          </div>
          <button className="link" onClick={onClose} aria-label="Close details">
            Close
          </button>
        </div>

        <div className="drawer-body">
          <div className="task-card-meta">
            <span
              className={`task-status task-status-${task.status.replace(/\s+/g, '-').toLowerCase()}`}
            >
              {task.status}
            </span>
            {agent && (
              <span className={agent.className} title={agent.title}>
                {agent.label}
              </span>
            )}
          </div>

          <h4>Task information</h4>
          <dl className="drawer-hierarchy">
            <div>
              <dt>Sprint</dt>
              <dd>
                {task.sprint ?? '—'}
                {task.sprintTimeFrame !== 'unknown' && (
                  <span className="muted"> ({task.sprintTimeFrame})</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Assignee</dt>
              <dd>{task.assignee ?? '—'}</dd>
            </div>
            <div>
              <dt>Agent</dt>
              <dd>{task.executionAgent ?? 'None assigned'}</dd>
            </div>
            {task.repo && (
              <div>
                <dt>Repo</dt>
                <dd>{task.repo}</dd>
              </div>
            )}
          </dl>

          <h4>Hierarchy</h4>
          <dl className="drawer-hierarchy">
            <div>
              <dt>Epic</dt>
              <dd>{titleOf(task.epic) || '—'}</dd>
            </div>
            <div>
              <dt>Feature</dt>
              <dd>{titleOf(task.feature) || '—'}</dd>
            </div>
            <div>
              <dt>Story</dt>
              <dd>{titleOf(task.story) || '—'}</dd>
            </div>
          </dl>

          <h4>Description</h4>
          <p className="drawer-text">{description || <span className="muted">None.</span>}</p>

          <h4>Acceptance criteria</h4>
          <p className="drawer-text">{criteria || <span className="muted">None.</span>}</p>

          <h4>Execution</h4>
          {exec ? (
            <dl className="drawer-hierarchy">
              <div>
                <dt>Run</dt>
                <dd>{exec.runId}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {exec.state}
                  {exec.attempts > 1 && <span className="muted"> · attempt {exec.attempts}</span>}
                </dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{formatTime(exec.startedAt)}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{formatTime(exec.completedAt)}</dd>
              </div>
              <div>
                <dt>Result</dt>
                <dd>
                  {exec.filesChanged} file(s), {exec.commits.length} commit(s)
                  {exec.cost > 0 && <span className="muted"> · ${exec.cost.toFixed(2)}</span>}
                </dd>
              </div>
              {exec.blockedReason && (
                <div>
                  <dt>Note</dt>
                  <dd>{exec.blockedReason}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="muted">No Developer Agent run for this Task yet.</p>
          )}
        </div>

        <div className="drawer-foot">
          {actionLabel ? (
            <>
              <button disabled={!allowed || working} onClick={onAction} title={reason}>
                {working ? 'Working…' : actionLabel}
              </button>
              {!allowed && (
                <span className="task-card-blocked">
                  {reason}
                  {hint ? ` ${hint}` : ''}
                </span>
              )}
            </>
          ) : (
            <p className="muted">
              {task.status === 'In Progress'
                ? 'A Developer agent is working on this Task. It moves to Done automatically once the run completes successfully.'
                : 'This Task is complete. Done is set by the orchestrator and cannot be changed here.'}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Bulk confirmation: the backend's dry-run verdict, so the user sees exactly what will happen. */
function BulkPreviewDialog(props: {
  pending: PendingBulk;
  working: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { pending, working, onCancel, onConfirm } = props;
  const { preview, to } = pending;
  const eligible = preview.outcomes.filter((o) => o.ok);
  const problems = preview.outcomes.filter((o) => !o.ok);

  return (
    <div className="drawer-backdrop" onClick={onCancel}>
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm bulk action"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>
          {BULK_LABEL[to]} — {preview.requested} selected Task
          {preview.requested === 1 ? '' : 's'}?
        </h3>
        <p>
          <strong>{eligible.length}</strong> eligible ·{' '}
          <strong>{preview.blocked + preview.skipped + preview.failed}</strong> cannot be moved
        </p>

        {problems.length > 0 && (
          <ul className="confirm-reasons">
            {problems.map((o) => (
              <li key={o.taskKey}>
                <span className="transition-failed">{o.status}</span> {o.title}
                {o.adoId ? ` (#${o.adoId})` : ''} — {o.reason}
              </li>
            ))}
          </ul>
        )}

        <div className="confirm-actions">
          <button className="link" onClick={onCancel} disabled={working}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={working || eligible.length === 0}>
            {working
              ? 'Working…'
              : `${BULK_LABEL[to]} — ${eligible.length} eligible Task${eligible.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Live QA status on the board. QA tests **Stories**, and the board shows **Tasks**, so without this
 * a running QA agent is invisible — the user clicks Start QA and then sees nothing change. Polls
 * while an agent is working; links out to the full run log for the detail.
 */
function QaActivityPanel(props: {
  runs: Run[];
  storyTitles: Map<string, string>;
  projectId: string;
  onRefresh: () => void;
}) {
  const { runs, storyTitles, projectId, onRefresh } = props;

  // One row per Story, not per run: a Story tested several times would otherwise look like
  // duplicates. The newest run wins, and earlier attempts are summarised on the same row.
  const byStory = new Map<string, { latest: Run; attempts: number }>();
  for (const run of [...runs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )) {
    const key = run.workItemId ?? run.runId;
    const seen = byStory.get(key);
    if (seen) {
      seen.attempts += 1;
    } else {
      byStory.set(key, { latest: run, attempts: 1 });
    }
  }
  const rows = [...byStory.values()].sort((a, b) => {
    const aActive = QA_TERMINAL.has(a.latest.state) ? 1 : 0;
    const bActive = QA_TERMINAL.has(b.latest.state) ? 1 : 0;
    return aActive - bActive;
  });
  const active = rows.filter((r) => !QA_TERMINAL.has(r.latest.state));

  const elapsed = (run: Run): string => {
    const ms = QA_TERMINAL.has(run.state)
      ? (run.result?.durationMs ?? 0)
      : Date.now() - new Date(run.createdAt).getTime();
    if (ms <= 0) return '—';
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <div className="qa-activity">
      <div className="qa-activity-head">
        <strong>
          QA testing
          {active.length > 0 && <span className="qa-live"> · {active.length} in progress</span>}
        </strong>
        <span>
          <a href={`/projects/${projectId}/runs`}>Full run log</a>
          {' · '}
          <button className="link" onClick={onRefresh}>
            Refresh
          </button>
        </span>
      </div>

      <ul className="qa-activity-list">
        {rows.map(({ latest, attempts }) => {
          const status = QA_STATUS[latest.state] ?? { label: latest.state, className: '' };
          const title = latest.workItemId ? storyTitles.get(latest.workItemId) : undefined;
          return (
            <li key={latest.workItemId ?? latest.runId}>
              <span className={`qa-run-status ${status.className}`}>{status.label}</span>
              <span className="qa-item-title">{title ?? `Story #${latest.workItemId ?? '—'}`}</span>
              <span className="muted">
                {latest.workItemId ? `#${latest.workItemId} · ` : ''}
                {elapsed(latest)}
                {latest.result?.cost ? ` · $${latest.result.cost.toFixed(2)}` : ''}
                {attempts > 1 && ` · ${attempts} runs`}
              </span>
            </li>
          );
        })}
      </ul>

      {active.length > 0 && (
        <p className="muted qa-activity-foot">
          The agent is reading the Story, writing test cases in Azure DevOps and running them. This
          usually takes a few minutes — results appear in Azure DevOps Test Plans when it finishes.
        </p>
      )}
    </div>
  );
}

/**
 * Confirms a QA wave — in plain language, because this spends real money and changes work items.
 * It names every Story/Bug that will be tested, says what the agent will do and what happens on a
 * pass or a failure, and explains anything it is *not* starting. Nothing runs until the user agrees.
 */
function QaPreviewDialog(props: {
  preview: QaBatchResult;
  working: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { preview, working, onCancel, onConfirm } = props;
  const items = preview.dispatched;
  const stories = items.filter((i) => i.kind !== 'bug');
  const retests = items.filter((i) => i.kind === 'bug');
  const nothingToDo = items.length === 0;

  return (
    <div className="drawer-backdrop" onClick={onCancel}>
      <div
        className="confirm-dialog qa-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Start QA"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{nothingToDo ? 'Nothing is ready to test' : 'Start testing?'}</h3>

        {nothingToDo ? (
          <p>
            A Story becomes testable once <strong>all of its Tasks are Done</strong>. Finish the
            remaining Tasks, and it will show up here.
          </p>
        ) : (
          <>
            <p>
              A QA agent will test {items.length === 1 ? 'this' : 'each of these'}, one at a time:
            </p>

            <ul className="qa-item-list">
              {stories.map((i) => (
                <li key={i.workItemId}>
                  <span className="qa-item-kind">Story</span>
                  <span className="qa-item-title">{i.title || `#${i.workItemId}`}</span>
                  <span className="muted"> #{i.workItemId}</span>
                </li>
              ))}
              {retests.map((i) => (
                <li key={i.workItemId}>
                  <span className="qa-item-kind qa-item-kind-bug">Re-test</span>
                  <span className="qa-item-title">{i.title || `#${i.workItemId}`}</span>
                  <span className="muted"> #{i.workItemId} · fixed by a developer</span>
                </li>
              ))}
            </ul>

            <p className="qa-explain">
              For each one it reads the Story and its acceptance criteria, writes test cases in
              Azure DevOps, runs them against the code on <code>ai-developer</code>, and records
              every result as <strong>Passed</strong>, <strong>Failed</strong> or{' '}
              <strong>Blocked</strong>.
            </p>

            <dl className="qa-outcomes">
              <div>
                <dt>If everything passes</dt>
                <dd>The Story stays Done. Nothing else changes.</dd>
              </div>
              <div>
                <dt>If something fails</dt>
                <dd>
                  A Bug is filed and the Story reopens. You review the Bug before any developer is
                  asked to fix it.
                </dd>
              </div>
              <div>
                <dt>If the test can’t run</dt>
                <dd>
                  It is marked Blocked — an environment problem, not a defect. No Bug, no reopen.
                </dd>
              </div>
            </dl>

            <p className="muted">Takes a few minutes per item and uses one AI session each.</p>
          </>
        )}

        {preview.skippedActive.length > 0 && (
          <p className="muted">
            {preview.skippedActive.length === 1
              ? '1 item is being tested right now, so it is skipped.'
              : `${preview.skippedActive.length} items are being tested right now, so they are skipped.`}
          </p>
        )}

        {preview.deferred.length > 0 && (
          <p className="muted">
            {preview.deferred.length} more {preview.deferred.length === 1 ? 'item is' : 'items are'}{' '}
            waiting — only one QA agent runs at a time. Start QA again when this one finishes.
          </p>
        )}

        {preview.ineligible.length > 0 && (
          <ul className="confirm-reasons">
            {preview.ineligible.map((i) => (
              <li key={i.workItemId}>
                <span className="transition-failed">skipped</span> #{i.workItemId} — {i.reason}
              </li>
            ))}
          </ul>
        )}

        <div className="confirm-actions">
          <button className="link" onClick={onCancel} disabled={working}>
            {nothingToDo ? 'Close' : 'Cancel'}
          </button>
          {!nothingToDo && (
            <button onClick={onConfirm} disabled={working}>
              {working
                ? 'Starting…'
                : `Start testing ${items.length === 1 ? 'this item' : `these ${items.length} items`}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Per-Task outcome of the last transition, so partial success is visible. */
function TransitionSummary(props: { result: TaskTransitionResult; onDismiss: () => void }) {
  const { result, onDismiss } = props;
  const problems = result.outcomes.filter((o) => !o.ok);
  const caveats = result.outcomes.filter((o) => o.ok && o.reason);
  return (
    <div className="transition-summary" role="status">
      <div className="transition-summary-head">
        <span>
          <strong>{result.succeeded}</strong> moved to <strong>{result.to}</strong>
          {result.blocked > 0 && ` · ${result.blocked} blocked`}
          {result.skipped > 0 && ` · ${result.skipped} skipped`}
          {result.failed > 0 && ` · ${result.failed} failed`}
        </span>
        <button className="link" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      {(problems.length > 0 || caveats.length > 0) && (
        <ul className="transition-summary-list">
          {problems.map((o) => (
            <li key={`p-${o.taskKey}`}>
              <span className="transition-failed">{o.status}</span> {o.title}
              {o.adoId ? ` (#${o.adoId})` : ''} — {o.reason}
            </li>
          ))}
          {caveats.map((o) => (
            <li key={`c-${o.taskKey}`}>
              <span className="transition-caveat">warning</span> {o.title}
              {o.adoId ? ` (#${o.adoId})` : ''} — {o.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
