import { describe, expect, it } from 'vitest';
import {
  currentView,
  isStepDone,
  isStepReachable,
  outstandingStep,
  stepStates,
} from './planning-stage';
import type { Clarification, Draft, TechnicalDetail } from '../../lib/types';

/**
 * The steps are derived from the draft, never stored, so what the stepper says and what is
 * actually answered cannot drift apart. These are the rules that keeps true.
 */

const question = (over: Partial<Clarification> = {}): Clarification => ({
  id: 'c1',
  question: 'Which channels should notifications use?',
  answer: 'Email and in-app.',
  answeredAt: '2026-10-08T10:00:00.000Z',
  ...over,
});

const detail = (over: Partial<TechnicalDetail> = {}): TechnicalDetail => ({
  field: 'frontend',
  label: 'Frontend',
  value: 'React',
  source: 'requirement',
  required: true,
  question: 'Which frontend framework?',
  ...over,
});

const draft = (over: Partial<Draft> = {}): Draft =>
  ({
    clarifications: [question()],
    technicalDetails: [detail()],
    planMarkdown: null,
    planApproved: false,
    backlog: [],
    backlogApproved: false,
    ...over,
  }) as Draft;

describe('what counts as done', () => {
  it('treats a requirement as done, because a draft only exists once one was given', () => {
    expect(isStepDone('requirement', draft())).toBe(true);
  });

  it('waits for every clarification to carry an answer', () => {
    expect(isStepDone('clarifications', draft())).toBe(true);
    expect(isStepDone('clarifications', draft({ clarifications: [question({ answer: null })] }))).toBe(
      false,
    );
    expect(isStepDone('clarifications', draft({ clarifications: [question({ answer: '' })] }))).toBe(
      false,
    );
  });

  it('counts no questions at all as answered', () => {
    expect(isStepDone('clarifications', draft({ clarifications: [] }))).toBe(true);
  });

  /** A product that names no integrations probably has none; holding the plan for that is noise. */
  it('ignores an unanswered detail that was never required', () => {
    const optional = detail({ field: 'integrations', required: false, source: 'missing', value: null });
    expect(isStepDone('technical', draft({ technicalDetails: [optional] }))).toBe(true);
  });

  it('waits for a required detail nobody has answered', () => {
    const missing = detail({ required: true, source: 'missing', value: null });
    expect(isStepDone('technical', draft({ technicalDetails: [missing] }))).toBe(false);
  });

  it('reads the plan and backlog from their approvals', () => {
    expect(isStepDone('review', draft({ planApproved: true }))).toBe(true);
    expect(isStepDone('ready', draft({ backlogApproved: true }))).toBe(true);
  });
});

describe('where the page opens', () => {
  const answered = { clarifications: [question()], technicalDetails: [detail()] };

  it('opens on the answers while anything is unanswered', () => {
    expect(currentView(draft({ clarifications: [question({ answer: null })] }))).toBe('answer');
    expect(
      currentView(draft({ technicalDetails: [detail({ required: true, source: 'missing' })] })),
    ).toBe('answer');
  });

  it('moves to the plan once the answers are in', () => {
    expect(currentView(draft(answered))).toBe('review');
  });

  it('moves on again once the plan is approved', () => {
    expect(currentView(draft({ ...answered, planApproved: true }))).toBe('ready');
  });

  /**
   * An answer withdrawn after a plan exists takes the reader back to it. The alternative is a page
   * that sits on a plan built around a question that no longer has an answer.
   */
  it('goes back to the answers if one is withdrawn later', () => {
    const withdrawn = draft({
      clarifications: [question({ answer: null })],
      planApproved: true,
    });
    expect(currentView(withdrawn)).toBe('answer');
  });
});

/**
 * Staging a page risks making something unreachable that used to be one scroll away. A step opens
 * as soon as it has anything to show, not only once the one before it is signed off.
 */
describe('what can be opened', () => {
  it('always allows the first three', () => {
    const early = draft({ clarifications: [question({ answer: null })] });
    for (const step of ['requirement', 'clarifications', 'technical'] as const) {
      expect(isStepReachable(step, early)).toBe(true);
    }
  });

  it('lets a plan be read before it is approved', () => {
    expect(isStepReachable('review', draft({ planMarkdown: '# Plan' }))).toBe(true);
  });

  it('lets a drafted backlog be opened before the plan is signed off', () => {
    const drafted = draft({ planMarkdown: '# Plan', backlog: [{ id: 'e1' }] as Draft['backlog'] });
    expect(isStepReachable('ready', drafted)).toBe(true);
  });

  it('does not open a screen that is still empty', () => {
    const early = draft({ clarifications: [question({ answer: null })] });
    expect(isStepReachable('review', early)).toBe(false);
    expect(isStepReachable('ready', early)).toBe(false);
  });
});

describe('how the stepper reads', () => {
  it('marks the screen in view as current and the rest by what is done', () => {
    const states = stepStates(
      draft({ clarifications: [question({ answer: null })] }),
      'answer',
    );
    expect(states.requirement).toBe('done');
    expect(states.clarifications).toBe('current');
    expect(states.technical).toBe('done');
    expect(states.review).toBe('pending');
    expect(states.ready).toBe('pending');
  });

  /** A tick that turns back into a number when you look at it is a lie about the work. */
  it('keeps a finished step ticked even while it is on screen', () => {
    expect(stepStates(draft(), 'answer').clarifications).toBe('done');
  });

  it('names the step still waiting on someone', () => {
    expect(outstandingStep(draft({ clarifications: [question({ answer: null })] }))).toBe(
      'clarifications',
    );
    expect(outstandingStep(draft())).toBe('review');
    expect(outstandingStep(draft({ planApproved: true, backlogApproved: true }))).toBeNull();
  });
});
