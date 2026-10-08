import {
  ClockCircleOutlined,
  FileAddOutlined,
  ReloadOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { relativeTime } from '../../lib/relative-time';
import type { Draft } from '../../lib/types';
import { TONE_HINT, statusTone } from './status-tone';

/** When the last planning run was started, and by whom. Null until the audit trail is read. */
export interface LastRun {
  at: string | null;
  by: string | null;
}

/**
 * The planning workspace's header: where the draft stands, what can be started next, and who last
 * started something.
 *
 * "Last run" and "triggered by" come from the same audit entry rather than two sources, so the time
 * and the person always describe the same event — a run whose actor is unknown would otherwise pair
 * a fresh timestamp with a stale name.
 */
export function PlanningStatus({
  draft,
  busy,
  lastRun,
  onStartEm,
  onStartSm,
  onRefresh,
}: {
  draft: Draft;
  busy: boolean;
  lastRun: LastRun;
  onStartEm: () => void;
  onStartSm: () => void;
  onRefresh: () => void;
}) {
  const tone = statusTone(draft.status);

  /*
   * A plan that has reached Azure DevOps cannot be re-planned in place: a fresh Scrum Master run
   * replaces the backlog outright, losing every work item's id and orphaning them on the board. The
   * backend refuses it — but a button that can only produce a refusal is a trap, so it is disabled
   * here and says what to do instead.
   *
   * The same is true of "Start SM backlog", and more sharply: every Scrum Master run replaces the
   * backlog outright, so on a pushed project the quieter-looking button is the more destructive one.
   */
  const plannedAlready = draft.approval?.pushedToAdo ?? false;

  return (
    <div className="card plan-status">
      <div className="ps-main">
        <div className="ps-state">
          <span className={`ps-dot ps-dot-${tone}`} aria-hidden />
          <span className="ps-state-label">Status</span>
          <span className={`badge ps-badge ps-badge-${tone}`}>{draft.status}</span>
          <span className="ps-hint">{TONE_HINT[tone]}</span>
          {draft.currentRunId && (
            <span className="ps-run">· Run {draft.currentRunId.slice(0, 8)}</span>
          )}
        </div>

        <div className="ps-actions">
          <button
            className="ps-btn ps-btn-primary"
            disabled={busy || plannedAlready}
            title={
              plannedAlready
                ? 'This plan is already in Azure DevOps. Planning again would replace the backlog ' +
                  'and orphan those work items — add an enhancement instead.'
                : ''
            }
            onClick={onStartEm}
          >
            <FileAddOutlined aria-hidden /> Start EM planning
          </button>
          <button
            className="ps-btn ps-btn-soft"
            disabled={busy || !draft.planApproved || plannedAlready}
            title={
              plannedAlready
                ? 'This backlog is already in Azure DevOps. Drafting it again would replace every ' +
                  'item and orphan those work items — add an enhancement instead.'
                : draft.planApproved
                  ? ''
                  : 'Approve the plan first'
            }
            onClick={onStartSm}
          >
            <UnorderedListOutlined aria-hidden /> Start SM backlog
          </button>
          <button className="ps-btn ps-btn-ghost" disabled={busy} onClick={onRefresh}>
            <ReloadOutlined aria-hidden /> Refresh
          </button>
        </div>
      </div>

      <dl className="ps-meta">
        <div className="ps-meta-item">
          <span className="ps-meta-icon">
            <ClockCircleOutlined aria-hidden />
          </span>
          <div>
            <dt>Last run</dt>
            <dd>{relativeTime(lastRun.at)}</dd>
          </div>
        </div>
        <div className="ps-meta-item">
          <span className="ps-meta-icon">
            <UserOutlined aria-hidden />
          </span>
          <div>
            <dt>Triggered by</dt>
            <dd>{lastRun.by ?? '—'}</dd>
          </div>
        </div>
      </dl>
    </div>
  );
}
