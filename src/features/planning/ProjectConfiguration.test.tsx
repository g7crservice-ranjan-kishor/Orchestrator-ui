import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProjectConfiguration } from './ProjectConfiguration';
import { api } from '../../lib/api';
import type { Draft, ProjectConfiguration as Config } from '../../lib/types';

/**
 * The questions only the plan can answer.
 *
 * Asking for the database and the repositories on the create form meant asking before anyone knew
 * whether the product stored anything — which is how a project ended up configured for a database
 * it never used. This panel exists to ask afterwards, so what it shows, and when it stays quiet,
 * is the whole of its behaviour.
 */
const config = (over: Partial<Config> = {}): Config => ({
  planReady: true,
  needsDatabase: true,
  databaseEvidence: 'Expenses are persisted in a database.',
  repositories: ['expense-api', 'expense-ui'],
  serverless: false,
  uiStyle: null,
  database: 'unset',
  databaseConfigured: false,
  configuredRepositories: [],
  currentUiStyle: 'antd',
  ...over,
});

const draft = { planMarkdown: '## Architecture' } as Draft;

function renderPanel() {
  return render(
    <ProjectConfiguration projectId="p1" draft={draft} onDraftChange={() => undefined} />,
  );
}

describe('ProjectConfiguration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('asks for the database the plan implies', async () => {
    vi.spyOn(api, 'getProjectConfiguration').mockResolvedValue(config());
    renderPanel();
    expect(await screen.findByText('Database')).toBeInTheDocument();
  });

  /** Someone answering has to see why they are being asked, in the plan's own words. */
  it("quotes the plan's own line as the reason", async () => {
    vi.spyOn(api, 'getProjectConfiguration').mockResolvedValue(config());
    renderPanel();
    expect(await screen.findByText(/Expenses are persisted in a database\./)).toBeInTheDocument();
  });

  it('suggests the repository names the plan implies', async () => {
    vi.spyOn(api, 'getProjectConfiguration').mockResolvedValue(config());
    renderPanel();
    await waitFor(() =>
      expect(screen.getByDisplayValue('expense-api, expense-ui')).toBeInTheDocument(),
    );
  });

  /** Nothing outstanding means nothing to show — an empty card is noise on a long page. */
  it('stays out of the way once everything is configured', async () => {
    vi.spyOn(api, 'getProjectConfiguration').mockResolvedValue(
      config({ databaseConfigured: true, configuredRepositories: ['https://x/_git/api'] }),
    );
    const { container } = renderPanel();
    await waitFor(() => expect(api.getProjectConfiguration).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing before a plan exists', () => {
    const get = vi.spyOn(api, 'getProjectConfiguration');
    render(
      <ProjectConfiguration
        projectId="p1"
        draft={{ planMarkdown: null } as Draft}
        onDraftChange={() => undefined}
      />,
    );
    expect(get).not.toHaveBeenCalled();
  });

  /**
   * A product that stores nothing must not be told it needs a database — but saying why is worth
   * more than saying nothing, because a wrong reading of the plan is only noticed if it is shown.
   */
  it('explains why no database is needed, rather than going quiet', async () => {
    vi.spyOn(api, 'getProjectConfiguration').mockResolvedValue(
      config({ needsDatabase: false, serverless: true, databaseEvidence: null }),
    );
    renderPanel();
    expect(await screen.findByText(/keeps nothing on a server/i)).toBeInTheDocument();
  });

  /** It must still be possible to overrule a misread plan. */
  it('still lets a database be chosen when the plan says none is needed', async () => {
    vi.spyOn(api, 'getProjectConfiguration').mockResolvedValue(
      config({ needsDatabase: false, serverless: true, databaseEvidence: null }),
    );
    renderPanel();
    await screen.findByText(/keeps nothing on a server/i);
    expect(screen.getByText('Database')).toBeInTheDocument();
  });

  /**
   * Changing the database after planning makes the plan wrong — it was written against a different
   * one. Saying so, and offering the fix here, is the point of asking at this moment at all.
   */
  it('offers to regenerate a plan the new database invalidates', async () => {
    vi.spyOn(api, 'getProjectConfiguration').mockResolvedValue(config());
    vi.spyOn(api, 'applyProjectConfiguration').mockResolvedValue({
      id: 'p1',
      replanNeeded: true,
    } as Awaited<ReturnType<typeof api.applyProjectConfiguration>>);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /apply configuration/i }));
    expect(await screen.findByRole('button', { name: /regenerate the plan/i })).toBeInTheDocument();
  });

  it('sends the repository names as names, not URLs', async () => {
    vi.spyOn(api, 'getProjectConfiguration').mockResolvedValue(config());
    const apply = vi.spyOn(api, 'applyProjectConfiguration').mockResolvedValue({
      id: 'p1',
      replanNeeded: false,
    } as Awaited<ReturnType<typeof api.applyProjectConfiguration>>);
    renderPanel();

    await waitFor(() => expect(screen.getByDisplayValue('expense-api, expense-ui')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /apply configuration/i }));
    expect(apply).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ repositories: ['expense-api', 'expense-ui'] }),
    );
  });

  it('says so when the configuration cannot be read', async () => {
    vi.spyOn(api, 'getProjectConfiguration').mockRejectedValue(new Error('down'));
    renderPanel();
    expect(await screen.findByText(/could not read the configuration/i)).toBeInTheDocument();
  });
  /**
   * A requirement that asks for Material UI has to produce a product built with it. Choosing a
   * framework on a form before anyone had read the requirement is how that gets contradicted.
   */
  it('uses the framework the plan names, over whatever the project was set to', async () => {
    vi.spyOn(api, 'getProjectConfiguration').mockResolvedValue(
      config({ uiStyle: 'mui', currentUiStyle: 'antd' }),
    );
    const apply = vi.spyOn(api, 'applyProjectConfiguration').mockResolvedValue({
      id: 'p1',
      replanNeeded: false,
    } as Awaited<ReturnType<typeof api.applyProjectConfiguration>>);
    renderPanel();

    await screen.findByText('User interface');
    fireEvent.click(screen.getByRole('button', { name: /apply configuration/i }));
    await waitFor(() =>
      expect(apply).toHaveBeenCalledWith('p1', expect.objectContaining({ uiStyle: 'mui' })),
    );
  });

  it("keeps the project's framework when the plan names none", async () => {
    vi.spyOn(api, 'getProjectConfiguration').mockResolvedValue(
      config({ uiStyle: null, currentUiStyle: 'tailwind' }),
    );
    const apply = vi.spyOn(api, 'applyProjectConfiguration').mockResolvedValue({
      id: 'p1',
      replanNeeded: false,
    } as Awaited<ReturnType<typeof api.applyProjectConfiguration>>);
    renderPanel();

    await screen.findByText('User interface');
    fireEvent.click(screen.getByRole('button', { name: /apply configuration/i }));
    await waitFor(() =>
      expect(apply).toHaveBeenCalledWith('p1', expect.objectContaining({ uiStyle: 'tailwind' })),
    );
  });
});
