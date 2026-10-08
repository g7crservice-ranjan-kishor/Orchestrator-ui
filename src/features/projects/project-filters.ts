import { DATABASE_LABELS, type DatabaseChoice, type Project } from '../../lib/types';

/** How the list is ordered. Only fields the API actually returns are offered. */
export type ProjectSort = 'name-asc' | 'name-desc' | 'repos-desc';

export const SORT_LABELS: Record<ProjectSort, string> = {
  'name-asc': 'Name (A–Z)',
  'name-desc': 'Name (Z–A)',
  'repos-desc': 'Most repositories',
};

/**
 * The repository's own name, from a target that may be a bare name or a clone URL:
 * `https://dev.azure.com/org/Project/_git/taskmanager-api` → `taskmanager-api`.
 *
 * Mirrors the backend's `repoNameOf`, because the two must agree on what a repository is called —
 * that mismatch is exactly what left every Task unassignable once before.
 */
export function repoName(target: string): string {
  return (
    target
      .replace(/\.git$/i, '')
      .split('/')
      .filter(Boolean)
      .pop() ?? target
  );
}

/**
 * Whether the Azure DevOps target is complete enough to push to.
 *
 * Deliberately *configured*, not *connected*: nothing here has spoken to Azure DevOps, and showing
 * a green "Connected" for a target that has never been contacted would be a claim the UI cannot
 * support. What can be said truthfully is whether all three parts are set.
 */
export function adoConfigured(project: Project): boolean {
  const { orgUrl, project: adoProject, areaPath } = project.adoTarget;
  return Boolean(orgUrl?.trim() && adoProject?.trim() && areaPath?.trim());
}

/** Free-text match across the fields a person would search by. */
export function matchesSearch(project: Project, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  return [
    project.name,
    project.description,
    project.adoTarget.project,
    DATABASE_LABELS[project.database] ?? project.database,
    ...project.targetRepos.map(repoName),
  ]
    .filter(Boolean)
    .some((field) => field.toLowerCase().includes(term));
}

export function sortProjects(projects: Project[], sort: ProjectSort): Project[] {
  const byName = (a: Project, b: Project) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  switch (sort) {
    case 'name-desc':
      return [...projects].sort((a, b) => byName(b, a));
    case 'repos-desc':
      // Ties keep alphabetical order, so the list never reshuffles arbitrarily.
      return [...projects].sort(
        (a, b) => b.targetRepos.length - a.targetRepos.length || byName(a, b),
      );
    case 'name-asc':
    default:
      return [...projects].sort(byName);
  }
}

/** Search, database filter and ordering, applied in that order. */
export function visibleProjects(
  projects: Project[],
  opts: { search: string; database: DatabaseChoice | 'all'; sort: ProjectSort },
): Project[] {
  const filtered = projects.filter(
    (project) =>
      matchesSearch(project, opts.search) &&
      (opts.database === 'all' || project.database === opts.database),
  );
  return sortProjects(filtered, opts.sort);
}

/** Only the databases actually in use, so the filter never offers an empty result. */
export function databasesInUse(projects: Project[]): DatabaseChoice[] {
  const seen = new Set(projects.map((project) => project.database));
  return (Object.keys(DATABASE_LABELS) as DatabaseChoice[]).filter((choice) => seen.has(choice));
}
