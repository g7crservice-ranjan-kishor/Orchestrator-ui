import type { SprintRolloverPlan } from '../../lib/types';

/**
 * Confirms a sprint rollover. Azure DevOps decides the active sprint from iteration **dates**, so
 * this shows the exact dates that will be written, which Tasks carry over, and anything that blocks
 * the change — nothing is applied until the user confirms.
 */
export function SprintRolloverDialog(props: {
  plan: SprintRolloverPlan;
  working: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { plan, working, onCancel, onConfirm } = props;
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');
  // `ok` is the backend's verdict; the blocker list is what it will show the reader.
  const blocked = !plan.ok || plan.blockers.length > 0;
  /*
   * A sprint closed on the day it began is moved wholesale into yesterday — start as well as
   * finish — because a finish before a start is invalid and an overlap would leave the old sprint
   * current. Worth saying plainly: its recorded start date changes.
   */
  const compressed =
    plan.newCurrentStart !== null && plan.newCurrentStart !== plan.current?.startDate;

  return (
    <div className="drawer-backdrop" onClick={onCancel}>
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm sprint rollover"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>
          Close {plan.current?.name ?? 'the active sprint'} and start{' '}
          {plan.next?.name ?? 'the next'}?
        </h3>

        {plan.blockers.length > 0 ? (
          <ul className="confirm-reasons">
            {plan.blockers.map((b) => (
              <li key={b}>
                <span className="transition-failed">blocked</span> {b}
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p>
              This writes the sprint dates in Azure DevOps — the only thing that decides which
              sprint is active.
            </p>
            {compressed && (
              <p className="muted">
                {plan.current?.name} began today, so it is moved into yesterday — its recorded start
                date changes — leaving {plan.next?.name} active from today.
              </p>
            )}
            <dl className="drawer-hierarchy">
              <div>
                <dt>{plan.current?.name}</dt>
                <dd>
                  {compressed
                    ? `${day(plan.newCurrentStart)} → ${day(plan.newCurrentFinish)} (becomes past)`
                    : `ends ${day(plan.newCurrentFinish)} (becomes past)`}
                </dd>
              </div>
              <div>
                <dt>{plan.next?.name}</dt>
                <dd>
                  {day(plan.newNextStart)} → {day(plan.newNextFinish)} (becomes active)
                </dd>
              </div>
            </dl>
          </>
        )}

        {plan.carryOver.length > 0 && (
          <>
            <p className="muted">Finish these before the sprint can be closed:</p>
            <ul className="confirm-reasons">
              {plan.carryOver.map((t) => (
                <li key={t.key}>
                  <span className="transition-caveat">{t.status}</span> {t.title}
                  {t.adoId ? ` (#${t.adoId})` : ''}
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="confirm-actions">
          <button className="link" onClick={onCancel} disabled={working}>
            {blocked ? 'Close' : 'Cancel'}
          </button>
          {/*
           * A blocked rollover cannot be confirmed, and the button has to *look* that way: a solid
           * primary button at 60% opacity still reads as "press me", which is how a dialog listing
           * a blocker ended up with what looked like a working action beside it.
           */}
          <button
            onClick={onConfirm}
            disabled={working || blocked}
            title={blocked ? plan.blockers[0] : ''}
          >
            {working
              ? 'Working…'
              : blocked
                ? 'Cannot close yet'
                : `Close ${plan.current?.name ?? 'sprint'} & start ${plan.next?.name ?? 'next'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
