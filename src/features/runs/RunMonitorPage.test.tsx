import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RunMonitorPage } from './RunMonitorPage';
import { api } from '../../lib/api';
import type { Run, RunResult } from '../../lib/types';

const result = (over: Partial<RunResult> = {}): RunResult => ({
  durationMs: 151_000,
  tokens: 137_925,
  cost: 0.84,
  logsRef: null,
  filesChanged: 9,
  commits: ['c98486b5aabbcc'],
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

/** Fourteen runs, as in the list the page was designed against. */
const manyRuns = (): Run[] =>
  Array.from({ length: 14 }, (_, i) =>
    run({
      runId: `${String(i).padStart(4, '0')}abcd-1e2b-4b6f-9a10-5c8d7f3e9a12`,
      workItemId: String(700 + i),
      createdAt: new Date(Date.UTC(2026, 9, 1, 8, i)).toISOString(),
    }),
  );

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/runs']}>
      <Routes>
        <Route path="/projects/:id/runs" element={<RunMonitorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RunMonitorPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists the runs with their state and duration', async () => {
    vi.spyOn(api, 'listRuns').mockResolvedValue([run()]);
    renderPage();

    expect(await screen.findByText('3ae6c15e')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('2m 31s')).toBeInTheDocument();
    expect(screen.getByText('Runs (1)')).toBeInTheDocument();
  });

  it('opens a run and shows what it cost', async () => {
    vi.spyOn(api, 'listRuns').mockResolvedValue([run()]);
    renderPage();

    fireEvent.click(await screen.findByText('3ae6c15e'));

    const panel = await screen.findByLabelText('Run details');
    expect(within(panel).getByText('$0.84')).toBeInTheDocument();
    expect(within(panel).getByText((137_925).toLocaleString())).toBeInTheDocument();
    expect(within(panel).getByText('/workspace/repo')).toBeInTheDocument();
    expect(within(panel).getByText('c98486b5')).toBeInTheDocument();
  });

  it('closes the detail panel again', async () => {
    vi.spyOn(api, 'listRuns').mockResolvedValue([run()]);
    renderPage();

    fireEvent.click(await screen.findByText('3ae6c15e'));
    fireEvent.click(await screen.findByLabelText('Close run details'));

    await waitFor(() => expect(screen.queryByLabelText('Run details')).not.toBeInTheDocument());
  });

  /** The activity list is built from what is stored, and says so while a run is still going. */
  it('shows the run still in progress as pending', async () => {
    vi.spyOn(api, 'listRuns').mockResolvedValue([
      run({ state: 'Running', result: null, runId: 'live1234-0000' }),
    ]);
    renderPage();

    fireEvent.click(await screen.findByText('live1234'));
    const panel = await screen.findByLabelText('Run details');

    // The state appears in the panel header, in the fact list and as the pending activity step.
    expect(within(panel).getAllByText('Running…').length).toBeGreaterThan(0);
    expect(within(panel).getByText('Run started')).toBeInTheDocument();
    expect(within(panel).getByText(/is not stored/)).toBeInTheDocument();
  });

  it('pages a long list ten at a time', async () => {
    vi.spyOn(api, 'listRuns').mockResolvedValue(manyRuns());
    renderPage();

    expect(await screen.findByText('Showing 1 to 10 of 14 runs')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('2'));
    expect(await screen.findByText('Showing 11 to 14 of 14 runs')).toBeInTheDocument();
  });

  /** A search that shrinks the list must not leave the reader on a page that no longer exists. */
  it('returns to the first page when the search narrows the list', async () => {
    vi.spyOn(api, 'listRuns').mockResolvedValue(manyRuns());
    renderPage();

    await screen.findByText('Showing 1 to 10 of 14 runs');
    fireEvent.click(screen.getByTitle('2'));
    await screen.findByText('Showing 11 to 14 of 14 runs');

    fireEvent.change(screen.getByLabelText('Search runs'), { target: { value: '0001abcd' } });

    expect(await screen.findByText('Showing 1 to 1 of 1 run')).toBeInTheDocument();
  });

  /** Runs are looked for by the Task they were started for far more often than by their id. */
  it('finds a run by its work item', async () => {
    vi.spyOn(api, 'listRuns').mockResolvedValue(manyRuns());
    renderPage();

    await screen.findByText('Showing 1 to 10 of 14 runs');
    fireEvent.change(screen.getByLabelText('Search runs'), { target: { value: '705' } });

    expect(await screen.findByText('Showing 1 to 1 of 1 run')).toBeInTheDocument();
    expect(screen.getByText('0005abcd')).toBeInTheDocument();
  });

  it('says when there are no runs at all', async () => {
    vi.spyOn(api, 'listRuns').mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No runs yet.')).toBeInTheDocument();
  });

  it('reports a failure to load', async () => {
    vi.spyOn(api, 'listRuns').mockRejectedValue(new Error('offline'));
    renderPage();

    expect(await screen.findByText('Failed to load runs.')).toBeInTheDocument();
  });

  /** A run is the only thing on screen that changes without the reader doing anything. */
  it('polls every three seconds while a run is active', async () => {
    const list = vi
      .spyOn(api, 'listRuns')
      .mockResolvedValue([run({ state: 'Running', result: null })]);
    renderPage();

    await screen.findByText('3ae6c15e');
    const before = list.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3100);

    expect(list.mock.calls.length).toBeGreaterThan(before);
  });

  it('refreshes on request', async () => {
    const list = vi.spyOn(api, 'listRuns').mockResolvedValue([run()]);
    renderPage();

    await screen.findByText('3ae6c15e');
    const before = list.mock.calls.length;
    fireEvent.click(screen.getByLabelText('Refresh runs'));

    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(before));
  });
});
