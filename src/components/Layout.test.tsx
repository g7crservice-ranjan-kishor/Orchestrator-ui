import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { api } from '../lib/api';

vi.mock('../features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { displayName: 'Administrator', email: 'admin@example.com' },
    logout: async () => undefined,
  }),
}));

/**
 * The shell's navigation.
 *
 * Reaching a project's planning page meant going to Projects, finding the row, opening it, and
 * only then navigating — every time, for every section. With a project open the sidebar carries
 * everything that project can do, and the workspace entries stay put so leaving is as easy as
 * arriving.
 */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<div>home</div>} />
          <Route path="/projects/:id/planning" element={<div>planning</div>} />
          <Route path="/projects/:id/board" element={<div>board</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Layout navigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'listProjects').mockResolvedValue([
      { id: 'p1', name: 'Employee Management System' },
    ] as unknown as Awaited<ReturnType<typeof api.listProjects>>);
  });

  it('shows only the workspace entries when no project is open', async () => {
    renderAt('/');
    expect(screen.getByRole('menuitem', { name: /overview/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /requirement intake/i })).not.toBeInTheDocument();
  });

  it('adds the project sections once a project is open', async () => {
    renderAt('/projects/p1/planning');
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: /requirement intake/i })).toBeInTheDocument(),
    );
    for (const label of [/planning/i, /development/i, /qa testing/i, /runs/i, /audit/i]) {
      expect(screen.getByRole('menuitem', { name: label })).toBeInTheDocument();
    }
  });

  /** Leaving has to be as easy as arriving. */
  it('keeps the workspace entries while a project is open', () => {
    renderAt('/projects/p1/planning');
    expect(screen.getByRole('menuitem', { name: /projects/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /overview/i })).toBeInTheDocument();
  });

  it('names the project it is showing', async () => {
    renderAt('/projects/p1/planning');
    await waitFor(() =>
      expect(screen.getAllByText('Employee Management System').length).toBeGreaterThan(0),
    );
  });

  /** The shell must still render if the project row cannot be read. */
  it('still renders when the project name cannot be loaded', async () => {
    vi.spyOn(api, 'listProjects').mockRejectedValue(new Error('down'));
    renderAt('/projects/p1/planning');
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: /planning/i })).toBeInTheDocument(),
    );
  });
});
