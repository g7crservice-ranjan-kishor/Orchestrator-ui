import { describe, expect, it } from 'vitest';
import { parsePlan } from './plan-model';

/**
 * Reading a generated plan into the review dashboard.
 *
 * The sample below is shaped like what the EM agent actually returns for a two-repository web
 * application: headings for phases, a nested breakdown, acceptance criteria as bullets, risks with
 * Impact/Mitigation lines. The tests assert both halves of the contract — that the structure is
 * recognised, and that **nothing is lost** when it is not.
 */
const PLAN = `# Plan

Task Manager: a small web application for creating and tracking personal tasks.

## Objective

Deliver a task manager with authentication, split across an API and a UI repository.

## Scope

### In scope

- Email + password authentication with JWT sessions
- Create, list, update and delete tasks
- Logout and token expiry handling

### Out of scope

- Team or shared workspaces
- Mobile applications
- Email notifications

## Repositories

- **taskmanager-api** — Backend
  - Stack: Node.js 20, Express, Prisma
  - Database: PostgreSQL
- **taskmanager-ui** — Frontend
  - Stack: React 18, Vite

## Phases

### Phase 0 — Foundations & API Contract

Set up both repositories, define the API contract, and establish the database structure.

- Story 0.1 — Repository scaffolding
  - Task: Initialise the API repository with linting and CI
  - Task: Initialise the UI repository
- Story 0.2 — Database schema

Acceptance criteria:

- Both repositories build from a clean checkout
- The OpenAPI document describes every planned endpoint

### Phase 1 — Authentication

Register, sign in, and protect the API with JWT.

- Story 1.1 — Registration endpoint
- Story 1.2 — Login endpoint

### Phase 2 — Task Management

CRUD for tasks, scoped to the signed-in user.

## Breakdown

### Epic 4 — Task Management

#### Feature 4.1 — Task CRUD

- Story 4.1.1 — API: Create a task
  - Acceptance criteria:
    - Valid request creates a task
    - Owner is taken from the authenticated user
    - Missing token returns 401
    - Invalid title returns 400
  - Task: Add the POST /tasks route
  - Task: Add request validation
  - Task: Add persistence
  - Task: Add tests
- Story 4.1.2 — API: List tasks

## Risks

- **Risk:** CORS misconfiguration — Impact: the API may reject legitimate UI requests or allow unintended origins. Mitigation: configure an explicit UI origin allowlist.
- **Risk:** Token storage in the browser
  - Impact: a token in local storage is readable by any injected script.
  - Mitigation: store the token in memory and refresh through an http-only cookie.

## API contract

\`POST /tasks\` creates a task and returns 201 with the created resource.

## Security

- Passwords hashed with bcrypt (cost 12)
- JWT signed with HS256

## Required credentials

- DATABASE_URL — connection string for the application database — postgres://user:pass@host:5432/db
- JWT_SECRET — signing key for session tokens — a 32-byte random string
`;

describe('parsePlan', () => {
  const plan = parsePlan(PLAN);

  it('reads the document title and the text before the first section', () => {
    expect(plan.title).toBe('Plan');
    expect(plan.intro[0]).toMatchObject({ kind: 'para' });
  });

  it('splits scope into what is in and what is out', () => {
    expect(plan.scope?.inScope).toHaveLength(3);
    expect(plan.scope?.inScope[0]).toContain('authentication');
    expect(plan.scope?.outOfScope).toEqual([
      'Team or shared workspaces',
      'Mobile applications',
      'Email notifications',
    ]);
  });

  it('reads each repository as a card with its technical facts as chips', () => {
    expect(plan.repositories.map((repo) => repo.name)).toEqual([
      'taskmanager-api',
      'taskmanager-ui',
    ]);
    expect(plan.repositories[0].role).toBe('Backend');
    expect(plan.repositories[0].chips).toEqual([
      { label: 'Stack', value: 'Node.js 20, Express, Prisma' },
      { label: 'Database', value: 'PostgreSQL' },
    ]);
  });

  it('reads the phases with a one-line summary for the collapsed card', () => {
    expect(plan.phases.map((phase) => phase.label)).toEqual(['Phase 0', 'Phase 1', 'Phase 2']);
    expect(plan.phases[0].title).toBe('Foundations & API Contract');
    expect(plan.phases[0].summary).toContain('Set up both repositories');
  });

  it('keeps the stories of a phase as work items rather than prose', () => {
    const [phase] = plan.phases;
    expect(phase.work.map((node) => node.title)).toEqual([
      'Repository scaffolding',
      'Database schema',
    ]);
    expect(phase.work[0].kind).toBe('story');
    expect(phase.work[0].children.map((task) => task.kind)).toEqual(['task', 'task']);
  });

  it("lifts a phase's acceptance criteria into a checklist", () => {
    expect(plan.phases[0].acceptance).toEqual([
      'Both repositories build from a clean checkout',
      'The OpenAPI document describes every planned endpoint',
    ]);
    // The label and its bullets are lifted out, so they are not also shown as loose text.
    expect(JSON.stringify(plan.phases[0].blocks)).not.toContain('clean checkout');
  });

  it('reads Epic → Feature → Story → Task as a hierarchy', () => {
    const [epic] = plan.epics;
    expect(epic).toMatchObject({ kind: 'epic', label: 'Epic 4', title: 'Task Management' });
    const [feature] = epic.children;
    expect(feature).toMatchObject({ kind: 'feature', title: 'Task CRUD' });
    const [story] = feature.children;
    expect(story).toMatchObject({ kind: 'story', label: 'Story 4.1.1' });
    expect(story.children.map((task) => task.title)).toEqual([
      'Add the POST /tasks route',
      'Add request validation',
      'Add persistence',
      'Add tests',
    ]);
  });

  it("reads a story's acceptance criteria as individual checks", () => {
    const story = plan.epics[0].children[0].children[0];
    expect(story.acceptance).toEqual([
      'Valid request creates a task',
      'Owner is taken from the authenticated user',
      'Missing token returns 401',
      'Invalid title returns 400',
    ]);
  });

  it('separates each risk into its impact and its mitigation', () => {
    expect(plan.risks).toHaveLength(2);
    expect(plan.risks[0].title).toBe('CORS misconfiguration');
    expect(plan.risks[0].impact).toContain('reject legitimate UI requests');
    expect(plan.risks[0].mitigation).toContain('explicit UI origin allowlist');
    expect(plan.risks[1].title).toBe('Token storage in the browser');
    expect(plan.risks[1].impact).toContain('local storage');
    expect(plan.risks[1].mitigation).toContain('http-only cookie');
  });

  it('files engineering detail under technical sections rather than the summary', () => {
    expect(plan.technical.map((section) => section.title)).toEqual(['API contract', 'Security']);
    expect(plan.credentials?.title).toBe('Required credentials');
  });

  it('counts what the plan contains', () => {
    expect(plan.stats).toEqual({ phases: 3, epics: 1, features: 1, stories: 6, tasks: 6 });
  });

  /**
   * Regression — the breakdown written as **bold paragraphs** rather than headings, which is what
   * the EM agent actually produced for the Task Manager plan.
   *
   * The bug: only the *first* list in the section was read as work. Epic 1's three Features became
   * the entire tree, every later epic fell through to loose prose, and the "What is being built"
   * chips showed Epic 1's scaffolding as though it were the plan.
   */
  describe('when epics are bold paragraphs instead of headings', () => {
    const BOLD_PLAN = [
      '# Plan',
      '',
      '## Breakdown',
      '',
      '**Epic 1: Backend project foundation**',
      '- Feature: Repo scaffolding (language/framework, lint/format, Dockerfile)',
      '- Feature: Config loading — validate DATABASE_URL and JWT_SECRET at boot',
      '- Feature: Data model — Users and Tasks tables/migrations against SQL Server',
      '',
      '**Epic 2: Authentication & authorization**',
      '- Story: Register endpoint (email/password validation, hashing, uniqueness check)',
      '- Story: Login endpoint (credential check, JWT issuance)',
      '',
      '**Epic 3: Task management API**',
      '- Story: Create task (validated title/description)',
      '',
    ].join(String.fromCharCode(10));

    it('keeps every epic, not just the one whose list came first', () => {
      const epics = parsePlan(BOLD_PLAN).epics;
      expect(epics.map((e) => e.title)).toEqual([
        'Backend project foundation',
        'Authentication & authorization',
        'Task management API',
      ]);
      expect(epics.every((e) => e.kind === 'epic')).toBe(true);
    });

    it('nests each list under the epic it was written beneath', () => {
      const [first, second, third] = parsePlan(BOLD_PLAN).epics;
      expect(first.children.map((c) => c.kind)).toEqual(['feature', 'feature', 'feature']);
      expect(first.children[0].title).toBe(
        'Repo scaffolding (language/framework, lint/format, Dockerfile)',
      );
      expect(second.children.map((c) => c.kind)).toEqual(['story', 'story']);
      expect(third.children).toHaveLength(1);
    });

    /** The visible symptom: scaffolding Features presented as the top-level plan. */
    it('never promotes a child Feature to the top level', () => {
      expect(parsePlan(BOLD_PLAN).epics.some((e) => e.kind === 'feature')).toBe(false);
    });

    /** A bold epic line must not be silently dropped into prose either. */
    it('leaves no epic behind as loose lead text', () => {
      const plan = parsePlan(BOLD_PLAN);
      const lead = JSON.stringify(plan.epicsLead ?? []);
      expect(lead).not.toContain('Authentication');
    });

    /** Ordinary prose that happens to start with a work word is still prose. */
    it('does not mistake a sentence beginning "Tasks are..." for an epic', () => {
      const prose = [
        '# Plan',
        '',
        '## Breakdown',
        '',
        'Tasks are owned by the user who created them.',
        '',
        '**Epic 1: Foundation**',
        '- Story: Scaffold the repository',
        '',
      ].join(String.fromCharCode(10));
      const epics = parsePlan(prose).epics;
      expect(epics).toHaveLength(1);
      expect(epics[0].title).toBe('Foundation');
    });
  });

  describe('when the plan is shaped differently', () => {
    it('handles phases written as a flat list', () => {
      const parsed = parsePlan('## Phases\n\n- Phase 1 — Setup\n- Phase 2 — Build\n');
      expect(parsed.phases.map((p) => p.title)).toEqual(['Setup', 'Build']);
    });

    it('handles risks written as a table', () => {
      const parsed = parsePlan(
        '## Risks\n\n| Risk | Impact | Mitigation |\n| --- | --- | --- |\n| Scope creep | Slips the date | Freeze scope after approval |\n',
      );
      expect(parsed.risks[0]).toMatchObject({
        title: 'Scope creep',
        impact: 'Slips the date',
        mitigation: 'Freeze scope after approval',
      });
    });

    it('treats a single unlabelled list under Scope as what is in scope', () => {
      const parsed = parsePlan('## Scope\n\n- Login\n- Logout\n');
      expect(parsed.scope?.inScope).toEqual(['Login', 'Logout']);
      expect(parsed.scope?.outOfScope).toEqual([]);
    });

    /**
     * What the Task-Manager plan actually wrote: bold labels with a parenthetical aside instead of
     * sub-headings. The aside used to push the label past the length guard, so "Out of scope" was
     * never recognised — the card read "Nothing was excluded explicitly" while the excluded items
     * sat below it as loose text.
     */
    it('recognises a bold scope label that carries a parenthetical aside', () => {
      const parsed = parsePlan(
        [
          '## Scope',
          '',
          '**In scope** (the requirement as written)',
          '',
          '- User registration and login',
          '- Task CRUD scoped to the owning user',
          '',
          '**Out of scope** (keeps the app "simple" per the requirement; candidate fast-follows)',
          '',
          '- Password reset / email verification flows',
          '- Real-time sync (websockets)',
          '',
        ].join('\n'),
      );
      expect(parsed.scope?.inScope).toEqual([
        'User registration and login',
        'Task CRUD scoped to the owning user',
      ]);
      expect(parsed.scope?.outOfScope).toEqual([
        'Password reset / email verification flows',
        'Real-time sync (websockets)',
      ]);
      // ...and the labels are not repeated underneath as leftover prose.
      expect(parsed.scope?.extra).toEqual([]);
    });

    it('does not read an ordinary sentence as a scope label', () => {
      const parsed = parsePlan(
        '## Scope\n\nIncluded here is everything the first release must do for a signed-in user.\n\n- Login\n',
      );
      expect(parsed.scope?.inScope).toEqual(['Login']);
      expect(parsed.scope?.extra).toHaveLength(1);
    });

    /** A plan in a shape nobody anticipated must still be readable, not blank. */
    it('keeps an unrecognised section instead of dropping it', () => {
      const parsed = parsePlan('## Stakeholder sign-off\n\nAsk Priya before release.\n');
      expect(parsed.other.map((section) => section.title)).toEqual(['Stakeholder sign-off']);
      expect(JSON.stringify(parsed.other)).toContain('Ask Priya before release.');
    });

    it('does not fall over on an empty plan', () => {
      const parsed = parsePlan('');
      expect(parsed.phases).toEqual([]);
      expect(parsed.stats).toEqual({ phases: 0, epics: 0, features: 0, stories: 0, tasks: 0 });
    });
  });

  /**
   * The redesign's central promise. Every heading in the source document has to survive into the
   * model somewhere — a presentation change must never quietly remove part of a plan.
   */
  it('keeps every heading of the source document', () => {
    const headings = PLAN.split('\n')
      .filter((line) => /^#{2,6}\s/.test(line))
      .map((line) => line.replace(/^#+\s*/, '').trim())
      // Container headings ("Breakdown", "Risks", ...) are hoisted into typed fields and the
      // view supplies its own heading for each; their *contents* are what must survive, and the
      // assertions above cover those. Every other heading has to be here verbatim.
      .filter(
        (heading) =>
          !/^(breakdown|work breakdown|risks?|phases|repositories|scope)$/i.test(heading),
      );
    const rendered = JSON.stringify(plan);
    for (const heading of headings) {
      const [, name] = /^(?:Phase|Epic|Feature)\s*[\d.]*\s*[—–-]?\s*(.*)$/.exec(heading) ?? [
        '',
        heading,
      ];
      expect(rendered).toContain(name || heading);
    }
  });
});
