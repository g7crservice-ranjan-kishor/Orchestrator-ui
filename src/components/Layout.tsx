import { useEffect, useState, type ReactNode } from 'react';
import {
  ApartmentOutlined,
  AppstoreOutlined,
  AuditOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  LogoutOutlined,
  PlayCircleOutlined,
  ProfileOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Dropdown, Layout as AntLayout, Menu, Space, Typography } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { ThemeToggle } from '../theme/ThemeToggle';
import { api } from '../lib/api';
import {
  activeNavKey,
  projectIdFrom,
  projectNav,
  WORKSPACE_NAV,
  type NavIcon,
} from './project-nav';

const { Header, Sider, Content } = AntLayout;

/** Kept here so {@link ./project-nav} stays a plain module that tests without React. */
const ICONS: Record<NavIcon, ReactNode> = {
  overview: <AppstoreOutlined />,
  projects: <FolderOpenOutlined />,
  requirements: <FileTextOutlined />,
  planning: <ProfileOutlined />,
  development: <ApartmentOutlined />,
  qa: <ExperimentOutlined />,
  runs: <PlayCircleOutlined />,
  audit: <AuditOutlined />,
  users: <TeamOutlined />,
};

/**
 * Authenticated app shell: navigation, identity controls, and routed content.
 *
 * The sidebar changes shape once a project is open. Reaching a project's planning page meant going
 * to Projects, finding the row, opening it, and only then navigating — every time, for every
 * section. With a project open, everything it can do is one click away, and the workspace entries
 * stay put so leaving is as easy as arriving.
 */
export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const projectId = projectIdFrom(location.pathname);
  const [projectName, setProjectName] = useState<string | null>(null);

  // The header says which project you are in. Best-effort: the shell must still render if the
  // project row cannot be read, so a failure here shows the id rather than an error screen.
  useEffect(() => {
    if (!projectId) {
      setProjectName(null);
      return;
    }
    let current = true;
    void api
      .listProjects()
      .then((projects) => projects.find((p) => p.id === projectId)?.name ?? null)
      .then((name) => {
        if (current) setProjectName(name);
      })
      .catch(() => {
        if (current) setProjectName(null);
      });
    return () => {
      current = false;
    };
  }, [projectId]);

  const selectedKey = activeNavKey(location.pathname, location.search);
  const sections = projectId ? projectNav(projectId) : [];

  return (
    <AntLayout className="app-shell">
      <Sider width={256} breakpoint="lg" collapsedWidth={0} className="sidebar">
        <div className="brand">
          <div className="brand-mark">O</div>
          <span>Orchestrator</span>
        </div>
        <div className="brand-subtitle">AGENTIC SDLC</div>

        <div className="sidebar-nav">
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            onClick={({ key }) => navigate(key)}
            items={WORKSPACE_NAV.map((item) => ({
              key: item.to,
              icon: ICONS[item.icon],
              label: item.label,
            }))}
          />

          {sections.length > 0 && (
            <>
              <div className="sidebar-section-label" title={projectName ?? undefined}>
                {projectName ?? 'Project'}
              </div>
              <Menu
                theme="dark"
                mode="inline"
                selectedKeys={[selectedKey]}
                onClick={({ key }) => navigate(key)}
                items={sections.map((item) => ({
                  key: item.to,
                  icon: ICONS[item.icon],
                  label: item.label,
                }))}
              />
            </>
          )}
        </div>
      </Sider>
      <AntLayout>
        <Header className="topbar">
          <Typography.Text type="secondary" className="workspace-label">
            {projectName ?? 'Delivery workspace'}
          </Typography.Text>
          <div className="topbar-actions">
            <ThemeToggle />
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: 'Sign out',
                    onClick: () => void logout(),
                  },
                ],
              }}
            >
              <Button type="text" className="profile-button">
                <Space size={8}>
                  <Avatar
                    size="small"
                    style={{ background: 'var(--primary-bg)', color: 'var(--primary-hover)' }}
                  >
                    {user?.displayName?.slice(0, 1).toUpperCase() || 'U'}
                  </Avatar>
                  <span>{user?.displayName || user?.email}</span>
                </Space>
              </Button>
            </Dropdown>
          </div>
        </Header>
        <Content className="content">
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
