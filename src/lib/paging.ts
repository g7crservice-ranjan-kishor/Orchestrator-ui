/**
 * Client-side paging, shared by the lists that do it.
 *
 * Both rules exist because of the same failure: a filter shrinks the list while the reader is on a
 * later page, and they are left looking at an empty table with a footer insisting there are 142
 * rows. The page is clamped, and the label is derived from the same clamped number the rows are.
 */

/** Rows per page across the application's lists. */
export const PAGE_SIZE = 10;

/** The page number actually in effect, once the list's length is taken into account. */
export function clampPage(total: number, page: number, size: number = PAGE_SIZE): number {
  const pages = Math.max(1, Math.ceil(total / size));
  return Math.min(Math.max(1, page), pages);
}

/** One page of rows. A page past the end returns the last one rather than nothing. */
export function pageOf<T>(rows: T[], page: number, size: number = PAGE_SIZE): T[] {
  const safe = clampPage(rows.length, page, size);
  return rows.slice((safe - 1) * size, safe * size);
}

/**
 * `Showing 1 to 10 of 142 logs` — and `Showing 0 of 0 logs` when a filter matches nothing.
 *
 * `noun` is the singular; the plural is it plus an `s`, which covers "run" and "log".
 */
export function showingLabel(
  total: number,
  page: number,
  noun: string,
  size: number = PAGE_SIZE,
): string {
  if (total === 0) return `Showing 0 of 0 ${noun}s`;
  const safe = clampPage(total, page, size);
  const first = (safe - 1) * size + 1;
  const last = Math.min(safe * size, total);
  return `Showing ${first} to ${last} of ${total} ${noun}${total === 1 ? '' : 's'}`;
}
