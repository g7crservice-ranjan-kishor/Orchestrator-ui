import type { Requirement } from '../../lib/types';

/**
 * The reading and filtering rules behind the Requirement Intake page.
 *
 * They live apart from the component because every one of them is a decision that can be wrong in a
 * way a screenshot will not show: a card that repeats its own first sentence twice, a search that
 * cannot find a requirement by its attachment, a 10 MB upload that fails only after the file has
 * been sent. Each is pinned by a test instead.
 */

/** A line break, built from its character code — a literal backslash escape in this repository's
 *  source has been mangled by tooling more than once. */
const NEWLINE = String.fromCharCode(10);
const CARRIAGE_RETURN = String.fromCharCode(13);

/** The intake form's own limit. The API only sets a minimum; this keeps a card readable. */
export const MAX_REQUIREMENT_CHARS = 5000;

/** Matched to the API's `MinLength(10)` so the form refuses before the request does. */
export const MIN_REQUIREMENT_CHARS = 10;

/** The API's `MAX_ATTACHMENT_BYTES`. Checked here so a too-large file is refused before upload. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** What the file picker offers, and what the hint under it says. */
export const ACCEPTED_ATTACHMENTS = '.pdf,.doc,.docx,.png,.jpg,.jpeg';
export const ACCEPTED_ATTACHMENTS_LABEL =
  'Supported formats: PDF, DOC, DOCX, PNG, JPG (max 10 MB each)';

/** Longest a derived title may run before it is cut at a word boundary. */
const TITLE_MAX = 120;

export interface Headline {
  /** The bold first line of a card. */
  title: string;
  /** Everything else. Empty when the requirement is a single short line. */
  body: string;
}

function normalise(text: string): string {
  return (text ?? '').split(CARRIAGE_RETURN).join('').trim();
}

/** Index just past the first sentence ending, or -1. */
function firstSentenceEnd(text: string): number {
  const ends = ['. ', '! ', '? ', '.' + NEWLINE, '!' + NEWLINE, '?' + NEWLINE]
    .map((mark) => text.indexOf(mark))
    .filter((at) => at > 0);
  if (ends.length === 0) return -1;
  return Math.min(...ends) + 1;
}

/** Cuts at the last word boundary before `limit`. */
function cutAtWord(text: string, limit: number): number {
  if (text.length <= limit) return text.length;
  const space = text.lastIndexOf(' ', limit);
  return space > limit / 2 ? space : limit;
}

/**
 * Splits a requirement into the heading a card shows in bold and the prose underneath it.
 *
 * A requirement is free text, so there is no title field to read — but people do write one, as a
 * short first line above the detail ("Focus Timer – Browser-based timer"). When they have, it is
 * used exactly as written. When they have not, the opening sentence stands in and the card shows
 * what *follows* it, so the same words never appear twice on one card.
 */
export function headline(text: string): Headline {
  const clean = normalise(text);
  if (!clean) return { title: 'Untitled requirement', body: '' };

  const lines = clean.split(NEWLINE);
  const first = lines[0].trim();
  const rest = lines.slice(1).join(NEWLINE).trim();

  // Written with a heading line of its own.
  if (rest && first.length > 0 && first.length <= TITLE_MAX) {
    return { title: first, body: rest };
  }

  // One block of prose: the opening sentence becomes the heading.
  const sentence = firstSentenceEnd(clean);
  if (sentence > 0 && sentence <= TITLE_MAX) {
    return { title: clean.slice(0, sentence).trim(), body: clean.slice(sentence).trim() };
  }

  const cut = cutAtWord(clean, TITLE_MAX);
  const title = clean.slice(0, cut).trim();
  const body = clean.slice(cut).trim();
  return { title: body ? title + '…' : title, body };
}

/**
 * How long ago, in the words a person would use.
 *
 * Two requirements for the same product often read almost identically; when they were submitted is
 * what tells them apart, and "2 hours ago" answers that faster than a timestamp does. Anything
 * older than a week is given as a date, where the exact day matters more than the distance.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 0) return 'just now'; // a clock skewed into the future is not worth reporting
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return plural(minutes, 'minute') + ' ago';

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, 'hour') + ' ago';

  const days = Math.floor(hours / 24);
  if (days < 7) return plural(days, 'day') + ' ago';

  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function plural(count: number, unit: string): string {
  return count + ' ' + unit + (count === 1 ? '' : 's');
}

/** Status as the badge shows it. Unknown values are passed through rather than hidden. */
export function statusLabel(status: string): string {
  const known: Record<string, string> = { submitted: 'Submitted', draft: 'Draft' };
  const key = (status ?? '').trim().toLowerCase();
  return known[key] ?? (key ? key[0].toUpperCase() + key.slice(1) : 'Unknown');
}

/**
 * Free-text match over everything visible on a card — including attachment names, because a
 * requirement is often remembered by the document that came with it rather than by its wording.
 */
export function matchesRequirementSearch(requirement: Requirement, query: string): boolean {
  const term = (query ?? '').trim().toLowerCase();
  if (!term) return true;
  return [
    requirement.text,
    statusLabel(requirement.status),
    ...requirement.attachments.map((a) => a.originalName),
  ]
    .filter(Boolean)
    .some((field) => field.toLowerCase().includes(term));
}

/** Search and status filter, newest first. */
export function visibleRequirements(
  requirements: Requirement[],
  opts: { search: string; status: string },
): Requirement[] {
  return requirements
    .filter(
      (requirement) =>
        matchesRequirementSearch(requirement, opts.search) &&
        (opts.status === 'all' || requirement.status === opts.status),
    )
    .sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? ''));
}

/** Only the statuses actually present, so the filter never offers an empty result. */
export function statusesInUse(requirements: Requirement[]): string[] {
  return [...new Set(requirements.map((r) => r.status))].sort();
}

/**
 * Why a file cannot be attached, or null when it can.
 *
 * The size check matters: the API's multipart limit rejects an oversized file only *after* it has
 * been uploaded, so without this a person waits for a 10 MB transfer to finish before being told it
 * was never going to work.
 */
export function attachmentProblem(file: { name: string; size: number }): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name} is larger than 10 MB and cannot be attached.`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

/** The attachment line under a card. */
export function describeAttachments(requirement: Requirement): string {
  const names = requirement.attachments.map((a) => a.originalName);
  return names.length > 0 ? names.join(', ') : 'none';
}
