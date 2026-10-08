import { useCallback, useEffect, useRef, useState } from 'react';
import { StartEnhancement } from './StartEnhancement';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { DATABASE_LABELS, type Draft, type Project, type ValidationIssue } from '../../lib/types';
import { ClarificationThread } from './ClarificationThread';
import { PlanReview } from './PlanReview';
import { ProjectConfiguration } from './ProjectConfiguration';
import { RequiredSecrets } from './RequiredSecrets';
import { TechnicalDetails } from './TechnicalDetails';
import { BacklogEditor } from './BacklogEditor';
import { ApprovalPanel } from './ApprovalPanel';
import { PlanningStatus, type LastRun } from './PlanningStatus';
import { PLANNING_POLL_MS, isAgentWorking } from './run-activity';
import { PlanningDoneBanner } from './PlanningDoneBanner';
import { completionOf, describeCompletion, type PlanningDone } from './planning-done';

/**
 * Planning workspace for a project: clarification thread → plan review (gate) → backlog editor +
 * validation. Reflects the WORKFLOW.md §2 pipeline; nothing reaches ADO until approval.
 */
export function PlanningPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Only the database matters here: the plan must agree with it, and a reader should see both. */
  const [databaseLabel, setDatabaseLabel] = useState<string | null>(null);
  // Kept whole rather than reduced to a label: the approval step needs its Azure DevOps target.
  const [project, setProject] = useState<Project | null>(null);
  /** The last planning run this project started, read from the audit trail. */
  const [lastRun, setLastRun] = useState<LastRun>({ at: null, by: null });
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The "it finished" message, once a run has finished while this page was watching. */
  const [done, setDone] = useState<PlanningDone | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    try {
      setDraft(await api.getDraft(projectId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load draft.');
    }
  }, [projectId]);

  /** Both header facts come from one audit entry, so the time and the person match. */
  const loadLastRun = useCallback(async () => {
    if (!projectId) return;
    try {
      const started = (await api.listAudit(projectId))
        .filter(
          (entry) => entry.action.startsWith('planning.') && entry.action.endsWith('.started'),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setLastRun({ at: started[0]?.createdAt ?? null, by: started[0]?.actorEmail ?? null });
    } catch {
      // The header degrades to em dashes; it is not worth failing the page over.
      setLastRun({ at: null, by: null });
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    void loadLastRun();
  }, [load, loadLastRun]);

  /**
   * While an agent is working, the page keeps itself current instead of asking the reader to press
   * Refresh — a planning run takes minutes, and its result can arrive twice when the orchestrator
   * regenerates a plan or backlog on its own.
   *
   * It polls only in those states. Everywhere else the page holds unsaved backlog edits, and a
   * background fetch would quietly overwrite them.
   */
  const working = isAgentWorking(draft?.status);
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => {
      void load();
      void loadLastRun();
    }, PLANNING_POLL_MS);
    return () => clearInterval(timer);
  }, [working, load, loadLastRun]);

  useEffect(() => {
    if (!projectId) return;
    // Best-effort: the plan still reviews fine if the project row cannot be read.
    void api
      .listProjects()
      .then((projects) => projects.find((found) => found.id === projectId))
      .then((found) => {
        setProject(found ?? null);
        setDatabaseLabel(
          found && found.database !== 'unset'
            ? (DATABASE_LABELS[found.database] ?? found.database)
            : null,
        );
      })
      .catch(() => {
        setProject(null);
        setDatabaseLabel(null);
      });
  }, [projectId]);

  /*
   * Announce a run that finished *here*, while someone was looking at this page.
   *
   * The previous status is kept in a ref rather than read from the draft, because the draft has
   * already moved on by the time this runs — the transition is the thing being watched, and it
   * only exists between two renders. Anchoring it this way is also what stops the page
   * congratulating you on a plan that was finished yesterday and is merely being opened again.
   */
  const previousStatus = useRef<string | null>(null);
  useEffect(() => {
    const before = previousStatus.current;
    const after = draft?.status ?? null;
    previousStatus.current = after;
    if (!draft) return;
    const kind = completionOf(before, after);
    if (kind) setDone(describeCompletion(kind, draft));
  }, [draft]);

  async function run(action: () => Promise<Draft>) {
    setBusy(true);
    setError(null);
    try {
      setDraft(await action());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshValidation() {
    if (!projectId) return;
    setIssues(await api.validateBacklog(projectId));
  }

  if (!projectId) return null;

  return (
    <section>
      <h2>Planning</h2>
      {/* Which plan this page is about. A project may hold an initial plan and its enhancements,
          and "Planning" alone would not say which one is on screen. */}
      {draft && draft.kind === 'enhancement' && <p className="plan-which">{draft.label}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {done && <PlanningDoneBanner done={done} onDismiss={() => setDone(null)} />}
      {!draft ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <PlanningStatus
            draft={draft}
            busy={busy}
            lastRun={lastRun}
            onStartEm={() =>
              void run(() => api.startEmPlanning(projectId)).then(() => loadLastRun())
            }
            onStartSm={() =>
              void run(() => api.startSmBacklog(projectId)).then(() => loadLastRun())
            }
            onRefresh={() => {
              void load();
              void loadLastRun();
            }}
          />

          <StartEnhancement projectId={projectId} draft={draft} onStarted={setDraft} />

          <ClarificationThread
            projectId={projectId}
            clarifications={draft.clarifications}
            onChange={setDraft}
          />

          {/* Early on purpose: these are filled from the requirement the moment it is submitted,
              and a person should see what was read off it before a plan is generated from it —
              not after, when disagreeing means regenerating. The plan cannot be approved while a
              required one is unanswered. */}
          <TechnicalDetails
            projectId={projectId}
            details={draft.technicalDetails}
            onChange={setDraft}
          />

          {/* Credentials live inside the Plan view; this covers the case of a draft that has
              declared them before a plan exists (an agent run that only asked questions). */}
          {!draft.planMarkdown && (
            <RequiredSecrets
              projectId={projectId}
              secrets={draft.requiredSecrets}
              onChange={setDraft}
            />
          )}

          {/* A run that finished without producing anything used to leave the page saying "an
              agent is working" indefinitely. It now says what happened. */}
          {draft.runNote && (
            <section className="card run-note" role="status">
              <h3>The last run produced nothing</h3>
              <p>{draft.runNote}</p>
            </section>
          )}

          {/* The orchestrator checks the generated plan against the project's binding choices and
              regenerates it itself when something is missing. This shows what survived that, so a
              plan that slipped through is impossible to miss. */}
          {draft.planIssues?.length > 0 && (
            <section className="card plan-gaps" role="alert">
              <h3>This plan is missing required elements</h3>
              <p className="muted">
                The orchestrator asked for it again automatically and these are still absent. Use
                “Request changes” to try once more, or approve anyway if you judge the plan usable.
              </p>
              <ul>
                {draft.planIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </section>
          )}

          {/* The database and the repositories are decided here, from the plan, rather than on
              the create form where nobody could yet know whether the product needed them. */}
          <ProjectConfiguration projectId={projectId} draft={draft} onDraftChange={setDraft} />

          <PlanReview
            projectId={projectId}
            draft={draft}
            busy={busy}
            onAction={run}
            onDraftChange={setDraft}
            databaseLabel={databaseLabel}
          />

          <BacklogEditor
            projectId={projectId}
            draft={draft}
            issues={issues}
            onChange={setDraft}
            onValidate={refreshValidation}
          />

          <ApprovalPanel
            projectId={projectId}
            draft={draft}
            busy={busy}
            onAction={run}
            adoTarget={project?.adoTarget ?? null}
          />
        </>
      )}
    </section>
  );
}
