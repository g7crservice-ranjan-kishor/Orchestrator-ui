import { useCallback, useEffect, useState } from 'react';
import { DeleteOutlined, UserAddOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Popconfirm,
  Row,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { api, ApiError } from '../../lib/api';
import type { User } from '../../lib/types';

/** Administrator user-management UI. */
export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', displayName: '', password: '' });
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await api.listUsers());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function createUser() {
    setError(null);
    setCreating(true);
    try {
      await api.createUser(form);
      setForm({ email: '', displayName: '', password: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create user.');
    } finally {
      setCreating(false);
    }
  }
  async function toggleDisabled(user: User) {
    try {
      await api.setUserDisabled(user.id, !user.disabled);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update user.');
    }
  }
  async function remove(user: User) {
    try {
      await api.deleteUser(user.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete user.');
    }
  }
  return (
    <section className="page-section">
      <div className="page-title">
        <div>
          <span className="eyebrow">ACCESS CONTROL</span>
          <Typography.Title level={2}>Users</Typography.Title>
          <Typography.Text type="secondary">
            Manage who can access your delivery workspace.
          </Typography.Text>
        </div>
      </div>
      {error && <Alert message={error} type="error" showIcon closable style={{ marginTop: 20 }} />}
      <Card
        className="surface-card"
        title={
          <Space>
            <UserAddOutlined />
            <span>Add a team member</span>
          </Space>
        }
        style={{ marginTop: 24 }}
      >
        <Form layout="vertical" onFinish={() => void createUser()} requiredMark={false}>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item label="Email" required>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Display name" required>
                <Input
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  required
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Temporary password" required>
                <Input.Password
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  minLength={12}
                  required
                />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" loading={creating}>
            Add user
          </Button>
        </Form>
      </Card>
      <Card className="surface-card" title="Workspace users" style={{ marginTop: 24 }}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={users}
          pagination={{ pageSize: 8 }}
          scroll={{ x: 700 }}
          columns={[
            {
              title: 'User',
              key: 'user',
              render: (_, user) => (
                <div>
                  <Typography.Text strong>{user.displayName}</Typography.Text>
                  <br />
                  <Typography.Text type="secondary">{user.email}</Typography.Text>
                </div>
              ),
            },
            {
              title: 'Roles',
              dataIndex: 'roles',
              render: (roles: string[]) =>
                roles.map((role) => (
                  <Tag color="purple" key={role}>
                    {role}
                  </Tag>
                )),
            },
            {
              title: 'Status',
              key: 'status',
              render: (_, user) => (
                <Tag color={user.disabled ? 'default' : 'success'}>
                  {user.disabled ? 'Disabled' : 'Active'}
                </Tag>
              ),
            },
            {
              title: 'Actions',
              key: 'actions',
              align: 'right',
              render: (_, user) => (
                <Space>
                  <Switch
                    checked={!user.disabled}
                    checkedChildren="Active"
                    unCheckedChildren="Disabled"
                    onChange={() => void toggleDisabled(user)}
                  />
                  <Popconfirm
                    title="Delete this user?"
                    onConfirm={() => void remove(user)}
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                  >
                    <Button danger type="text" icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </section>
  );
}
