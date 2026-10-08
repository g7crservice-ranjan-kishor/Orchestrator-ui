import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlanningStatus } from './PlanningStatus';
import { statusTone } from './status-tone';
import type { Draft } from '../../lib/types';

/**
 * The planning header. The dot's colour and its pulse are the only things on the page that say
 * "an agent is working right now", so the mapping behind them is worth pinning down.
 */
describe('statusTone', () => {
  it('treats a run in flight as running', () => {
    expect(statusTone('planning')).toBe('running');
    expect(statusTone('backlogDrafting')).toBe('running');
  });

  it('treats anything needing a person as waiting', () => {
    for (const status of ['clarifying', 'planned', 'backlogDrafted']) {
      expect(statusTone(status)).toBe('waiting');
    }
  });

  it('treats approval as done, and an unstarted draft as idle', () => {
    expect(statusTone('approved')).toBe('done');
    expect(statusTone('intake')).toBe('idle');
  });

  /** A status this build has never heard of must not be coloured as finished. */
  it('falls back to idle for an unknown status', () => {
    expect(statusTone('something-new')).toBe('idle');
  });
});

function draftWith(status: string): Draft {
  return {
    id: 'd',
    projectId: 'p',
    status,
    kind: 'initial',
    seq: 0,
    title: null,
    label: 'Initial plan',
    clarifications: [],
    requiredSecrets: [],
    technicalDetails: [],
    planMarkdown: null,
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
  };
}

function renderStatus(status: string) {
  return render(
    <PlanningStatus
      draft={draftWith(status)}
      busy={false}
      lastRun={{ at: new Date(Date.now() - 7_200_000).toISOString(), by: 'ranjan@example.com' }}
      onStartEm={vi.fn()}
      onStartSm={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );
}

describe('PlanningStatus', () => {
  it('pulses only while an agent is working', () => {
    renderStatus('planning');
    expect(document.querySelector('.ps-dot-running')).toBeInTheDocument();

    renderStatus('planned');
    expect(document.querySelectorAll('.ps-dot-running')).toHaveLength(1); // the first render only
    expect(document.querySelector('.ps-dot-waiting')).toBeInTheDocument();
  });

  /** Colour alone must not carry the meaning. */
  it('says in words what the colour means', () => {
    renderStatus('planning');
    expect(screen.getByText('An agent is working')).toBeInTheDocument();
  });

  it('shows when the last run was and who started it', () => {
    renderStatus('planned');
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
    expect(screen.getByText('ranjan@example.com')).toBeInTheDocument();
  });

  it('holds the backlog action shut until the plan is approved', () => {
    renderStatus('planned');
    expect(screen.getByRole('button', { name: /start sm backlog/i })).toBeDisabled();
  });
});

/**
 * "Start EM planning" on a plan that is already in Azure DevOps.
 *
 * A fresh Scrum Master run replaces the backlog outright, losing every work item's id and leaving
 * 71 work items orphaned on the board. The backend refuses it — but a button that can only produce
 * a refusal is a trap, so it is disabled and says what to do instead.
 */
describe('Start EM planning once the plan is pushed', () => {
  const pushed = (yes: boolean) => {
    const base = draftWith('approved');
    return { ...base, approval: { ...base.approval, pushedToAdo: yes } } as Draft;
  };

  const show = (draft: Draft) =>
    render(
      <PlanningStatus
        draft={draft}
        busy={false}
        lastRun={{ at: null, by: null }}
        onStartEm={() => {}}
        onStartSm={() => {}}
        onRefresh={() => {}}
      />,
    );

  it('is disabled once the work is in Azure DevOps', () => {
    show(pushed(true));
    expect(screen.getByRole('button', { name: /start em planning/i })).toBeDisabled();
  });

  it('says what to do instead', () => {
    show(pushed(true));
    expect(screen.getByRole('button', { name: /start em planning/i })).toHaveAttribute(
      'title',
      expect.stringContaining('enhancement') as unknown as string,
    );
  });

  it('is still available before anything has been pushed', () => {
    show(pushed(false));
    expect(screen.getByRole('button', { name: /start em planning/i })).toBeEnabled();
  });
});
