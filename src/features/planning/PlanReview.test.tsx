import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PlanReview } from './PlanReview';
import type { Draft, RequiredSecret } from '../../lib/types';

/**
 * The plan-review screen: that the plan is presented as structure rather than a Markdown dump, and
 * that approval stays shut until the application's credentials have been supplied (D-029).
 */
const PLAN = `# Plan

## Objective

Deliver a task manager.

## Scope

### In scope

- Authentication

### Out of scope

- Mobile applications

## Phases

### Phase 1 — Authentication

Register and sign in.

- Story 1.1 — Registration endpoint
  - Acceptance criteria:
    - A duplicate email returns 409
`;

function draftWith(secrets: RequiredSecret[], overrides: Partial<Draft> = {}): Draft {
  return {
    id: 'draft-1',
    projectId: 'project-1',
    status: 'plan_ready',
    kind: 'initial',
    seq: 0,
    title: null,
    label: 'Initial plan',
    clarifications: [],
    requiredSecrets: secrets,
    technicalDetails: [],
    planMarkdown: PLAN,
    planIssues: [],
    runNote: null,
    planApproved: false,
    planFeedback: null,
    backlog: [],
    backlogApproved: false,
    approval: {
      approved: false,
      approvedBy: null,
      approvedAt: null,
      adoTargetConfirmed: false,
      confirmedTarget: null,
      confirmedBy: null,
      confirmedAt: null,
      pushedToAdo: false,
      pushedAt: null,
    },
    currentRunId: null,
    ...overrides,
  };
}

const secret = (name: string, provided: boolean): RequiredSecret => ({
  name,
  description: `Value for ${name}`,
  example: '',
  provided,
  providedAt: provided ? new Date().toISOString() : null,
});

function renderPlan(draft: Draft) {
  return render(
    <PlanReview
      projectId="project-1"
      draft={draft}
      busy={false}
      onAction={vi.fn()}
      onDraftChange={vi.fn()}
    />,
  );
}

describe('PlanReview', () => {
  it('presents the plan as sections rather than one block of Markdown', () => {
    renderPlan(draftWith([]));

    expect(screen.getByRole('navigation', { name: /plan sections/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scope' })).toBeInTheDocument();
    const scope = within(document.getElementById('plan-scope')!);
    expect(scope.getByText('In scope')).toBeInTheDocument();
    expect(scope.getByText('Authentication')).toBeInTheDocument();
    expect(scope.getByText('Mobile applications')).toBeInTheDocument();
    // The generated document is available, but not as the default presentation.
    expect(document.querySelector('.pv-raw-text')).toBeNull();
  });

  it('keeps the original document one click away', () => {
    renderPlan(draftWith([]));
    fireEvent.click(screen.getByRole('button', { name: /original plan document/i }));
    expect(document.querySelector('.pv-raw-text')?.textContent).toBe(PLAN);
  });

  it('reveals a story and its acceptance criteria when a phase is expanded', () => {
    renderPlan(draftWith([]));

    // The first phase opens by default; its story is a card, its criteria a checklist.
    fireEvent.click(screen.getByRole('button', { name: /Registration endpoint/i }));
    expect(screen.getByText('A duplicate email returns 409')).toBeInTheDocument();
    expect(screen.getByText(/acceptance criteria/i)).toBeInTheDocument();
  });

  describe('the credentials gate', () => {
    it('blocks approval and names what is missing', () => {
      renderPlan(draftWith([secret('DATABASE_URL', false), secret('JWT_SECRET', true)]));

      for (const button of screen.getAllByRole('button', { name: /proceed \(approve plan\)/i })) {
        expect(button).toBeDisabled();
      }
      expect(screen.getByText(/1 credential needed/i)).toBeInTheDocument();
      expect(screen.getByText(/before this plan can be approved/i).textContent).toContain(
        'DATABASE_URL',
      );
    });

    it('collects the values in the plan itself', () => {
      renderPlan(draftWith([secret('DATABASE_URL', false)]));

      const section = document.getElementById('plan-credentials')!;
      expect(within(section).getByLabelText('Value for DATABASE_URL')).toHaveAttribute(
        'type',
        'password',
      );
      expect(within(section).getByText('Not set')).toBeInTheDocument();
    });

    /** The agent writes its descriptions in Markdown; backticks must not reach the screen. */
    it('renders the markdown in a credential description and example', () => {
      renderPlan(
        draftWith([
          {
            name: 'DATABASE_URL',
            description: 'connection string for the `taskmanager-api` application database',
            example: '`postgres://user:pass@host:5432/taskmanager`',
            provided: false,
            providedAt: null,
          },
        ]),
      );

      const section = within(document.getElementById('plan-credentials')!);
      expect(section.getByText('taskmanager-api').tagName).toBe('CODE');
      expect(section.getByText('postgres://user:pass@host:5432/taskmanager').tagName).toBe('CODE');
      expect(document.getElementById('plan-credentials')!.textContent).not.toContain('`');
    });

    it('allows approval once every credential is provided', () => {
      renderPlan(draftWith([secret('DATABASE_URL', true)]));

      for (const button of screen.getAllByRole('button', { name: /proceed \(approve plan\)/i })) {
        expect(button).toBeEnabled();
      }
      expect(screen.getByText(/ready for review/i)).toBeInTheDocument();
      expect(screen.queryByText(/before this plan can be approved/i)).toBeNull();
    });

    it('offers no approval action at all once the plan is approved', () => {
      renderPlan(draftWith([], { planApproved: true }));

      expect(screen.queryByRole('button', { name: /proceed \(approve plan\)/i })).toBeNull();
      expect(screen.getByText(/this plan is approved/i)).toBeInTheDocument();
    });
  });
});
