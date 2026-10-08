import { describe, expect, it } from 'vitest';
import { PLANNING_POLL_MS, isAgentWorking } from './run-activity';

/**
 * Which states the planning page is allowed to fetch in on its own.
 *
 * Two requirements pull against each other: a planning run takes minutes and its result can arrive
 * twice when the orchestrator regenerates a plan itself, so the page has to keep itself current —
 * but the same page holds unsaved backlog edits, and a background fetch would replace them with
 * whatever the server last stored. Polling only while an agent is working satisfies both.
 */
describe('isAgentWorking', () => {
  it('is true exactly while an agent is running', () => {
    expect(isAgentWorking('planning')).toBe(true);
    expect(isAgentWorking('backlogDrafting')).toBe(true);
  });

  /** Every one of these is a state where the reader may be editing. */
  it('is false in every state the reader controls', () => {
    for (const status of ['intake', 'clarifying', 'planned', 'backlogDrafted', 'approved']) {
      expect(isAgentWorking(status)).toBe(false);
    }
  });

  it('is false before a draft has loaded', () => {
    expect(isAgentWorking(undefined)).toBe(false);
    expect(isAgentWorking(null)).toBe(false);
  });

  /** Fast enough to feel live, slow enough not to hammer the API for a multi-minute run. */
  it('polls on the same cadence as the run monitor', () => {
    expect(PLANNING_POLL_MS).toBe(3000);
  });
});
