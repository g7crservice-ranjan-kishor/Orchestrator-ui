import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRightOutlined,
  BarChartOutlined,
  LockOutlined,
  MailOutlined,
  RocketOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { useAuth } from './AuthContext';
import { LoginArtwork } from './LoginArtwork';
import { LoginBackdrop } from './LoginBackdrop';
import { ApiError } from '../../lib/api';

/** What the product is for, in the three things a new signer-in most wants to know. */
const HIGHLIGHTS = [
  {
    icon: <TeamOutlined />,
    tone: 'indigo',
    title: 'Collaborate',
    body: 'Align teams and streamline delivery.',
  },
  {
    icon: <ThunderboltOutlined />,
    tone: 'violet',
    title: 'Build faster',
    body: 'Combine human expertise with AI.',
  },
  {
    icon: <BarChartOutlined />,
    tone: 'teal',
    title: 'Stay in control',
    body: 'Track progress with complete transparency.',
  },
];

/**
 * Email/password login.
 *
 * The authentication is untouched — the same `login()` call, the same error handling, the same
 * redirect. Everything else is presentation: a dark brand stage on the left, the form on a light
 * panel at the right, stacking to stage-then-form on a narrow screen.
 */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-stage">
        <LoginBackdrop />

        <div className="login-stage-inner">
          <div className="login-brand">
            <span className="login-brand-mark">
              <RocketOutlined />
            </span>
            <span className="login-brand-name">AGENTIC SDLC</span>
          </div>

          <div className="login-pitch">
            <h1>
              Ship with <span className="login-gradient">clarity.</span>
            </h1>
            <p>One workspace for bringing human judgment and AI-assisted delivery together.</p>
          </div>

          <ul className="login-highlights">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title}>
                <span className={`login-highlight-icon is-${item.tone}`} aria-hidden="true">
                  {item.icon}
                </span>
                <span className="login-highlight-text">
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                </span>
              </li>
            ))}
          </ul>

          <p className="login-footnote">
            From ideas to impact,
            <br />
            with AI by your side.
          </p>
        </div>

        <LoginArtwork />
      </section>

      <section className="login-panel">
        <div className="login-card">
          <Typography.Title level={2}>Welcome back</Typography.Title>
          <Typography.Paragraph type="secondary">
            Sign in to open your delivery workspace.
          </Typography.Paragraph>
          {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 20 }} />}
          <Form layout="vertical" onFinish={() => void onSubmit()} requiredMark={false}>
            <Form.Item label="Email" required>
              <Input
                prefix={<MailOutlined />}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                size="large"
                required
                autoComplete="username"
              />
            </Form.Item>
            <Form.Item label="Password" required>
              <Input.Password
                prefix={<LockOutlined />}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                size="large"
                required
                autoComplete="current-password"
              />
            </Form.Item>
            {/* `loading` also disables the button, so a second submit cannot start while the
                first request is still in flight. */}
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={submitting}
              className="login-submit"
            >
              {submitting ? (
                'Signing in…'
              ) : (
                <>
                  Sign in <ArrowRightOutlined />
                </>
              )}
            </Button>
          </Form>
        </div>
      </section>
    </div>
  );
}
