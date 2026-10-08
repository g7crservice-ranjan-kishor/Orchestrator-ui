import type { BoardTask } from '../../lib/types';

/**
 * What the card's progress strip should say. Only `running` travels: a queued run has no pod yet
 * and a blocked one is not advancing, so animating either would claim progress that is not
 * happening.
 */
export type AgentTone = 'running' | 'queued' | 'blocked';

/**
 * What the agent is *actually* doing, from the job's own state. An In Progress Task always has a
 * run behind it, but a `Queued` run has no pod yet — the dispatch is waiting on the cluster — so
 * showing "Agent running" for it would be a lie. Queued resolves itself: the scheduler re-dispatches
 * a run that never got a pod, so a cluster that is still starting self-heals within a couple of
 * minutes.
 */
export function agentBadge(
  task: BoardTask,
): { label: string; className: string; title: string; tone: AgentTone } | null {
  if (!task.agentRunning) {
    return null;
  }
  switch (task.execution?.state) {
    case 'Running':
    case 'Claimed':
      return {
        label: 'Agent running',
        className: 'badge badge-agent',
        title: 'A Developer agent pod is executing this Task now.',
        tone: 'running',
      };
    case 'Blocked':
      return {
        label: 'Agent blocked',
        className: 'badge badge-agent-blocked',
        title: task.execution?.blockedReason ?? 'The run is waiting on something external.',
        tone: 'blocked',
      };
    default:
      return {
        label: 'Queued — waiting for an agent',
        className: 'badge badge-agent-queued',
        title:
          'The run is queued; no agent pod has picked it up yet. If the cluster is starting, the ' +
          'scheduler re-dispatches it automatically.',
        tone: 'queued',
      };
  }
}
