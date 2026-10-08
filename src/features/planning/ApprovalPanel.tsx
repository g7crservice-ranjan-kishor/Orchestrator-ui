import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AimOutlined,
  CheckOutlined,
  CloudUploadOutlined,
  ExportOutlined,
  FileTextOutlined,
  LinkOutlined,
  LoadingOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { api, ApiError } from '../../lib/api';
import type { AdoTarget, Draft, PushResult } from '../../lib/types';

interface Props {
  projectId: string;
  draft: Draft;
  busy: boolean;
  onAction: (action: () => Promise<Draft>) => Promise<void>;
  /**
   * The project's own Azure DevOps target, used to fill the confirmation in.
   *
   * Null while it is still loading, or if the project row could not be read — the fields are then
   * empty and typeable, exactly as they were before.
   */
  adoTarget?: AdoTarget | null;
}

const STEPS = ['Approve draft', 'Confirm target', 'Push to ADO'];

/**
 * A step's action button, which says when it is working.
 *
 * Each of these three makes a network call — and the push creates every work item in the backlog,
 * which is the slowest thing this screen does. Disabling a button without changing how it looks
 * reads as "nothing happened": the only feedback was that clicking again did nothing, which is
 * indistinguishable from a dead button. So the icon becomes a spinner and the label says what is
 * happening, and `aria-busy` says the same thing to a screen reader.
 */
function StepButton({
  working,
  workingLabel,
  icon,
  label,
  disabled,
  title,
  onClick,
}: {
  working: boolean;
  workingLabel: string;
  icon: ReactNode;
  label: string;
  disabled: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      className="ap-primary"
      disabled={disabled || working}
      aria-busy={working}
      title={title}
      onClick={onClick}
    >
      {working ? <LoadingOutlined spin /> : icon} {working ? workingLabel : label}
    </button>
  );
}

/**
 * The approval + ADO-target-confirmation gate (WORKFLOW.md §4). Two deliberate steps precede any
 * Azure DevOps write: approve the draft, then re-confirm the org/project/area path. Only then is
 * the one-directional push enabled. Nothing here writes to ADO until the push button is used.
 *
 * Presented as a numbered sequence because it *is* one — each step is unavailable until the one
 * before it is done, and showing that is kinder than three buttons that quietly refuse.
 */
export function ApprovalPanel({ projectId, draft, busy, onAction, adoTarget = null }: Props) {
  const { approval } = draft;
  const [target, setTarget] = useState({ orgUrl: '', project: '', areaPath: '' });

  // The project was set up with an organization, a project and an area path, and they were checked
  // against Azure DevOps at the time. Asking for them again from an empty form invites a typo into
  // the one step that writes to someone else's system — and the area path is the field where a
  // typo is worst, because a wrong one still succeeds and simply files the work where nobody looks.
  // This step stays: it is the confirmation before a write. It just no longer starts blank.
  useEffect(() => {
    if (!adoTarget) return;
    setTarget((current) =>
      current.orgUrl || current.project || current.areaPath
        ? current // never overwrite what someone has started typing
        : {
            orgUrl: adoTarget.orgUrl ?? '',
            project: adoTarget.project ?? '',
            areaPath: adoTarget.areaPath ?? '',
          },
    );
  }, [adoTarget]);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushProblems, setPushProblems] = useState<string[]>([]);
  const [pushing, setPushing] = useState(false);

  async function push() {
    setPushing(true);
    setPushError(null);
    setPushProblems([]);
    try {
      setPushResult(await api.pushToAdo(projectId));
    } catch (err) {
      setPushError(err instanceof ApiError ? err.message : 'Push failed.');
      setPushProblems(err instanceof ApiError ? err.details : []);
    } finally {
      setPushing(false);
    }
  }

  const canApprove = draft.planApproved && draft.backlog.length > 0 && !approval.approved;
  const targetComplete = target.orgUrl && target.project && target.areaPath;

  /** Which step the reader is on, so the tracker and the cards agree. */
  const current = !approval.approved ? 0 : !approval.adoTargetConfirmed ? 1 : 2;
  const stepState = (index: number): string =>
    index < current ? 'is-done' : index === current ? 'is-current' : 'is-todo';

  return (
    <section className="card ap" aria-labelledby="approval-heading">
      <header className="ap-head">
        <span className="ap-head-icon" aria-hidden="true">
          <RocketOutlined />
        </span>
        <div className="ap-head-text">
          <h3 id="approval-heading">Approval &amp; ADO push</h3>
          <p>Review the draft, confirm the Azure DevOps target and push the items to your board.</p>
        </div>
        <ol className="ap-track" aria-label="Progress">
          {STEPS.map((label, index) => (
            <li key={label} className={stepState(index)}>
              <span className="ap-track-dot">
                {index < current ? <CheckOutlined /> : index + 1}
              </span>
              <span className="ap-track-label">{label}</span>
            </li>
          ))}
        </ol>
      </header>

      <ol className="ap-steps">
        {/* Step 1 — approve */}
        <li className={`ap-step ${stepState(0)}`}>
          <span className="ap-step-num" aria-hidden="true">
            1
          </span>
          <span className="ap-step-icon is-approve" aria-hidden="true">
            <FileTextOutlined />
          </span>
          <div className="ap-step-text">
            <h4>Approve draft</h4>
            <p>Review the generated draft and approve it to proceed.</p>
          </div>
          <div className="ap-step-action">
            {approval.approved ? (
              <span className="badge">
                approved by {approval.approvedBy} ·{' '}
                {new Date(approval.approvedAt!).toLocaleString()}
              </span>
            ) : (
              <StepButton
                working={busy}
                workingLabel="Approving…"
                icon={<CheckOutlined />}
                label="Approve draft"
                disabled={!canApprove}
                title={canApprove ? '' : 'Approve the plan and add a valid backlog first'}
                onClick={() => void onAction(() => api.approveDraft(projectId))}
              />
            )}
          </div>
        </li>

        {/* Step 2 — confirm ADO target */}
        <li className={`ap-step ${stepState(1)}`}>
          <span className="ap-step-num" aria-hidden="true">
            2
          </span>
          <span className="ap-step-icon is-target" aria-hidden="true">
            <AimOutlined />
          </span>
          <div className="ap-step-text">
            <h4>Confirm ADO target</h4>
            <p>Choose the organization, project and area path where the items will be created.</p>
          </div>
          <div className="ap-step-action ap-step-action-wide">
            {approval.adoTargetConfirmed ? (
              <span className="badge">
                {approval.confirmedTarget?.project} · {approval.confirmedTarget?.areaPath}
              </span>
            ) : (
              <>
                <div className="ap-fields">
                  <label className="ap-field">
                    <span>Org URL</span>
                    <span className="ap-input">
                      <LinkOutlined aria-hidden="true" />
                      <input
                        value={target.orgUrl}
                        disabled={!approval.approved}
                        onChange={(e) => setTarget({ ...target, orgUrl: e.target.value })}
                        placeholder="https://dev.azure.com/org"
                      />
                    </span>
                  </label>
                  <label className="ap-field">
                    <span>Project</span>
                    <span className="ap-input">
                      <input
                        value={target.project}
                        disabled={!approval.approved}
                        onChange={(e) => setTarget({ ...target, project: e.target.value })}
                        placeholder="Task-Manager"
                      />
                    </span>
                  </label>
                  <label className="ap-field">
                    <span>Area path</span>
                    <span className="ap-input">
                      <input
                        value={target.areaPath}
                        disabled={!approval.approved}
                        onChange={(e) => setTarget({ ...target, areaPath: e.target.value })}
                        placeholder="Task-Manager"
                      />
                    </span>
                  </label>
                </div>
                <StepButton
                  working={busy}
                  workingLabel="Confirming…"
                  icon={<AimOutlined />}
                  label="Confirm target"
                  disabled={!approval.approved || !targetComplete}
                  title={approval.approved ? '' : 'Approve the draft first'}
                  onClick={() => void onAction(() => api.confirmAdoTarget(projectId, target))}
                />
              </>
            )}
          </div>
        </li>

        {/* Step 3 — push */}
        <li className={`ap-step ${stepState(2)}`}>
          <span className="ap-step-num" aria-hidden="true">
            3
          </span>
          <span className="ap-step-icon is-push" aria-hidden="true">
            <CloudUploadOutlined />
          </span>
          <div className="ap-step-text">
            <h4>Create in Azure DevOps</h4>
            <p>Push the approved items to Azure DevOps and open the board.</p>
            {approval.pushedToAdo && (
              <span className="badge">
                pushed · {new Date(approval.pushedAt!).toLocaleString()}
              </span>
            )}
          </div>
          <div className="ap-step-action">
            <StepButton
              working={pushing}
              // Named so the wait is legible: this creates every item in the backlog, one by one.
              workingLabel="Creating work items…"
              icon={<CloudUploadOutlined />}
              label={approval.pushedToAdo ? 'Re-run push' : 'Push to Azure DevOps'}
              disabled={!approval.adoTargetConfirmed}
              title={approval.adoTargetConfirmed ? '' : 'Approve and confirm the target first'}
              onClick={() => void push()}
            />
            <Link className="ap-secondary" to={`/projects/${projectId}/board`}>
              <ExportOutlined /> Open board
            </Link>
          </div>
        </li>
      </ol>

      {pushError && (
        <div className="push-refusal" role="alert">
          <p className="error">{pushError}</p>
          {/* Nothing reached Azure DevOps, so this is a to-do list rather than a post-mortem. */}
          {pushProblems.length > 0 && (
            <>
              <p className="muted">Fix these in the backlog, then push again:</p>
              <ul className="push-problems">
                {pushProblems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {pushResult && (
        <p className="ap-result" role="status">
          Created {pushResult.created}, skipped {pushResult.skipped} (already in ADO).
        </p>
      )}
    </section>
  );
}
