import { CheckCircleFilled, CloseOutlined } from '@ant-design/icons';
import type { PlanningDone } from './planning-done';

/**
 * The moment an agent finishes, said out loud.
 *
 * A planning run takes minutes. The page polls, and when the answer arrives the spinner stops and
 * a plan appears somewhere below the fold — which, if you looked away, is indistinguishable from
 * the page having always looked like that. This is the one thing on the page that marks *now*.
 *
 * It states what arrived rather than only that something did: "6 epics · 25 stories · 83 tasks"
 * is a result you can sanity-check at a glance, where "Done!" is a noise you learn to ignore. It
 * stays until dismissed — a toast that fades after four seconds is no use to someone who started
 * a ten-minute run and went to make tea.
 */
export function PlanningDoneBanner({
  done,
  onDismiss,
}: {
  done: PlanningDone;
  onDismiss: () => void;
}) {
  return (
    <section className="planning-done" role="status" aria-live="polite">
      <span className="planning-done-icon" aria-hidden>
        <CheckCircleFilled />
      </span>

      <div className="planning-done-body">
        <h3>{done.title}</h3>
        {done.facts.length > 0 && (
          <ul className="planning-done-facts">
            {done.facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        )}
        <p>{done.next}</p>
      </div>

      <button
        type="button"
        className="planning-done-close"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <CloseOutlined />
      </button>
    </section>
  );
}
