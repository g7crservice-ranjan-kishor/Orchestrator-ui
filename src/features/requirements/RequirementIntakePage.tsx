import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ClockCircleOutlined,
  CopyOutlined,
  DownOutlined,
  FileAddOutlined,
  FileTextOutlined,
  FilterOutlined,
  MoreOutlined,
  PaperClipOutlined,
  ReadOutlined,
  SearchOutlined,
  SendOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Alert, Button, Dropdown, Empty, Input, Select, Spin } from 'antd';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import type { Requirement } from '../../lib/types';
import {
  ACCEPTED_ATTACHMENTS,
  ACCEPTED_ATTACHMENTS_LABEL,
  attachmentProblem,
  describeAttachments,
  headline,
  MAX_REQUIREMENT_CHARS,
  MIN_REQUIREMENT_CHARS,
  relativeTime,
  statusesInUse,
  statusLabel,
  visibleRequirements,
} from './requirement-intake';

const PLACEHOLDER = [
  'Example:',
  '• Build a task management application with user authentication…',
  '• Create a dashboard with charts, and allow users to manage tasks…',
  '• Develop a REST API with database integration…',
].join(String.fromCharCode(10));

/**
 * Requirement intake for a project: write the requirement, attach any supporting documents, then
 * read back everything submitted so far.
 *
 * Attachments are chosen *with* the requirement even though the API takes them separately — a
 * person has the files to hand while they are describing the work, not after. The page creates the
 * requirement first and uploads each file against the id it gets back, which is the same two calls
 * the old form made a person perform by hand.
 */
export function RequirementIntakePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  /** The form's picker, and the per-card one that adds a file to a requirement already submitted. */
  const newFiles = useRef<HTMLInputElement | null>(null);
  const extraFile = useRef<HTMLInputElement | null>(null);
  const attachingTo = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      setRequirements(await api.listRequirements(projectId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load requirements.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () => visibleRequirements(requirements, { search, status }),
    [requirements, search, status],
  );

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: 'All status' },
      ...statusesInUse(requirements).map((value) => ({ value, label: statusLabel(value) })),
    ],
    [requirements],
  );

  const planningLink = projectId ? `/projects/${projectId}/planning` : null;
  const tooShort = text.trim().length < MIN_REQUIREMENT_CHARS;

  function chooseFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);
    const refusal = picked.map(attachmentProblem).find(Boolean);
    if (refusal) {
      setError(refusal);
      return;
    }
    setError(null);
    setPending(picked);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!projectId || tooShort) return;
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const created = await api.createRequirement(projectId, text);
      // Uploaded one at a time against the new requirement's id. A failure here leaves the
      // requirement in place — it is the thing that matters — and says which file did not make it.
      for (const file of pending) {
        try {
          await api.uploadAttachment(created.id, file);
        } catch (err) {
          setError(
            `The requirement was saved, but ${file.name} could not be attached` +
              (err instanceof ApiError ? `: ${err.message}` : '.'),
          );
        }
      }
      setText('');
      setPending([]);
      if (newFiles.current) newFiles.current.value = '';
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit requirement.');
    } finally {
      setSubmitting(false);
    }
  }

  async function addAttachment(file: File | undefined) {
    const requirementId = attachingTo.current;
    if (!file || !requirementId) return;
    const refusal = attachmentProblem(file);
    if (refusal) {
      setError(refusal);
      return;
    }
    setError(null);
    try {
      await api.uploadAttachment(requirementId, file);
      setNotice(`${file.name} attached.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Attachment upload failed.');
    } finally {
      attachingTo.current = null;
      if (extraFile.current) extraFile.current.value = '';
    }
  }

  async function copyText(requirement: Requirement) {
    try {
      await navigator.clipboard?.writeText(requirement.text);
      setNotice('Requirement text copied.');
    } catch {
      setError('This browser would not let the page copy to the clipboard.');
    }
  }

  return (
    <section className="page-section ri-page">
      <header className="ri-head">
        <div className="ri-head-text">
          <h2>Requirement Intake</h2>
          <p className="muted">
            Provide your product idea or detailed requirement. The Orchestrator will analyse it and
            create a structured plan.
          </p>
        </div>
        <Button
          className="ri-help-toggle"
          icon={<ReadOutlined />}
          onClick={() => setShowHelp((open) => !open)}
          aria-expanded={showHelp}
        >
          Need help writing a requirement?
          <DownOutlined className={showHelp ? 'ri-chevron ri-chevron-open' : 'ri-chevron'} />
        </Button>
      </header>

      {showHelp && (
        <div className="card ri-help">
          <h3>What the planning agent needs from you</h3>
          <p className="muted">
            Write it as you would explain it to a new colleague. Plain sentences work better than
            bullet points, and the first short line becomes the requirement&rsquo;s title.
          </p>
          <ul>
            <li>
              <strong>Who uses it and what they do.</strong> &ldquo;An administrator signs in,
              searches employees, and edits their details.&rdquo;
            </li>
            <li>
              <strong>What has to be kept.</strong> Say whether anything is stored and survives a
              refresh — this is what decides whether the product gets a database and an API.
            </li>
            <li>
              <strong>The rules that are not obvious.</strong> Limits, who may do what, what happens
              when something fails.
            </li>
            <li>
              <strong>What is out of scope.</strong> Saying &ldquo;no sign-up, one administrator
              only&rdquo; prevents a sprint of work nobody wanted.
            </li>
          </ul>
        </div>
      )}

      {error && (
        <Alert
          className="ri-alert"
          message={error}
          type="error"
          showIcon
          closable
          onClose={() => setError(null)}
        />
      )}
      {notice && (
        <Alert
          className="ri-alert"
          message={notice}
          type="success"
          showIcon
          closable
          onClose={() => setNotice(null)}
        />
      )}

      <form className="card ri-form" onSubmit={submit} aria-label="Submit requirement">
        <div className="ri-banner">
          <span className="ri-banner-icon">
            <FileAddOutlined />
          </span>
          <div className="ri-banner-text">
            <strong>New requirement</strong>
            <p>
              Describe what you want to build. You can write a high-level idea or a detailed
              requirement.
            </p>
          </div>
        </div>

        <label className="ri-label" htmlFor="requirement-text">
          Requirement (text) <span className="ri-required">*</span>
        </label>
        <Input.TextArea
          id="requirement-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={7}
          maxLength={MAX_REQUIREMENT_CHARS}
          showCount
        />

        <div className="ri-attach">
          <span className="ri-attach-icon">
            <PaperClipOutlined />
          </span>
          <div className="ri-attach-text">
            <strong>Attachments (optional)</strong>
            <p>Upload requirement documents, designs, or reference files.</p>
          </div>
          <div className="ri-attach-pick">
            <Button icon={<UploadOutlined />} onClick={() => newFiles.current?.click()}>
              Choose files
            </Button>
            <span className="ri-attach-chosen">
              {pending.length === 0
                ? 'No file chosen'
                : pending.map((file) => file.name).join(', ')}
            </span>
          </div>
          <p className="ri-attach-hint">{ACCEPTED_ATTACHMENTS_LABEL}</p>
          <input
            ref={newFiles}
            className="ri-file-input"
            type="file"
            multiple
            accept={ACCEPTED_ATTACHMENTS}
            aria-label="Choose attachments"
            onChange={(e) => chooseFiles(e.target.files)}
          />
        </div>

        <Button
          type="primary"
          htmlType="submit"
          icon={<SendOutlined />}
          loading={submitting}
          disabled={tooShort}
          className="ri-submit"
        >
          Submit requirement
        </Button>
      </form>

      <div className="ri-list-head">
        <div className="ri-list-title">
          <h3>Submitted requirements</h3>
          <p className="muted">View and manage the requirements you have submitted.</p>
        </div>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search requirements…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search requirements"
        />
        <Select
          value={status}
          onChange={setStatus}
          options={statusOptions}
          suffixIcon={<FilterOutlined />}
          aria-label="Filter by status"
        />
      </div>

      {loading && (
        <div className="ri-loading">
          <Spin />
        </div>
      )}

      {!loading &&
        rows.map((requirement) => {
          const { title, body } = headline(requirement.text);
          return (
            <article className="card ri-card" key={requirement.id}>
              <span className="ri-card-icon">
                <FileTextOutlined />
              </span>
              <div className="ri-card-main">
                <h4>{title}</h4>
                {body && <p className="ri-card-body">{body}</p>}
                <p className="ri-card-files">
                  <PaperClipOutlined /> Attachments: {describeAttachments(requirement)}
                </p>
              </div>
              <div className="ri-card-side">
                <div className="ri-card-meta">
                  <span className={`ri-status ri-status-${requirement.status}`}>
                    {statusLabel(requirement.status)}
                  </span>
                  <span className="ri-card-age">
                    <ClockCircleOutlined /> {relativeTime(requirement.createdAt)}
                  </span>
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        {
                          key: 'attach',
                          icon: <PaperClipOutlined />,
                          label: 'Add attachment…',
                          onClick: () => {
                            attachingTo.current = requirement.id;
                            extraFile.current?.click();
                          },
                        },
                        {
                          key: 'copy',
                          icon: <CopyOutlined />,
                          label: 'Copy requirement text',
                          onClick: () => void copyText(requirement),
                        },
                      ],
                    }}
                  >
                    <Button
                      type="text"
                      icon={<MoreOutlined />}
                      aria-label={`More actions for ${title}`}
                    />
                  </Dropdown>
                </div>
                {planningLink && (
                  <Link className="ri-proceed" to={planningLink}>
                    Proceed to planning →
                  </Link>
                )}
              </div>
            </article>
          );
        })}

      {!loading && rows.length === 0 && (
        <div className="card ri-empty">
          <Empty
            description={
              requirements.length === 0
                ? 'No requirements submitted yet.'
                : 'No requirement matches this search.'
            }
          />
        </div>
      )}

      <input
        ref={extraFile}
        className="ri-file-input"
        type="file"
        accept={ACCEPTED_ATTACHMENTS}
        aria-label="Add an attachment to a submitted requirement"
        onChange={(e) => void addAttachment(e.target.files?.[0])}
      />
    </section>
  );
}
