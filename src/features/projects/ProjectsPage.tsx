import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FolderOutlined,
  MoreOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { VscAzure, VscRepo } from 'react-icons/vsc';
import { SiGit } from 'react-icons/si';
import { Alert, Button, Dropdown, Empty, Input, Modal, Select, Table, Tooltip } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { DATABASE_LABELS, type DatabaseChoice, type Project } from '../../lib/types';
import { DatabaseIcon } from './DatabaseIcon';
import { NewProjectModal } from './NewProjectModal';
import {
  adoConfigured,
  databasesInUse,
  repoName,
  SORT_LABELS,
  visibleProjects,
  type ProjectSort,
} from './project-filters';

/**
 * The project directory: every project with its Azure DevOps target, database and repositories,
 * searchable and sortable, with the row itself as the way in.
 *
 * The Azure DevOps column says **Configured**, not "Connected". Nothing on this page has spoken to
 * Azure DevOps — checking would mean one API call per row on every load — so the honest claim is
 * that the target is complete, which is what the green dot means here.
 */
export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [database, setDatabase] = useState<DatabaseChoice | 'all'>('all');
  const [sort, setSort] = useState<ProjectSort>('name-asc');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await api.listProjects());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load projects.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () => visibleProjects(projects, { search, database, sort }),
    [projects, search, database, sort],
  );

  const databaseOptions = useMemo(
    () => [
      { value: 'all', label: 'All databases' },
      ...databasesInUse(projects).map((choice) => ({
        value: choice,
        label: DATABASE_LABELS[choice],
      })),
    ],
    [projects],
  );

  /** Deleting removes the project and its drafts; work items already in ADO are untouched. */
  function confirmDelete(project: Project) {
    Modal.confirm({
      title: `Delete ${project.name}?`,
      content:
        'This removes the project and its planning drafts from the orchestrator. Work items ' +
        'already pushed to Azure DevOps are left exactly as they are.',
      okText: 'Delete project',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.deleteProject(project.id);
          await load();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Failed to delete the project.');
        }
      },
    });
  }

  return (
    <section className="page-section projects-page">
      <header className="pp-head">
        <span className="pp-head-icon">
          <VscAzure />
        </span>
        <div className="pp-head-text">
          <h2>Your projects</h2>
          <p className="muted">Manage your projects, Azure DevOps, database and repositories.</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
          New project
        </Button>
      </header>

      {error && <Alert message={error} type="error" showIcon closable style={{ marginTop: 16 }} />}

      <div className="card pp-panel">
        <div className="pp-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search projects"
          />
          <Select
            value={database}
            onChange={setDatabase}
            options={databaseOptions}
            aria-label="Filter by database"
          />
          <Select
            value={sort}
            onChange={setSort}
            options={(Object.keys(SORT_LABELS) as ProjectSort[]).map((value) => ({
              value,
              label: `Sort by: ${SORT_LABELS[value]}`,
            }))}
            aria-label="Sort projects"
          />
        </div>

        <Table
          className="pp-table"
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={rows.length > 8 ? { pageSize: 8, showSizeChanger: false } : false}
          scroll={{ x: 900 }}
          locale={{
            emptyText: (
              <Empty
                description={
                  projects.length === 0
                    ? 'No projects yet. Create one to start planning.'
                    : 'No project matches these filters.'
                }
              />
            ),
          }}
          columns={[
            {
              title: 'Project',
              key: 'name',
              width: '30%',
              render: (_, project) => (
                <div className="pp-project">
                  <span className="pp-project-icon">
                    <FolderOutlined />
                  </span>
                  <div className="pp-project-text">
                    <Link className="pp-name" to={`/projects/${project.id}/requirements`}>
                      {project.name}
                    </Link>
                    {project.description && (
                      <Tooltip title={project.description} placement="bottomLeft">
                        <p className="pp-desc">{project.description}</p>
                      </Tooltip>
                    )}
                  </div>
                </div>
              ),
            },
            {
              title: 'Azure DevOps',
              key: 'ado',
              render: (_, project) => (
                <div className="pp-cell">
                  <Tooltip title={project.adoTarget.areaPath}>
                    <span className="pp-chip pp-chip-ado">
                      <VscAzure className="pp-azure" /> {project.adoTarget.project || '—'}
                    </span>
                  </Tooltip>
                  <span className={`pp-status ${adoConfigured(project) ? 'is-ok' : 'is-warn'}`}>
                    {adoConfigured(project) ? 'Configured' : 'Incomplete target'}
                  </span>
                </div>
              ),
            },
            {
              title: 'Database',
              key: 'database',
              render: (_, project) => (
                <span className="pp-chip">
                  <DatabaseIcon database={project.database} />{' '}
                  {DATABASE_LABELS[project.database] ?? project.database}
                </span>
              ),
            },
            {
              title: 'Repositories',
              key: 'repos',
              render: (_, project) => (
                <div className="pp-cell">
                  <span className="pp-repos-count">
                    <VscRepo className="pp-repo-icon" />{' '}
                    {project.targetRepos.length === 0
                      ? 'None'
                      : `${project.targetRepos.length} ${
                          project.targetRepos.length === 1 ? 'repository' : 'repositories'
                        }`}
                  </span>
                  {project.targetRepos.length > 0 && (
                    <span className="pp-repo-chips">
                      {project.targetRepos.map((repo) => (
                        <Tooltip key={repo} title={repo}>
                          <span className="pp-chip pp-chip-repo">
                            <SiGit className="pp-git-icon" /> {repoName(repo)}
                          </span>
                        </Tooltip>
                      ))}
                    </span>
                  )}
                </div>
              ),
            },
            {
              title: 'Actions',
              key: 'actions',
              align: 'right',
              width: 170,
              render: (_, project) => (
                <div className="pp-actions">
                  <Link to={`/projects/${project.id}/requirements`}>
                    <Button type="link" icon={<RightOutlined />} iconPosition="end">
                      Open
                    </Button>
                  </Link>
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: 'planning', label: 'Planning' },
                        { key: 'board', label: 'Development board' },
                        { type: 'divider' },
                        { key: 'delete', label: 'Delete project', danger: true },
                      ],
                      onClick: ({ key }) => {
                        if (key === 'planning') navigate(`/projects/${project.id}/planning`);
                        if (key === 'board') navigate(`/projects/${project.id}/board`);
                        if (key === 'delete') confirmDelete(project);
                      },
                    }}
                  >
                    <Button
                      type="text"
                      icon={<MoreOutlined />}
                      aria-label={`More actions for ${project.name}`}
                    />
                  </Dropdown>
                </div>
              ),
            },
          ]}
        />
      </div>

      <NewProjectModal open={creating} onClose={() => setCreating(false)} onCreated={load} />
    </section>
  );
}
