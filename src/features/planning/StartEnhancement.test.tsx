import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StartEnhancement } from './StartEnhancement';
import { api, ApiError } from '../../lib/api';
import type { Draft } from '../../lib/types';

/**
 * The way to add to a product that is already built.
 *
 * The alternative — pressing "Start EM planning" again — replaces the backlog and throws away the
 * link to every work item in Azure DevOps. The backend refuses it outright, so this is the thing a
 * person is meant to do instead, and it has to be visible exactly when it applies and invisible
 * when it does not: a button that can only fail is worse than no button.
 */

const draft = (over: Partial<Draft> = {}): Draft =>
  ({
    id: 'd1',
    projectId: 'p1',
    status: 'approved',
    kind: 'initial',
    seq: 0,
    title: null,
    label: 'Initial plan',
    clarifications: [],
    requiredSecrets: [],
    planMarkdown: '## Plan',
    planApproved: true,
    planFeedback: null,
    planIssues: [],
    runNote: null,
    backlog: [],
    backlogApproved: true,
    approval: { pushedToAdo: true },
    currentRunId: null,
    ...over,
  }) as unknown as Draft;

const renderPanel = (over: Partial<Draft> = {}, onStarted = vi.fn()) =>
  render(<StartEnhancement projectId="p1" draft={draft(over)} onStarted={onStarted} />);

describe('StartEnhancement', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('offers to add to a product that is built and settled', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /add enhancement/i })).toBeInTheDocument();
  });

  /** Nothing in Azure DevOps means nothing to enhance — the plan itself is what should change. */
  it('says nothing on a product that has never been pushed', () => {
    const { container } = renderPanel({ approval: { pushedToAdo: false } } as Partial<Draft>);
    expect(container).toBeEmptyDOMElement();
  });

  /** One planning cycle at a time; the backend refuses a second, so it is not offered. */
  it('says nothing while a plan is still being worked on', () => {
    const { container } = renderPanel({ status: 'backlogDrafted' });
    expect(container).toBeEmptyDOMElement();
  });

  it('promises not to disturb what is already there', () => {
    renderPanel();
    expect(
      screen.getByText(/Nothing already in Azure DevOps is changed or removed/i),
    ).toBeInTheDocument();
  });

  it('starts one and hands back the new plan', async () => {
    const started = draft({ kind: 'enhancement', seq: 1, label: 'ENH-001 — Implement Dark Mode' });
    const create = vi.spyOn(api, 'startEnhancement').mockResolvedValue(started);
    const onStarted = vi.fn();
    renderPanel({}, onStarted);

    fireEvent.click(screen.getByRole('button', { name: /add enhancement/i }));
    fireEvent.change(await screen.findByLabelText(/what is it called/i), {
      target: { value: 'Implement Dark Mode' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start planning/i }));

    // The anchor goes with it: an enhancement's sprints are numbered from the sprint the project
    // is actually in, not from Sprint 1, which is how ENH-001's work landed in sprints 4–6 while
    // the board showed it as Sprint 1. 'current' is the default nobody has to think about.
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith('p1', {
        title: 'Implement Dark Mode',
        sprintAnchor: 'current',
      }),
    );
    expect(onStarted).toHaveBeenCalledWith(started);
  });

  it('will not start one without a name', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /add enhancement/i }));
    expect(await screen.findByRole('button', { name: /start planning/i })).toBeDisabled();
  });

  /** The backend's refusals are the useful ones — they say what to do instead. */
  it('shows the reason the backend gave', async () => {
    vi.spyOn(api, 'startEnhancement').mockRejectedValue(
      new ApiError(400, 'ENH-001 — Implement Dark Mode is still being planned (planning).'),
    );
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /add enhancement/i }));
    fireEvent.change(await screen.findByLabelText(/what is it called/i), {
      target: { value: 'Export to CSV' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start planning/i }));

    expect(await screen.findByText(/still being planned/i)).toBeInTheDocument();
  });

  /** The detail goes in as a requirement; without saying so the title is all anyone would write. */
  it('says where the detail goes', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /add enhancement/i }));
    expect(await screen.findByText(/Requirement Intake/i)).toBeInTheDocument();
  });
});
