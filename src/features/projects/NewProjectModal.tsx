import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  AutoComplete,
  Button,
  Col,
  Form,
  Input,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  theme,
  Typography,
} from 'antd';
import {
  ApartmentOutlined,
  ArrowRightOutlined,
  CheckCircleFilled,
  DatabaseOutlined,
  ExportOutlined,
  FileTextOutlined,
  FolderOutlined,
  LinkOutlined,
  PlusSquareOutlined,
} from '@ant-design/icons';
import { api, ApiError } from '../../lib/api';
import type { Preflight } from '../../lib/types';

const emptyForm = {
  name: '',
  description: '',
  orgUrl: '',
  pat: '',
  project: '',
  areaPath: '',
  /**
   * Make the Azure DevOps project, rather than pick one that exists.
   *
   * The default, because one Azure DevOps project per product is the arrangement that works.
   * Products sharing a project share a sprint timeline — the second one inherits the first one's
   * active sprint, and completing a sprint on one board moves the other's.
   */
  createProject: true,
};

/** What the token has to be allowed to do, shown wherever the token is asked for. */
/**
 * The scrolling area's height, and how much room the rest of the dialog needs around it.
 *
 * `BODY_HEIGHT` is roughly the Azure DevOps section plus one field — enough that the form reads
 * as a form rather than a peephole, without the dialog filling a laptop screen. `CHROME_HEIGHT`
 * is the heading, the buttons, their borders and the margin a centred dialog keeps from the
 * window edge; it is what stops a short screen pushing the buttons out of reach.
 */
const BODY_HEIGHT = 480;
const CHROME_HEIGHT = 260;

const PAT_SCOPES =
  'Work Items (read & write), Code (read & write), Project and Team (read, write & manage)';

/** Where to make a token when there is no organization to send someone to yet. */
const PAT_DOCS =
  'https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate';

/** The Azure mark, for the section that is about someone else's product. */
function AzureMark() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden focusable="false">
      <path
        fill="#0078D4"
        d="M5.483 21.3H24L14.025 4.013l-3.038 8.347 5.938 7.056L5.483 21.3zM13.23 2.7L6.105 8.677 0 19.253h5.505L13.23 2.7z"
      />
    </svg>
  );
}

/**
 * One titled group of fields.
 *
 * The form asks for two unrelated things — what is being built, and where it is built — and running
 * them together as one list of inputs made it read longer than it is. Grouping them is the whole
 * difference between a form someone skims and a form someone braces for.
 */
function Section({
  icon,
  tint,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  tint: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const { token } = theme.useToken();
  return (
    <section
      style={{
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        background: token.colorFillQuaternary,
        padding: '18px 20px 4px',
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 38,
            height: 38,
            borderRadius: 10,
            background: tint,
            flex: '0 0 auto',
          }}
        >
          {icon}
        </span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>{title}</div>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {subtitle}
          </Typography.Text>
        </div>
      </div>
      {children}
    </section>
  );
}

/** An external link that says it leaves the page. */
function OutLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Typography.Link href={href} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
      {children} <ExportOutlined style={{ fontSize: 11 }} />
    </Typography.Link>
  );
}

/**
 * Creating a project: the few things that cannot be worked out from anything else.
 *
 * Everything this used to ask for up front — the database, the repositories — is now asked after
 * planning, because before a plan exists nobody knows whether the product stores anything or how
 * many repositories it is. Answering those questions early is how a project ended up configured
 * for a database it never used and repositories whose names had nothing to do with what was built.
 *
 * What is left has to be given: the organization, a token for it, and where the work items live.
 * The token is checked here rather than believed, so a wrong or expired one is caught while
 * someone is still looking at this form instead of surfacing as a 401 inside a pod hours later.
 */
export function NewProjectModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const { token } = theme.useToken();
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  /*
   * Bring the scrolling area back to the top when something goes wrong.
   *
   * The alerts sit above the fields, and the fields now scroll — so pressing "Create project" from
   * the bottom of a filled-in form would put the failure message off-screen above, and the only
   * visible change would be the button no longer spinning. The ref is on a marker at the very top
   * of the body, whose parent is the element that actually scrolls.
   */
  const topMarker = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!error && warnings.length === 0) return;
    // Optional call: not every environment implements it, and a dialog that throws while telling
    // you something went wrong would replace a message with a blank screen.
    topMarker.current?.parentElement?.scrollTo?.({ top: 0, behavior: 'smooth' });
  }, [error, warnings.length]);

  const set = (key: keyof typeof emptyForm) => (e: { target: { value: string } }) => {
    const { value } = e.target;
    setForm((current) => ({ ...current, [key]: value }));
    // Anything that changes what the check was about invalidates its answer.
    if (key === 'orgUrl' || key === 'pat' || key === 'project') setPreflight(null);
  };

  const reset = () => {
    setForm(emptyForm);
    setPreflight(null);
    setError(null);
    setWarnings([]);
  };

  /** Asks Azure DevOps what this token can see, before anything is stored. */
  async function check(project = form.project) {
    setError(null);
    setChecking(true);
    try {
      setPreflight(
        await api.preflightAdo({
          orgUrl: form.orgUrl,
          pat: form.pat,
          // Nothing to look up when the project is about to be created: asking about it would
          // come back "no such project", which is true and useless.
          project: form.createProject ? undefined : project || undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach Azure DevOps.');
    } finally {
      setChecking(false);
    }
  }

  async function create() {
    setError(null);
    setCreating(true);
    try {
      const created = await api.createProvisionedProject({
        name: form.name,
        description: form.description,
        adoPat: form.pat,
        createAdoProject: form.createProject,
        adoTarget: { orgUrl: form.orgUrl, project: form.project, areaPath },
      });
      await onCreated();
      if (created.warnings.length > 0) {
        // The project exists; something about setting it up did not work and has to be said.
        setWarnings(created.warnings);
        return;
      }
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create project.');
    } finally {
      setCreating(false);
    }
  }

  const org = form.orgUrl.trim().replace(/\/+$/, '');
  // When the project is created for this product, its work items live at the project root — there
  // is nothing else in there to separate them from.
  const areaPath = form.createProject ? form.project : form.areaPath;
  const filled = form.name && org && form.pat && form.project && areaPath;
  const verified = preflight?.ok === true;
  const tokensUrl = /^https?:\/\/.+\/.+/.test(org) ? `${org}/_usersSettings/tokens` : PAT_DOCS;
  const areasUrl =
    org && form.project
      ? `${org}/${encodeURIComponent(form.project)}/_settings/work-team?_a=areas`
      : null;

  return (
    <Modal
      open={open}
      onCancel={() => {
        reset();
        onClose();
      }}
      // One field per row, so the dialog is narrower than it was with paired columns: a single
      // input stretched across 920px puts its label and its content a long way apart, and a short
      // value like a project name looks lost in it.
      width={640}
      destroyOnHidden
      centered
      /*
       * A fixed shell with a scrolling middle: the heading and the buttons stay put, and only the
       * fields move.
       *
       * `height` rather than `maxHeight` on purpose. This form changes size as you fill it in — a
       * connection check adds an alert, choosing "Use an existing one" swaps two fields for two
       * others, a failed token adds a warning block. With a maximum, the dialog grows and shrinks
       * under the pointer and the Cancel button moves while you are reaching for it. A fixed
       * height costs some empty space early on and keeps every control exactly where it was.
       *
       * Capped against the viewport so it still fits on a short screen, where the alternative is
       * a footer pushed off the bottom and no way to reach it.
       */
      styles={{
        body: {
          height: `min(${BODY_HEIGHT}px, calc(100vh - ${CHROME_HEIGHT}px))`,
          overflowY: 'auto',
          // Room for the scrollbar, so it sits beside the fields rather than on top of them.
          paddingRight: 12,
          marginRight: -4,
        },
        header: {
          marginBottom: 0,
          paddingBottom: 20,
          borderBottom: `1px solid ${token.colorSplit}`,
        },
        footer: {
          marginTop: 0,
          paddingTop: 16,
          borderTop: `1px solid ${token.colorSplit}`,
        },
      }}
      title={
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', paddingRight: 24 }}>
          <span
            aria-hidden
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: 12,
              background: token.colorPrimaryBg,
              color: token.colorPrimary,
              fontSize: 20,
              flex: '0 0 auto',
            }}
          >
            <PlusSquareOutlined />
          </span>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.3 }}>Create New Project</div>
            <Typography.Text type="secondary" style={{ fontSize: 14, fontWeight: 400 }}>
              Set up a new project to start building with the Orchestrator.
            </Typography.Text>
          </div>
        </div>
      }
      footer={
        <Space>
          <Button
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            type="primary"
            loading={creating}
            disabled={!filled || !verified}
            onClick={() => void create()}
          >
            Create project <ArrowRightOutlined />
          </Button>
        </Space>
      }
    >
      <div ref={topMarker} aria-hidden />
      {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}
      {warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="The project was created, but not everything could be set up"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          }
        />
      )}

      <Form layout="vertical" requiredMark>
        <Section
          icon={<FileTextOutlined style={{ fontSize: 18, color: token.colorPrimary }} />}
          tint={token.colorPrimaryBg}
          title="Project details"
          subtitle="Provide a name and a brief description for your project."
        >
          <Row gutter={20}>
            <Col xs={24}>
              <Form.Item
                label="Project name"
                required
                htmlFor="project-name"
                extra="Use a clear and descriptive name for your project."
              >
                <Input
                  id="project-name"
                  value={form.name}
                  onChange={set('name')}
                  placeholder="Focus Timer"
                />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item
                label="Description"
                htmlFor="project-description"
                // The character count is positioned just under the field, where the help text
                // would otherwise sit — so the help text starts below it instead of behind it.
                extra={
                  <span style={{ display: 'block', marginTop: 18 }}>
                    Describe what you want to build. This helps the Orchestrator create a better
                    plan.
                  </span>
                }
              >
                <Input.TextArea
                  id="project-description"
                  value={form.description}
                  onChange={set('description')}
                  placeholder="A browser-based focus timer for work and break cycles"
                  maxLength={500}
                  showCount
                  autoSize={{ minRows: 2, maxRows: 4 }}
                />
              </Form.Item>
            </Col>
          </Row>
        </Section>

        <Section
          icon={<AzureMark />}
          tint="rgba(0, 120, 212, 0.12)"
          title="Azure DevOps configuration"
          subtitle="The Orchestrator works in your Azure DevOps on this project's behalf. It creates work items, reads the board, and creates the repositories the plan calls for."
        >
          <Row gutter={20}>
            <Col xs={24}>
              <Form.Item
                label="Organization URL"
                required
                htmlFor="ado-org-url"
                extra="Your Azure DevOps organization URL (e.g. https://dev.azure.com/your-org)."
              >
                <Input
                  id="ado-org-url"
                  prefix={<LinkOutlined style={{ color: token.colorTextTertiary }} />}
                  value={form.orgUrl}
                  onChange={set('orgUrl')}
                  placeholder="https://dev.azure.com/org"
                />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item
                label="Personal access token (PAT)"
                required
                htmlFor="ado-pat"
                tooltip={`Stored in the vault and never shown again. It needs ${PAT_SCOPES}.`}
                extra={
                  <>
                    Needs {PAT_SCOPES} permissions.
                    <br />
                    <OutLink href={tokensUrl}>How to create a PAT?</OutLink>
                  </>
                }
              >
                <Space.Compact style={{ width: '100%' }}>
                  <Input.Password
                    id="ado-pat"
                    value={form.pat}
                    onChange={set('pat')}
                    placeholder="Paste the token"
                    autoComplete="off"
                  />
                  <Button
                    onClick={() => void check()}
                    loading={checking}
                    disabled={!form.orgUrl || !form.pat}
                  >
                    Check connection
                  </Button>
                </Space.Compact>
              </Form.Item>
            </Col>
          </Row>

          {preflight && !preflight.ok && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 20 }}
              message="That token did not work"
              description={preflight.problem}
            />
          )}
          {verified && (
            <Alert
              type="success"
              style={{ marginBottom: 20 }}
              icon={<CheckCircleFilled />}
              showIcon
              message="Connected successfully!"
              description={
                form.createProject
                  ? `${preflight.projects.length} project(s) in this organization. A new one will be created for this product.`
                  : form.project
                    ? `Project '${form.project}' is available with ${preflight.areaPaths.length} area path(s).`
                    : `${preflight.projects.length} project(s) available — select one below.`
              }
              action={
                <Button type="link" size="small" onClick={() => setPreflight(null)}>
                  Change
                </Button>
              }
            />
          )}

          <Form.Item
            label="Azure DevOps project"
            required
            tooltip="One Azure DevOps project per product. Sharing one between products means sharing a sprint timeline."
          >
            <Radio.Group
              value={form.createProject}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  createProject: e.target.value as boolean,
                  project: '',
                  areaPath: '',
                }))
              }
              optionType="button"
              buttonStyle="solid"
              options={[
                { label: 'Create a new one', value: true },
                { label: 'Use an existing one', value: false },
              ]}
            />
            <Typography.Paragraph type="secondary" style={{ fontSize: 13, margin: '8px 0 0' }}>
              A product gets its own Azure DevOps project. Area paths separate work items, but
              sprints belong to the project — two products in one project share a single sprint
              timeline, so the second inherits the first one&apos;s active sprint.
            </Typography.Paragraph>
          </Form.Item>

          {preflight?.processProblem && form.createProject && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 20 }}
              message="A new project cannot be created with this token"
              description={preflight.processProblem}
            />
          )}

          <Row gutter={20}>
            <Col xs={24}>
              {form.createProject ? (
                <Form.Item
                  label="New project name"
                  required
                  htmlFor="ado-project"
                  tooltip="Created in Azure DevOps on the Scrum process, which is the one the orchestrator drives."
                  extra="Created for you, on the Scrum process. Its work items, repositories and sprints are this product's alone."
                >
                  <Input
                    id="ado-project"
                    prefix={<FolderOutlined style={{ color: token.colorTextTertiary }} />}
                    value={form.project}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, project: e.target.value }))
                    }
                    placeholder={form.name || 'Employee Management System'}
                  />
                </Form.Item>
              ) : (
                <Form.Item
                  label="Azure DevOps Project"
                  required
                  htmlFor="ado-project"
                  tooltip="The Azure DevOps project the work items are created in."
                  extra="Select the Azure DevOps project where work items and repositories will be created."
                >
                  <Select
                    id="ado-project"
                    showSearch
                    prefix={<FolderOutlined style={{ color: token.colorTextTertiary }} />}
                    value={form.project || undefined}
                    onChange={(project: string) => {
                      setForm((current) => ({ ...current, project }));
                      // Re-check straight away rather than making someone press Check twice: the
                      // second answer is what lists this project's area paths.
                      void check(project);
                    }}
                    placeholder={
                      preflight ? 'Select a project' : 'Check the connection to list projects'
                    }
                    options={(preflight?.projects ?? []).map((p) => ({ value: p, label: p }))}
                    notFoundContent="Check the connection to list the projects this token can see."
                  />
                </Form.Item>
              )}
            </Col>
            <Col xs={24}>
              {form.createProject ? (
                <Form.Item
                  label="Area path"
                  htmlFor="ado-area-path"
                  tooltip="With a project of its own there is nothing to separate the work from, so the work items sit at the project root."
                  extra="Nothing to choose: the product has the project to itself."
                >
                  <Input
                    id="ado-area-path"
                    disabled
                    prefix={<ApartmentOutlined style={{ color: token.colorTextTertiary }} />}
                    value={form.project || ''}
                    placeholder="The new project's root"
                  />
                </Form.Item>
              ) : (
                <Form.Item
                  label="Area path"
                  required
                  htmlFor="ado-area-path"
                  tooltip="Where this project's work items live. Pick an existing one, or type a new one and it will be created."
                  extra={
                    <>
                      Select an existing area path or type a new name to create it.
                      {areasUrl && (
                        <>
                          <br />
                          <OutLink href={areasUrl}>View available area paths</OutLink>
                        </>
                      )}
                    </>
                  }
                >
                  <AutoComplete
                    value={form.areaPath}
                    onChange={(areaPath: string) =>
                      setForm((current) => ({ ...current, areaPath }))
                    }
                    options={(preflight?.areaPaths ?? []).map((p) => ({ value: p }))}
                    filterOption={(input, option) =>
                      (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                  >
                    <Input
                      id="ado-area-path"
                      prefix={<ApartmentOutlined style={{ color: token.colorTextTertiary }} />}
                      placeholder={form.project ? `${form.project}\\Team` : 'Project\\Team'}
                    />
                  </AutoComplete>
                </Form.Item>
              )}
            </Col>
          </Row>

          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: token.borderRadiusLG,
              background: token.colorPrimaryBg,
              padding: '14px 16px',
              marginBottom: 20,
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 34,
                height: 34,
                borderRadius: 9,
                background: token.colorBgContainer,
                color: token.colorPrimary,
                flex: '0 0 auto',
              }}
            >
              <DatabaseOutlined />
            </span>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Next steps</div>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                Database configuration and repository details will be requested after planning,
                based on the actual requirements of your product. This keeps the setup simple and
                only asks for what is needed.
              </Typography.Text>
            </div>
          </div>
        </Section>
      </Form>
    </Modal>
  );
}
