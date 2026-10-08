import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuditPage } from './AuditPage';
import { api } from '../../lib/api';
import type { AuditEntry } from '../../lib/types';

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

const manyEntries = (): AuditEntry[] =>
  Array.from({ length: 14 }, (_, i) =>
    entry({
      id: `e${i}`,
      entityId: String(700 + i),
      createdAt: new Date(Date.UTC(2026, 9, 1, 8, i)).toISOString(),
    }),
  );

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/audit']}>
      <Routes>
        <Route path="/projects/:id/audit" element={<AuditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AuditPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists entries with their action, type and a readable summary', async () => {
    vi.spyOn(api, 'listAudit').mockResolvedValue([entry()]);
    renderPage();

    expect(await screen.findByText('task.development.started')).toBeInTheDocument();
    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    expect(screen.getByText('To Do → In Progress')).toBeInTheDocument();
    expect(screen.getByText('Audit logs (1)')).toBeInTheDocument();
  });

  /** The tiles are counted from the same filtered list the rows come from. */
  it('counts the headline categories', async () => {
    vi.spyOn(api, 'listAudit').mockResolvedValue([
      entry({ id: '1', action: 'task.completed' }),
      entry({ id: '2', action: 'task.approved' }),
      entry({ id: '3', action: 'approval.draft.approved' }),
      entry({ id: '4', action: 'ado.push.completed' }),
    ]);
    renderPage();

    await screen.findByText('Audit logs (4)');
    const total = screen.getByText('Total logs').closest('.al-tile') as HTMLElement;
    const tasks = screen.getByText('Task events').closest('.al-tile') as HTMLElement;
    expect(within(total).getByText('4')).toBeInTheDocument();
    expect(within(tasks).getByText('2')).toBeInTheDocument();
  });

  it('opens an entry and shows its full context as JSON', async () => {
    vi.spyOn(api, 'listAudit').mockResolvedValue([
      entry({ metadata: { bulkOperationId: '180f8f76', succeeded: 1 } }),
    ]);
    renderPage();

    fireEvent.click(await screen.findByText('task.development.started'));

    const panel = await screen.findByLabelText('Log details');
    expect(within(panel).getByText(/180f8f76/)).toBeInTheDocument();
    expect(
      within(panel).getByText('Task development started — by admin@example.com'),
    ).toBeInTheDocument();
  });

  /** An entry that names a run is the thread back to what the agent actually did. */
  it('shows the run an entry points at', async () => {
    vi.spyOn(api, 'listAudit').mockResolvedValue([
      entry({
        action: 'task.completed',
        metadata: { runId: 'a627b053-049f-4f5b-84b7-23b23d386fd0', result: 'succeeded' },
      }),
    ]);
    renderPage();

    fireEvent.click(await screen.findByText('task.completed'));
    const panel = await screen.findByLabelText('Log details');

    expect(within(panel).getByText('Run ID')).toBeInTheDocument();
    expect(within(panel).getByText('a627b053-049f-4f5b-84b7-23b23d386fd0')).toBeInTheDocument();
  });

  it('leaves out the run row when the entry names none', async () => {
    vi.spyOn(api, 'listAudit').mockResolvedValue([entry()]);
    renderPage();

    fireEvent.click(await screen.findByText('task.development.started'));
    const panel = await screen.findByLabelText('Log details');

    expect(within(panel).queryByText('Run ID')).not.toBeInTheDocument();
  });

  it('closes the detail panel again', async () => {
    vi.spyOn(api, 'listAudit').mockResolvedValue([entry()]);
    renderPage();

    fireEvent.click(await screen.findByText('task.development.started'));
    fireEvent.click(await screen.findByLabelText('Close log details'));

    await waitFor(() => expect(screen.queryByLabelText('Log details')).not.toBeInTheDocument());
  });

  it('pages a long log ten at a time', async () => {
    vi.spyOn(api, 'listAudit').mockResolvedValue(manyEntries());
    renderPage();

    expect(await screen.findByText('Showing 1 to 10 of 14 logs')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('2'));
    expect(await screen.findByText('Showing 11 to 14 of 14 logs')).toBeInTheDocument();
  });

  /** The question is usually "what happened to 772?", and the answer is in the context. */
  it('searches the context as well as the columns', async () => {
    vi.spyOn(api, 'listAudit').mockResolvedValue([
      entry({ id: '1', metadata: { taskKey: 772 } }),
      entry({ id: '2', metadata: { taskKey: 999 } }),
    ]);
    renderPage();

    await screen.findByText('Audit logs (2)');
    fireEvent.change(screen.getByLabelText('Search the audit log'), { target: { value: '772' } });

    expect(await screen.findByText('Audit logs (1)')).toBeInTheDocument();
  });

  it('returns to the first page when a search narrows the log', async () => {
    vi.spyOn(api, 'listAudit').mockResolvedValue(manyEntries());
    renderPage();

    await screen.findByText('Showing 1 to 10 of 14 logs');
    fireEvent.click(screen.getByTitle('2'));
    await screen.findByText('Showing 11 to 14 of 14 logs');

    fireEvent.change(screen.getByLabelText('Search the audit log'), { target: { value: '705' } });

    expect(await screen.findByText('Showing 1 to 1 of 1 log')).toBeInTheDocument();
  });

  it('says when there is nothing recorded yet', async () => {
    vi.spyOn(api, 'listAudit').mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No audit entries yet.')).toBeInTheDocument();
  });

  it('reports a failure to load', async () => {
    vi.spyOn(api, 'listAudit').mockRejectedValue(new Error('offline'));
    renderPage();

    expect(await screen.findByText('Failed to load audit log.')).toBeInTheDocument();
  });

  it('refreshes on request', async () => {
    const list = vi.spyOn(api, 'listAudit').mockResolvedValue([entry()]);
    renderPage();

    await screen.findByText('task.development.started');
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(1));
  });
});
