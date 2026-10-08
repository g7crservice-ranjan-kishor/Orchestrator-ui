import { describe, expect, it } from 'vitest';
import { completionOf, describeCompletion } from './planning-done';
import type { BacklogItem, Draft } from '../../lib/types';

/**
 * Saying "this just finished", and only when it did.
 *
 * A planning run takes minutes; the page polls, and when the answer lands the spinner stops and a
 * plan appears further down. If you looked away, that is indistinguishable from the page having
 * always looked like that. These rules are what keep the announcement truthful: it marks a
 * transition actually observed, and it never congratulates a run that produced nothing.
 */

const draft = (over: Partial<Draft> = {}): Draft =>
  ({ planMarkdown: null, backlog: [], runNote: null, ...over }) as Draft;

const item = (type: string, id: string): BacklogItem => ({ id, type }) as BacklogItem;

describe('recognising that an agent has finished', () => {
  it('sees a plan arrive', () => {
    expect(completionOf('planning', 'planned')).toBe('plan');
  });

  it('sees a backlog arrive', () => {
    expect(completionOf('backlogDrafting', 'backlogDrafted')).toBe('backlog');
  });

  /** The orchestrator can start the Scrum Master itself, which is still the plan finishing. */
  it('sees a plan arrive even when drafting starts straight away', () => {
    expect(completionOf('planning', 'backlogDrafting')).toBe('plan');
  });

  /**
   * The rule that stops the message appearing for work you did yesterday: there must be a
   * transition. Opening the page on a finished draft announces nothing.
   */
  it('says nothing without a transition', () => {
    expect(completionOf('planned', 'planned')).toBeNull();
    expect(completionOf(undefined, 'planned')).toBeNull();
    expect(completionOf(null, 'backlogDrafted')).toBeNull();
  });

  it('says nothing about starting work', () => {
    expect(completionOf('intake', 'planning')).toBeNull();
    expect(completionOf('planned', 'backlogDrafting')).toBeNull();
  });

  /** Falling back to clarifying is a run that did not deliver, not a run that finished. */
  it('does not treat a fallback as a finish', () => {
    expect(completionOf('planning', 'clarifying')).toBeNull();
    expect(completionOf('planning', 'intake')).toBeNull();
  });
});

describe('what the message says', () => {
  it('counts what the plan contains', () => {
    const markdown = `# Plan

## Epics

### Epic 1 — Authentication

- Story 1.1 — Register
  - Task 1.1.1 — Registration endpoint
- Story 1.2 — Login
`;
    const done = describeCompletion('plan', draft({ planMarkdown: markdown }));
    expect(done?.title).toBe('Your plan is ready');
    expect(done?.facts.join(' ')).toContain('epic');
  });

  it('counts what the backlog contains', () => {
    const backlog = [item('epic', '1'), item('story', '2'), item('story', '3'), item('task', '4')];
    const done = describeCompletion('backlog', draft({ backlog }));
    expect(done?.title).toBe('Your backlog is ready');
    expect(done?.facts).toContain('1 epic');
    expect(done?.facts).toContain('2 stories');
    expect(done?.facts).toContain('1 task');
  });

  /** "1 epics" is the kind of detail that makes a congratulation feel machine-made. */
  it('gets the singular right', () => {
    const done = describeCompletion('backlog', draft({ backlog: [item('epic', '1')] }));
    expect(done?.facts).toContain('1 epic');
    expect(done?.facts.join(' ')).not.toContain('1 epics');
  });

  it('leaves out what the plan has none of', () => {
    const done = describeCompletion('backlog', draft({ backlog: [item('epic', '1')] }));
    expect(done?.facts.join(' ')).not.toContain('story');
  });

  it('says what to do next', () => {
    const done = describeCompletion('backlog', draft({ backlog: [item('epic', '1')] }));
    expect(done?.next).toMatch(/approve/i);
  });
});

describe('what it refuses to call a success', () => {
  /**
   * A run can finish and leave nothing behind — the `runNote` card exists to say why. A green
   * "Your plan is ready" beside it would be the page contradicting itself.
   */
  it('says nothing when the run explained why it produced nothing', () => {
    expect(
      describeCompletion(
        'plan',
        draft({ planMarkdown: '# Plan', runNote: 'The agent timed out.' }),
      ),
    ).toBeNull();
  });

  it('says nothing when there is no plan to show', () => {
    expect(describeCompletion('plan', draft())).toBeNull();
  });

  it('says nothing when the backlog came back empty', () => {
    expect(describeCompletion('backlog', draft({ backlog: [] }))).toBeNull();
  });
});
