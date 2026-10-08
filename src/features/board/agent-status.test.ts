import { describe, expect, it } from 'vitest';
import { agentBadge } from './agent-status';
import type { BoardTask, TaskExecution } from '../../lib/types';

/**
 * What the card says, and shows, about a run attached to it.
 *
 * The distinction that matters: a moving progress strip is a claim that work is happening. A
 * queued run has no pod and a blocked run has stopped, so neither may travel — otherwise the card
 * shows steady progress on a Task that nothing is touching.
 */
const execution = (state: string): TaskExecution => ({
  runId: 'r1',
  state,
  attempts: 1,
  startedAt: null,
  completedAt: null,
  blockedReason: null,
  durationMs: 0,
  tokens: 0,
  cost: 0,
  filesChanged: 0,
  commits: [],
});

const task = (agentRunning: boolean, state?: string): BoardTask =>
  ({
    kind: 'task',
    adoId: 156,
    agentRunning,
    execution: state ? execution(state) : null,
  }) as BoardTask;

describe('agentBadge', () => {
  it('says nothing when no run is attached', () => {
    expect(agentBadge(task(false))).toBeNull();
    expect(agentBadge(task(false, 'Running'))).toBeNull();
  });

  it('only lets a live pod animate', () => {
    expect(agentBadge(task(true, 'Running'))?.tone).toBe('running');
    expect(agentBadge(task(true, 'Claimed'))?.tone).toBe('running');
  });

  /** No pod has it yet, so nothing is progressing — the strip must not travel. */
  it('marks a queued run as queued, not running', () => {
    const badge = agentBadge(task(true, 'Queued'));
    expect(badge?.tone).toBe('queued');
    expect(badge?.label).toMatch(/queued/i);
  });

  it('marks a blocked run as blocked', () => {
    expect(agentBadge(task(true, 'Blocked'))?.tone).toBe('blocked');
  });

  /** A state this build does not know must not be presented as active work. */
  it('treats an unknown run state as queued', () => {
    expect(agentBadge(task(true, 'Something'))?.tone).toBe('queued');
    expect(agentBadge(task(true))?.tone).toBe('queued');
  });

  it('carries the blocked reason into the tooltip when there is one', () => {
    const blocked = task(true, 'Blocked');
    blocked.execution!.blockedReason = 'Waiting on a missing credential';
    expect(agentBadge(blocked)?.title).toBe('Waiting on a missing credential');
  });
});
