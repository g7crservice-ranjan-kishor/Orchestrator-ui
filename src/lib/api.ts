import type {
  AuditEntry,
  AuthResponse,
  BacklogItem,
  Board,
  DevQueue,
  QaQueue,
  ConfirmAdoTargetInput,
  CreateProjectInput,
  DatabaseChoice,
  Draft,
  Preflight,
  ProjectConfiguration,
  ProvisionedProject,
  UiStyleChoice,
  TaskTransitionResult,
  TransitionSource,
  TransitionTarget,
  ErrorEnvelope,
  Project,
  PushResult,
  QaBatchResult,
  QaBoard,
  Requirement,
  Run,
  SprintRolloverPlan,
  StoredAuth,
  StoryTests,
  User,
  ValidationIssue,
} from './types';

const STORAGE_KEY = 'orchestrator.auth';

/** Thrown for non-2xx responses; carries the backend error envelope when available. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly correlationId?: string,
    /**
     * The specific problems behind the message. A refusal that says "3 validation
     * error(s)" and stops is a puzzle; these are the lines that say what to fix.
     */
    public readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function messageOf(envelope: Partial<ErrorEnvelope> | undefined, fallback: string): string {
  if (!envelope?.message) return fallback;
  return Array.isArray(envelope.message) ? envelope.message.join(', ') : envelope.message;
}

/**
 * Typed REST client for the Orchestrator API. Keeps the access token in memory and the
 * refresh material in localStorage; transparently refreshes once on a 401 and retries. All
 * network access goes through here — components never call `fetch` directly
 * (DEVELOPMENT_GUIDELINES.md §7).
 */
export class ApiClient {
  private accessToken: string | null = null;
  private stored: StoredAuth | null = null;

  constructor(private readonly baseUrl: string) {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      try {
        this.stored = JSON.parse(raw) as StoredAuth;
      } catch {
        this.stored = null;
      }
    }
  }

  get isAuthenticated(): boolean {
    return this.stored !== null;
  }

  private persist(auth: AuthResponse): void {
    this.accessToken = auth.accessToken;
    this.stored = { sessionId: auth.sessionId, refreshToken: auth.refreshToken };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stored));
  }

  private clear(): void {
    this.accessToken = null;
    this.stored = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  private async parseError(res: Response, fallback: string): Promise<ApiError> {
    let envelope: Partial<ErrorEnvelope> | undefined;
    try {
      envelope = (await res.json()) as Partial<ErrorEnvelope>;
    } catch {
      envelope = undefined;
    }
    const missing = envelope?.missingSprints ?? [];
    const details = [
      ...(envelope?.errors ?? []),
      ...missing.map((s) => `Sprint "${s}" does not exist in Azure DevOps.`),
    ];
    return new ApiError(
      res.status,
      messageOf(envelope, fallback),
      envelope?.correlationId,
      details,
    );
  }

  /** Attempts a one-shot refresh using stored material. Returns true on success. */
  private async tryRefresh(): Promise<boolean> {
    if (!this.stored) return false;
    const res = await fetch(`${this.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.stored),
    });
    if (!res.ok) {
      this.clear();
      return false;
    }
    this.persist((await res.json()) as AuthResponse);
    return true;
  }

  private async request<T>(path: string, init: RequestInit = {}, retryOn401 = true): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body) headers.set('Content-Type', 'application/json');
    if (this.accessToken) headers.set('Authorization', `Bearer ${this.accessToken}`);

    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });

    if (res.status === 401 && retryOn401 && (await this.tryRefresh())) {
      return this.request<T>(path, init, false);
    }
    if (!res.ok) {
      throw await this.parseError(res, `Request failed (${res.status})`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // --- Auth -----------------------------------------------------------------
  async login(email: string, password: string): Promise<User> {
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      throw await this.parseError(res, 'Login failed');
    }
    const auth = (await res.json()) as AuthResponse;
    this.persist(auth);
    return auth.user;
  }

  async logout(): Promise<void> {
    try {
      await this.request<void>('/auth/logout', { method: 'POST' });
    } finally {
      this.clear();
    }
  }

  me(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  // --- Users ----------------------------------------------------------------
  listUsers(): Promise<User[]> {
    return this.request<User[]>('/users');
  }

  createUser(input: { email: string; displayName: string; password: string }): Promise<User> {
    return this.request<User>('/users', { method: 'POST', body: JSON.stringify(input) });
  }

  setUserDisabled(id: string, disabled: boolean): Promise<User> {
    return this.request<User>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ disabled }),
    });
  }

  deleteUser(id: string): Promise<void> {
    return this.request<void>(`/users/${id}`, { method: 'DELETE' });
  }

  // --- Projects -------------------------------------------------------------
  listProjects(): Promise<Project[]> {
    return this.request<Project[]>('/projects');
  }

  createProject(input: CreateProjectInput): Promise<Project> {
    return this.request<Project>('/projects', { method: 'POST', body: JSON.stringify(input) });
  }

  /**
   * Checks an organization URL and token, and reports what they can see.
   *
   * The token is sent for this check only — it is not stored by this call. A token that does not
   * work comes back as `ok: false` with an explanation, not as a failed request.
   */
  preflightAdo(input: { orgUrl: string; pat: string; project?: string }): Promise<Preflight> {
    return this.request<Preflight>('/ado/preflight', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /** Creates a project and sets it up in Azure DevOps, creating the area path if it is missing. */
  createProvisionedProject(input: CreateProjectInput): Promise<ProvisionedProject> {
    return this.request<ProvisionedProject>('/ado/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /** What the plan says the project still has to be configured with. */
  getProjectConfiguration(projectId: string): Promise<ProjectConfiguration> {
    return this.request<ProjectConfiguration>(`/projects/${projectId}/provisioning/configuration`);
  }

  /**
   * Records the database and creates the repositories the plan calls for.
   *
   * `replanNeeded` comes back true when the database changed under an existing plan — that plan was
   * written against a different one and has to be regenerated.
   */
  applyProjectConfiguration(
    projectId: string,
    input: { database?: DatabaseChoice; repositories?: string[]; uiStyle?: UiStyleChoice },
  ): Promise<Project & { replanNeeded: boolean }> {
    return this.request<Project & { replanNeeded: boolean }>(
      `/projects/${projectId}/provisioning/configuration`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  }

  deleteProject(id: string): Promise<void> {
    return this.request<void>(`/projects/${id}`, { method: 'DELETE' });
  }

  // --- Requirements ---------------------------------------------------------
  listRequirements(projectId: string): Promise<Requirement[]> {
    return this.request<Requirement[]>(`/projects/${projectId}/requirements`);
  }

  createRequirement(projectId: string, text: string): Promise<Requirement> {
    return this.request<Requirement>(`/projects/${projectId}/requirements`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  // --- Planning / draft -----------------------------------------------------
  getDraft(projectId: string): Promise<Draft> {
    return this.request<Draft>(`/projects/${projectId}/draft`);
  }

  startEmPlanning(projectId: string): Promise<Draft> {
    return this.request<Draft>(`/projects/${projectId}/planning/em`, { method: 'POST' });
  }

  /**
   * Starts a new planning cycle on a product that is already built.
   *
   * Creates a separate plan (ENH-001, ENH-002, …) rather than editing the existing one, so the work
   * items already in Azure DevOps are left exactly as they are.
   */
  startEnhancement(
    projectId: string,
    body: { title: string; requirementId?: string; sprintAnchor?: 'current' | 'next' },
  ): Promise<Draft> {
    return this.request<Draft>(`/projects/${projectId}/planning/enhancement`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  answerClarification(projectId: string, clarificationId: string, answer: string): Promise<Draft> {
    return this.request<Draft>(`/projects/${projectId}/clarifications/${clarificationId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    });
  }

  /**
   * Supplies one of the generated application's runtime credentials. Write-only: the value goes to
   * Key Vault and there is deliberately no endpoint that reads it back.
   */
  setRequiredSecret(projectId: string, name: string, value: string): Promise<Draft> {
    return this.request<Draft>(
      `/projects/${projectId}/required-secrets/${encodeURIComponent(name)}`,
      { method: 'POST', body: JSON.stringify({ value }) },
    );
  }

  /** Records an answer for one technical detail. Marked as the person's, so nothing overwrites it. */
  setTechnicalDetail(projectId: string, field: string, value: string): Promise<Draft> {
    return this.request<Draft>(
      `/projects/${projectId}/technical-details/${encodeURIComponent(field)}`,
      { method: 'POST', body: JSON.stringify({ value }) },
    );
  }

  /** Re-reads the requirement and the project configuration, keeping any answer a person gave. */
  refreshTechnicalDetails(projectId: string): Promise<Draft> {
    return this.request<Draft>(`/projects/${projectId}/technical-details/refresh`, {
      method: 'POST',
    });
  }

  approvePlan(projectId: string): Promise<Draft> {
    return this.request<Draft>(`/projects/${projectId}/plan/approve`, { method: 'POST' });
  }

  regeneratePlan(projectId: string, feedback?: string): Promise<Draft> {
    return this.request<Draft>(`/projects/${projectId}/plan/regenerate`, {
      method: 'POST',
      body: JSON.stringify({ feedback: feedback ?? '' }),
    });
  }

  startSmBacklog(projectId: string): Promise<Draft> {
    return this.request<Draft>(`/projects/${projectId}/planning/sm`, { method: 'POST' });
  }

  // --- Backlog editor -------------------------------------------------------
  addBacklogItem(
    projectId: string,
    input: Partial<BacklogItem> & { type: string; title: string },
  ): Promise<Draft> {
    return this.request<Draft>(`/projects/${projectId}/backlog/items`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateBacklogItem(
    projectId: string,
    itemId: string,
    patch: Record<string, unknown>,
  ): Promise<Draft> {
    return this.request<Draft>(`/projects/${projectId}/backlog/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  deleteBacklogItem(projectId: string, itemId: string): Promise<Draft> {
    return this.request<Draft>(`/projects/${projectId}/backlog/items/${itemId}`, {
      method: 'DELETE',
    });
  }

  moveBacklogItem(
    projectId: string,
    itemId: string,
    parentId: string | null,
    order: number,
  ): Promise<Draft> {
    return this.request<Draft>(`/projects/${projectId}/backlog/items/${itemId}/move`, {
      method: 'POST',
      body: JSON.stringify({ parentId, order }),
    });
  }

  validateBacklog(projectId: string): Promise<ValidationIssue[]> {
    return this.request<ValidationIssue[]>(`/projects/${projectId}/backlog/validation`);
  }

  // --- Runs -----------------------------------------------------------------
  listRuns(projectId: string): Promise<Run[]> {
    return this.request<Run[]>(`/projects/${projectId}/runs`);
  }

  getRun(runId: string): Promise<Run> {
    return this.request<Run>(`/runs/${runId}`);
  }

  // --- Approval + ADO push --------------------------------------------------
  approveDraft(projectId: string): Promise<Draft> {
    return this.request<Draft>(`/projects/${projectId}/approve`, { method: 'POST' });
  }

  confirmAdoTarget(projectId: string, input: ConfirmAdoTargetInput): Promise<Draft> {
    return this.request<Draft>(`/projects/${projectId}/confirm-ado-target`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  pushToAdo(projectId: string): Promise<PushResult> {
    return this.request<PushResult>(`/projects/${projectId}/ado/push`, { method: 'POST' });
  }

  getBoard(projectId: string): Promise<Board> {
    return this.request<Board>(`/projects/${projectId}/board`);
  }

  // --- Development -----------------------------------------------------------
  transitionTasks(
    projectId: string,
    taskKeys: string[],
    to: TransitionTarget,
    opts: { dryRun?: boolean; source?: TransitionSource } = {},
  ): Promise<TaskTransitionResult> {
    return this.request<TaskTransitionResult>(`/projects/${projectId}/development/transition`, {
      method: 'POST',
      body: JSON.stringify({ taskKeys, to, ...opts }),
    });
  }

  /**
   * Queues the selected Tasks for sequential development. The backend starts the first one and
   * holds the rest until a run finishes, so the concurrency cap decides the pace, not the browser.
   */
  queueDevelopment(projectId: string, workItemIds: string[]): Promise<DevQueue> {
    return this.request<DevQueue>(`/projects/${projectId}/development-queue`, {
      method: 'POST',
      body: JSON.stringify({ workItemIds }),
    });
  }

  getDevelopmentQueue(projectId: string): Promise<DevQueue> {
    return this.request<DevQueue>(`/projects/${projectId}/development-queue`);
  }

  resumeDevelopmentQueue(projectId: string): Promise<DevQueue> {
    return this.request<DevQueue>(`/projects/${projectId}/development-queue/resume`, {
      method: 'POST',
    });
  }

  /** Drops everything still waiting; a run in flight finishes on its own. */
  cancelDevelopmentQueue(projectId: string): Promise<DevQueue> {
    return this.request<DevQueue>(`/projects/${projectId}/development-queue`, { method: 'DELETE' });
  }

  /** Queues Stories for QA; the first starts immediately if a slot is free. */
  queueQa(projectId: string, workItemIds: string[]): Promise<QaQueue> {
    return this.request<QaQueue>(`/projects/${projectId}/qa-queue`, {
      method: 'POST',
      body: JSON.stringify({ workItemIds }),
    });
  }

  getQaQueue(projectId: string): Promise<QaQueue> {
    return this.request<QaQueue>(`/projects/${projectId}/qa-queue`);
  }

  /** Resumes a halted QA queue; the Story that failed is retried before the rest. */
  resumeQaQueue(projectId: string): Promise<QaQueue> {
    return this.request<QaQueue>(`/projects/${projectId}/qa-queue/resume`, { method: 'POST' });
  }

  /** Drops everything still waiting; a run in flight finishes on its own. */
  cancelQaQueue(projectId: string): Promise<QaQueue> {
    return this.request<QaQueue>(`/projects/${projectId}/qa-queue`, { method: 'DELETE' });
  }

  /**
   * Closes the active sprint and starts the next one by moving their dates in Azure DevOps. Always
   * called with `dryRun: true` first — the confirmation dialog shows the exact dates and carry-over.
   */
  completeSprint(projectId: string, opts: { dryRun?: boolean } = {}): Promise<SprintRolloverPlan> {
    return this.request<SprintRolloverPlan>(`/projects/${projectId}/board/sprint/complete`, {
      method: 'POST',
      body: JSON.stringify(opts),
    });
  }

  // --- QA -------------------------------------------------------------------
  /**
   * Starts QA for every Ready-for-QA item in the project — one pod per Story in Done and per Bug
   * awaiting retest. Idempotent: an item already under test is skipped. Always called with
   * `dryRun: true` first, so the user confirms how many pods a wave will actually start.
   */
  getQaBoard(projectId: string): Promise<QaBoard> {
    return this.request<QaBoard>(`/projects/${projectId}/qa/board`);
  }

  startQa(
    projectId: string,
    opts: { dryRun?: boolean; workItemIds?: string[] } = {},
  ): Promise<QaBatchResult> {
    return this.request<QaBatchResult>(`/projects/${projectId}/qa/start`, {
      method: 'POST',
      body: JSON.stringify(opts),
    });
  }

  /** A Story's Test Cases + latest outcomes for the Test tab (read-only, one-directional). */
  getStoryTests(projectId: string, storyId: number): Promise<StoryTests> {
    return this.request<StoryTests>(`/projects/${projectId}/qa/stories/${storyId}/tests`);
  }

  // --- Audit ----------------------------------------------------------------
  listAudit(projectId: string): Promise<AuditEntry[]> {
    return this.request<AuditEntry[]>(`/projects/${projectId}/audit`);
  }

  /** Uploads an attachment (multipart) to a requirement, refreshing auth if needed. */
  async uploadAttachment(requirementId: string, file: File): Promise<Requirement> {
    const form = new FormData();
    form.append('file', file);
    const doRequest = async (): Promise<Response> => {
      const headers = new Headers();
      if (this.accessToken) headers.set('Authorization', `Bearer ${this.accessToken}`);
      return fetch(`${this.baseUrl}/requirements/${requirementId}/attachments`, {
        method: 'POST',
        headers,
        body: form,
      });
    };
    let res = await doRequest();
    if (res.status === 401 && (await this.tryRefresh())) {
      res = await doRequest();
    }
    if (!res.ok) {
      throw await this.parseError(res, 'Attachment upload failed');
    }
    return (await res.json()) as Requirement;
  }
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
export const api = new ApiClient(baseUrl);
