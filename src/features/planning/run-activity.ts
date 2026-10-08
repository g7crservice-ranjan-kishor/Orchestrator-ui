import type { Draft } from '../../lib/types';

/** How often the planning page re-reads the draft while an agent is working. */
export const PLANNING_POLL_MS = 3000;

/**
 * Whether an agent is currently working on this draft.
 *
 * Polling is deliberately limited to exactly these states. In every other state the page is a
 * form: the backlog editor holds unsaved edits, and a background refresh would replace them with
 * whatever the server last stored. Waiting on an agent is the only time new data can arrive that
 * the reader did not cause — so it is the only time the page fetches on its own.
 */
export function isAgentWorking(status: Draft['status'] | undefined | null): boolean {
  return status === 'planning' || status === 'backlogDrafting';
}
