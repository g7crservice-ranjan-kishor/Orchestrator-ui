/** One destination in the sidebar. */
export interface NavItem {
  /** The route it goes to. Also the key the menu selects on. */
  to: string;
  label: string;
  /** Which icon to draw. Kept out of here so this module stays testable without React. */
  icon: NavIcon;
}

export type NavIcon =
  | 'overview'
  | 'projects'
  | 'requirements'
  | 'planning'
  | 'development'
  | 'qa'
  | 'runs'
  | 'audit'
  | 'users';

/** Where the sidebar goes when no project is open. */
export const WORKSPACE_NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: 'overview' },
  { to: '/projects', label: 'Projects', icon: 'projects' },
  { to: '/users', label: 'Users', icon: 'users' },
];

/**
 * The project id in a path, or null when the path is not inside a project.
 *
 * `/projects` is the list, not a project — only `/projects/<id>/...` is one.
 */
export function projectIdFrom(pathname: string): string | null {
  const match = /^\/projects\/([^/]+)(?:\/|$)/.exec(pathname ?? '');
  const id = match?.[1];
  return id && id !== 'new' ? id : null;
}

/**
 * Everything reachable for one project, in the order the work happens.
 *
 * Deliberately only the sections that exist. A sidebar entry for a page that is not built leads
 * somewhere empty, and an empty page is read as a broken one — worse than the entry being absent,
 * because it costs a click to find out.
 */
export function projectNav(projectId: string): NavItem[] {
  const base = `/projects/${projectId}`;
  return [
    { to: `${base}/requirements`, label: 'Requirement Intake', icon: 'requirements' },
    { to: `${base}/planning`, label: 'Planning', icon: 'planning' },
    { to: `${base}/board`, label: 'Development', icon: 'development' },
    { to: `${base}/board?view=qa`, label: 'QA Testing', icon: 'qa' },
    { to: `${base}/runs`, label: 'Runs', icon: 'runs' },
    { to: `${base}/audit`, label: 'Audit', icon: 'audit' },
  ];
}

/**
 * Which entry should look selected, given where the browser is.
 *
 * Development and QA Testing are the same route told apart by a query string, so the path alone
 * cannot decide between them — matching on the path would light both up at once.
 */
export function activeNavKey(pathname: string, search: string): string {
  const projectId = projectIdFrom(pathname);
  if (!projectId) {
    // `/users` and `/projects` match on their first segment; everything else is Overview.
    const first = `/${(pathname ?? '').split('/')[1] ?? ''}`;
    return WORKSPACE_NAV.some((item) => item.to === first) ? first : '/';
  }
  const items = projectNav(projectId);
  const qaView = new URLSearchParams(search ?? '').get('view') === 'qa';
  const exact = items.find((item) => item.to === `${pathname}${qaView ? '?view=qa' : ''}`);
  if (exact) return exact.to;
  return items.find((item) => item.to.split('?')[0] === pathname)?.to ?? '';
}
