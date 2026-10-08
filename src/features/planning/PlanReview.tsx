import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ApartmentOutlined,
  CheckCircleFilled,
  CloseCircleOutlined,
  ExclamationCircleFilled,
  KeyOutlined,
  BranchesOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { api } from '../../lib/api';
import type { BacklogItem, Draft } from '../../lib/types';
import { Blocks, InlineText } from './Prose';
import { Chip, Disclosure, Field, SectionContent } from './PlanElements';
import { useDisclosure } from './use-disclosure';
import { PhaseCard, WorkList } from './PlanWork';
import { RequiredSecrets } from './RequiredSecrets';
import { parsePlan, type RepoCard } from './plan-model';

/**
 * Plan review — the gate between planning and development (WORKFLOW.md §2).
 *
 * The agent returns one long Markdown document. Printing it verbatim made the plan unreadable, so
 * it is parsed ({@link ./plan-model}) and re-presented as a review dashboard: a summary and the
 * headline numbers first, the detail behind expandable sections. The content is unchanged — every
 * heading, bullet and criterion of the generated plan is still here, including the raw document at
 * the bottom, which is what lets a reader confirm nothing was lost in the translation.
 *
 * The approval action lives in two places (header and footer) because a reader should never have to
 * scroll a long plan to find it — and it stays disabled until every application credential the plan
 * declared has been supplied (D-029).
 */
export function PlanReview({
  projectId,
  draft,
  busy,
  onAction,
  onDraftChange,
  databaseLabel = null,
}: {
  projectId: string;
  draft: Draft;
  busy: boolean;
  onAction: (action: () => Promise<Draft>) => Promise<void>;
  onDraftChange: (draft: Draft) => void;
  /** The database the project must be built against, shown so a contrary plan is obvious. */
  databaseLabel?: string | null;
}) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [active, setActive] = useState('');
  /** The plan reads inside one scrolling panel, so the page itself stays a single screen. */
  const scroller = useRef<HTMLDivElement>(null);

  const plan = useMemo(() => parsePlan(draft.planMarkdown ?? ''), [draft.planMarkdown]);
  const repos = useMemo(
    () => (plan.repositories.length > 0 ? plan.repositories : reposFromBacklog(draft.backlog)),
    [plan.repositories, draft.backlog],
  );

  const phasePanels = useDisclosure(
    plan.phases.map((p) => p.id),
    plan.phases.slice(0, 1).map((p) => p.id),
  );
  const detailPanels = useDisclosure([...plan.technical, ...plan.other].map((s) => s.id));

  const secrets = draft.requiredSecrets ?? [];
  const missingSecrets = secrets.filter((secret) => !secret.provided);
  const approvalBlocked = missingSecrets.length > 0;

  const nav = useMemo(
    () =>
      [
        { id: 'plan-overview', label: 'Overview', show: true },
        { id: 'plan-scope', label: 'Scope', show: plan.scope !== null },
        { id: 'plan-repos', label: 'Repositories', show: repos.length > 0 },
        { id: 'plan-phases', label: 'Delivery phases', show: plan.phases.length > 0 },
        { id: 'plan-epics', label: 'Epics & stories', show: plan.epics.length > 0 },
        { id: 'plan-risks', label: 'Risks', show: plan.risks.length > 0 },
        {
          id: 'plan-technical',
          label: 'Technical details',
          show: plan.technical.length + plan.other.length > 0,
        },
        {
          id: 'plan-credentials',
          label: 'Credentials',
          show: secrets.length > 0 || plan.credentials !== null,
        },
        { id: 'plan-approval', label: 'Approval', show: true },
      ].filter((item) => item.show),
    [plan, repos.length, secrets.length],
  );

  const navKey = nav.map((item) => item.id).join(',');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // Relative to the panel the plan scrolls in, not the page.
      { root: scroller.current, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );
    for (const id of navKey.split(',')) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [navKey]);

  if (!draft.planMarkdown) return null;

  function goTo(id: string) {
    setActive(id);
    const element = document.getElementById(id);
    const panel = scroller.current;
    if (!element) return;
    // Sections inside the panel scroll the panel; Approval sits outside it and scrolls the page.
    // On a phone the panel is not a scroll region at all (see the 560px rules), so the page moves.
    const panelScrolls = panel !== null && panel.scrollHeight > panel.clientHeight + 1;
    if (panelScrolls && panel.contains(element)) {
      // Measured rather than read from offsetTop, which depends on the offset parent.
      const top =
        element.getBoundingClientRect().top -
        panel.getBoundingClientRect().top +
        panel.scrollTop -
        8;
      if (panel.scrollTo) panel.scrollTo({ top, behavior: 'smooth' });
      else panel.scrollTop = top;
    } else {
      element.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }

  const stats = [
    { label: plan.stats.phases === 1 ? 'Phase' : 'Phases', value: plan.stats.phases },
    { label: plan.stats.epics === 1 ? 'Epic' : 'Epics', value: plan.stats.epics },
    { label: plan.stats.features === 1 ? 'Feature' : 'Features', value: plan.stats.features },
    { label: plan.stats.stories === 1 ? 'Story' : 'Stories', value: plan.stats.stories },
    { label: plan.stats.tasks === 1 ? 'Task' : 'Tasks', value: plan.stats.tasks },
  ].filter((stat) => stat.value > 0);

  const statusBadge = draft.planApproved
    ? { className: 'pv-badge-ok', text: 'Approved' }
    : approvalBlocked
      ? {
          className: 'pv-badge-warn',
          text: `${missingSecrets.length} credential${missingSecrets.length === 1 ? '' : 's'} needed`,
        }
      : { className: 'pv-badge-ready', text: 'Ready for review' };

  const approveButton = (
    <button
      disabled={busy || approvalBlocked}
      title={
        approvalBlocked
          ? `Provide the application credentials first: ${missingSecrets
              .map((secret) => secret.name)
              .join(', ')}`
          : ''
      }
      onClick={() => void onAction(() => api.approvePlan(projectId))}
    >
      Proceed (approve plan)
    </button>
  );

  const requestChangesButton = (
    <button
      className="link"
      disabled={busy}
      onClick={() => {
        setShowFeedback(true);
        goTo('plan-approval');
      }}
    >
      Request changes
    </button>
  );

  return (
    <div className="plan-review">
      {/* 1 — header, with the decision always within reach */}
      <header className="card pv-head">
        <div className="pv-head-text">
          <p className="eyebrow">PLAN REVIEW</p>
          <h3>Plan</h3>
          <p className="muted">
            Review the proposed implementation plan before development begins.
          </p>
          {databaseLabel && (
            <p className="pv-constraint">
              <DatabaseOutlined aria-hidden /> Built against <strong>{databaseLabel}</strong> —
              check the plan agrees before approving.
            </p>
          )}
        </div>
        <div className="pv-head-side">
          <span className={`pv-badge ${statusBadge.className}`}>{statusBadge.text}</span>
          {!draft.planApproved && (
            <div className="actions">
              {approveButton}
              {requestChangesButton}
            </div>
          )}
          {approvalBlocked && !draft.planApproved && (
            <button className="link pv-inline-link" onClick={() => goTo('plan-credentials')}>
              Provide credentials →
            </button>
          )}
        </div>
      </header>

      {/* The whole plan reads inside one panel: its tabs stay put, its content scrolls. */}
      <div className="card pv-shell">
        {/* 11 — navigation, because the plan is long */}
        <nav className="pv-nav" aria-label="Plan sections">
          <div className="pv-nav-items">
            {nav.map((item) => (
              <button
                key={item.id}
                className={`pv-nav-item ${active === item.id ? 'is-active' : ''}`}
                onClick={() => goTo(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {/* 12 — the decision stays reachable from anywhere in a long plan */}
          {!draft.planApproved && <div className="pv-nav-action">{approveButton}</div>}
        </nav>

        <div className="pv-scroll" ref={scroller}>
          {/* 10 + 2 — the numbers and the summary */}
          <section id="plan-overview" className="pv-section">
            {stats.length > 0 && (
              <ul className="pv-stats">
                {stats.map((stat) => (
                  <li key={stat.label}>
                    <strong>{stat.value}</strong>
                    <span>{stat.label}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="card pv-summary">
              <h4 className="pv-section-title">Overview</h4>
              {plan.objective && (
                <Field label="Objective">
                  <SectionContent section={plan.objective} />
                </Field>
              )}
              {plan.intro.length > 0 && (
                <Field label="Context">
                  <Blocks blocks={plan.intro} />
                </Field>
              )}
              {plan.epics.length > 0 && (
                <Field label="What is being built">
                  <div className="pv-chips">
                    {plan.epics.map((epic) => (
                      <Chip key={epic.id} value={epic.title} />
                    ))}
                  </div>
                </Field>
              )}
              {repos.length > 0 && (
                <Field label="Repositories involved">
                  <div className="pv-chips">
                    {repos.map((repo) => (
                      <Chip key={repo.id} value={repo.name} />
                    ))}
                  </div>
                </Field>
              )}
              {plan.phases.length > 0 && (
                <Field label="Delivery approach">
                  <ol className="pv-approach">
                    {plan.phases.map((phase) => (
                      <li key={phase.id}>
                        <button
                          className="link"
                          onClick={() => {
                            phasePanels.openOne(phase.id);
                            goTo('plan-phases');
                          }}
                        >
                          {phase.label ?? phase.title}
                        </button>
                        {phase.label && <span className="muted"> — {phase.title}</span>}
                      </li>
                    ))}
                  </ol>
                </Field>
              )}
            </div>
          </section>

          {/* 3 — scope */}
          {plan.scope && (
            <section id="plan-scope" className="pv-section">
              <h4 className="pv-section-title">Scope</h4>
              <div className="pv-scope-grid">
                <div className="card pv-scope pv-scope-in">
                  <h5>
                    <CheckCircleFilled aria-hidden /> In scope
                  </h5>
                  {plan.scope.inScope.length > 0 ? (
                    <ul>
                      {plan.scope.inScope.map((item, i) => (
                        <li key={i}>
                          <InlineText text={item} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">Not stated separately in the plan.</p>
                  )}
                </div>
                <div className="card pv-scope pv-scope-out">
                  <h5>
                    <CloseCircleOutlined aria-hidden /> Out of scope
                  </h5>
                  {plan.scope.outOfScope.length > 0 ? (
                    <ul>
                      {plan.scope.outOfScope.map((item, i) => (
                        <li key={i}>
                          <InlineText text={item} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">Nothing was excluded explicitly.</p>
                  )}
                </div>
              </div>
              {plan.scope.extra.length > 0 && (
                <div className="card pv-scope-extra">
                  <Blocks blocks={plan.scope.extra} />
                </div>
              )}
            </section>
          )}

          {/* 4 — repositories */}
          {repos.length > 0 && (
            <section id="plan-repos" className="pv-section">
              <h4 className="pv-section-title">Repositories</h4>
              <Blocks blocks={plan.repositoriesLead} />
              <div className="pv-repo-grid">
                {repos.map((repo) => (
                  <div key={repo.id} className="card pv-repo">
                    <div className="pv-repo-head">
                      <BranchesOutlined aria-hidden />
                      <strong>
                        <InlineText text={repo.name} />
                      </strong>
                    </div>
                    {repo.role && (
                      <p className="pv-repo-role">
                        <InlineText text={repo.role} />
                      </p>
                    )}
                    {repo.chips.length > 0 && (
                      <div className="pv-chips">
                        {repo.chips.map((chip) => (
                          <Chip key={chip.label} label={chip.label} value={chip.value} />
                        ))}
                      </div>
                    )}
                    <Blocks blocks={repo.blocks} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 5 — delivery phases */}
          {plan.phases.length > 0 && (
            <section id="plan-phases" className="pv-section">
              <div className="pv-section-head">
                <h4 className="pv-section-title">Delivery phases</h4>
                <button className="link" onClick={phasePanels.toggleAll}>
                  {phasePanels.allOpen ? 'Collapse all' : 'Expand all'}
                </button>
              </div>
              <Blocks blocks={plan.phasesLead} />
              <div className="pv-panels">
                {plan.phases.map((phase, i) => (
                  <PhaseCard
                    key={phase.id}
                    phase={phase}
                    index={i + 1}
                    open={phasePanels.isOpen(phase.id)}
                    onToggle={() => phasePanels.toggle(phase.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 6 — epics → features → stories → tasks */}
          {plan.epics.length > 0 && (
            <section id="plan-epics" className="pv-section">
              <h4 className="pv-section-title">
                <ApartmentOutlined aria-hidden /> Epics &amp; stories
              </h4>
              <Blocks blocks={plan.epicsLead} />
              <div className="card pv-tree">
                <WorkList nodes={plan.epics} />
              </div>
            </section>
          )}

          {/* 8 — risks */}
          {plan.risks.length > 0 && (
            <section id="plan-risks" className="pv-section">
              <h4 className="pv-section-title">Risks &amp; considerations</h4>
              <Blocks blocks={plan.risksLead} />
              <div className="pv-risk-grid">
                {plan.risks.map((risk) => (
                  <div key={risk.id} className="card pv-risk">
                    <div className="pv-risk-head">
                      <ExclamationCircleFilled aria-hidden />
                      <strong>
                        <InlineText text={risk.title} />
                      </strong>
                    </div>
                    {risk.impact && (
                      <Field label="Impact">
                        <InlineText text={risk.impact} />
                      </Field>
                    )}
                    {risk.mitigation && (
                      <Field label="Mitigation">
                        <InlineText text={risk.mitigation} />
                      </Field>
                    )}
                    <Blocks blocks={risk.blocks} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 9 — technical detail, available but not dominant */}
          {plan.technical.length + plan.other.length > 0 && (
            <section id="plan-technical" className="pv-section">
              <div className="pv-section-head">
                <h4 className="pv-section-title">Technical details</h4>
                <button className="link" onClick={detailPanels.toggleAll}>
                  {detailPanels.allOpen ? 'Collapse all' : 'Expand all'}
                </button>
              </div>
              <div className="pv-panels">
                {[...plan.technical, ...plan.other].map((section) => (
                  <Disclosure
                    key={section.id}
                    className="pv-detail"
                    open={detailPanels.isOpen(section.id)}
                    onToggle={() => detailPanels.toggle(section.id)}
                    head={
                      <span className="pv-detail-title">
                        <InlineText text={section.title} />
                      </span>
                    }
                  >
                    <SectionContent section={section} />
                  </Disclosure>
                ))}
              </div>
            </section>
          )}

          {/* Application credentials — the plan declares the names, a human supplies the values */}
          {(secrets.length > 0 || plan.credentials) && (
            <section id="plan-credentials" className="pv-section">
              <div className="pv-section-head">
                <h4 className="pv-section-title">
                  <KeyOutlined aria-hidden /> Application credentials
                </h4>
                {secrets.length > 0 && (
                  <span className={`pv-badge ${approvalBlocked ? 'pv-badge-warn' : 'pv-badge-ok'}`}>
                    {approvalBlocked ? `${missingSecrets.length} still needed` : 'All provided'}
                  </span>
                )}
              </div>
              <div className="card pv-credentials">
                {secrets.length > 0 ? (
                  <RequiredSecrets
                    projectId={projectId}
                    secrets={secrets}
                    onChange={onDraftChange}
                    embedded
                  />
                ) : (
                  plan.credentials && <SectionContent section={plan.credentials} />
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* 12 — approval, below the panel so it never scrolls out of reach */}
      <section id="plan-approval" className="pv-section">
        <div className="card pv-approval">
          <h4 className="pv-section-title">Approval</h4>
          {draft.planApproved ? (
            <p className="pv-approved">
              <CheckCircleFilled aria-hidden /> This plan is approved. The next step is generating
              the backlog.
            </p>
          ) : (
            <>
              <p className="muted">
                Approving the plan moves the project to backlog generation. Nothing is written to
                Azure DevOps yet — that happens after the backlog is reviewed and pushed.
              </p>
              {approvalBlocked && (
                <p className="pv-gate">
                  <ExclamationCircleFilled aria-hidden />
                  <span>
                    Before this plan can be approved, provide{' '}
                    {missingSecrets.map((secret) => secret.name).join(', ')} in{' '}
                    <button
                      className="link pv-inline-link"
                      onClick={() => goTo('plan-credentials')}
                    >
                      Application credentials
                    </button>
                    .
                  </span>
                </p>
              )}
              {!showFeedback ? (
                <div className="actions">
                  {approveButton}
                  {requestChangesButton}
                </div>
              ) : (
                <div className="feedback-form">
                  <label htmlFor="plan-feedback">What should change?</label>
                  <textarea
                    id="plan-feedback"
                    rows={4}
                    value={feedback}
                    placeholder="e.g. Split Epic 7 into separate auth and quiz-config epics; add a security phase."
                    onChange={(e) => setFeedback(e.target.value)}
                  />
                  <div className="actions">
                    <button
                      disabled={busy || !feedback.trim()}
                      title={feedback.trim() ? '' : 'Describe the changes first'}
                      onClick={() =>
                        void onAction(() => api.regeneratePlan(projectId, feedback.trim())).then(
                          () => {
                            setShowFeedback(false);
                            setFeedback('');
                          },
                        )
                      }
                    >
                      Regenerate with feedback
                    </button>
                    <button
                      className="link"
                      disabled={busy}
                      onClick={() => {
                        setShowFeedback(false);
                        setFeedback('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* The generated document itself, so a reader can always check the presentation against it */}
      <div className="pv-raw">
        <Disclosure
          open={showRaw}
          onToggle={() => setShowRaw((v) => !v)}
          head={<span className="pv-detail-title">Original plan document</span>}
        >
          <pre className="pv-raw-text">{draft.planMarkdown}</pre>
        </Disclosure>
      </div>
    </div>
  );
}

/** Falls back to the repositories the backlog already targets when the plan names none. */
function reposFromBacklog(backlog: BacklogItem[]): RepoCard[] {
  const names = [
    ...new Set(backlog.map((item) => item.repo).filter((repo): repo is string => !!repo)),
  ];
  return names.map((name) => ({ id: `repo-${name}`, name, role: null, chips: [], blocks: [] }));
}
