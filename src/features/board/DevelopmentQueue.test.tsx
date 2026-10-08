import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DevelopmentQueue } from './DevelopmentQueue';
import type { BoardTask, DevQueue } from '../../lib/types';

/**
 * The queue panel. It reports the backend's record and decides nothing, so what matters is that it
 * shows the real order, distinguishes the four states, and never hides a failure.
 */
const task = (adoId: number, title: string) => ({ adoId, title }) as BoardTask;

const tasks = [
  task(201, 'Scaffold the API'),
  task(202, 'Add the login route'),
  task(203, 'Wire the UI form'),
];

const queue = (overrides: Partial<DevQueue> = {}): DevQueue => ({
  batchId: 'b1',
  status: 'active',
  haltedReason: null,
  items: [
    {
      workItemId: '201',
      position: 0,
      state: 'done',
      runId: 'r1',
      startedAt: null,
      finishedAt: null,
    },
    {
      workItemId: '202',
      position: 1,
      state: 'running',
      runId: 'r2',
      startedAt: null,
      finishedAt: null,
    },
    {
      workItemId: '203',
      position: 2,
      state: 'queued',
      runId: null,
      startedAt: null,
      finishedAt: null,
    },
  ],
  ...overrides,
});

function renderQueue(q: DevQueue) {
  return render(
    <DevelopmentQueue queue={q} tasks={tasks} busy={false} onResume={vi.fn()} onCancel={vi.fn()} />,
  );
}

describe('DevelopmentQueue', () => {
  it('shows nothing at all when no Tasks were queued', () => {
    const { container } = renderQueue(queue({ items: [] }));
    expect(container).toBeEmptyDOMElement();
  });

  it('groups the Tasks by what they are doing, and names them', () => {
    renderQueue(queue());
    expect(screen.getByText('Currently running')).toBeInTheDocument();
    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(screen.getByText('Finished')).toBeInTheDocument();
    expect(screen.getByText('Add the login route')).toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it('counts what is still waiting', () => {
    renderQueue(queue());
    expect(screen.getByText('1 waiting')).toBeInTheDocument();
  });

  /** Only the running row animates — the same rule the card's progress strip follows. */
  it('marks only the running row as running', () => {
    const { container } = renderQueue(queue());
    expect(container.querySelectorAll('.dq-row-running')).toHaveLength(1);
    expect(container.querySelectorAll('.dq-row-queued')).toHaveLength(1);
  });

  it('surfaces why a failure stopped the queue, and offers to resume', () => {
    renderQueue(
      queue({
        status: 'halted',
        haltedReason: 'Task 202 failed. The queue is paused.',
        items: [
          {
            workItemId: '202',
            position: 0,
            state: 'failed',
            runId: 'r2',
            startedAt: null,
            finishedAt: null,
          },
          {
            workItemId: '203',
            position: 1,
            state: 'queued',
            runId: null,
            startedAt: null,
            finishedAt: null,
          },
        ],
      }),
    );
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByText(/Task 202 failed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('offers no resume while the queue is running normally', () => {
    renderQueue(queue());
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
  });

  /** A Task the board has not loaded must still be identifiable. */
  it('falls back to the id when the Task is not on the board', () => {
    renderQueue(
      queue({
        items: [
          {
            workItemId: '999',
            position: 0,
            state: 'queued',
            runId: null,
            startedAt: null,
            finishedAt: null,
          },
        ],
      }),
    );
    expect(screen.getByText('Task 999')).toBeInTheDocument();
  });
});

/**
 * A Task waiting for work it depends on.
 *
 * The queue passes over it and starts later Tasks, so a reader watching it sit still while others
 * move has to be told why — and that it needs nothing from them. Saying only "Waiting" hides both.
 */
describe('a Task waiting on work it depends on', () => {
  const waitingQueue = {
    batchId: 'b1',
    status: 'active',
    haltedReason: null,
    items: [
      {
        workItemId: '812',
        position: 0,
        state: 'queued',
        runId: null,
        startedAt: null,
        finishedAt: null,
        note:
          'Task 812 is waiting for work that is not finished: #790 "Build the Settings page" ' +
          '(To Do). It will start on its own once that is Done.',
      },
    ],
  } as unknown as DevQueue;

  it('says which work item it is waiting for', () => {
    render(
      <DevelopmentQueue
        queue={waitingQueue}
        busy={false}
        onResume={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText(/#790/)).toBeInTheDocument();
    expect(screen.getByText(/Build the Settings page/)).toBeInTheDocument();
  });

  it('says it needs nothing from the reader', () => {
    render(
      <DevelopmentQueue
        queue={waitingQueue}
        busy={false}
        onResume={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText(/start on its own/i)).toBeInTheDocument();
  });

  /** An ordinary queued Task still reads as plain "Waiting". */
  it('leaves a Task with no note alone', () => {
    const plain = {
      ...waitingQueue,
      items: [{ ...waitingQueue.items[0], note: null }],
    } as unknown as DevQueue;
    render(<DevelopmentQueue queue={plain} busy={false} onResume={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });
});
