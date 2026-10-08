import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NewProjectModal } from './NewProjectModal';
import { api } from '../../lib/api';
import type { Preflight } from '../../lib/types';

/**
 * Creating a project.
 *
 * Two things matter here. The token is checked against Azure DevOps before anything is stored, so
 * a wrong or expired one is caught while someone is still looking at the form rather than as a 401
 * inside a pod hours later. And the database and repositories are *not* asked for: until a plan
 * exists nobody knows whether the product needs them, which is how a project ended up configured
 * for a database it never used.
 */
const preflight = (over: Partial<Preflight> = {}): Preflight => ({
  ok: true,
  problem: null,
  projects: ['Proj'],
  areaPaths: ['Proj', 'Proj\\Team A'],
  repositories: [],
  canCreateProjects: true,
  processProblem: null,
  ...over,
});

function renderModal() {
  return render(<NewProjectModal open onClose={() => undefined} onCreated={() => undefined} />);
}

const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

/**
 * Opens the project dropdown and chooses an option, the way someone using it would.
 *
 * Addressed by id: Ant Design renders the label beside its own hidden input rather than the
 * combobox, so the accessible name is not the field's own.
 */
const useExistingProject = () =>
  fireEvent.click(screen.getByRole('radio', { name: /use an existing one/i }));

async function pickProject(name: string) {
  fireEvent.mouseDown(document.getElementById('ado-project') as HTMLElement);
  fireEvent.click(await screen.findByTitle(name));
}

describe('NewProjectModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('asks for the organization, a token and where the work items go', () => {
    renderModal();
    useExistingProject();
    expect(screen.getByLabelText(/organization url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/personal access token/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/area path/i)).toBeInTheDocument();
  });

  /**
   * These belong after planning now — asking here is what this change exists to stop. Asserted on
   * the labels themselves: the dialog does mention a database, in the note explaining that it will
   * be asked for later, and that sentence is the opposite of a field.
   */
  it('has no field for a database or repositories', () => {
    renderModal();
    const labels = screen.queryAllByText(/database|repositor/i, { selector: 'label' });
    expect(labels).toEqual([]);
  });

  it('says plainly that those come after planning', () => {
    renderModal();
    expect(screen.getByText(/after planning/i)).toBeInTheDocument();
  });

  it('says why the token is needed and what it must be allowed to do', () => {
    renderModal();
    expect(screen.getByText(/Work Items \(read & write\)/)).toBeInTheDocument();
  });

  /** A token that does not work must be reported here, not discovered inside a pod. */
  it('reports a token that did not work, in the words the server used', async () => {
    vi.spyOn(api, 'preflightAdo').mockResolvedValue(
      preflight({ ok: false, problem: 'That token could not read the organization.' }),
    );
    renderModal();
    type(/organization url/i, 'https://dev.azure.com/org');
    type(/personal access token/i, 'bad-token');
    fireEvent.click(screen.getByRole('button', { name: /check/i }));

    expect(
      await screen.findByText(/that token could not read the organization/i),
    ).toBeInTheDocument();
  });

  it('cannot create a project on a token nobody checked', () => {
    renderModal();
    type(/^project name$/i, 'Expense Tracker');
    type(/organization url/i, 'https://dev.azure.com/org');
    type(/personal access token/i, 'token');
    expect(screen.getByRole('button', { name: /create project/i })).toBeDisabled();
  });

  it('lists the projects the token can see once it is checked', async () => {
    vi.spyOn(api, 'preflightAdo').mockResolvedValue(preflight());
    renderModal();
    useExistingProject();
    type(/organization url/i, 'https://dev.azure.com/org');
    type(/personal access token/i, 'token');
    fireEvent.click(screen.getByRole('button', { name: /check/i }));

    expect(await screen.findByText(/1 project\(s\) available/i)).toBeInTheDocument();
  });

  /** Editing the organization or the token makes the previous answer meaningless. */
  it('drops the check when what it was about changes', async () => {
    vi.spyOn(api, 'preflightAdo').mockResolvedValue(preflight());
    renderModal();
    useExistingProject();
    type(/organization url/i, 'https://dev.azure.com/org');
    type(/personal access token/i, 'token');
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    await screen.findByText(/project\(s\) available/i);

    type(/organization url/i, 'https://dev.azure.com/other');
    await waitFor(() =>
      expect(screen.queryByText(/project\(s\) available/i)).not.toBeInTheDocument(),
    );
  });

  /**
   * The project is created even when its area path could not be. Losing the project over a step
   * that can simply be retried would help nobody — but staying silent about it would not either.
   */
  it('keeps the dialog open and says so when setup was incomplete', async () => {
    vi.spyOn(api, 'preflightAdo').mockResolvedValue(preflight());
    vi.spyOn(api, 'createProvisionedProject').mockResolvedValue({
      id: 'p1',
      warnings: ["The area path 'Proj\\Team A' could not be created: 403"],
    } as Awaited<ReturnType<typeof api.createProvisionedProject>>);

    renderModal();
    useExistingProject();
    type(/^project name$/i, 'Expense Tracker');
    type(/organization url/i, 'https://dev.azure.com/org');
    type(/personal access token/i, 'token');
    type(/area path/i, 'Proj\\Team A');
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    await screen.findByText(/project\(s\) available/i);

    await pickProject('Proj');
    await screen.findByText(/is available with/i);

    fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    expect(await screen.findByText(/not everything could be set up/i)).toBeInTheDocument();
  });

  /** Picking a project re-checks by itself; pressing Check twice for one answer is not a flow. */
  it('lists the area paths of a project as soon as it is picked', async () => {
    const check = vi.spyOn(api, 'preflightAdo').mockResolvedValue(preflight());
    renderModal();
    useExistingProject();
    type(/organization url/i, 'https://dev.azure.com/org');
    type(/personal access token/i, 'token');
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    await screen.findByText(/project\(s\) available/i);

    await pickProject('Proj');
    await waitFor(() =>
      expect(check).toHaveBeenLastCalledWith(expect.objectContaining({ project: 'Proj' })),
    );
  });
});

/**
 * A product gets its own Azure DevOps project.
 *
 * Area paths separate work items, but iterations do not follow them: two products in one Azure
 * DevOps project share a single sprint timeline, so the second inherits the first one's active
 * sprint and completing a sprint on one board moves the other's. Creating the project is therefore
 * the default, not the exception.
 */
describe('NewProjectModal creating the Azure DevOps project', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('offers to create one by default', () => {
    renderModal();
    expect(screen.getByRole('radio', { name: /create a new one/i })).toBeChecked();
  });

  it('asks for a name rather than a list to pick from', () => {
    renderModal();
    expect(screen.getByLabelText(/new project name/i)).toBeInTheDocument();
  });

  /** With a project to itself there is nothing to separate the work from. */
  it('does not ask for an area path', () => {
    renderModal();
    const areaPath = screen.getByLabelText(/area path/i, { selector: 'input' });
    expect(areaPath).toBeDisabled();
  });

  it('says why a product gets its own project', () => {
    renderModal();
    expect(screen.getByText(/share a single sprint timeline/i)).toBeInTheDocument();
  });

  it('asks the server to create it, with the area path at the project root', async () => {
    vi.spyOn(api, 'preflightAdo').mockResolvedValue(preflight());
    const create = vi.spyOn(api, 'createProvisionedProject').mockResolvedValue({
      id: 'p1',
      warnings: [],
    } as unknown as Awaited<ReturnType<typeof api.createProvisionedProject>>);

    renderModal();
    type(/^project name$/i, 'Employee Management System');
    type(/organization url/i, 'https://dev.azure.com/org');
    type(/personal access token/i, 'token');
    type(/new project name/i, 'Employee Management System');
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    await screen.findByText(/a new one will be created/i);

    fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          createAdoProject: true,
          adoTarget: expect.objectContaining({
            project: 'Employee Management System',
            areaPath: 'Employee Management System',
          }),
        }),
      ),
    );
  });

  /** A token that cannot create one should say so while the form is still open. */
  it('warns when the organization offers no Scrum process', async () => {
    vi.spyOn(api, 'preflightAdo').mockResolvedValue(
      preflight({
        canCreateProjects: false,
        processProblem: 'This organization offers no Scrum process (it has: Agile).',
      }),
    );
    renderModal();
    type(/organization url/i, 'https://dev.azure.com/org');
    type(/personal access token/i, 'token');
    fireEvent.click(screen.getByRole('button', { name: /check/i }));

    expect(await screen.findByText(/offers no scrum process/i)).toBeInTheDocument();
  });
});
