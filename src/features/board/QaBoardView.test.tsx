import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QaBoardView } from './QaBoardView';
import type { QaBoard, QaStory } from '../../lib/types';

const getQaBoard = vi.fn();
const startQa = vi.fn();
const getQaQueue = vi.fn();
const queueQa = vi.fn();

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      getQaBoard: (...a: unknown[]) => getQaBoard(...a),
      startQa: (...a: unknown[]) => startQa(...a),
      getQaQueue: (...a: unknown[]) => getQaQueue(...a),
      queueQa: (...a: unknown[]) => queueQa(...a),
    },
  };
});

const story = (over: Partial<QaStory> = {}): QaStory =>
  ({
    adoId: 413,
    title: 'Initialize Express + TypeScript project structure',
    description: '',
    state: 'Done',
    status: 'Ready for QA',
    feature: null,
    epic: null,
    sprint: 'Sprint 1',
    developer: null,
    tasksTotal: 2,
    tasksDone: 2,
    openBugs: 0,
    bugs: [],
    qaVerified: false,
    updatedAt: null,
    execution: null,
    qaRunning: false,
    canStart: { allowed: true },
    ...over,
  }) as QaStory;

const board = (stories: QaStory[]): QaBoard => ({ stories }) as QaBoard;

/**
 * What the board does when the API refuses to start a QA run.
 *
 * The incident: a QA wave was refused for every Story — "no target repository resolvable for the
 * work item" — and the board showed nothing. The reason *was* rendered, but only as a banner above
 * the columns, so a Start pressed on a card further down reported itself off-screen. It read as a
 * button that did nothing, and the real cause took half an hour to find in the database. A refusal
 * belongs on the card the person clicked.
 */
describe('QaBoardView refusals', () => {
  beforeEach(() => {
    getQaBoard.mockReset().mockResolvedValue(board([story()]));
    startQa.mockReset();
    getQaQueue.mockReset().mockResolvedValue({
      batchId: '',
      status: 'finished',
      haltedReason: null,
      items: [],
    });
    queueQa.mockReset();
  });

  it('shows the API reason on the card that was clicked', async () => {
    startQa.mockResolvedValue({
      dispatchedCount: 0,
      dispatched: [],
      deferred: [],
      skippedActive: [],
      ineligible: [{ workItemId: '413', reason: 'no target repository resolvable' }],
    });

    render(<QaBoardView projectId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start testing' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('no target repository resolvable');
    // On the card, not in the board-wide banner above the columns.
    expect(alert.closest('.qa-story-card')).not.toBeNull();
  });

  it('says something even when the API gives no reason at all', async () => {
    startQa.mockResolvedValue({
      dispatchedCount: 0,
      dispatched: [],
      deferred: [],
      skippedActive: [],
      ineligible: [],
    });

    render(<QaBoardView projectId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start testing' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not start testing/);
  });

  it('stays quiet when the run actually starts', async () => {
    startQa.mockResolvedValue({
      dispatchedCount: 1,
      dispatched: [{ runId: 'r1', workItemId: '413', title: 'x', kind: 'story' }],
      deferred: [],
      skippedActive: [],
      ineligible: [],
    });

    render(<QaBoardView projectId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start testing' }));

    await waitFor(() => expect(startQa).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  /** A failure to load the board is not about one card, so it keeps the banner. */
  it('keeps a board-wide failure above the columns', async () => {
    getQaBoard.mockRejectedValue(new Error('down'));
    render(<QaBoardView projectId="p1" />);

    const alert = await screen.findByRole('alert');
    expect(alert.closest('.qa-story-card')).toBeNull();
  });
});

/**
 * Selecting several Stories queues them in one request.
 *
 * Sending one request per Story would dispatch the first and have the concurrency cap refuse the
 * rest into a `deferred` list nothing reads — the exact behaviour the queue exists to replace. So
 * the test that matters is the shape of the call, not just that something happened.
 */
describe('QaBoardView batch selection', () => {
  beforeEach(() => {
    getQaBoard.mockReset().mockResolvedValue(
      board([
        story({ adoId: 413, title: 'Login endpoint' }),
        story({ adoId: 414, title: 'User data model' }),
        story({
          adoId: 415,
          title: 'Already testing',
          canStart: { allowed: false, reason: 'x' },
        }),
      ]),
    );
    getQaQueue.mockReset().mockResolvedValue({
      batchId: '',
      status: 'finished',
      haltedReason: null,
      items: [],
    });
    queueQa.mockReset().mockResolvedValue({
      batchId: 'b1',
      status: 'active',
      haltedReason: null,
      items: [
        {
          workItemId: '413',
          position: 0,
          state: 'running',
          runId: 'r1',
          startedAt: null,
          finishedAt: null,
        },
        {
          workItemId: '414',
          position: 1,
          state: 'queued',
          runId: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
    });
    startQa.mockReset();
  });

  it('queues every selected Story in a single request', async () => {
    render(<QaBoardView projectId="p1" />);
    fireEvent.click(await screen.findByRole('checkbox', { name: /Select Login endpoint/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select User data model/ }));
    fireEvent.click(screen.getByRole('button', { name: /Start testing →/ }));

    await waitFor(() => expect(queueQa).toHaveBeenCalledTimes(1));
    expect(queueQa).toHaveBeenCalledWith('p1', ['413', '414']);
  });

  /** A Story that cannot start must not be selectable, or the batch would halt on it. */
  it('offers no checkbox for a Story that cannot start', async () => {
    render(<QaBoardView projectId="p1" />);
    await screen.findByRole('checkbox', { name: /Select Login endpoint/ });
    expect(screen.queryByRole('checkbox', { name: /Select Already testing/ })).toBeNull();
  });

  it('selects every startable Story in a column at once', async () => {
    render(<QaBoardView projectId="p1" />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Select all' }))[0]);
    // The count is split across elements (<strong>2</strong> Stories selected), so read the bar.
    const bar = await screen.findByRole('region', { name: 'Bulk QA actions' });
    expect(bar.textContent).toContain('2');
    expect(bar.textContent).toContain('Stories selected');
  });

  it('shows the queue the backend reports, with what is running and what waits', async () => {
    getQaQueue.mockResolvedValue({
      batchId: 'b1',
      status: 'active',
      haltedReason: null,
      items: [
        {
          workItemId: '413',
          position: 0,
          state: 'running',
          runId: 'r1',
          startedAt: null,
          finishedAt: null,
        },
        {
          workItemId: '414',
          position: 1,
          state: 'queued',
          runId: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
    });
    render(<QaBoardView projectId="p1" />);

    expect(await screen.findByRole('heading', { name: 'QA queue' })).toBeInTheDocument();
    expect(screen.getByText('Currently running')).toBeInTheDocument();
    expect(screen.getByText('Queued')).toBeInTheDocument();
  });

  it('surfaces why a failure paused the batch, and offers to resume', async () => {
    getQaQueue.mockResolvedValue({
      batchId: 'b1',
      status: 'halted',
      haltedReason: 'Story 413 could not be tested. The queue is paused.',
      items: [
        {
          workItemId: '413',
          position: 0,
          state: 'failed',
          runId: 'r1',
          startedAt: null,
          finishedAt: null,
        },
        {
          workItemId: '414',
          position: 1,
          state: 'queued',
          runId: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
    });
    render(<QaBoardView projectId="p1" />);

    expect(await screen.findByText(/could not be tested/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });
});
