import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlanningDoneBanner } from './PlanningDoneBanner';

/**
 * What the finish message has to do to be worth showing at all: name the result, show what
 * arrived, say what happens next, and announce itself to a screen reader — the whole point being
 * that it reaches someone who was not looking at the page when the run ended.
 */
const done = {
  kind: 'backlog' as const,
  title: 'Your backlog is ready',
  facts: ['6 epics', '25 stories', '83 tasks'],
  next: 'Check it below, then approve it to push the work items to Azure DevOps.',
};

describe('PlanningDoneBanner', () => {
  it('says what finished', () => {
    render(<PlanningDoneBanner done={done} onDismiss={vi.fn()} />);
    expect(screen.getByText('Your backlog is ready')).toBeInTheDocument();
  });

  /** A result you can sanity-check beats a "Done!" you learn to ignore. */
  it('shows what arrived', () => {
    render(<PlanningDoneBanner done={done} onDismiss={vi.fn()} />);
    for (const fact of done.facts) expect(screen.getByText(fact)).toBeInTheDocument();
  });

  it('says what to do next', () => {
    render(<PlanningDoneBanner done={done} onDismiss={vi.fn()} />);
    expect(screen.getByText(/then approve it/i)).toBeInTheDocument();
  });

  /** Announced, because the person it is for had looked away from the screen. */
  it('announces itself without stealing focus', () => {
    render(<PlanningDoneBanner done={done} onDismiss={vi.fn()} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('can be dismissed', () => {
    const onDismiss = vi.fn();
    render(<PlanningDoneBanner done={done} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('manages without any counts', () => {
    render(<PlanningDoneBanner done={{ ...done, facts: [] }} onDismiss={vi.fn()} />);
    expect(screen.getByText('Your backlog is ready')).toBeInTheDocument();
  });
});
