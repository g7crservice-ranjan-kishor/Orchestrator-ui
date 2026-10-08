import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ApartmentOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  CopyOutlined,
  FileTextOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  TagOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, Button, DatePicker, Empty, Input, Pagination, Select, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api, ApiError } from '../../lib/api';
import type { AuditEntry } from '../../lib/types';
import { PAGE_SIZE, pageOf, showingLabel } from '../../lib/paging';
import {
  actionLabel,
  actionsInUse,
  countsByDay,
  entryType,
  formatFullWhen,
  formatWhen,
  prettyMetadata,
  runIdOf,
  sparkline,
  summarise,
  totalsOf,
  visibleEntries,
  type AuditSort,
  type EntryType,
} from './audit-log';

const { RangePicker } = DatePicker;

/** The picker reports `YYYY-MM-DD`; the bounds are the reader's own day, not UTC's. */
function dayStart(text: string): string | null {
  if (!text) return null;
  const at = new Date(`${text}T00:00:00`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

function dayEnd(text: string): string | null {
  if (!text) return null;
  const at = new Date(`${text}T23:59:59.999`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/**
 * A stat tile: the count, and the shape of the fortnight behind it.
 *
 * One series per tile, so there is no palette to assign — every sparkline is drawn in the accent
 * hue and identity comes from the label and the icon beside it, never from colour alone. The plot
 * carries no axes or labels deliberately: it answers "steady or spiky?", and the exact numbers are
 * in the table underneath.
 */
function StatTile({
  icon,
  label,
  value,
  series,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  series: number[];
}) {
  const paths = sparkline(series);
  return (
    <div className="card al-tile">
      <span className="al-tile-icon">{icon}</span>
      <div className="al-tile-text">
        <span className="al-tile-label">{label}</span>
        <strong>{value.toLocaleString()}</strong>
      </div>
      {paths && (
        <svg
          className="al-spark"
          viewBox="0 0 96 32"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${label}: activity over the last 14 days`}
        >
          <path className="al-spark-area" d={paths.area} />
          <path className="al-spark-line" d={paths.line} />
        </svg>
      )}
    </div>
  );
}

/** Copies a value and says so. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip title={copied ? 'Copied' : label}>
      <Button
        type="text"
        size="small"
        className="al-copy"
        aria-label={label}
        icon={<CopyOutlined />}
        onClick={() => {
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

function TypeTag({ type }: { type: EntryType }) {
  return <span className={`al-type al-type-${type.toLowerCase()}`}>{type}</span>;
}

/**
 * The immutable audit trail for a project: every action, gate approval and Azure DevOps write, with
 * who did it and the context it carried.
 *
 * Nothing on this page can change anything — the collection is append-only and the API offers no
 * write. What it does offer is the ability to *find* an entry, which is why the search covers the
 * context JSON as well as the actor and the action: the question is usually "what happened to 772?"
 * and the answer is inside the metadata, not in any column.
 */
export function AuditPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('all');
  /**
   * The picked range as the two `YYYY-MM-DD` strings the picker reports, rather than its own date
   * objects — `dayjs` reaches this workspace only through Ant Design, and a page should not depend
   * on a library it never added.
   */
  const [range, setRange] = useState<[string, string]>(['', '']);
  const [sort, setSort] = useState<AuditSort>('newest');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      setEntries(await api.listAudit(projectId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load audit log.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rowsAll = useMemo(
    () =>
      visibleEntries(entries, {
        search,
        action,
        from: dayStart(range[0]),
        to: dayEnd(range[1]),
        sort,
      }),
    [entries, search, action, range, sort],
  );
  const rows = useMemo(() => pageOf(rowsAll, page), [rowsAll, page]);
  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  );

  // A narrowed list must not leave the reader on a page that no longer exists.
  useEffect(() => {
    setPage(1);
  }, [search, action, range, sort]);

  // Counted from the filtered list, so the tiles can never disagree with the rows beneath them.
  const totals = useMemo(() => totalsOf(rowsAll), [rowsAll]);
  const series = useMemo(
    () => ({
      total: countsByDay(rowsAll),
      task: countsByDay(rowsAll.filter((e) => entryType(e.action) === 'Task')),
      approval: countsByDay(rowsAll.filter((e) => entryType(e.action) === 'Approval')),
      ado: countsByDay(rowsAll.filter((e) => entryType(e.action) === 'ADO')),
    }),
    [rowsAll],
  );

  const actionOptions = useMemo(
    () => [
      { value: 'all', label: 'All actions' },
      ...actionsInUse(entries).map((group) => ({
        label: group.type,
        options: group.actions.map((verb) => ({ value: verb, label: actionLabel(verb) })),
      })),
    ],
    [entries],
  );

  const columns: ColumnsType<AuditEntry> = [
    {
      title: 'When',
      dataIndex: 'createdAt',
      sorter: true,
      sortOrder: sort === 'newest' ? 'descend' : 'ascend',
      render: (createdAt: string) => {
        const { date, time } = formatWhen(createdAt);
        return (
          <span className="al-when">
            <span>{date}</span>
            <span className="muted">{time}</span>
          </span>
        );
      },
    },
    { title: 'Actor', dataIndex: 'actorEmail' },
    {
      title: 'Action',
      dataIndex: 'action',
      render: (verb: string) => <code className="al-action">{verb}</code>,
    },
    {
      title: 'Type',
      key: 'type',
      render: (_, entry) => <TypeTag type={entryType(entry.action)} />,
    },
    {
      title: 'Details',
      key: 'details',
      render: (_, entry) => <span className="al-details">{summarise(entry)}</span>,
    },
  ];

  if (!projectId) return null;

  return (
    <section className="page-section al-page" aria-labelledby="audit-heading">
      <header className="al-head">
        <div className="al-head-text">
          <h2 id="audit-heading">Audit Log</h2>
          <p className="muted">
            View all system actions, approvals, and Azure DevOps integrations in a single place.
          </p>
        </div>
        <RangePicker
          onChange={(_dates, text) => setRange([text?.[0] ?? '', text?.[1] ?? ''])}
          aria-label="Filter by date range"
        />
        <Select
          value={action}
          onChange={setAction}
          options={actionOptions}
          showSearch
          optionFilterProp="label"
          aria-label="Filter by action"
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          Refresh
        </Button>
      </header>

      {error && (
        <Alert
          className="al-alert"
          message={error}
          type="error"
          showIcon
          closable
          onClose={() => setError(null)}
        />
      )}

      <div className="al-tiles">
        <StatTile
          icon={<FileTextOutlined />}
          label="Total logs"
          value={totals.total}
          series={series.total}
        />
        <StatTile
          icon={<PlayCircleOutlined />}
          label="Task events"
          value={totals.task}
          series={series.task}
        />
        <StatTile
          icon={<CheckCircleOutlined />}
          label="Approval events"
          value={totals.approval}
          series={series.approval}
        />
        <StatTile
          icon={<ApartmentOutlined />}
          label="ADO events"
          value={totals.ado}
          series={series.ado}
        />
      </div>

      <div className={selected ? 'al-body al-body-split' : 'al-body'}>
        <div className="card al-list">
          <div className="al-list-head">
            <h3>Audit logs ({rowsAll.length})</h3>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search by actor, action or details…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search the audit log"
            />
          </div>

          <Table
            className="al-table"
            rowKey="id"
            columns={columns}
            dataSource={rows}
            loading={loading}
            pagination={false}
            showSorterTooltip={false}
            onChange={(_p, _f, sorter) => {
              const order = Array.isArray(sorter) ? sorter[0]?.order : sorter?.order;
              setSort(order === 'ascend' ? 'oldest' : 'newest');
            }}
            locale={{ emptyText: <Empty description="No audit entries yet." /> }}
            rowClassName={(entry) => (entry.id === selectedId ? 'al-row al-row-open' : 'al-row')}
            onRow={(entry) => ({ onClick: () => setSelectedId(entry.id) })}
          />

          <div className="al-list-foot">
            <span className="muted">{showingLabel(rowsAll.length, page, 'log')}</span>
            <Pagination
              current={page}
              onChange={setPage}
              total={rowsAll.length}
              pageSize={PAGE_SIZE}
              showSizeChanger={false}
              hideOnSinglePage
            />
          </div>
        </div>

        {selected && (
          <aside className="card al-detail" aria-label="Log details">
            <div className="al-detail-head">
              <h3>Log details</h3>
              <Button
                type="text"
                icon={<CloseOutlined />}
                aria-label="Close log details"
                onClick={() => setSelectedId(null)}
              />
            </div>

            <div className="al-detail-stamp">
              <TypeTag type={entryType(selected.action)} />
              <span className="muted">{formatFullWhen(selected.createdAt)}</span>
            </div>

            <h4 className="al-detail-action">{selected.action}</h4>
            <p className="al-detail-sub muted">
              {actionLabel(selected.action)} — by {selected.actorEmail}
            </p>

            <dl className="al-facts">
              <div>
                <dt>
                  <UserOutlined /> Actor
                </dt>
                <dd>{selected.actorEmail}</dd>
              </div>
              <div>
                <dt>
                  <TagOutlined /> Type
                </dt>
                <dd>
                  <TypeTag type={entryType(selected.action)} />
                </dd>
              </div>
              <div>
                <dt>
                  <FileTextOutlined /> Entity
                </dt>
                <dd>
                  <code>
                    {selected.entityType} {selected.entityId}
                  </code>
                </dd>
              </div>
              {runIdOf(selected) && (
                <div>
                  <dt>
                    <PlayCircleOutlined /> Run ID
                  </dt>
                  <dd>
                    <span className="al-inline">
                      <code>{runIdOf(selected)}</code>
                      <CopyButton value={runIdOf(selected) as string} label="Copy run ID" />
                    </span>
                  </dd>
                </div>
              )}
            </dl>

            <div className="al-json">
              <div className="al-json-head">
                <h4>Details (JSON)</h4>
                <CopyButton value={prettyMetadata(selected)} label="Copy details JSON" />
              </div>
              <pre>
                <code>{prettyMetadata(selected)}</code>
              </pre>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
