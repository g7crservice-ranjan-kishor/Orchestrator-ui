import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Input, Select, Space, Tag, Typography } from 'antd';
import { api, ApiError } from '../../lib/api';
import {
  DATABASE_LABELS,
  UI_STYLE_LABELS,
  type DatabaseChoice,
  type Draft,
  type UiStyleChoice,
} from '../../lib/types';

/**
 * The questions that only the plan can answer, asked once it exists.
 *
 * These used to be on the create-project form, which meant asking before anyone knew whether the
 * product stored anything or how many repositories it was. A project ended up configured for a
 * database it never used, and with repository names that had nothing to do with what was planned.
 *
 * The plan is the first moment the answers exist, so this is where they are asked. Changing the
 * database afterwards makes the plan wrong — it was written against a different one — so that is
 * said plainly, with the regeneration offered right here rather than left to be remembered.
 */
export function ProjectConfiguration({
  projectId,
  draft,
  onDraftChange,
}: {
  projectId: string;
  draft: Draft;
  onDraftChange: (draft: Draft) => void;
}) {
  const [database, setDatabase] = useState<DatabaseChoice | null>(null);
  const [uiStyle, setUiStyle] = useState<UiStyleChoice | null>(null);
  const [uiStyleFromPlan, setUiStyleFromPlan] = useState<UiStyleChoice | null>(null);
  const [repos, setRepos] = useState<string>('');
  const [needsDatabase, setNeedsDatabase] = useState(false);
  const [serverless, setServerless] = useState(false);
  const [evidence, setEvidence] = useState<string | null>(null);
  const [configured, setConfigured] = useState<string[]>([]);
  const [databaseConfigured, setDatabaseConfigured] = useState(true);
  const [planReady, setPlanReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replanNeeded, setReplanNeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const config = await api.getProjectConfiguration(projectId);
      setPlanReady(config.planReady);
      setNeedsDatabase(config.needsDatabase);
      setServerless(config.serverless);
      setEvidence(config.databaseEvidence);
      setDatabaseConfigured(config.databaseConfigured);
      setConfigured(config.configuredRepositories);
      setDatabase((current) => current ?? config.database);
      setUiStyleFromPlan(config.uiStyle);
      // What the plan asked for wins over what the project happens to be set to: a requirement
      // naming Material UI must not be built with something else because of an earlier default.
      setUiStyle((current) => current ?? config.uiStyle ?? config.currentUiStyle);
      // Suggested names, unless repositories are already configured — then there is nothing to ask.
      setRepos((current) =>
        current || config.configuredRepositories.length > 0
          ? current
          : config.repositories.join(', '),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not read the configuration.');
    }
  }, [projectId]);

  useEffect(() => {
    if (draft.planMarkdown) void load();
  }, [draft.planMarkdown, load]);

  const names = repos
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const result = await api.applyProjectConfiguration(projectId, {
        database: database ?? undefined,
        uiStyle: uiStyle ?? undefined,
        repositories: names.length > 0 ? names : undefined,
      });
      setReplanNeeded(result.replanNeeded);
      await load();
      /*
       * The Technical details table reads the project's database, and it was resolved before this
       * panel changed it — so without this it keeps saying "Needs your input" for a database that
       * has just been chosen, two places disagreeing about the same fact. The refresh keeps any
       * answer typed by hand, and a failure here must not make a successful save look failed.
       */
      try {
        onDraftChange(await api.refreshTechnicalDetails(projectId));
      } catch {
        /* the table is stale until it is next re-read; the configuration is saved either way */
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not apply the configuration.');
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    setSaving(true);
    try {
      onDraftChange(
        await api.regeneratePlan(
          projectId,
          `The database for this project is ${DATABASE_LABELS[database ?? 'unset']}. ` +
            'Rewrite the plan against it, including the connection string it needs and the ' +
            'credentials that must be declared.',
        ),
      );
      setReplanNeeded(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not regenerate the plan.');
    } finally {
      setSaving(false);
    }
  }

  const outstanding = (needsDatabase && !databaseConfigured) || configured.length === 0;
  // An error is shown whatever else is true: a panel that failed to load its own state cannot use
  // that state to decide whether to say so.
  if (!error && (!planReady || (!outstanding && !replanNeeded))) {
    return null;
  }

  return (
    <section className="card" aria-labelledby="project-configuration">
      <h3 id="project-configuration">What this plan needs</h3>
      <p className="muted">
        The plan is ready, so these can now be answered for the product that is actually being
        built. The repositories are created in Azure DevOps for you.
      </p>

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}

      <div style={{ marginBottom: 16 }}>
        <Typography.Text strong>Database</Typography.Text>
        {serverless ? (
          // Saying why nothing is being asked is worth more than asking nothing: it shows the plan
          // was read, and it is how a wrong reading gets noticed.
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 8px' }}>
            The plan says this product keeps nothing on a server, so it needs no database. Choose
            one only if that is wrong.
          </Typography.Paragraph>
        ) : (
          evidence && (
            <Typography.Paragraph type="secondary" style={{ margin: '4px 0 8px' }}>
              The plan says: “{evidence}”
            </Typography.Paragraph>
          )
        )}
        <Select
          style={{ minWidth: 260 }}
          value={database ?? undefined}
          onChange={setDatabase}
          options={Object.entries(DATABASE_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Typography.Text strong>User interface</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ margin: '4px 0 8px' }}>
          {uiStyleFromPlan
            ? 'The plan names this framework, so the product is built with it.'
            : 'The plan names no framework; this is what the agents will be told to use.'}
        </Typography.Paragraph>
        <Select
          style={{ minWidth: 260 }}
          value={uiStyle ?? undefined}
          onChange={setUiStyle}
          options={Object.entries(UI_STYLE_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Typography.Text strong>Repositories</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ margin: '4px 0 8px' }}>
          Names, not URLs — each one is created if it does not exist, and its real clone URL is
          recorded.
        </Typography.Paragraph>
        {configured.length > 0 && (
          <Space wrap style={{ marginBottom: 8 }}>
            {configured.map((url) => (
              <Tag key={url} color="green">
                {url.split('/').pop()}
              </Tag>
            ))}
          </Space>
        )}
        <Input
          value={repos}
          onChange={(e) => setRepos(e.target.value)}
          placeholder="expense-tracker-api, expense-tracker-ui"
        />
      </div>

      <Space>
        <Button
          type="primary"
          loading={saving}
          onClick={() => void save()}
          disabled={!database && !uiStyle && names.length === 0}
        >
          Apply configuration
        </Button>
      </Space>

      {replanNeeded && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message="This plan was written against a different database"
          description={
            <>
              <p style={{ marginTop: 0 }}>
                It has to be regenerated, or the work it describes will be built against the wrong
                one.
              </p>
              <Button onClick={() => void regenerate()} loading={saving}>
                Regenerate the plan
              </Button>
            </>
          }
        />
      )}
    </section>
  );
}
