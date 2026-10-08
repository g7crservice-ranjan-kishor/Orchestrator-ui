import type { BoardTask, DevQueue, DevQueueItem, DevQueueItemState } from '../../lib/types';
import { relativeTime } from '../../lib/relative-time';

/** The three groups a reader cares about, in the order work moves through them. */
const GROUPS: { state: DevQueueItemState | 'finished'; label: string }[] = [
  { state: 'running', label: 'Currently running' },
  { state: 'queued', label: 'Queued' },
  { state: 'finished', label: 'Finished' },
];

function titleFor(tasks: BoardTask[], workItemId: string, noun: string): string {
  return tasks.find((task) => String(task.adoId) === workItemId)?.title ?? `${noun} ${workItemId}`;
}

function rowClass(state: DevQueueItemState): string {
  return `dq-row dq-row-${state}`;
}

function statusText(item: DevQueueItem): string {
  switch (item.state) {
    case 'running':
      return item.startedAt
        ? `Agent running · started ${relativeTime(item.startedAt)}`
        : 'Agent running';
    case 'queued':
      /*
       * A queued entry is usually waiting its turn. One waiting on *work it depends on* is a
       * different thing, and saying only "Waiting" hides it: the queue has already passed over this
       * Task and started later ones, so a reader watching it sit still while others move needs to
       * be told why, and that it needs nothing from them.
       */
      return item.note ?? 'Waiting';
    case 'done':
      return item.finishedAt ? `Completed ${relativeTime(item.finishedAt)}` : 'Completed';
    case 'failed':
      // A skipped entry carries the reason it could never start. Saying only "Failed" would make a
      // Story that was never set up properly look like one whose tests went red.
      return item.note ?? 'Failed';
  }
}

/**
 * The development queue: what is running, what is waiting, and what is already done.
 *
 * Rendered from the backend's own record rather than from anything the browser remembers, so a
 * refresh — or opening the board somewhere else mid-batch — shows the same order and the same
 * progress. It reports; it never decides what runs next.
 */
export function DevelopmentQueue({
  queue,
  tasks = [],
  busy,
  onResume,
  onCancel,
  heading = 'Development queue',
  noun = 'Task',
  titleOf,
}: {
  queue: DevQueue;
  tasks?: BoardTask[];
  busy: boolean;
  onResume: () => void;
  onCancel: () => void;
  /**
   * The QA board drains the same kind of queue, over Stories rather than Tasks. Only the words and
   * the title lookup differ, so they share one panel — two copies would drift, and the board shows
   * them in the same place.
   */
  heading?: string;
  noun?: string;
  titleOf?: (workItemId: string) => string;
}) {
  if (queue.items.length === 0) {
    return null;
  }

  const waiting = queue.items.filter((item) => item.state === 'queued').length;
  const halted = queue.status === 'halted';
  // Unique per panel so the two queues never share a DOM id if both are ever on screen.
  const headingId = `dq-heading-${noun.toLowerCase()}`;

  return (
    <section className="card dq" aria-labelledby={headingId}>
      <div className="dq-head">
        <h3 id={headingId}>{heading}</h3>
        <span className={`badge ${halted ? 'badge-unset' : 'badge'}`}>
          {halted ? 'Paused' : waiting > 0 ? `${waiting} waiting` : 'Finishing'}
        </span>
        <div className="dq-actions">
          {halted && (
            <button disabled={busy} onClick={onResume}>
              Resume
            </button>
          )}
          {waiting > 0 && (
            <button className="link" disabled={busy} onClick={onCancel}>
              Clear the queue
            </button>
          )}
        </div>
      </div>

      {halted && queue.haltedReason && (
        <p className="dq-halted" role="status">
          {queue.haltedReason}
        </p>
      )}

      {GROUPS.map(({ state, label }) => {
        const items = queue.items.filter((item) =>
          state === 'finished'
            ? item.state === 'done' || item.state === 'failed'
            : item.state === state,
        );
        if (items.length === 0) return null;
        return (
          <div key={state} className="dq-group">
            <h4 className="dq-group-title">
              {label} <span className="dq-count">{items.length}</span>
            </h4>
            <ul className="dq-list">
              {items.map((item) => (
                <li key={item.workItemId} className={rowClass(item.state)}>
                  <span className="dq-dot" aria-hidden />
                  <span className="dq-title">
                    <span className="dq-id">#{item.workItemId}</span>
                    {titleOf?.(item.workItemId) ?? titleFor(tasks, item.workItemId, noun)}
                  </span>
                  <span className="dq-state">{statusText(item)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
