import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SprintRolloverDialog } from './SprintRolloverDialog';
import type { SprintRolloverPlan } from '../../lib/types';

/**
 * The rollover confirmation. This dialog writes sprint dates in Azure DevOps — the only thing that
 * decides which sprint is active — so the one behaviour that must never slip is that a blocked
 * rollover cannot be confirmed, *and* does not look confirmable.
 */
const plan = (over: Partial<SprintRolloverPlan> = {}): SprintRolloverPlan => ({
  ok: true,
  dryRun: true,
  applied: false,
  current: { name: 'Sprint 2', path: 'P\\Sprint 2', startDate: null, finishDate: null },
  next: { name: 'Sprint 3', path: 'P\\Sprint 3', startDate: null, finishDate: null },
  newCurrentStart: '2026-09-12T00:00:00.000Z',
  newCurrentFinish: '2026-09-25T00:00:00.000Z',
  newNextStart: '2026-09-26T00:00:00.000Z',
  newNextFinish: '2026-10-09T00:00:00.000Z',
  blockers: [],
  carryOver: [],
  ...over,
});

const blockedPlan = plan({
  ok: false,
  blockers: [
    'Sprint 2 started today. A sprint cannot be closed on the day it begins — close it tomorrow or later.',
  ],
});

function renderDialog(p: SprintRolloverPlan, onConfirm = vi.fn()) {
  render(
    <SprintRolloverDialog plan={p} working={false} onCancel={vi.fn()} onConfirm={onConfirm} />,
  );
  return onConfirm;
}

describe('SprintRolloverDialog', () => {
  it('offers the rollover when nothing blocks it', () => {
    renderDialog(plan());
    const confirm = screen.getByRole('button', { name: /close sprint 2 & start sprint 3/i });
    expect(confirm).toBeEnabled();
  });

  /** The rule that replaced the old refusal: a sprint begun today is moved into yesterday. */
  it('says so when the closing sprint is moved into the past wholesale', () => {
    renderDialog(
      plan({
        current: {
          name: 'Sprint 2',
          path: 'P/Sprint 2',
          startDate: '2026-09-26T00:00:00.000Z',
          finishDate: null,
        },
        newCurrentStart: '2026-09-25T00:00:00.000Z',
        newCurrentFinish: '2026-09-25T00:00:00.000Z',
      }),
    );
    expect(screen.getByText(/began today/i).textContent).toMatch(/recorded start date changes/i);
    expect(screen.getByRole('button', { name: /close sprint 2 & start sprint 3/i })).toBeEnabled();
  });

  it('shows the dates that will be written', () => {
    renderDialog(plan());
    expect(screen.getByText(/only thing that decides which sprint is active/i)).toBeInTheDocument();
  });

  describe('when the rollover is blocked', () => {
    it('states the blocker', () => {
      renderDialog(blockedPlan);
      expect(screen.getByText(/cannot be closed on the day it begins/i)).toBeInTheDocument();
    });

    /** The defect this covers: a disabled solid button still read as "press me". */
    it('does not offer an action it cannot perform', () => {
      renderDialog(blockedPlan);
      const confirm = screen.getByRole('button', { name: /cannot close yet/i });
      expect(confirm).toBeDisabled();
      expect(screen.queryByRole('button', { name: /close sprint 2 & start/i })).toBeNull();
    });

    it('cannot be confirmed by clicking anyway', () => {
      const onConfirm = renderDialog(blockedPlan);
      fireEvent.click(screen.getByRole('button', { name: /cannot close yet/i }));
      expect(onConfirm).not.toHaveBeenCalled();
    });

    /** Nothing will happen, so the remaining action is to leave — not to "cancel" a change. */
    it('offers Close rather than Cancel', () => {
      renderDialog(blockedPlan);
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    /** `ok: true` with blockers listed would otherwise show a live button beside a blocker. */
    it('treats any listed blocker as blocking, whatever ok says', () => {
      renderDialog(plan({ ok: true, blockers: ['Two Tasks are still In Progress.'] }));
      expect(screen.getByRole('button', { name: /cannot close yet/i })).toBeDisabled();
    });
  });

  it('shows carry-over Tasks so the reader knows what to finish first', () => {
    renderDialog(
      plan({
        ok: false,
        blockers: ['Two Tasks are unfinished.'],
        carryOver: [
          {
            adoId: 161,
            key: '161',
            title: 'Generate the initial migration',
            status: 'In Progress',
          },
        ],
      }),
    );
    expect(screen.getByText(/Generate the initial migration/)).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('says nothing is happening while the rollover is applied', () => {
    render(<SprintRolloverDialog plan={plan()} working onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
  });
});
