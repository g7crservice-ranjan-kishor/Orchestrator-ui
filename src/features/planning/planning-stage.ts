import type { Draft } from '../../lib/types';

/**
 * Where a draft has got to, as five steps a reader can see at a glance.
 *
 * The page used to be one column of ten sections, every one of them on screen at once whether it
 * had anything to say or not. Someone opening it mid-flight had to work out from the content which
 * parts were waiting on them — the backlog editor looks much the same before a backlog exists as
 * after. The steps say it instead.
 *
 * **Derived, never stored.** The draft is the single source of truth, so a step cannot drift out of
 * step with what is actually answered, and a page reload cannot land somewhere the draft is not.
 */
export type PlanningStep =
  | 'requirement'
  | 'clarifications'
  | 'technical'
  | 'review'
  | 'ready';

/** The screens those steps map onto. Clarifications and Technical Details share one. */
export type PlanningView = 'answer' | 'review' | 'ready';

export type StepState = 'done' | 'current' | 'pending';

export const PLANNING_STEPS: {
  step: PlanningStep;
  label: string;
  /** `null` for a step whose work happens on another page. */
  view: PlanningView | null;
}[] = [
  { step: 'requirement', label: 'Requirement', view: null },
  { step: 'clarifications', label: 'Clarifications', view: 'answer' },
  { step: 'technical', label: 'Technical Details', view: 'answer' },
  { step: 'review', label: 'Review Plan', view: 'review' },
  { step: 'ready', label: 'Ready for Development', view: 'ready' },
];

/** Every clarification carries an answer. No questions at all counts as answered. */
export function clarificationsAnswered(draft: Draft): boolean {
  return (draft.clarifications ?? []).every((c) => c.answer !== null && c.answer !== '');
}

/**
 * Every technical decision that blocks a plan has been made.
 *
 * Only the required ones: a product that names no integrations probably has none, and counting
 * that as outstanding would hold the plan for a question nobody needs to answer.
 */
export function technicalDetailsAnswered(draft: Draft): boolean {
  return (draft.technicalDetails ?? []).every((d) => !d.required || d.source !== 'missing');
}

export function isStepDone(step: PlanningStep, draft: Draft): boolean {
  switch (step) {
    // A draft only exists because a requirement was submitted.
    case 'requirement':
      return true;
    case 'clarifications':
      return clarificationsAnswered(draft);
    case 'technical':
      return technicalDetailsAnswered(draft);
    case 'review':
      return draft.planApproved;
    case 'ready':
      return draft.backlogApproved;
  }
}

/**
 * The screen to open on.
 *
 * The first thing still waiting on a person, which is the only screen they can act on. Answers
 * come before the plan because a plan generated around an unanswered question is a plan built on
 * an assumption nobody made.
 */
export function currentView(draft: Draft): PlanningView {
  if (!clarificationsAnswered(draft) || !technicalDetailsAnswered(draft)) return 'answer';
  if (!draft.planApproved) return 'review';
  return 'ready';
}

/**
 * Whether a step can be opened.
 *
 * Deliberately wider than "done or current". Staging a page risks making something unreachable
 * that used to be one scroll away, so a step opens as soon as it has anything to show — a plan
 * that exists can be read before it is approved, and a drafted backlog before the plan is signed
 * off. What it will not do is open a screen that is still empty.
 */
export function isStepReachable(step: PlanningStep, draft: Draft): boolean {
  switch (step) {
    case 'requirement':
    case 'clarifications':
    case 'technical':
      return true;
    case 'review':
      return draft.planMarkdown !== null || currentView(draft) === 'review';
    case 'ready':
      return (draft.backlog ?? []).length > 0 || currentView(draft) === 'ready';
  }
}

/**
 * How each step reads in the stepper.
 *
 * `view` is where the reader actually is, which is not always where the draft is — they may have
 * stepped back to re-read an answered question. A step that is done stays done even when it is the
 * one on screen, because a tick that turns back into a number when you look at it is a lie about
 * the state of the work.
 */
export function stepStates(draft: Draft, view: PlanningView): Record<PlanningStep, StepState> {
  const states = {} as Record<PlanningStep, StepState>;
  for (const { step, view: stepView } of PLANNING_STEPS) {
    if (isStepDone(step, draft)) states[step] = 'done';
    else if (stepView === view) states[step] = 'current';
    else states[step] = 'pending';
  }
  return states;
}

/** The step a reader is being asked to finish, for the message in the action bar. */
export function outstandingStep(draft: Draft): PlanningStep | null {
  return PLANNING_STEPS.map(({ step }) => step).find((step) => !isStepDone(step, draft)) ?? null;
}
