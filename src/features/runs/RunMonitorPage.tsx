import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  BranchesOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  CloseOutlined,
  CloudServerOutlined,
  CopyOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  LoadingOutlined,
  MoreOutlined,
  NodeIndexOutlined,
  PauseCircleFilled,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Alert, Button, Dropdown, Empty, Input, Pagination, Select, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api, ApiError } from '../../lib/api';
import type { Run } from '../../lib/types';
import {
  ACTIVE_POLL_MS,
  activityOf,
  formatCost,
  formatDuration,
  formatStarted,
  formatTokens,
  IDLE_POLL_MS,
  isTerminal,
  PAGE_SIZE,
  pageOf,
  runDuration,
  shortId,
  showingLabel,
  SORT_LABELS,
  statesInUse,
  visibleRuns,
  type RunSort,
} from './run-monitor';

/** Copies a value and says so, without taking the reader anywhere. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip title={copied ? 'Copied' : label}>
      <Button
        type="text"
        size="small"
        className="rm-copy"
        aria-label={label}
        icon={<CopyOutlined />}
        onClick={(e) => {
          e.stopPropagation();
          void navigator.clipboard?.writeText(value).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            },
            () => undefined,
          );
        }}
      />
    </Tooltip>
  );
}

/** The run's state, coloured by what it means rather than by its name. */
function StateTag({ state }: { state: string }) {
  if (state === 'Completed') {
    return (
      <span className="rm-state rm-state-done">
        <CheckCircleFilled /> Completed
      </span>
    );
  }
  if (state === 'Failed' || state === 'Cancelled') {
    return (
      <span className="rm-state rm-state-bad">
        <CloseCircleFilled /> {state}
      </span>
    );
  }
  if (state === 'Blocked') {
    return (
      <span className="rm-state rm-state-held">
        <PauseCircleFilled /> Blocked
      </span>
    );
  }
  return (
    <span className="rm-state rm-state-live">
      <LoadingOutlined /> {state}…
    </span>
  );
}

/**
 * Every background run for a project, with the detail of whichever one is open.
 *
 * The page polls: three seconds while anything is still running, ten when nothing is. A run is the
 * only thing on screen that changes without the reader doing anything, so it is the only thing that
 * refreshes itself.
 */
export function RunMonitorPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [state, setState] = useState('all');
  const [sort, setSort] = useState<RunSort>('latest');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      setRuns(await api.listRuns(projectId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load runs.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const anyActive = useMemo(() => runs.some((run) => !isTerminal(run.state)), [runs]);

  useEffect(() => {
    const id = setInterval(() => void load(), anyActive ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    return () => clearInterval(id);
  }, [load, anyActive]);

  const matching = useMemo(
    () => visibleRuns(runs, { search, state, sort }),
    [runs, search, state, sort],
  );
  const rows = useMemo(() => pageOf(matching, page), [matching, page]);
  const selected = useMemo(
    () => runs.find((run) => run.runId === selectedId) ?? null,
    [runs, selectedId],
  );

  // A narrowed list must not leave the reader on a page that no longer exists.
  useEffect(() => {
    setPage(1);
  }, [search, state, sort]);

  const stateOptions = useMemo(
    () => [
      { value: 'all', label: 'All states' },
      ...statesInUse(runs).map((value) => ({ value, label: value })),
    ],
    [runs],
  );

  const columns: ColumnsType<Run> = [
    {
      title: 'Run ID',
      dataIndex: 'runId',
      render: (runId: string) => (
        <span className="rm-id">
          <code>{shortId(runId)}</code>
          <CopyButton value={runId} label="Copy run ID" />
        </span>
      ),
    },
    { title: 'Role', dataIndex: 'role' },
    { title: 'State', dataIndex: 'state', render: (value: string) => <StateTag state={value} /> },
    { title: 'Attempts', dataIndex: 'attempts', align: 'center' },
    {
      title: 'Started at',
      dataIndex: 'createdAt',
      render: (createdAt: string) => <span className="rm-started">{formatStarted(createdAt)}</span>,
    },
    {
      title: 'Duration',
      key: 'duration',
      render: (_, run) => formatDuration(runDuration(run)),
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right',
      render: (_, run) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'open', label: 'View details', onClick: () => setSelectedId(run.runId) },
              {
                key: 'copy',
                label: 'Copy run ID',
                onClick: () => void navigator.clipboard?.writeText(run.runId),
              },
              ...(run.result?.logsRef
                ? [
                    {
                      key: 'logs',
                      label: <a href={run.result.logsRef}>Open logs</a>,
                    },
                  ]
                : []),
            ],
          }}
        >
          <Button
            type="text"
            icon={<MoreOutlined />}
            aria-label={`Actions for run ${shortId(run.runId)}`}
            onClick={(e) => e.stopPropagation()}
          />
        </Dropdown>
      ),
    },
  ];

  if (!projectId) return null;

  return (
    <section className="page-section rm-page">
      <header className="rm-head">
        <div className="rm-head-text">
          <h2>Runs</h2>
          <p className="muted">View and monitor all background runs and their execution details.</p>
        </div>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search by run ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search runs"
        />
        <Select
          value={state}
          onChange={setState}
          options={stateOptions}
          aria-label="Filter by state"
        />
        <Tooltip title="Refresh">
          <Button icon={<ReloadOutlined />} aria-label="Refresh runs" onClick={() => void load()} />
        </Tooltip>
      </header>

      {error && (
        <Alert
          className="rm-alert"
          message={error}
          type="error"
          showIcon
          closable
          onClose={() => setError(null)}
        />
      )}

      <div className={selected ? 'rm-body rm-body-split' : 'rm-body'}>
        <div className="card rm-list">
          <div className="rm-list-head">
            <h3>Runs ({matching.length})</h3>
            <label className="rm-sort">
              Sort by
              <Select
                value={sort}
                onChange={(value: RunSort) => setSort(value)}
                options={(Object.keys(SORT_LABELS) as RunSort[]).map((value) => ({
                  value,
                  label: SORT_LABELS[value],
                }))}
                aria-label="Sort runs"
              />
            </label>
          </div>

          <Table
            className="rm-table"
            rowKey="runId"
            columns={columns}
            dataSource={rows}
            loading={loading}
            pagination={false}
            locale={{ emptyText: <Empty description="No runs yet." /> }}
            rowClassName={(run) => (run.runId === selectedId ? 'rm-row rm-row-open' : 'rm-row')}
            onRow={(run) => ({ onClick: () => setSelectedId(run.runId) })}
          />

          <div className="rm-list-foot">
            <span className="muted">{showingLabel(matching.length, page)}</span>
            <Pagination
              current={page}
              onChange={setPage}
              total={matching.length}
              pageSize={PAGE_SIZE}
              showSizeChanger={false}
              hideOnSinglePage
            />
          </div>
        </div>

        {selected && (
          <aside className="card rm-detail" aria-label="Run details">
            <div className="rm-detail-head">
              <h3>Run details</h3>
              <StateTag state={selected.state} />
              <Button
                type="text"
                icon={<CloseOutlined />}
                aria-label="Close run details"
                onClick={() => setSelectedId(null)}
              />
            </div>

            <p className="rm-detail-id">
              <code>{selected.runId}</code>
              <CopyButton value={selected.runId} label="Copy run ID" />
            </p>
            <p className="rm-detail-sub muted">
              Role: <strong>{selected.role}</strong>
              {selected.workItemId && (
                <>
                  {' | '}Work item: <strong>{selected.workItemId}</strong>
                </>
              )}
              {' | '}Started: {formatStarted(selected.createdAt)}
            </p>

            <div className="rm-tiles">
              <div className="rm-tile">
                <span className="rm-tile-icon">
                  <ClockCircleOutlined />
                </span>
                <div>
                  <span className="rm-tile-label">Duration</span>
                  <strong>{formatDuration(runDuration(selected))}</strong>
                </div>
              </div>
              <div className="rm-tile">
                <span className="rm-tile-icon">
                  <FileTextOutlined />
                </span>
                <div>
                  <span className="rm-tile-label">Tokens</span>
                  <strong>{selected.result ? formatTokens(selected.result.tokens) : '—'}</strong>
                </div>
              </div>
              <div className="rm-tile">
                <span className="rm-tile-icon">
                  <DatabaseOutlined />
                </span>
                <div>
                  <span className="rm-tile-label">Cost</span>
                  <strong>{selected.result ? formatCost(selected.result.cost) : '—'}</strong>
                </div>
              </div>
            </div>

            <dl className="rm-facts">
              <div>
                <dt>
                  <NodeIndexOutlined /> State
                </dt>
                <dd>
                  <StateTag state={selected.state} />
                </dd>
              </div>
              <div>
                <dt>
                  <ReloadOutlined /> Attempts
                </dt>
                <dd>{selected.attempts}</dd>
              </div>
              <div>
                <dt>
                  <FileTextOutlined /> Files changed
                </dt>
                <dd>{selected.result ? selected.result.filesChanged : '—'}</dd>
              </div>
              <div>
                <dt>
                  <BranchesOutlined /> Commits
                </dt>
                <dd>
                  {selected.result?.commits?.length ? (
                    <span className="rm-id">
                      <code>{selected.result.commits.map((c) => c.slice(0, 8)).join(', ')}</code>
                      <CopyButton
                        value={selected.result.commits.join(' ')}
                        label="Copy commit hashes"
                      />
                    </span>
                  ) : (
                    <span className="muted">none</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  <CloudServerOutlined /> ADO changes
                </dt>
                <dd>{selected.result?.adoChanges?.length ?? 0}</dd>
              </div>
              <div>
                <dt>
                  <FolderOpenOutlined /> Workspace
                </dt>
                <dd>
                  {selected.result?.workspacePath ? (
                    <span className="rm-id">
                      <code>{selected.result.workspacePath}</code>
                      <CopyButton
                        value={selected.result.workspacePath}
                        label="Copy workspace path"
                      />
                    </span>
                  ) : (
                    <span className="muted">n/a</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  <FileTextOutlined /> Logs
                </dt>
                <dd>
                  {selected.result?.logsRef ? (
                    <a href={selected.result.logsRef}>{selected.result.logsRef}</a>
                  ) : (
                    <span className="muted">none</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="rm-activity">
              <h4>
                <ClockCircleOutlined /> Recent activity
              </h4>
              <ol>
                {activityOf(selected).map((entry) => (
                  <li
                    key={entry.key}
                    className={entry.pending ? 'rm-step rm-step-live' : 'rm-step'}
                  >
                    <span className="rm-step-dot" aria-hidden="true" />
                    <div>
                      <strong>{entry.label}</strong>
                      {entry.at && <span className="muted">{formatStarted(entry.at)}</span>}
                    </div>
                  </li>
                ))}
              </ol>
              {!selected.result && !isTerminal(selected.state) && (
                <p className="rm-activity-note muted">
                  Step-by-step progress is streamed to the browser while a run is live and is not
                  stored, so only what the orchestrator recorded is listed here.
                </p>
              )}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
