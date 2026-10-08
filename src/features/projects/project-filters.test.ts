import { describe, expect, it } from 'vitest';
import {
  adoConfigured,
  databasesInUse,
  matchesSearch,
  repoName,
  sortProjects,
  visibleProjects,
} from './project-filters';
import type { DatabaseChoice, Project, UiStyleChoice } from '../../lib/types';

const project = (over: Partial<Project> = {}): Project => ({
  id: over.id ?? '1',
  name: 'Task Manager',
  description: 'Two-repo task management application',
  adoTarget: {
    orgUrl: 'https://dev.azure.com/RanjanKishor0024',
    project: 'Task-Manager',
    areaPath: 'Task-Manager',
  },
  targetRepos: [
    'https://dev.azure.com/RanjanKishor0024/Task-Manager/_git/taskmanager-api',
    'https://dev.azure.com/RanjanKishor0024/Task-Manager/_git/taskmanager-ui',
  ],
  database: 'sqlserver' as DatabaseChoice,
  uiStyle: 'antd' as UiStyleChoice,
  ...over,
});

describe('repoName', () => {
  it('takes the repository name out of a clone URL', () => {
    expect(repoName('https://dev.azure.com/org/Proj/_git/taskmanager-api')).toBe('taskmanager-api');
  });

  it('leaves a bare name alone, and drops a .git suffix', () => {
    expect(repoName('taskmanager-ui')).toBe('taskmanager-ui');
    expect(repoName('https://host/x/_git/repo.git')).toBe('repo');
  });
});

/**
 * The row says "Configured", not "Connected". Nothing here has spoken to Azure DevOps, so the only
 * honest claim is whether the target is complete.
 */
describe('adoConfigured', () => {
  it('is true only when org, project and area path are all set', () => {
    expect(adoConfigured(project())).toBe(true);
    expect(adoConfigured(project({ adoTarget: { orgUrl: '', project: 'P', areaPath: 'A' } }))).toBe(
      false,
    );
    expect(
      adoConfigured(project({ adoTarget: { orgUrl: 'u', project: '  ', areaPath: 'A' } })),
    ).toBe(false);
  });
});

describe('matchesSearch', () => {
  it('matches an empty query', () => {
    expect(matchesSearch(project(), '   ')).toBe(true);
  });

  it('searches the name, description, ADO project and repositories', () => {
    expect(matchesSearch(project(), 'task man')).toBe(true);
    expect(matchesSearch(project(), 'two-repo')).toBe(true);
    expect(matchesSearch(project(), 'Task-Manager')).toBe(true);
    expect(matchesSearch(project(), 'taskmanager-ui')).toBe(true);
  });

  /** A repository is searchable by its name, not by the URL noise around it. */
  it('does not match on the URL boilerplate shared by every repository', () => {
    expect(
      matchesSearch(project({ name: 'x', description: '', targetRepos: [] }), 'dev.azure'),
    ).toBe(false);
  });

  it('ignores case', () => {
    expect(matchesSearch(project(), 'TASK MANAGER')).toBe(true);
  });

  it('matches the database by its label, not its internal id', () => {
    expect(matchesSearch(project(), 'SQL Server')).toBe(true);
  });
});

describe('sortProjects', () => {
  const a = project({ id: 'a', name: 'Alpha', targetRepos: ['one'] });
  const b = project({ id: 'b', name: 'beta', targetRepos: ['one', 'two', 'three'] });
  const c = project({ id: 'c', name: 'Gamma', targetRepos: [] });

  it('orders by name regardless of case', () => {
    expect(sortProjects([c, b, a], 'name-asc').map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(sortProjects([a, b, c], 'name-desc').map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });

  it('orders by repository count, breaking ties alphabetically', () => {
    const d = project({ id: 'd', name: 'Aardvark', targetRepos: ['one'] });
    expect(sortProjects([a, b, c, d], 'repos-desc').map((p) => p.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('does not mutate the array it was given', () => {
    const input = [c, a, b];
    sortProjects(input, 'name-asc');
    expect(input.map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('visibleProjects', () => {
  const sql = project({ id: 'sql', name: 'Task Manager', database: 'sqlserver' });
  const mongo = project({ id: 'mongo', name: 'Quiz generator', database: 'mongodb' });

  it('applies the search, the database filter and the order together', () => {
    expect(
      visibleProjects([sql, mongo], { search: '', database: 'all', sort: 'name-asc' }).map(
        (p) => p.id,
      ),
    ).toEqual(['mongo', 'sql']);

    expect(
      visibleProjects([sql, mongo], { search: '', database: 'mongodb', sort: 'name-asc' }).map(
        (p) => p.id,
      ),
    ).toEqual(['mongo']);

    expect(
      visibleProjects([sql, mongo], { search: 'quiz', database: 'all', sort: 'name-asc' }).map(
        (p) => p.id,
      ),
    ).toEqual(['mongo']);
  });
});

describe('databasesInUse', () => {
  /** Offering a filter that can only ever return nothing is worse than offering fewer. */
  it('offers only the databases some project actually uses', () => {
    const projects = [project({ database: 'sqlserver' }), project({ database: 'mongodb' })];
    expect(databasesInUse(projects)).toEqual(['sqlserver', 'mongodb']);
  });

  it('is empty when there are no projects', () => {
    expect(databasesInUse([])).toEqual([]);
  });
});
