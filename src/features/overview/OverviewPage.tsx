import { useEffect, useState } from 'react';
import {
  AppstoreOutlined,
  BarChartOutlined,
  CheckCircleFilled,
  FolderOpenOutlined,
  RightOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../../lib/api';
import { HeroArtwork } from './HeroArtwork';

/** The three promises the product makes, shown under the welcome. */
const PROMISES = ['Plan with clarity', 'Deliver with confidence', 'Govern with control'];

/** The places to go from here. Every one is a route that exists. */
const DESTINATIONS = [
  {
    to: '/projects',
    tone: 'indigo',
    icon: <FolderOpenOutlined />,
    title: 'Projects',
    blurb: 'Set up and manage delivery workspaces',
  },
  {
    to: '/users',
    tone: 'violet',
    icon: <TeamOutlined />,
    title: 'Team access',
    blurb: 'Manage workspace users',
  },
  {
    to: '/projects',
    tone: 'green',
    icon: <AppstoreOutlined />,
    title: 'Delivery flow',
    blurb: 'Plan, approve, and ship',
  },
] as const;

/** First steps, in the order someone new to the workspace actually takes them. */
const FIRST_STEPS = [
  {
    to: '/projects',
    tone: 'indigo',
    icon: <FolderOpenOutlined />,
    title: 'Create a project',
    blurb: 'Set up a new delivery workspace.',
  },
  {
    to: '/users',
    tone: 'violet',
    icon: <TeamOutlined />,
    title: 'Add team members',
    blurb: 'Invite and manage workspace users.',
  },
  {
    to: '/projects',
    tone: 'green',
    icon: <AppstoreOutlined />,
    title: 'Plan and approve',
    blurb: 'Review requirements and start delivery.',
  },
] as const;

/**
 * Counts the workspace can actually answer.
 *
 * Only what the API really returns is shown. A dashboard that invents a number is worse than one
 * that shows fewer — a figure on this page is read as fact, and the first time one turns out to be
 * decorative, none of the others can be trusted either. A count that cannot be loaded (an endpoint
 * this user is not allowed to call, or a request that fails) is left out rather than shown as zero.
 */
interface Counts {
  projects: number | null;
  users: number | null;
}

/** Landing view for the delivery workspace. */
export function OverviewPage() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Counts>({ projects: null, users: null });

  useEffect(() => {
    let live = true;
    const load = async () => {
      const [projects, users] = await Promise.all([
        api.listProjects().then(
          (p) => p.length,
          () => null,
        ),
        api.listUsers().then(
          (u) => u.length,
          () => null,
        ),
      ]);
      if (live) setCounts({ projects, users });
    };
    void load();
    return () => {
      live = false;
    };
  }, []);

  const stats = [
    {
      to: '/projects',
      tone: 'indigo',
      icon: <FolderOpenOutlined />,
      label: 'Projects',
      value: counts.projects,
    },
    {
      to: '/users',
      tone: 'violet',
      icon: <TeamOutlined />,
      label: 'Team members',
      value: counts.users,
    },
  ].filter((s) => s.value !== null);

  return (
    <section className="overview-page">
      <div className="overview-hero">
        <div className="overview-hero-copy">
          <span className="eyebrow">CONTROL CENTER</span>
          <h1>
            Welcome back,
            <br />
            <span className="overview-hero-name">
              {user?.displayName?.split(' ')[0] || 'there'}.
            </span>
          </h1>
          <p>
            Bring requirements, planning, delivery, and governance together in one clear workflow.
          </p>
          <ul className="overview-promises">
            {PROMISES.map((promise) => (
              <li key={promise}>
                <CheckCircleFilled />
                {promise}
              </li>
            ))}
          </ul>
        </div>
        <div className="overview-hero-art">
          <HeroArtwork />
        </div>
      </div>

      <div className="overview-destinations">
        {DESTINATIONS.map((d) => (
          <Link key={d.title} to={d.to} className="overview-destination">
            <span className={`overview-tile tone-${d.tone}`}>{d.icon}</span>
            <span className="overview-destination-copy">
              <strong>{d.title}</strong>
              <span>{d.blurb}</span>
            </span>
            <RightOutlined className="overview-chevron" />
          </Link>
        ))}
      </div>

      <div className="overview-panels">
        <section className="overview-panel">
          <header className="overview-panel-head">
            <span className="overview-tile tone-indigo">
              <ThunderboltOutlined />
            </span>
            <div>
              <h2>Getting started</h2>
              <p>Set up your workspace and start delivering faster.</p>
            </div>
          </header>
          <div className="overview-steps">
            {FIRST_STEPS.map((step) => (
              <Link key={step.title} to={step.to} className="overview-step">
                <span className={`overview-tile tone-${step.tone}`}>{step.icon}</span>
                <strong>{step.title}</strong>
                <span className="overview-step-blurb">{step.blurb}</span>
                <RightOutlined className="overview-chevron" />
              </Link>
            ))}
          </div>
        </section>

        <section className="overview-panel">
          <header className="overview-panel-head">
            <span className="overview-tile tone-violet">
              <BarChartOutlined />
            </span>
            <div>
              <h2>Platform overview</h2>
              <p>Everything you need for end-to-end delivery.</p>
            </div>
          </header>
          {stats.length > 0 ? (
            <div className="overview-stats">
              {stats.map((stat) => (
                <Link key={stat.label} to={stat.to} className={`overview-stat tone-${stat.tone}`}>
                  <span className="overview-stat-icon">{stat.icon}</span>
                  <strong>{stat.value}</strong>
                  <span className="overview-stat-label">{stat.label}</span>
                  <RightOutlined className="overview-chevron" />
                </Link>
              ))}
            </div>
          ) : (
            <p className="overview-stats-empty">Counts are unavailable right now.</p>
          )}
        </section>
      </div>
    </section>
  );
}
