import { useMemo, useState, type FormEvent } from 'react';
import {
  ApartmentOutlined,
  AppstoreOutlined,
  BranchesOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  DeleteOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { api, ApiError } from '../../lib/api';
import type { BacklogItem, BacklogItemType, Draft, ValidationIssue } from '../../lib/types';

const TYPES: BacklogItemType[] = ['epic', 'feature', 'story', 'task'];

/** One icon per level, so a row's kind is readable before the badge is. */
const TYPE_ICON: Record<BacklogItemType, JSX.Element> = {
  epic: <AppstoreOutlined />,
  feature: <ApartmentOutlined />,
  story: <FileTextOutlined />,
  task: <CheckSquareOutlined />,
};

/** Depth of an item in the parent chain (for indentation). */
function depthOf(item: BacklogItem, byId: Map<string, BacklogItem>): number {
  let d = 0;
  let cur = item;
  while (cur.parentId && byId.has(cur.parentId)) {
    cur = byId.get(cur.parentId)!;
    d += 1;
  }
  return d;
}

/**
 * Backlog editor: add/edit/delete/re-parent cards, set priority/repo/sprint, and surface validation
 * issues. Every edit persists to the MongoDB draft through the same API calls it always used — this
 * is a presentation change, not a behavioural one.
 */
export function BacklogEditor({
  projectId,
  draft,
  issues,
  onChange,
  onValidate,
}: {
  projectId: string;
  draft: Draft;
  issues: ValidationIssue[];
  onChange: (draft: Draft) => void;
  onValidate: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ type: BacklogItemType; title: string; parentId: string }>({
    type: 'epic',
    title: '',
    parentId: '',
  });

  const byId = useMemo(() => new Map(draft.backlog.map((i) => [i.id, i])), [draft.backlog]);
  const ordered = useMemo(
    () => [...draft.backlog].sort((a, b) => a.order - b.order),
    [draft.backlog],
  );
  const counts = useMemo(() => {
    const tally = { epic: 0, feature: 0, story: 0, task: 0 } as Record<BacklogItemType, number>;
    for (const item of draft.backlog) tally[item.type] += 1;
    return tally;
  }, [draft.backlog]);

  async function guard(action: () => Promise<Draft>) {
    setError(null);
    try {
      onChange(await action());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    await guard(() =>
      api.addBacklogItem(projectId, {
        type: form.type,
        title: form.title,
        parentId: form.parentId || null,
      }),
    );
    setForm({ type: 'epic', title: '', parentId: '' });
  }

  const stats = [
    { key: 'total', label: 'Total items', value: draft.backlog.length, icon: <DatabaseOutlined /> },
    { key: 'epic', label: 'Epics', value: counts.epic, icon: TYPE_ICON.epic },
    { key: 'feature', label: 'Features', value: counts.feature, icon: TYPE_ICON.feature },
    { key: 'story', label: 'Stories', value: counts.story, icon: TYPE_ICON.story },
    { key: 'task', label: 'Tasks', value: counts.task, icon: TYPE_ICON.task },
  ];

  return (
    <section className="card bl" aria-labelledby="backlog-heading">
      <header className="bl-head">
        <span className="bl-head-icon" aria-hidden="true">
          <DatabaseOutlined />
        </span>
        <div className="bl-head-text">
          <h3 id="backlog-heading">Backlog</h3>
          <p>Manage and organise your backlog items across epics, features, stories and tasks.</p>
        </div>
        <div className="bl-stats">
          {stats.map((stat) => (
            <div className={`bl-stat is-${stat.key}`} key={stat.key}>
              <span className="bl-stat-icon" aria-hidden="true">
                {stat.icon}
              </span>
              <span className="bl-stat-text">
                <span className="bl-stat-label">{stat.label}</span>
                <strong>{stat.value}</strong>
              </span>
            </div>
          ))}
        </div>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <form className="bl-add" onSubmit={addItem} aria-label="Add backlog item">
        <label className="bl-field">
          <span>Item type</span>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as BacklogItemType })}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t[0].toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="bl-field bl-field-grow">
          <span>Title</span>
          <input
            placeholder="Enter title…"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </label>
        <label className="bl-field">
          <span>Parent</span>
          <select
            value={form.parentId}
            onChange={(e) => setForm({ ...form, parentId: e.target.value })}
          >
            <option value="">(no parent)</option>
            {draft.backlog.map((i) => (
              <option key={i.id} value={i.id}>
                {i.type}: {i.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="bl-clear"
          onClick={() => setForm({ type: 'epic', title: '', parentId: '' })}
        >
          <ReloadOutlined /> Clear
        </button>
        <button type="submit" className="bl-add-btn">
          <PlusOutlined /> Add item
        </button>
      </form>

      <div className="bl-table-wrap">
        <table className="bl-table">
          <thead>
            <tr>
              <th className="bl-col-num">#</th>
              <th>Item</th>
              <th className="bl-col-priority">Priority</th>
              <th className="bl-col-repo">Repository</th>
              <th className="bl-col-sprint">Sprint</th>
              <th className="bl-col-parent">Parent</th>
              <th className="bl-col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((item, index) => (
              <tr key={item.id} className={`bl-row is-${item.type}`}>
                <td className="bl-col-num">{index + 1}</td>
                <td>
                  <div className="bl-item" style={{ paddingLeft: `${depthOf(item, byId) * 18}px` }}>
                    <span className={`bl-type-icon is-${item.type}`} aria-hidden="true">
                      {TYPE_ICON[item.type]}
                    </span>
                    <span className={`bl-kind is-${item.type}`}>{item.type}</span>
                    <span className="bl-item-text">
                      <input
                        className="bl-title"
                        aria-label={`Title of ${item.title}`}
                        defaultValue={item.title}
                        onBlur={(e) =>
                          e.target.value !== item.title &&
                          void guard(() =>
                            api.updateBacklogItem(projectId, item.id, { title: e.target.value }),
                          )
                        }
                      />
                      {item.description && <span className="bl-desc">{item.description}</span>}
                    </span>
                  </div>
                </td>
                <td className="bl-col-priority">
                  <select
                    className={`bl-priority is-p${item.priority}`}
                    aria-label={`Priority of ${item.title}`}
                    defaultValue={item.priority}
                    onChange={(e) =>
                      void guard(() =>
                        api.updateBacklogItem(projectId, item.id, {
                          priority: Number(e.target.value),
                        }),
                      )
                    }
                  >
                    {[1, 2, 3, 4].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="bl-col-repo">
                  <span className="bl-chip-input">
                    <BranchesOutlined aria-hidden="true" />
                    <input
                      aria-label={`Repository of ${item.title}`}
                      defaultValue={item.repo ?? ''}
                      placeholder="repository"
                      onBlur={(e) =>
                        void guard(() =>
                          api.updateBacklogItem(projectId, item.id, { repo: e.target.value }),
                        )
                      }
                    />
                  </span>
                </td>
                <td className="bl-col-sprint">
                  <span className="bl-chip-input">
                    <CalendarOutlined aria-hidden="true" />
                    <input
                      aria-label={`Sprint of ${item.title}`}
                      defaultValue={item.sprint ?? ''}
                      placeholder="sprint"
                      onBlur={(e) =>
                        void guard(() =>
                          api.updateBacklogItem(projectId, item.id, { sprint: e.target.value }),
                        )
                      }
                    />
                  </span>
                </td>
                <td className="bl-col-parent">
                  <select
                    aria-label={`Parent of ${item.title}`}
                    defaultValue={item.parentId ?? ''}
                    onChange={(e) =>
                      void guard(() =>
                        api.moveBacklogItem(projectId, item.id, e.target.value || null, item.order),
                      )
                    }
                  >
                    <option value="">(root)</option>
                    {draft.backlog
                      .filter((p) => p.id !== item.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                  </select>
                </td>
                <td className="bl-col-actions">
                  <button
                    type="button"
                    className="bl-delete"
                    aria-label={`Delete ${item.title}`}
                    title="Delete"
                    onClick={() => void guard(() => api.deleteBacklogItem(projectId, item.id))}
                  >
                    <DeleteOutlined />
                  </button>
                </td>
              </tr>
            ))}
            {draft.backlog.length === 0 && (
              <tr>
                <td colSpan={7} className="bl-empty">
                  No backlog yet — run the Scrum Master session, or add items above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bl-foot">
        <button type="button" className="link" onClick={() => void onValidate()}>
          Validate backlog
        </button>
      </div>

      {issues.length > 0 && (
        <ul className="bl-issues">
          {issues.map((issue, idx) => (
            <li key={idx} className={issue.severity === 'error' ? 'is-error' : 'is-warning'}>
              <span className="bl-issue-tag">{issue.severity}</span>
              {issue.itemId ? `${byId.get(issue.itemId)?.title ?? issue.itemId}: ` : ''}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
