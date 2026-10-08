import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkList } from './PlanWork';
import { parsePlan } from './plan-model';

/**
 * How the breakdown is presented. The plan below is in the shape the EM agent actually returns —
 * bold epic lines with their children in the list beneath — which is the shape that used to be
 * mis-parsed and mis-labelled.
 */
const PLAN = [
  '# Plan',
  '',
  '## Breakdown',
  '',
  '**Epic 1: Backend project foundation**',
  '- Feature: Repo scaffolding',
  '',
  '**Epic 2: Authentication**',
  '- Story: Register endpoint',
  '',
].join(String.fromCharCode(10));

function renderWork() {
  const plan = parsePlan(PLAN);
  return render(<WorkList nodes={plan.epics} />);
}

describe('WorkList', () => {
  it('shows each epic once, with its numbering', () => {
    renderWork();
    expect(screen.getByText('Backend project foundation')).toBeInTheDocument();
    expect(screen.getByText('Authentication')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  /**
   * The visible bug: a child carried a bare "Feature" label beside the "Feature" kind chip, so the
   * card read "FeatureFeatureRepo scaffolding". A label earns its chip only when it adds something.
   */
  it('does not repeat the kind as a second chip', () => {
    const { container } = renderWork();
    const refs = [...container.querySelectorAll('.pv-ref')].map((el) => el.textContent?.trim());
    expect(refs).not.toContain('Feature');
    expect(refs).not.toContain('Story');
    expect(refs).not.toContain('Epic');
    expect(refs).toEqual(expect.arrayContaining(['1', '2']));
  });

  it('keeps the child under its epic rather than at the top level', () => {
    const { container } = renderWork();
    const top = container.querySelectorAll(':scope > .pv-work-list > li');
    expect(top.length).toBe(2);
  });
});
