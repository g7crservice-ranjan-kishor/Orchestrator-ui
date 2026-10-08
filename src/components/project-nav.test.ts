import { describe, expect, it } from 'vitest';
import { activeNavKey, projectIdFrom, projectNav, WORKSPACE_NAV } from './project-nav';

/**
 * What the sidebar offers, and which entry looks selected.
 *
 * The sidebar changes shape once a project is open: everything that project can do appears,
 * because hunting for the planning page through the projects list every time is the friction this
 * removes. Only sections that exist are listed — an entry pointing at a page that is not built
 * reads as broken, and costs a click to find that out.
 */
describe('finding the project in a path', () => {
  it('reads the id out of a project route', () => {
    expect(projectIdFrom('/projects/abc123/planning')).toBe('abc123');
  });

  it('reads it from the bare project path too', () => {
    expect(projectIdFrom('/projects/abc123')).toBe('abc123');
  });

  /** The list is not a project. */
  it('finds none on the projects list', () => {
    expect(projectIdFrom('/projects')).toBeNull();
    expect(projectIdFrom('/projects/')).toBeNull();
  });

  it('finds none elsewhere', () => {
    expect(projectIdFrom('/')).toBeNull();
    expect(projectIdFrom('/users')).toBeNull();
  });
});

describe('the project sections', () => {
  const nav = projectNav('p1');

  it('covers the work in the order it happens', () => {
    expect(nav.map((i) => i.label)).toEqual([
      'Requirement Intake',
      'Planning',
      'Development',
      'QA Testing',
      'Runs',
      'Audit',
    ]);
  });

  it('points every entry at that project', () => {
    expect(nav.every((i) => i.to.startsWith('/projects/p1/'))).toBe(true);
  });

  /** Both are the board; only the query string tells them apart. */
  it('separates Development from QA Testing', () => {
    expect(nav.find((i) => i.label === 'Development')?.to).toBe('/projects/p1/board');
    expect(nav.find((i) => i.label === 'QA Testing')?.to).toBe('/projects/p1/board?view=qa');
  });
});

describe('which entry is selected', () => {
  it('selects Overview at the root', () => {
    expect(activeNavKey('/', '')).toBe('/');
  });

  it('selects the workspace entries by their first segment', () => {
    expect(activeNavKey('/projects', '')).toBe('/projects');
    expect(activeNavKey('/users', '')).toBe('/users');
  });

  it('selects a project section', () => {
    expect(activeNavKey('/projects/p1/planning', '')).toBe('/projects/p1/planning');
  });

  /**
   * Development and QA Testing share a route. Matching on the path alone lit both at once, which
   * is the one thing a selected state must never do.
   */
  it('tells Development and QA Testing apart by the query string', () => {
    expect(activeNavKey('/projects/p1/board', '')).toBe('/projects/p1/board');
    expect(activeNavKey('/projects/p1/board', '?view=qa')).toBe('/projects/p1/board?view=qa');
  });

  it('selects Development for any other view value', () => {
    expect(activeNavKey('/projects/p1/board', '?view=nonsense')).toBe('/projects/p1/board');
  });

  it('selects nothing for a project route with no entry', () => {
    expect(activeNavKey('/projects/p1/unknown', '')).toBe('');
  });

  it('offers the workspace entries when no project is open', () => {
    expect(WORKSPACE_NAV.map((i) => i.label)).toEqual(['Overview', 'Projects', 'Users']);
  });
});
