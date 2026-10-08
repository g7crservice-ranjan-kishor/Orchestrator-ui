import { describe, expect, it } from 'vitest';
import type { StoryTestCase } from '../../lib/types';
import { hasFailures, outcomeBadge, summarizeOutcomes } from './testTab';

/**
 * Unit tests for the Test-tab data mapping (Task 18409, web): outcome→badge mapping, the outcome
 * summary line, and failure detection that flags a Story needing a fix.
 */
describe('board Test-tab mapping', () => {
  describe('outcomeBadge', () => {
    it('maps each outcome to a distinct accessible label + class', () => {
      expect(outcomeBadge('Passed')).toEqual({ label: 'Passed', className: 'badge badge-pass' });
      expect(outcomeBadge('Failed')).toEqual({ label: 'Failed', className: 'badge badge-fail' });
      expect(outcomeBadge('Blocked')).toEqual({
        label: 'Blocked',
        className: 'badge badge-blocked',
      });
      expect(outcomeBadge('NotRun')).toEqual({ label: 'Not run', className: 'badge badge-notrun' });
    });
  });

  const cases: StoryTestCase[] = [
    { testCaseId: 1, title: 'a', state: 'Ready', outcome: 'Passed' },
    { testCaseId: 2, title: 'b', state: 'Ready', outcome: 'Failed' },
    { testCaseId: 3, title: 'c', state: 'Ready', outcome: 'NotRun' },
  ];

  it('summarizeOutcomes counts each outcome and handles the empty case', () => {
    expect(summarizeOutcomes(cases)).toBe('3 case(s): 1 passed, 1 failed, 0 blocked, 1 not run.');
    expect(summarizeOutcomes([])).toBe('No test cases yet.');
  });

  it('hasFailures is true only when a case failed', () => {
    expect(hasFailures(cases)).toBe(true);
    expect(hasFailures([{ testCaseId: 1, title: 'a', state: 'Ready', outcome: 'Passed' }])).toBe(
      false,
    );
  });
});
