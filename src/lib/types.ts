/** Shared API types mirrored from the backend DTOs. */

export type Role = 'administrator';

export interface User {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  disabled: boolean;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  sessionId: string;
  refreshToken: string;
  user: User;
}

/** Consistent error envelope returned by the backend. */
export interface ErrorEnvelope {
  statusCode: number;
  message: string | string[];
  error: string;
  correlationId: string;
  /** Why a guard refused, when it wants the UI to say more than the message. */
  reason?: string;
  /** The specific problems to fix — one line each, already written for a human. */
  errors?: string[];
  missingSprints?: string[];
  availableSprints?: string[];
}

/** Persisted auth state (access token kept in memory; refresh material persisted). */
export interface StoredAuth {
  sessionId: string;
  refreshToken: string;
}

export interface AdoTarget {
  orgUrl: string;
  project: string;
  areaPath: string;
}

/** The database a project's generated application is built against (mirrors the API catalogue). */
export type DatabaseChoice = 'sqlserver' | 'postgres' | 'mysql' | 'mongodb' | 'unset';

/** Shown in the project form; the order here is the order of the dropdown. */
export const DATABASE_LABELS: Record<DatabaseChoice, string> = {
  sqlserver: 'SQL Server / Azure SQL',
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  mongodb: 'MongoDB',
  unset: 'Let the planner decide',
};

/** How a project's generated interface is built and styled (mirrors the API catalogue). */
export type UiStyleChoice = 'antd' | 'tailwind' | 'mui' | 'css' | 'unset';

export const UI_STYLE_LABELS: Record<UiStyleChoice, string> = {
  antd: 'Ant Design',
  tailwind: 'Tailwind CSS',
  mui: 'Material UI',
  css: 'Plain CSS with tokens',
  unset: 'Let the developer decide',
};

export interface Project {
  id: string;
  name: string;
  description: string;
  adoTarget: AdoTarget;
  targetRepos: string[];
  /** Steers planning: the agent builds against this rather than inferring one from the text. */
  database: DatabaseChoice;
  /** Steers the look: without it an agent ships a working but unstyled application. */
  uiStyle: UiStyleChoice;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  adoTarget: AdoTarget;
  /**
   * This project's own Azure DevOps token. Sent once, stored in the vault, never returned.
   * Without one the project falls back to the platform token, as every project did before.
   */
  adoPat?: string;
  /**
   * Create the Azure DevOps project named in `adoTarget` rather than expecting it to exist.
   *
   * One Azure DevOps project per product. Area paths separate work items, but iterations do not
   * follow them — products sharing a project share one sprint timeline, so a second product
   * inherits the first one's active sprint. A project of its own makes the sprints its own.
   */
  createAdoProject?: boolean;
  targetRepos?: string[];
  database?: DatabaseChoice;
  uiStyle?: UiStyleChoice;
}

/** A created project, plus anything about setting it up that did not work. */
export interface ProvisionedProject extends Project {
  warnings: string[];
}

/** What an organization URL and token can actually see. */
export interface Preflight {
  ok: boolean;
  /** Why not, in words worth showing as-is. Null when `ok`. */
  problem: string | null;
  projects: string[];
  areaPaths: string[];
  repositories: string[];
  /** Whether a new project can be created here. Null when the token could not list processes. */
  canCreateProjects: boolean | null;
  /** Why one cannot be created. Null when one can. */
  processProblem: string | null;
}

/**
 * What the plan says a project still has to be configured with.
 *
 * Asked after planning rather than before it: until there is a plan, nobody knows whether the
 * product stores anything or how many repositories it is.
 */
export interface ProjectConfiguration {
  planReady: boolean;
  needsDatabase: boolean;
  /** The line of the plan that raised the question, quoted for the person answering it. */
  databaseEvidence: string | null;
  /**
   * The plan states the product keeps nothing on a server.
   *
   * Different from "no database was detected": this is a decision the plan took, worth showing
   * rather than leaving as silence.
   */
  serverless: boolean;
  repositories: string[];
  /** The interface framework the plan names, or null when it names none. */
  uiStyle: UiStyleChoice | null;
  database: DatabaseChoice;
  databaseConfigured: boolean;
  configuredRepositories: string[];
  currentUiStyle: UiStyleChoice;
}

export interface RequirementAttachment {
  originalName: string;
  contentType: string;
  size: number;
  url: string;
}

export interface Requirement {
  id: string;
  projectId: string;
  text: string;
  status: string;
  attachments: RequirementAttachment[];
  /** When it was submitted, ISO 8601. */
  createdAt: string;
}

export type BacklogItemType = 'epic' | 'feature' | 'story' | 'task';

export interface Clarification {
  id: string;
  question: string;
  answer: string | null;
  answeredAt: string | null;
}

export interface BacklogItem {
  id: string;
  type: BacklogItemType;
  title: string;
  description: string;
  acceptanceCriteria: string;
  parentId: string | null;
  order: number;
  priority: number;
  estimate: number | null;
  dependsOn: string[];
  repo: string | null;
  sprint: string | null;
  attachments: { originalName: string; url: string; contentType: string; size: number }[];
  adoId: number | null;
}

export interface ApprovalState {
  approved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  adoTargetConfirmed: boolean;
  confirmedTarget: AdoTarget | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  pushedToAdo: boolean;
  pushedAt: string | null;
}

/**
 * One credential the generated application needs at runtime. Carries the name, its purpose and
 * whether a value has been stored — **never the value**, which lives only in Key Vault.
 */
export interface RequiredSecret {
  name: string;
  description: string;
  example: string;
  provided: boolean;
  providedAt: string | null;
}

/** Whether a plan is the product's first or a later change to it. */
export type DraftKind = 'initial' | 'enhancement';

/** Where a technical detail's value came from — shown beside it, so a fact reads as a fact. */
export type DetailSource = 'requirement' | 'project' | 'user' | 'missing';

/** One technology decision: what it is, what was chosen, and who chose it. */
export interface TechnicalDetail {
  field: string;
  label: string;
  value: string | null;
  source: DetailSource;
  required: boolean;
  question: string;
  /** The usual answers, offered as suggestions. Never a constraint — the field stays free text. */
  options?: string[];
}

export interface Draft {
  id: string;
  projectId: string;
  status: string;
  kind: DraftKind;
  /** Position in the project's planning history: 0 is the initial plan, 1 the first enhancement. */
  seq: number;
  /** The enhancement's name; null for the initial plan. */
  title: string | null;
  /** What to call this plan on screen: "Initial plan", or "ENH-001 — Implement Dark Mode". */
  label: string;
  clarifications: Clarification[];
  /** Credentials the generated application needs at runtime; values live only in Key Vault. */
  requiredSecrets: RequiredSecret[];
  /** The technology this product is built with, and where each decision came from. */
  technicalDetails: TechnicalDetail[];
  planMarkdown: string | null;
  planApproved: boolean;
  planFeedback: string | null;
  /** What the generated plan is missing against the project's binding choices; empty when fine. */
  planIssues: string[];
  /** Why the last run left nothing behind; null when it delivered. */
  runNote: string | null;
  backlog: BacklogItem[];
  backlogApproved: boolean;
  approval: ApprovalState;
  currentRunId: string | null;
}

export type ConfirmAdoTargetInput = AdoTarget;

export interface PushedItem {
  itemId: string;
  adoId: number;
  type: string;
  title: string;
  created: boolean;
}

export interface PushResult {
  created: number;
  skipped: number;
  items: PushedItem[];
}

/** Normalized Development-board execution states (presentation layer over the raw ADO states). */
export type TaskStatus = 'Draft' | 'To Do' | 'In Progress' | 'Done';

/** The Development workflow, left → right. */
export const TASK_COLUMNS: readonly TaskStatus[] = ['Draft', 'To Do', 'In Progress', 'Done'];

/** Where a sprint sits relative to today, as classified by Azure DevOps itself. */
export type SprintTimeFrame = 'past' | 'current' | 'future' | 'unknown';

/** A parent work item shown as context on a Task card (never a card itself). */
export interface WorkItemRef {
  adoId: number | null;
  title: string;
  state: string | null;
}

/** The latest Developer run for a Task (projected from the existing job records). */
export interface TaskExecution {
  runId: string;
  state: string;
  attempts: number;
  startedAt: string | null;
  completedAt: string | null;
  blockedReason: string | null;
  durationMs: number;
  tokens: number;
  cost: number;
  filesChanged: number;
  commits: string[];
}

/** Backend-computed eligibility for a card's single forward move — the UI never re-derives rules. */
export interface TransitionAvailability {
  to: TaskStatus | null;
  allowed: boolean;
  reason?: string;
  hint?: string;
}

/** One Task card — the Developer Agent's unit of execution (one agent run = one Task). */
export interface BoardTask {
  /**
   * What the card is. A Developer agent executes **Tasks** (new work) and **Bugs** (defects QA
   * found) — both appear on the Development board because both are work a developer picks up.
   */
  kind: 'task' | 'bug';
  adoId: number | null;
  key: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  state: string | null;
  status: TaskStatus;
  sprint: string | null;
  sprintPath: string | null;
  sprintTimeFrame: SprintTimeFrame;
  assignee: string | null;
  /** The agent that would execute this Task — distinct from `assignee`. */
  executionAgent: string | null;
  repo: string | null;
  /** ADO `System.ChangedDate` — the card's "Updated 2 hours ago" line. */
  updatedAt: string | null;
  agentRunning: boolean;
  execution: TaskExecution | null;
  canTransition: TransitionAvailability;
  story: WorkItemRef | null;
  feature: WorkItemRef | null;
  epic: WorkItemRef | null;
}

/** One sprint in a rollover preview. */
export interface SprintSummary {
  name: string;
  path: string;
  startDate: string | null;
  finishDate: string | null;
}

/** A Task that will not be finished when the sprint closes. */
export interface CarryOverTask {
  adoId: number | null;
  key: string;
  title: string;
  status: string;
}

/**
 * What closing the active sprint would do (or did). Azure DevOps decides the current sprint from
 * iteration dates alone, so a rollover is literally a date change — previewed here before it runs.
 */
export interface SprintRolloverPlan {
  ok: boolean;
  dryRun: boolean;
  applied: boolean;
  current: SprintSummary | null;
  next: SprintSummary | null;
  /** The closing sprint's start, moved back only when it would otherwise outlast its finish. */
  newCurrentStart: string | null;
  newCurrentFinish: string | null;
  newNextStart: string | null;
  newNextFinish: string | null;
  blockers: string[];
  carryOver: CarryOverTask[];
}

export interface BoardColumn {
  status: TaskStatus;
  tasks: BoardTask[];
}

export interface Board {
  pushed: boolean;
  /** Active sprint from ADO, or null when it cannot be determined. */
  currentSprint: string | null;
  columns: BoardColumn[];
}

/**
 * Statuses a user may move a Task **to**. `Done` is intentionally absent — only the orchestrator
 * completes a Task, and only after the Developer Agent's run succeeds.
 */
export type TransitionTarget = 'To Do' | 'In Progress';

/** How the transition was initiated (recorded in the audit trail). */
export type TransitionSource = 'button' | 'drag-drop' | 'bulk';

/** succeeded = moved; blocked = a rule rejected it; skipped = nothing to do; failed = errored. */
export type OutcomeStatus = 'succeeded' | 'blocked' | 'failed' | 'skipped';

export interface TaskTransitionOutcome {
  taskKey: string;
  adoId: number | null;
  title: string;
  from: string;
  to: string;
  status: OutcomeStatus;
  ok: boolean;
  reason?: string;
  hint?: string;
  runId?: string;
  sprint?: string | null;
  executionAgent?: string | null;
}

export interface TaskTransitionResult {
  bulkOperationId: string;
  to: TransitionTarget;
  dryRun: boolean;
  requested: number;
  succeeded: number;
  blocked: number;
  failed: number;
  skipped: number;
  outcomes: TaskTransitionOutcome[];
}

/** Where one Task stands in the development queue. */
export type DevQueueItemState = 'queued' | 'running' | 'done' | 'failed';

/** Whether the queue is still feeding work, stopped by a failure, or finished. */
export type DevQueueStatus = 'active' | 'halted' | 'finished';

export interface DevQueueItem {
  workItemId: string;
  position: number;
  state: DevQueueItemState;
  runId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** Why a skipped entry was passed over. Only the QA queue sets it. */
  note?: string | null;
}

/**
 * An ordered selection of Tasks, drained one run at a time. Read from the backend rather than held
 * in the browser, so a refresh — or another machine — shows the same order and the same progress.
 */
export interface DevQueue {
  batchId: string;
  status: DevQueueStatus;
  haltedReason: string | null;
  items: DevQueueItem[];
}

/**
 * An ordered selection of Stories, drained one QA run at a time. Same shape as the development
 * queue because it is the same mechanism — only the work differs.
 */
export type QaQueue = DevQueue;
export type QaQueueItem = DevQueueItem;

export type TestTabOutcome = 'Passed' | 'Failed' | 'Blocked' | 'NotRun';

export interface StoryTestCase {
  testCaseId: number;
  title: string;
  state: string;
  outcome: TestTabOutcome;
}

/** One item a QA wave would test (or is testing): the Story/Bug and its run. */
export interface QaDispatch {
  /** Empty on a preview — nothing has been dispatched yet. */
  runId: string;
  workItemId: string;
  /** Work-item title, so the UI names what is being tested instead of showing a bare id. */
  title?: string;
  /** `story` = first test of finished development; `bug` = retest of a Developer's fix. */
  kind?: 'story' | 'bug';
}

/**
 * Result of a QA wave. One pod per Ready-for-QA item: every Story in Done, plus every Bug in Done
 * not yet tagged `qa-verified`. Re-running is safe — items already under test are skipped.
 */
export interface QaBatchResult {
  candidates: number;
  dispatched: QaDispatch[];
  dispatchedCount: number;
  /** Items skipped because a QA run is already active for them. */
  skippedActive: string[];
  /** Eligible items held back by the concurrency cap; a later wave picks them up. */
  deferred: string[];
  /** Items that will not be tested, each with the reason. */
  ineligible: { workItemId: string; reason: string }[];
  /** True when this was a preview and nothing was started. */
  dryRun: boolean;
}

/** Where a Story sits in the QA pipeline — the four buckets the QA view groups by. */
export type QaStoryStatus = 'Ready for QA' | 'Testing' | 'Failed / Fix Required' | 'Completed';

export const QA_STORY_STATUSES: readonly QaStoryStatus[] = [
  'Ready for QA',
  'Testing',
  'Failed / Fix Required',
  'Completed',
];

/** A Bug QA filed against a Story. */
export interface QaBug {
  adoId: number;
  title: string;
  /** Raw ADO state: `New` (filed) → `Committed` (being fixed) → `Done` (awaiting retest / verified). */
  state: string;
  severity: string | null;
  assignedTo: string | null;
  qaVerified: boolean;
  fixRunning: boolean;
  canFix: { allowed: boolean; reason?: string };
}

/** One Story card on the QA view. QA works Story-by-Story; the Task board stays Task-by-Task. */
export interface QaStory {
  adoId: number;
  title: string;
  description: string;
  state: string;
  status: QaStoryStatus;
  feature: WorkItemRef | null;
  epic: WorkItemRef | null;
  sprint: string | null;
  developer: string | null;
  tasksTotal: number;
  tasksDone: number;
  openBugs: number;
  bugs: QaBug[];
  qaVerified: boolean;
  updatedAt: string | null;
  execution: TaskExecution | null;
  qaRunning: boolean;
  canStart: { allowed: boolean; reason?: string };
}

export interface QaBoard {
  stories: QaStory[];
}

export interface StoryTests {
  storyId: number;
  testCases: StoryTestCase[];
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  projectId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ValidationIssue {
  itemId: string | null;
  severity: 'error' | 'warning';
  message: string;
}

export interface RunResult {
  durationMs: number;
  tokens: number;
  cost: number;
  logsRef: string | null;
  filesChanged: number;
  commits: string[];
  adoChanges: string[];
  artifacts: string[];
  workspacePath: string | null;
}

export interface Run {
  runId: string;
  role: string;
  state: string;
  workItemId: string | null;
  attempts: number;
  result: RunResult | null;
  createdAt: string;
  updatedAt: string;
}
