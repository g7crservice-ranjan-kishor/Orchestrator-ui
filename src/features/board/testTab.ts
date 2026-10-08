import type { StoryTestCase, TestTabOutcome } from '../../lib/types';

/** A colour/label mapping for a test outcome badge (accessible label + CSS modifier class). */
export interface OutcomeBadge {
  label: string;
  className: string;
}

/** Maps a test-point outcome to its badge label + class. Unknown values render as NotRun. */
export function outcomeBadge(outcome: TestTabOutcome): OutcomeBadge {
  switch (outcome) {
    case 'Passed':
      return { label: 'Passed', className: 'badge badge-pass' };
    case 'Failed':
      return { label: 'Failed', className: 'badge badge-fail' };
    case 'Blocked':
      return { label: 'Blocked', className: 'badge badge-blocked' };
    default:
      return { label: 'Not run', className: 'badge badge-notrun' };
  }
}

/** A one-line summary of a Story's test outcomes (for the Test tab header / a11y announcement). */
export function summarizeOutcomes(testCases: readonly StoryTestCase[]): string {
  if (testCases.length === 0) {
    return 'No test cases yet.';
  }
  const counts: Record<TestTabOutcome, number> = {
    Passed: 0,
    Failed: 0,
    Blocked: 0,
    NotRun: 0,
  };
  for (const tc of testCases) {
    counts[tc.outcome] += 1;
  }
  return `${testCases.length} case(s): ${counts.Passed} passed, ${counts.Failed} failed, ${counts.Blocked} blocked, ${counts.NotRun} not run.`;
}

/** True when any Test Case has failed — lets the UI flag a Story that needs a fix. */
export function hasFailures(testCases: readonly StoryTestCase[]): boolean {
  return testCases.some((tc) => tc.outcome === 'Failed');
}
