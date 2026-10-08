import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OverviewPage } from './OverviewPage';

const listProjects = vi.fn();
const listUsers = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    listProjects: () => listProjects(),
    listUsers: () => listUsers(),
  },
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { displayName: 'Ranjan Kishor', email: 'r@example.com' } }),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <OverviewPage />
    </MemoryRouter>,
  );

/**
 * The landing view.
 *
 * The rule this pins is the one about numbers: every figure on this page is read as fact, so it
 * shows only counts the API actually returned. A count that cannot be loaded — an endpoint this
 * user may not call, or a request that failed — is left out rather than rendered as a zero, which
 * would be a made-up figure wearing the same clothes as a real one.
 */
describe('OverviewPage', () => {
  beforeEach(() => {
    listProjects.mockReset().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    listUsers.mockReset().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }]);
  });

  it('greets the signed-in person by first name', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Ranjan.');
  });

  it('shows the real counts the API returned', async () => {
    renderPage();
    const projects = await screen.findByText('Projects', { selector: '.overview-stat-label' });
    expect(projects.closest('a')).toHaveTextContent('2');
    const members = screen.getByText('Team members', { selector: '.overview-stat-label' });
    expect(members.closest('a')).toHaveTextContent('3');
  });

  it('leaves out a count it could not load, rather than showing zero', async () => {
    listUsers.mockRejectedValue(new Error('forbidden'));
    renderPage();
    await screen.findByText('Projects', { selector: '.overview-stat-label' });
    expect(screen.queryByText('Team members')).not.toBeInTheDocument();
  });

  it('says so when no count is available at all', async () => {
    listProjects.mockRejectedValue(new Error('down'));
    listUsers.mockRejectedValue(new Error('down'));
    renderPage();
    expect(await screen.findByText(/Counts are unavailable/i)).toBeInTheDocument();
  });

  /** Every card is a route that exists — a dead link on the landing page is worse than no link. */
  it('points every destination at a real route', async () => {
    renderPage();
    await screen.findByText('Projects', { selector: '.overview-stat-label' });
    const hrefs = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
      .filter(Boolean);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(['/projects', '/users']).toContain(href);
    }
  });

  it('names the three stages the product promises', async () => {
    renderPage();
    expect(await screen.findByText('Plan with clarity')).toBeInTheDocument();
    expect(screen.getByText('Deliver with confidence')).toBeInTheDocument();
    expect(screen.getByText('Govern with control')).toBeInTheDocument();
  });

  /** The illustration carries no information, so it must not be announced. */
  it('hides the decorative artwork from assistive technology', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('.hero-art')).toBeTruthy());
    expect(container.querySelector('.hero-art')).toHaveAttribute('aria-hidden', 'true');
  });
});
