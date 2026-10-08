import { describe, expect, it } from 'vitest';
import type { Requirement } from '../../lib/types';
import {
  attachmentProblem,
  describeAttachments,
  headline,
  matchesRequirementSearch,
  MAX_ATTACHMENT_BYTES,
  relativeTime,
  statusesInUse,
  statusLabel,
  visibleRequirements,
} from './requirement-intake';

const NEWLINE = String.fromCharCode(10);

const requirement = (over: Partial<Requirement> = {}): Requirement => ({
  id: 'r1',
  projectId: 'p1',
  text: 'Build a focus timer that runs entirely in the browser.',
  status: 'submitted',
  attachments: [],
  createdAt: '2026-10-01T09:00:00.000Z',
  ...over,
});

/**
 * A requirement is free text with no title field, so the card's bold first line has to be read out
 * of the text itself — and the one thing it must never do is print the same sentence twice.
 */
describe('headline', () => {
  it('uses a short first line as the title and the rest as the body', () => {
    const text = ['Focus Timer – Browser-based timer', 'Build a focus timer in the browser.'].join(
      NEWLINE,
    );
    expect(headline(text)).toEqual({
      title: 'Focus Timer – Browser-based timer',
      body: 'Build a focus timer in the browser.',
    });
  });

  it('promotes the opening sentence when the text is one block of prose', () => {
    const text = 'Build a focus timer. A person starts a 25 minute work session.';
    expect(headline(text)).toEqual({
      title: 'Build a focus timer.',
      body: 'A person starts a 25 minute work session.',
    });
  });

  /** The defect this shape exists to prevent. */
  it('never repeats the title inside the body', () => {
    const { title, body } = headline('Build a focus timer. It runs in the browser.');
    expect(body).not.toContain(title);
  });

  it('leaves the body empty for a single short requirement', () => {
    expect(headline('Build a focus timer')).toEqual({
      title: 'Build a focus timer',
      body: '',
    });
  });

  it('cuts a long unbroken opening at a word boundary', () => {
    const long = 'word '.repeat(60).trim();
    const { title, body } = headline(long);
    expect(title.length).toBeLessThanOrEqual(121); // 120 plus the ellipsis
    expect(title.endsWith('…')).toBe(true);
    expect(body.startsWith('word')).toBe(true);
  });

  it('survives an empty requirement', () => {
    expect(headline('')).toEqual({ title: 'Untitled requirement', body: '' });
  });

  /** Text pasted from Windows carries carriage returns that would otherwise end up on screen. */
  it('ignores carriage returns', () => {
    const text = 'Title here' + String.fromCharCode(13) + NEWLINE + 'Detail here';
    expect(headline(text)).toEqual({ title: 'Title here', body: 'Detail here' });
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-10-01T12:00:00.000Z');

  it('reads the way a person would say it', () => {
    expect(relativeTime('2026-10-01T11:59:30.000Z', now)).toBe('just now');
    expect(relativeTime('2026-10-01T11:45:00.000Z', now)).toBe('15 minutes ago');
    expect(relativeTime('2026-10-01T10:00:00.000Z', now)).toBe('2 hours ago');
    expect(relativeTime('2026-09-29T12:00:00.000Z', now)).toBe('2 days ago');
  });

  it('says one, not 1s', () => {
    expect(relativeTime('2026-10-01T11:00:00.000Z', now)).toBe('1 hour ago');
  });

  /** Past a week the exact day is more useful than the distance. */
  it('gives a date once it is more than a week old', () => {
    expect(relativeTime('2026-09-01T12:00:00.000Z', now)).toMatch(/2026/);
  });

  it('says nothing for a missing or unreadable date', () => {
    expect(relativeTime('', now)).toBe('');
    expect(relativeTime('not a date', now)).toBe('');
  });
});

describe('statusLabel', () => {
  it('names the statuses the API returns', () => {
    expect(statusLabel('submitted')).toBe('Submitted');
    expect(statusLabel('draft')).toBe('Draft');
  });

  /** A status this build has not heard of is shown, not swallowed. */
  it('passes an unknown status through', () => {
    expect(statusLabel('archived')).toBe('Archived');
  });
});

describe('search and filtering', () => {
  const timer = requirement({ id: 'a', text: 'Focus timer in the browser' });
  const employees = requirement({
    id: 'b',
    text: 'Employee management system',
    status: 'draft',
    createdAt: '2026-10-01T11:00:00.000Z',
    attachments: [
      { originalName: 'org-chart.pdf', contentType: 'application/pdf', size: 10, url: 'u' },
    ],
  });

  it('matches the requirement text', () => {
    expect(matchesRequirementSearch(timer, 'browser')).toBe(true);
    expect(matchesRequirementSearch(timer, 'employee')).toBe(false);
  });

  /** A requirement is often remembered by the document that came with it. */
  it('matches an attachment name', () => {
    expect(matchesRequirementSearch(employees, 'org-chart')).toBe(true);
  });

  it('matches everything on an empty query', () => {
    expect(matchesRequirementSearch(timer, '   ')).toBe(true);
  });

  it('filters by status', () => {
    const shown = visibleRequirements([timer, employees], { search: '', status: 'draft' });
    expect(shown.map((r) => r.id)).toEqual(['b']);
  });

  it('shows the newest first', () => {
    const shown = visibleRequirements([timer, employees], { search: '', status: 'all' });
    expect(shown.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('offers only the statuses actually present', () => {
    expect(statusesInUse([timer, employees])).toEqual(['draft', 'submitted']);
  });
});

/**
 * The API rejects an oversized file through its multipart limit — but only once the bytes have
 * arrived. Checking first is the difference between an instant refusal and a wasted 10 MB upload.
 */
describe('attachmentProblem', () => {
  it('refuses a file over 10 MB', () => {
    expect(attachmentProblem({ name: 'big.pdf', size: MAX_ATTACHMENT_BYTES + 1 })).toContain(
      'larger than 10 MB',
    );
  });

  it('refuses an empty file', () => {
    expect(attachmentProblem({ name: 'empty.pdf', size: 0 })).toContain('empty');
  });

  it('accepts a file at the limit', () => {
    expect(attachmentProblem({ name: 'ok.pdf', size: MAX_ATTACHMENT_BYTES })).toBeNull();
  });
});

describe('describeAttachments', () => {
  it('says none when there are none', () => {
    expect(describeAttachments(requirement())).toBe('none');
  });

  it('lists them by name', () => {
    const withFiles = requirement({
      attachments: [
        { originalName: 'a.pdf', contentType: 'application/pdf', size: 1, url: 'u' },
        { originalName: 'b.png', contentType: 'image/png', size: 1, url: 'u' },
      ],
    });
    expect(describeAttachments(withFiles)).toBe('a.pdf, b.png');
  });
});
